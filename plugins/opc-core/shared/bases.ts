import { parseCard, type CardIssue } from "@opc-os/card-protocol";

/**
 * Bases 的一个子集。
 * 只做属性筛选、排序和分组。不解析 Obsidian .base 的公式、文件链接或视图继承。
 * 视图文本可以是这份 YAML 子集，也可以是 JSON。
 */

export type Yaml = string | boolean | null | Yaml[] | { [key: string]: Yaml };

export type FieldFilter =
  | { op: "eq" | "neq" | "contains"; field: string; value: string }
  | { op: "empty"; field: string }
  | { op: "dateRange"; field: string; from?: string; to?: string };

export type FilterNode = { op: "and" | "or"; items: FilterNode[] } | FieldFilter;

export type SortKey = { field: string; direction: "asc" | "desc" };

export type ViewColumn = { value: string; title: string };

export type ViewLayout = "list" | "board" | "columns" | "timeline" | "cards";

export type ViewDefinition = {
  id: string;
  title: string;
  layout: ViewLayout;
  filter?: FilterNode;
  sort?: SortKey[];
  groupBy?: string;
  columns?: ViewColumn[];
};

export type QueryGroup = {
  key: string;
  title: string;
  cards: Record<string, unknown>[];
};

export type QueryResult = {
  matched: Record<string, unknown>[];
  groups: QueryGroup[];
  invalid: { issues: readonly CardIssue[] }[];
};

export type QueryOptions = { now?: string };

const LAYOUTS = new Set<ViewLayout>(["list", "board", "columns", "timeline", "cards"]);
const DAY_MS = 24 * 60 * 60 * 1000;

type Line = { indent: number; text: string };

export function parseYamlSubset(source: string): { ok: true; value: Yaml } | { ok: false; detail: string } {
  try {
    const lines = tokenize(source);
    if (lines.length === 0) return { ok: true, value: {} };
    const parsed = parseBlock(lines, 0, 0);
    if (parsed.next !== lines.length) return { ok: false, detail: "视图定义有没读完的行" };
    return { ok: true, value: parsed.value };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "视图定义读不懂" };
  }
}

export function parseViewDocument(text: string): { ok: true; view: ViewDefinition } | { ok: false; detail: string } {
  const trimmed = text.replace(/^\uFEFF/, "").replace(/^(?:[ ]*\r?\n)+/, "").replace(/(?:\r?\n[ ]*)+$/, "");
  if (!trimmed) return { ok: false, detail: "视图定义是空的" };
  let value: unknown;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      value = JSON.parse(trimmed) as unknown;
    } catch {
      return { ok: false, detail: "视图定义的 JSON 读不懂" };
    }
  } else {
    const yaml = parseYamlSubset(trimmed);
    if (!yaml.ok) return yaml;
    value = yaml.value;
  }
  return parseView(value);
}

export function parseView(value: unknown): { ok: true; view: ViewDefinition } | { ok: false; detail: string } {
  if (!isRecord(value)) return { ok: false, detail: "视图定义必须是一组属性" };
  if (typeof value.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,40}$/.test(value.id)) {
    return { ok: false, detail: "视图标识只能用小写英文、数字和短横线" };
  }
  if (typeof value.title !== "string" || value.title.trim() === "") return { ok: false, detail: "视图要有标题" };
  if (typeof value.layout !== "string" || !LAYOUTS.has(value.layout as ViewLayout)) {
    return { ok: false, detail: "视图布局无法识别" };
  }
  const view: ViewDefinition = {
    id: value.id,
    title: value.title.trim(),
    layout: value.layout as ViewLayout,
  };
  if (value.groupBy !== undefined) {
    if (typeof value.groupBy !== "string" || value.groupBy.trim() === "") {
      return { ok: false, detail: "分组字段无效" };
    }
    view.groupBy = value.groupBy;
  }
  if (value.sort !== undefined) {
    const sort = parseSort(value.sort);
    if (!sort.ok) return sort;
    if (sort.sort.length > 0) view.sort = sort.sort;
  }
  if (value.columns !== undefined) {
    const columns = parseColumns(value.columns);
    if (!columns.ok) return columns;
    if (columns.columns.length > 0) view.columns = columns.columns;
  }
  if (value.filter !== undefined) {
    const filter = parseFilter(value.filter);
    if (!filter.ok) return filter;
    view.filter = filter.filter;
  }
  return { ok: true, view };
}

export function renderView(view: ViewDefinition): string {
  return `${emitMap(viewToPlain(view), 0).join("\n")}\n`;
}

export function fieldValue(record: unknown, field: string): unknown {
  if (!isRecord(record)) return undefined;
  let current: unknown = record;
  for (const part of field.split(".")) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return current;
}

/** 合法卡片参与筛选、排序和分组。非法卡片单独列出，不混进结果。 */
export function queryCards(
  inputs: readonly unknown[],
  view: ViewDefinition,
  options: QueryOptions = {},
): QueryResult {
  const matched: Record<string, unknown>[] = [];
  const invalid: { issues: readonly CardIssue[] }[] = [];
  for (const input of inputs) {
    const parsed = parseCard(input);
    if (!parsed.ok) {
      invalid.push({ issues: parsed.issues });
      continue;
    }
    if (!isRecord(input) || !matches(input, view.filter, options.now)) continue;
    matched.push(input);
  }
  const sorted = sortCards(matched, view.sort);
  if (!view.groupBy) {
    return {
      matched: sorted,
      groups: [{ key: "", title: view.title, cards: sorted }],
      invalid,
    };
  }
  const groups: QueryGroup[] = [];
  for (const column of view.columns ?? []) {
    groups.push({ key: column.value, title: column.title, cards: [] });
  }
  for (const card of sorted) {
    const key = groupKey(fieldValue(card, view.groupBy));
    let group = groups.find((item) => item.key === key);
    if (!group) {
      group = { key, title: key === "" ? "未填写" : key, cards: [] };
      groups.push(group);
    }
    group.cards.push(card);
  }
  return { matched: sorted, groups, invalid };
}

function sortCards(cards: Record<string, unknown>[], sort: SortKey[] | undefined): Record<string, unknown>[] {
  const indexed = cards.map((card, index) => ({ card, index }));
  indexed.sort((left, right) => {
    for (const key of sort ?? []) {
      const compared = compareValues(fieldValue(left.card, key.field), fieldValue(right.card, key.field));
      if (compared !== 0) return key.direction === "desc" ? -compared : compared;
    }
    return left.index - right.index;
  });
  return indexed.map((item) => item.card);
}

function matches(record: unknown, filter: FilterNode | undefined, now: string | undefined): boolean {
  if (!filter) return true;
  switch (filter.op) {
    case "and":
      return filter.items.every((item) => matches(record, item, now));
    case "or":
      return filter.items.length > 0 && filter.items.some((item) => matches(record, item, now));
    case "empty":
      return isEmpty(fieldValue(record, filter.field));
    case "eq":
      return equals(fieldValue(record, filter.field), filter.value);
    case "neq":
      return !equals(fieldValue(record, filter.field), filter.value);
    case "contains":
      return contains(fieldValue(record, filter.field), filter.value);
    case "dateRange":
      return inDateRange(fieldValue(record, filter.field), filter.from, filter.to, now);
    default: {
      const unreachable: never = filter;
      return unreachable;
    }
  }
}

function isEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (isRecord(value)) return Object.keys(value).length === 0;
  return false;
}

function equals(actual: unknown, expected: string): boolean {
  if (typeof actual === "boolean" || typeof actual === "number") return String(actual) === expected;
  if (Array.isArray(actual)) return actual.some((item) => equals(item, expected));
  return actual === expected;
}

function contains(actual: unknown, expected: string): boolean {
  if (typeof actual === "string") return actual.includes(expected);
  if (Array.isArray(actual)) return actual.some((item) => typeof item === "string" && item.includes(expected));
  return false;
}

function inDateRange(actual: unknown, from: string | undefined, to: string | undefined, now: string | undefined): boolean {
  if (typeof actual !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(actual)) return false;
  const time = Date.parse(actual);
  if (Number.isNaN(time)) return false;
  if (from !== undefined) {
    const start = resolveBound(from, now);
    if (start == null || time < start) return false;
  }
  if (to !== undefined) {
    const end = resolveBound(to, now);
    if (end == null || time > end) return false;
  }
  return true;
}

function resolveBound(token: string, now: string | undefined): number | null {
  const base = now === undefined ? Date.now() : Date.parse(now);
  if (Number.isNaN(base)) return null;
  if (token === "$now") return base;
  if (token === "$todayStart" || token === "$todayEnd") {
    const date = new Date(base);
    const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    return token === "$todayStart" ? start : start + DAY_MS - 1;
  }
  const relative = /^\$now([+-])(\d+)d$/.exec(token);
  if (relative) {
    const sign = relative[1] === "+" ? 1 : -1;
    return base + sign * Number(relative[2]) * DAY_MS;
  }
  const parsed = Date.parse(token);
  return Number.isNaN(parsed) ? null : parsed;
}

function groupKey(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function compareValues(left: unknown, right: unknown): number {
  const leftEmpty = isEmpty(left);
  const rightEmpty = isEmpty(right);
  if (leftEmpty && rightEmpty) return 0;
  if (leftEmpty) return 1;
  if (rightEmpty) return -1;
  if (isDateText(left) && isDateText(right)) return Date.parse(left) - Date.parse(right);
  if (typeof left === "number" && typeof right === "number") return left - right;
  if (typeof left === "boolean" && typeof right === "boolean") return Number(left) - Number(right);
  return String(left).localeCompare(String(right), "zh");
}

function isDateText(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value));
}

function parseSort(value: unknown): { ok: true; sort: SortKey[] } | { ok: false; detail: string } {
  if (!Array.isArray(value)) return { ok: false, detail: "排序必须是列表" };
  const sort: SortKey[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.field !== "string" || item.field.trim() === "") {
      return { ok: false, detail: "排序要写字段" };
    }
    if (item.direction !== "asc" && item.direction !== "desc") return { ok: false, detail: "排序方向只能是升序或降序" };
    sort.push({ field: item.field, direction: item.direction });
  }
  return { ok: true, sort };
}

function parseColumns(value: unknown): { ok: true; columns: ViewColumn[] } | { ok: false; detail: string } {
  if (!Array.isArray(value)) return { ok: false, detail: "分列必须是列表" };
  const columns: ViewColumn[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.value !== "string" || typeof item.title !== "string" || item.title.trim() === "") {
      return { ok: false, detail: "每一列都要有值和标题" };
    }
    columns.push({ value: item.value, title: item.title.trim() });
  }
  return { ok: true, columns };
}

function parseFilter(value: unknown): { ok: true; filter: FilterNode } | { ok: false; detail: string } {
  if (!isRecord(value) || typeof value.op !== "string") return { ok: false, detail: "筛选读不懂" };
  if (value.op === "and" || value.op === "or") {
    if (!Array.isArray(value.items)) return { ok: false, detail: "组合筛选要有条目" };
    const items: FilterNode[] = [];
    for (const item of value.items) {
      const parsed = parseFilter(item);
      if (!parsed.ok) return parsed;
      items.push(parsed.filter);
    }
    return { ok: true, filter: { op: value.op, items } };
  }
  if (value.op === "empty") {
    if (typeof value.field !== "string" || value.field.trim() === "") return { ok: false, detail: "筛选要写字段" };
    return { ok: true, filter: { op: "empty", field: value.field } };
  }
  if (value.op === "dateRange") {
    if (typeof value.field !== "string" || value.field.trim() === "") return { ok: false, detail: "筛选要写字段" };
    const filter: FieldFilter = { op: "dateRange", field: value.field };
    if (value.from !== undefined) {
      if (typeof value.from !== "string") return { ok: false, detail: "日期范围的起点无效" };
      filter.from = value.from;
    }
    if (value.to !== undefined) {
      if (typeof value.to !== "string") return { ok: false, detail: "日期范围的终点无效" };
      filter.to = value.to;
    }
    return { ok: true, filter };
  }
  if (value.op === "eq" || value.op === "neq" || value.op === "contains") {
    if (typeof value.field !== "string" || value.field.trim() === "") return { ok: false, detail: "筛选要写字段" };
    if (typeof value.value !== "string") return { ok: false, detail: "筛选的比较值必须是文本" };
    return { ok: true, filter: { op: value.op, field: value.field, value: value.value } };
  }
  return { ok: false, detail: "不认识的筛选" };
}

function viewToPlain(view: ViewDefinition): Record<string, Yaml> {
  const plain: Record<string, Yaml> = { id: view.id, title: view.title, layout: view.layout };
  if (view.groupBy) plain.groupBy = view.groupBy;
  if (view.sort && view.sort.length > 0) {
    plain.sort = view.sort.map((item) => ({ field: item.field, direction: item.direction }));
  }
  if (view.columns && view.columns.length > 0) {
    plain.columns = view.columns.map((item) => ({ value: item.value, title: item.title }));
  }
  if (view.filter) plain.filter = filterToPlain(view.filter);
  return plain;
}

function filterToPlain(filter: FilterNode): Yaml {
  switch (filter.op) {
    case "and":
    case "or":
      return { op: filter.op, items: filter.items.map(filterToPlain) };
    case "empty":
      return { op: filter.op, field: filter.field };
    case "dateRange": {
      const plain: Record<string, Yaml> = { op: filter.op, field: filter.field };
      if (filter.from !== undefined) plain.from = filter.from;
      if (filter.to !== undefined) plain.to = filter.to;
      return plain;
    }
    case "eq":
    case "neq":
    case "contains":
      return { op: filter.op, field: filter.field, value: filter.value };
    default: {
      const unreachable: never = filter;
      return unreachable;
    }
  }
}

function tokenize(source: string): Line[] {
  const lines: Line[] = [];
  for (const raw of source.split(/\r?\n/)) {
    if (raw.trim() === "" || raw.trimStart().startsWith("#")) continue;
    const indent = raw.match(/^ */)?.[0].length ?? 0;
    if (raw.slice(0, indent).includes("\t") || raw.trimStart() !== raw.slice(indent)) {
      throw new Error("视图定义不能用制表符缩进");
    }
    lines.push({ indent, text: raw.slice(indent) });
  }
  return lines;
}

function parseBlock(lines: Line[], start: number, minIndent: number): { value: Yaml; next: number } {
  if (start >= lines.length || lines[start].indent < minIndent) return { value: {}, next: start };
  if (lines[start].text.startsWith("- ")) return parseList(lines, start);
  const map: Record<string, Yaml> = {};
  let index = start;
  const indent = lines[start].indent;
  while (index < lines.length && lines[index].indent === indent && !lines[index].text.startsWith("- ")) {
    const text = lines[index].text;
    const colon = text.indexOf(":");
    if (colon <= 0) throw new Error(`读不懂这一行：${text}`);
    const key = text.slice(0, colon).trim();
    const rest = text.slice(colon + 1).trim();
    index += 1;
    if (rest === "[]") map[key] = [];
    else if (rest === "{}") map[key] = {};
    else if (rest === "") {
      if (index < lines.length && lines[index].indent > indent) {
        const nested = parseBlock(lines, index, indent + 1);
        map[key] = nested.value;
        index = nested.next;
      } else map[key] = "";
    } else map[key] = parseScalar(rest);
  }
  return { value: map, next: index };
}

function parseList(lines: Line[], start: number): { value: Yaml; next: number } {
  const items: Yaml[] = [];
  let index = start;
  const indent = lines[start].indent;
  while (index < lines.length && lines[index].indent === indent && lines[index].text.startsWith("- ")) {
    const content = lines[index].text.slice(2).trim();
    index += 1;
    const nested: Line[] = [];
    if (content) nested.push({ indent: indent + 2, text: content });
    while (index < lines.length && lines[index].indent > indent) {
      nested.push(lines[index]);
      index += 1;
    }
    if (nested.length === 0) items.push("");
    else if (nested.length === 1 && !isMapLine(content)) items.push(parseScalar(content));
    else {
      const parsed = parseBlock(nested, 0, 0);
      items.push(parsed.value);
    }
  }
  return { value: items, next: index };
}

function isMapLine(text: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_-]*:(?:\s|$)/.test(text);
}

function parseScalar(text: string): string | boolean | null {
  if (text.startsWith("\"") && text.endsWith("\"") && text.length >= 2) {
    return text.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
  }
  if (text.startsWith("'") && text.endsWith("'") && text.length >= 2) return text.slice(1, -1);
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "null" || text === "~") return null;
  return text;
}

function emitMap(map: Record<string, Yaml>, indent: number): string[] {
  const lines: string[] = [];
  const pad = " ".repeat(indent);
  for (const [key, item] of Object.entries(map)) {
    if (Array.isArray(item)) {
      if (item.length === 0) lines.push(`${pad}${key}: []`);
      else {
        lines.push(`${pad}${key}:`);
        lines.push(...emitList(item, indent + 2));
      }
    } else if (isRecord(item)) {
      if (Object.keys(item).length === 0) lines.push(`${pad}${key}: {}`);
      else {
        lines.push(`${pad}${key}:`);
        lines.push(...emitMap(item, indent + 2));
      }
    } else lines.push(`${pad}${key}: ${scalarText(item)}`);
  }
  return lines;
}

function emitList(items: Yaml[], indent: number): string[] {
  const lines: string[] = [];
  const pad = " ".repeat(indent);
  for (const item of items) {
    if (Array.isArray(item)) {
      lines.push(`${pad}-`);
      lines.push(...emitList(item, indent + 2));
    } else if (isRecord(item)) {
      const nested = emitMap(item, indent + 2);
      const first = nested[0]?.trim() ?? "";
      lines.push(`${pad}- ${first}`);
      for (const line of nested.slice(1)) lines.push(line);
    } else lines.push(`${pad}- ${scalarText(item)}`);
  }
  return lines;
}

function scalarText(value: string | boolean | null): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  return quote(value);
}

function quote(value: string): string {
  if (
    value === "" ||
    value.trim() !== value ||
    /^(?:true|false|null|~)$/.test(value) ||
    /[:#\n"'[\]{},&*!|>%@`]/.test(value)
  ) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, "\\n")}"`;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, Yaml> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
