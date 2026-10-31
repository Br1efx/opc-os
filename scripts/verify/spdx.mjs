/**
 * 只覆盖本仓库依赖里会出现的 SPDX 表达式：
 * 标识、WITH、AND、OR、括号。AND 比 OR 更紧。
 * 标识必须与允许列表完全一致，不接受 mit 这种小写。
 */

export function evaluateSpdx(expression, allowList, exceptionList = []) {
  const parsed = parseSpdx(expression);
  if (!parsed.ok) return parsed;
  const allow = new Set(allowList);
  const exceptions = new Set(exceptionList);
  return evaluateNode(parsed.node, allow, exceptions);
}

function parseSpdx(expression) {
  if (typeof expression !== "string" || expression.trim() === "") {
    return { ok: false, reason: "空许可" };
  }
  const tokens = tokenize(expression);
  if (!tokens) return { ok: false, reason: `无法解析许可：${expression}` };
  const parsed = parseOr(tokens, 0);
  if (!parsed.ok) return parsed;
  if (parsed.pos !== tokens.length) {
    return { ok: false, reason: `许可表达式有多余内容：${expression}` };
  }
  return { ok: true, node: parsed.node };
}

function tokenize(expression) {
  const tokens = [];
  let index = 0;
  while (index < expression.length) {
    const current = expression[index];
    if (/\s/.test(current)) {
      index += 1;
      continue;
    }
    if (current === "(" || current === ")") {
      tokens.push(current);
      index += 1;
      continue;
    }
    const match = /^[A-Za-z0-9][A-Za-z0-9.+-]*/.exec(expression.slice(index));
    if (!match) return null;
    tokens.push(match[0]);
    index += match[0].length;
  }
  return tokens;
}

function parseOr(tokens, pos) {
  let left = parseAnd(tokens, pos);
  if (!left.ok) return left;
  const children = [left.node];
  while (tokens[left.pos] === "OR") {
    const right = parseAnd(tokens, left.pos + 1);
    if (!right.ok) return right;
    children.push(right.node);
    left = right;
  }
  if (children.length === 1) return left;
  return { ok: true, node: { type: "or", children }, pos: left.pos };
}

function parseAnd(tokens, pos) {
  let left = parsePrimary(tokens, pos);
  if (!left.ok) return left;
  const children = [left.node];
  while (tokens[left.pos] === "AND") {
    const right = parsePrimary(tokens, left.pos + 1);
    if (!right.ok) return right;
    children.push(right.node);
    left = right;
  }
  if (children.length === 1) return left;
  return { ok: true, node: { type: "and", children }, pos: left.pos };
}

function parsePrimary(tokens, pos) {
  if (tokens[pos] === "(") {
    const inner = parseOr(tokens, pos + 1);
    if (!inner.ok) return inner;
    if (tokens[inner.pos] !== ")") return { ok: false, reason: "缺少右括号" };
    return { ok: true, node: inner.node, pos: inner.pos + 1 };
  }
  const id = tokens[pos];
  if (!id || id === "AND" || id === "OR" || id === "WITH" || id === ")") {
    return { ok: false, reason: "缺少许可证标识" };
  }
  let next = pos + 1;
  let exception = null;
  if (tokens[next] === "WITH") {
    exception = tokens[next + 1];
    if (!exception || exception === "AND" || exception === "OR" || exception === "WITH" || exception === "(" || exception === ")") {
      return { ok: false, reason: "WITH 缺少例外标识" };
    }
    next += 2;
  }
  return { ok: true, node: { type: "license", id, exception }, pos: next };
}

function evaluateNode(node, allow, exceptions) {
  if (node.type === "license") {
    if (!allow.has(node.id)) return { ok: false, reason: rejectReason(node.id) };
    if (node.exception && !exceptions.has(node.exception)) {
      return { ok: false, reason: `例外 ${node.exception} 不在允许列表` };
    }
    return { ok: true };
  }
  if (node.type === "or") {
    const reasons = [];
    for (const child of node.children) {
      const result = evaluateNode(child, allow, exceptions);
      if (result.ok) return { ok: true };
      reasons.push(result.reason);
    }
    return { ok: false, reason: reasons.join("；") };
  }
  for (const child of node.children) {
    const result = evaluateNode(child, allow, exceptions);
    if (!result.ok) return result;
  }
  return { ok: true };
}

function rejectReason(id) {
  if (/^(?:AGPL|GPL|LGPL)(?:-|$)/.test(id)) return `拒绝 ${id}`;
  if (id === "UNLICENSED" || id.startsWith("BUSL") || id === "SSPL-1.0") return `拒绝 ${id}`;
  return `不在允许列表：${id}`;
}
