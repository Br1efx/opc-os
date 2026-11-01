import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

const SHA_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function utf8Bytes(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return Uint8Array.from(bytes);
}

/** 锁定区比对用的 SHA-256。纯函数，客户端和服务端算出同一个值。 */
export function sha256(text: string): string {
  const bytes = utf8Bytes(text);
  const total = Math.ceil((bytes.length + 9) / 64) * 64;
  const data = new Uint8Array(total);
  data.set(bytes);
  data[bytes.length] = 0x80;
  const view = new DataView(data.buffer);
  const bits = BigInt(bytes.length) * 8n;
  view.setUint32(total - 8, Number(bits >> 32n));
  view.setUint32(total - 4, Number(bits & 0xffffffffn));
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const words = new Uint32Array(64);
  for (let offset = 0; offset < total; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 64; index += 1) {
      const s0 = rotateRight(words[index - 15], 7) ^ rotateRight(words[index - 15], 18) ^ (words[index - 15] >>> 3);
      const s1 = rotateRight(words[index - 2], 17) ^ rotateRight(words[index - 2], 19) ^ (words[index - 2] >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choose + SHA_K[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((value) => value.toString(16).padStart(8, "0")).join("");
}

export const COMMENT_FOOTER = "%% comments %%";
export const NOTES_RULES_MARKER = "<!-- opc-notes-rules -->";
const ASK_LIMIT = 8000;

export interface LockSpan {
  id: string;
  from: number;
  to: number;
  inner: string;
  block: string;
}

export interface LockSnap {
  id: string;
  inner: string;
  block: string;
}

/** 成对的锁定区。没有 lock:end 的开头不算锁定，避免后文被误冻。 */
export function lockSpans(text: string): LockSpan[] {
  const spans: LockSpan[] = [];
  const start = /<!--\s*lock:start\s+([A-Za-z0-9_-]+)\s*-->/g;
  const end = /<!--\s*lock:end\s*-->/;
  let match: RegExpExecArray | null;
  while ((match = start.exec(text)) !== null) {
    const from = match.index;
    const innerFrom = from + match[0].length;
    const endMatch = end.exec(text.slice(innerFrom));
    if (!endMatch) break;
    const to = innerFrom + endMatch.index + endMatch[0].length;
    spans.push({
      id: match[1],
      from,
      to,
      inner: text.slice(innerFrom, innerFrom + endMatch.index),
      block: text.slice(from, to),
    });
    start.lastIndex = to;
  }
  return spans;
}

export function lockSnaps(text: string): LockSnap[] {
  return lockSpans(text).map((span) => ({ id: span.id, inner: span.inner, block: span.block }));
}

export function lockFilterResult(text: string): true | number[] {
  const spans = lockSpans(text);
  if (spans.length === 0) return true;
  return spans.flatMap((span) => [span.from, span.to]);
}

export function replaceDocumentSpec(length: number, next: string): {
  changes: { from: number; to: number; insert: string };
  filter: false;
} {
  return { changes: { from: 0, to: length, insert: next }, filter: false };
}

function footerStart(text: string): number {
  let offset = 0;
  const lines = text.split("\n");
  for (const line of lines) {
    if (line.trim() === COMMENT_FOOTER) return offset;
    offset += line.length + 1;
  }
  return -1;
}

export function restoreLocks(current: string, snaps: readonly LockSnap[]): { text: string; restoredIds: string[] } {
  if (snaps.length === 0) return { text: current, restoredIds: [] };
  const spans = lockSpans(current);
  const used = new Set<number>();
  const replacements: { from: number; to: number; block: string }[] = [];
  const missing: LockSnap[] = [];
  const restoredIds: string[] = [];
  for (const snap of snaps) {
    const index = spans.findIndex((span, spanIndex) => !used.has(spanIndex) && span.id === snap.id);
    if (index < 0) {
      missing.push(snap);
      restoredIds.push(snap.id);
      continue;
    }
    used.add(index);
    const span = spans[index];
    if (sha256(span.inner) !== sha256(snap.inner)) {
      replacements.push({ from: span.from, to: span.to, block: snap.block });
      restoredIds.push(snap.id);
    }
  }
  let text = current;
  for (const replacement of replacements.sort((left, right) => right.from - left.from)) {
    text = text.slice(0, replacement.from) + replacement.block + text.slice(replacement.to);
  }
  if (missing.length > 0) {
    const footerAt = footerStart(text);
    const insertAt = footerAt >= 0 ? footerAt : text.length;
    const pieces = missing.map((snap) => snap.block).join("\n\n");
    const prefix = insertAt > 0 && !text.slice(0, insertAt).endsWith("\n") ? "\n\n" : insertAt > 0 ? "\n" : "";
    const suffix = footerAt >= 0 ? "\n\n" : "";
    text = text.slice(0, insertAt) + prefix + pieces + suffix + text.slice(insertAt);
  }
  return { text, restoredIds };
}

export function checkSave(base: string, next: string): { ok: true; detail: "" } | { ok: false; detail: string } {
  const before = lockSpans(base);
  const after = lockSpans(next);
  const used = new Set<number>();
  const ids: string[] = [];
  for (const span of before) {
    const index = after.findIndex(
      (item, itemIndex) => !used.has(itemIndex) && item.id === span.id && sha256(item.inner) === sha256(span.inner),
    );
    if (index < 0) ids.push(span.id);
    else used.add(index);
  }
  if (ids.length === 0) return { ok: true, detail: "" };
  return { ok: false, detail: `锁定区不能改：${[...new Set(ids)].join("、")}` };
}

export interface NoteReply {
  at: string;
  author: string;
  body: string;
}

export interface NoteComment {
  id: string;
  quote: string;
  note: string;
  status: "open" | "resolved";
  replies: NoteReply[];
  inlineFrom: number | null;
  inlineTo: number | null;
}

interface InlineMark {
  from: number;
  to: number;
  quote: string;
  note: string;
}

function parseInlines(body: string): InlineMark[] {
  const marks: InlineMark[] = [];
  const pattern = /\{==([\s\S]*?)==\}\{>>([\s\S]*?)<<\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    if (match[1].length === 0) continue;
    marks.push({ from: match.index, to: match.index + match[0].length, quote: match[1], note: match[2] });
  }
  return marks;
}

function parseReply(line: string): NoteReply | null {
  const match = /^回复：(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z) (\S+)：(.*)$/.exec(line);
  if (!match) return null;
  return { at: match[1], author: match[2], body: match[3] };
}

function parseThreadInner(inner: string): { quote: string; note: string; replies: NoteReply[] } | null {
  const lines = inner.replace(/^\n/, "").replace(/\n$/, "").split("\n");
  if (lines[0] !== "摘录：") return null;
  const noteAt = lines.indexOf("批注：", 1);
  if (noteAt < 0) return null;
  const quote = lines.slice(1, noteAt).join("\n");
  const rest = lines.slice(noteAt + 1);
  const replyAt = rest.findIndex((line) => line.startsWith("回复："));
  const noteLines = replyAt < 0 ? rest : rest.slice(0, replyAt);
  while (noteLines.length > 0 && noteLines[noteLines.length - 1] === "") noteLines.pop();
  const replies: NoteReply[] = [];
  for (const line of replyAt < 0 ? [] : rest.slice(replyAt)) {
    if (line === "") continue;
    const reply = parseReply(line);
    if (reply) replies.push(reply);
  }
  return { quote, note: noteLines.join("\n"), replies };
}

interface ThreadMark {
  id: string;
  status: "open" | "resolved";
  quote: string;
  note: string;
  replies: NoteReply[];
}

function parseThreads(tail: string): ThreadMark[] {
  const threads: ThreadMark[] = [];
  const pattern = /<!--\s*opc-thread\s+id="([^"]+)"\s+status="(open|resolved)"\s*-->([\s\S]*?)<!--\s*\/opc-thread\s*-->/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(tail)) !== null) {
    const parsed = parseThreadInner(match[3]);
    if (!parsed) continue;
    threads.push({
      id: match[1],
      status: match[2] === "resolved" ? "resolved" : "open",
      quote: parsed.quote,
      note: parsed.note,
      replies: parsed.replies,
    });
  }
  return threads;
}

function inlineId(quote: string, note: string, seen: Map<string, number>): string {
  const base = `h${sha256(`${quote}\n${note}`).slice(0, 8)}`;
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

export function listComments(text: string): NoteComment[] {
  const cut = footerStart(text);
  const body = cut < 0 ? text : text.slice(0, cut);
  const tail = cut < 0 ? "" : text.slice(cut);
  const inlines = parseInlines(body);
  const threads = parseThreads(tail);
  const used = new Set<number>();
  const comments: NoteComment[] = [];
  for (const thread of threads) {
    const index = inlines.findIndex(
      (inline, inlineIndex) => !used.has(inlineIndex) && inline.quote === thread.quote && inline.note === thread.note,
    );
    if (index >= 0) used.add(index);
    const inline = index >= 0 ? inlines[index] : undefined;
    comments.push({
      id: thread.id,
      quote: inline?.quote ?? thread.quote,
      note: inline?.note ?? thread.note,
      status: thread.status,
      replies: thread.replies,
      inlineFrom: inline ? inline.from : null,
      inlineTo: inline ? inline.to : null,
    });
  }
  const seen = new Map<string, number>();
  for (let index = 0; index < inlines.length; index += 1) {
    if (used.has(index)) continue;
    const inline = inlines[index];
    comments.push({
      id: inlineId(inline.quote, inline.note, seen),
      quote: inline.quote,
      note: inline.note,
      status: "open",
      replies: [],
      inlineFrom: inline.from,
      inlineTo: inline.to,
    });
  }
  return comments;
}

function renderThread(comment: Pick<NoteComment, "id" | "status" | "quote" | "note" | "replies">): string {
  const replies = comment.replies.map((reply) => `回复：${reply.at} ${reply.author}：${reply.body}`);
  return [
    `<!-- opc-thread id="${comment.id}" status="${comment.status}" -->`,
    "摘录：",
    comment.quote,
    "批注：",
    comment.note,
    ...replies,
    "<!-- /opc-thread -->",
  ].join("\n");
}

function threadPattern(id: string): RegExp {
  return new RegExp(
    `<!--\\s*opc-thread\\s+id="${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s+status="(?:open|resolved)"\\s*-->[\\s\\S]*?<!--\\s*\\/opc-thread\\s*-->`,
  );
}

function ensureFooter(text: string): string {
  if (footerStart(text) >= 0) return text.endsWith("\n") ? text : `${text}\n`;
  const separator = text.length === 0 || text.endsWith("\n") ? "\n" : "\n\n";
  return `${text}${separator}${COMMENT_FOOTER}\n`;
}

function upsertThread(text: string, comment: Pick<NoteComment, "id" | "status" | "quote" | "note" | "replies">): string {
  const rendered = renderThread(comment);
  const pattern = threadPattern(comment.id);
  if (pattern.test(text)) return text.replace(pattern, rendered);
  const withFooter = ensureFooter(text);
  return `${withFooter}${rendered}\n`;
}

function overlapsLock(text: string, from: number, to: number): boolean {
  return lockSpans(text).some((span) => from < span.to && to > span.from);
}

function nextCommentId(text: string): string {
  let max = 0;
  for (const comment of listComments(text)) {
    const match = /^c(\d+)$/.exec(comment.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `c${max + 1}`;
}

export function addComment(
  text: string,
  from: number,
  to: number,
  note: string,
  now: string,
): { ok: true; text: string; id: string } | { ok: false; detail: string } {
  if (from === to) return { ok: false, detail: "先选中一段文字" };
  if (from < 0 || to > text.length || from > to) return { ok: false, detail: "选区不在文件里" };
  const quote = text.slice(from, to);
  const cleaned = oneLine(note);
  if (!cleaned) return { ok: false, detail: "批注内容是空的" };
  if (quote.includes("{==") || quote.includes("==}") || quote.includes("{>>") || quote.includes("<<}")) {
    return { ok: false, detail: "这段里已经有批注标记" };
  }
  if (cleaned.includes("<<") || cleaned.includes(">>")) return { ok: false, detail: "批注内容里不能写 >> 或 <<" };
  if (overlapsLock(text, from, to)) return { ok: false, detail: "这段在锁定区里，不能加批注" };
  const id = nextCommentId(text);
  const marked = `{==${quote}==}{>>${cleaned}<<}`;
  const spliced = insertMark(text, from, to, marked);
  if (!spliced.ok) return spliced;
  const next = upsertThread(spliced.text, { id, status: "open", quote, note: cleaned, replies: [] });
  const saved = checkSave(text, next);
  if (!saved.ok) return { ok: false, detail: saved.detail };
  return { ok: true, text: next, id };
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** 选区落在批注区里时，把标记挪到 %% comments %% 前面，否则列批注时看不见。 */
function insertMark(
  text: string,
  from: number,
  to: number,
  marked: string,
): { ok: true; text: string } | { ok: false; detail: string } {
  const cut = footerStart(text);
  if (cut >= 0 && from < cut && to > cut) return { ok: false, detail: "选区跨过了批注区，请只选正文" };
  if (cut < 0 || to <= cut) return { ok: true, text: text.slice(0, from) + marked + text.slice(to) };
  const without = text.slice(0, from) + text.slice(to);
  const at = footerStart(without);
  if (at < 0) {
    const separator = without.endsWith("\n") || without.length === 0 ? "" : "\n";
    return { ok: true, text: `${without}${separator}${marked}` };
  }
  const prefix = at > 0 && !without.slice(0, at).endsWith("\n") ? "\n" : "";
  return { ok: true, text: `${without.slice(0, at)}${prefix}${marked}\n${without.slice(at)}` };
}

export function replyToComment(
  text: string,
  id: string,
  body: string,
  author: string,
  now: string,
): { ok: true; text: string } | { ok: false; detail: string } {
  const comment = listComments(text).find((item) => item.id === id);
  if (!comment) return { ok: false, detail: "没有这条批注" };
  const cleaned = oneLine(body);
  const who = oneLine(author).replace(/：/g, "");
  if (!cleaned) return { ok: false, detail: "回复是空的" };
  if (!who) return { ok: false, detail: "回复的人是空的" };
  const next = upsertThread(text, {
    ...comment,
    replies: [...comment.replies, { at: now, author: who, body: cleaned }],
  });
  const saved = checkSave(text, next);
  if (!saved.ok) return saved;
  return { ok: true, text: next };
}

export function resolveComment(text: string, id: string): { ok: true; text: string } | { ok: false; detail: string } {
  const comment = listComments(text).find((item) => item.id === id);
  if (!comment) return { ok: false, detail: "没有这条批注" };
  if (comment.inlineFrom !== null && comment.inlineTo !== null && overlapsLock(text, comment.inlineFrom, comment.inlineTo)) {
    return { ok: false, detail: "这段在锁定区里，不能去掉批注标记" };
  }
  let next = text;
  if (comment.inlineFrom !== null && comment.inlineTo !== null) {
    next = next.slice(0, comment.inlineFrom) + comment.quote + next.slice(comment.inlineTo);
  }
  next = upsertThread(next, { ...comment, status: "resolved" });
  const saved = checkSave(text, next);
  if (!saved.ok) return saved;
  return { ok: true, text: next };
}

export function formatCommentList(comments: readonly NoteComment[]): string {
  const open = comments.filter((comment) => comment.status === "open").length;
  const lines = [`共 ${comments.length} 条批注，未解决 ${open} 条。`];
  comments.forEach((comment, index) => {
    const replies =
      comment.replies.length === 0
        ? "回复：无"
        : comment.replies.map((reply) => `回复：${reply.at} ${reply.author}：${reply.body}`).join("\n");
    lines.push(
      `${index + 1}. id=${comment.id} ${comment.status === "open" ? "未解决" : "已解决"}`,
      `摘录：${comment.quote}`,
      `批注：${comment.note}`,
      replies,
    );
  });
  return lines.join("\n");
}

export function askAgentPrompt(filePath: string, selection: string): string {
  const trimmed = selection.trim();
  const excerpt = trimmed.length > ASK_LIMIT ? `${trimmed.slice(0, ASK_LIMIT)}\n…（已截断）` : trimmed;
  return `请根据下面这段笔记摘录回答。回复写在当前对话里，不要改锁定区。\n\n文件：${filePath}\n摘录：\n---\n${excerpt}\n---`;
}

const NOTES_RULES = `${NOTES_RULES_MARKER}
笔记规则：
1. 锁定区用 <!-- lock:start 标识 --> 开头、<!-- lock:end --> 结尾。标识和标记之间的文字不能改、不能删、不能挪。工具拒绝时就停，并说明哪一段被锁了。
2. 批注是正文里的 {==摘录==}{>>批注<<}，线程在文件末尾 %% comments %% 里。处理时用 list_comments 逐条读未解决的批注，改正文（跳过锁定区），用 reply_comment 回复「已改」以及改了什么，然后等用户自己解决。不要自己调用 resolve_comment，除非用户明确说可以解决。`;

export function withNotesRules(systemPrompt: string | undefined): string {
  if (systemPrompt?.includes(NOTES_RULES_MARKER)) return systemPrompt;
  if (!systemPrompt) return NOTES_RULES;
  return `${systemPrompt}\n\n${NOTES_RULES}`;
}

export interface AgentCandidate {
  id: string;
  workspaceId?: string | null;
  archivedAt?: string | null;
  updatedAt: string;
  internal?: boolean;
}

export function pickAgent<T extends AgentCandidate>(agents: readonly T[], workspaceId: string): T | null {
  const matches = agents.filter(
    (agent) => agent.workspaceId === workspaceId && !agent.archivedAt && agent.internal !== true,
  );
  matches.sort((left, right) => (left.updatedAt < right.updatedAt ? 1 : left.updatedAt > right.updatedAt ? -1 : 0));
  return matches[0] ?? null;
}

export function isComposingKey(event: { isComposing?: boolean; keyCode?: number }): boolean {
  return event.isComposing === true || event.keyCode === 229;
}

export function lockShade(foreground: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(foreground.trim());
  if (!hex) return "#d9d9d9";
  const value = Number.parseInt(hex[1], 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.6 ? "#3a3a3a" : "#d9d9d9";
}

export type NoteSegment = { kind: "text"; text: string } | { kind: "lock"; id: string; text: string };

export function noteSegments(text: string): NoteSegment[] {
  const spans = lockSpans(text);
  if (spans.length === 0) return [{ kind: "text", text }];
  const segments: NoteSegment[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.from > cursor) segments.push({ kind: "text", text: text.slice(cursor, span.from) });
    segments.push({ kind: "lock", id: span.id, text: span.block });
    cursor = span.to;
  }
  if (cursor < text.length) segments.push({ kind: "text", text: text.slice(cursor) });
  return segments;
}

export interface NoteFiles {
  read(path: string): Promise<{ text: string } | null>;
  write(path: string, text: string, expected: string | null): Promise<"ok" | "missing" | "conflict">;
  listMarkdown(root: string): Promise<string[]>;
}

export interface FileBaseline {
  path: string;
  text: string;
  snaps: LockSnap[];
}

export interface RestoreHit {
  path: string;
  restoredIds: string[];
  rebuilt: boolean;
}

export async function captureBaselines(files: NoteFiles, root: string): Promise<FileBaseline[]> {
  const paths = await files.listMarkdown(root);
  const baselines: FileBaseline[] = [];
  for (const filePath of paths) {
    const file = await files.read(filePath);
    if (!file) continue;
    const snaps = lockSnaps(file.text);
    if (snaps.length === 0) continue;
    baselines.push({ path: filePath, text: file.text, snaps });
  }
  return baselines;
}

export async function restoreBaselines(files: NoteFiles, baselines: readonly FileBaseline[]): Promise<RestoreHit[]> {
  const hits: RestoreHit[] = [];
  for (const baseline of baselines) {
    const current = await files.read(baseline.path);
    if (!current) {
      const wrote = await files.write(baseline.path, baseline.text, null);
      if (wrote === "ok") {
        hits.push({
          path: baseline.path,
          restoredIds: baseline.snaps.map((snap) => snap.id),
          rebuilt: true,
        });
      }
      continue;
    }
    const restored = restoreLocks(current.text, baseline.snaps);
    if (restored.restoredIds.length === 0 || restored.text === current.text) continue;
    let wrote = await files.write(baseline.path, restored.text, current.text);
    if (wrote === "conflict") {
      const again = await files.read(baseline.path);
      if (!again) continue;
      const second = restoreLocks(again.text, baseline.snaps);
      if (second.text === again.text) continue;
      wrote = await files.write(baseline.path, second.text, again.text);
      if (wrote === "ok") hits.push({ path: baseline.path, restoredIds: second.restoredIds, rebuilt: false });
      continue;
    }
    if (wrote === "ok") hits.push({ path: baseline.path, restoredIds: restored.restoredIds, rebuilt: false });
  }
  return hits;
}

export async function applyNoteChange(
  files: NoteFiles,
  filePath: string,
  change: (text: string) => { ok: true; text: string } | { ok: false; detail: string },
): Promise<{ ok: true; text: string } | { ok: false; detail: string }> {
  const file = await files.read(filePath);
  if (!file) return { ok: false, detail: "没有这个 Markdown 文件" };
  const changed = change(file.text);
  if (!changed.ok) return changed;
  if (changed.text === file.text) return { ok: true, text: file.text };
  const wrote = await files.write(filePath, changed.text, file.text);
  if (wrote === "conflict") return { ok: false, detail: "文件在别处被改过，请再试一次" };
  if (wrote !== "ok") return { ok: false, detail: "没有写进文件" };
  return { ok: true, text: changed.text };
}

export const noteNoticeDataSchema = z.object({
  title: z.string(),
  body: z.string(),
  path: z.string(),
  lockIds: z.array(z.string()),
});

export const noteNoticeSchema = noteNoticeDataSchema.extend({
  id: z.string(),
  at: z.string(),
});

export type NoteNotice = z.infer<typeof noteNoticeSchema>;

export function lockNotice(filePath: string, lockIds: readonly string[], at: string, rebuilt: boolean): NoteNotice {
  const names = lockIds.join("、");
  return {
    id: `lock-${sha256(`${filePath}\n${at}\n${names}`).slice(0, 12)}`,
    at,
    path: filePath,
    lockIds: [...lockIds],
    title: "锁定区已还原",
    body: rebuilt
      ? `文件 ${filePath} 在这一轮里被删掉了，已按回合开始时的原文写回。锁定区：${names}。`
      : `文件 ${filePath} 的锁定区 ${names} 被改过，已自动还原。`,
  };
}

export function createNoticeLog() {
  const items: NoteNotice[] = [];
  return {
    add(notice: NoteNotice) {
      items.unshift(notice);
      if (items.length > 50) items.pop();
    },
    list(): NoteNotice[] {
      return items.map((item) => ({ ...item, lockIds: [...item.lockIds] }));
    },
  };
}

export const checkNoteSaveRpc = defineRpc({
  name: "opc-core.notes.check-save",
  input: z.object({
    baseText: z.string(),
    nextText: z.string(),
  }),
  output: z.object({
    ok: z.boolean(),
    detail: z.string(),
  }),
});

export const listNoteNoticesRpc = defineRpc({
  name: "opc-core.notes.list-notices",
  input: z.object({}),
  output: z.object({
    notices: z.array(noteNoticeSchema),
  }),
});
