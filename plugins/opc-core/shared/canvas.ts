import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/** JSON Canvas。未知字段留在原文里，存回去时不丢掉。 */

export type CanvasNodeType = "text" | "file" | "link" | "group" | "raw";

export type CanvasNode = {
  id: string;
  type: CanvasNodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  text?: string;
  file?: string;
  url?: string;
  label?: string;
  extra?: Record<string, unknown>;
  raw?: Record<string, unknown>;
};

export type CanvasEdge = {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: string;
  toSide?: string;
  fromEnd?: string;
  toEnd?: string;
  color?: string;
  label?: string;
  extra?: Record<string, unknown>;
};

export type CanvasDoc = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  extra?: Record<string, unknown>;
};

export type CanvasResult = { ok: true; canvas: CanvasDoc } | { ok: false; detail: string };

const KNOWN = new Set(["text", "file", "link", "group"]);
const NODE_KEYS = new Set(["id", "type", "x", "y", "width", "height", "color", "text", "file", "url", "label"]);
const EDGE_KEYS = new Set(["id", "fromNode", "toNode", "fromSide", "toSide", "fromEnd", "toEnd", "color", "label"]);

export const REVIEW_CANVAS_DIR = "视频审阅";

export function parseCanvas(text: string): CanvasResult {
  try {
    if (!text.trim()) return { ok: false, detail: "这份画布是空的" };
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, detail: "这份画布不是合法的 JSON" };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, detail: "这份画布的格式不对" };
    }
    const record = parsed as Record<string, unknown>;
    if (!Array.isArray(record.nodes)) return { ok: false, detail: "这份画布缺少节点列表" };
    const nodes: CanvasNode[] = [];
    for (const item of record.nodes) {
      const node = readNode(item);
      if (node) nodes.push(node);
    }
    const edges: CanvasEdge[] = [];
    if (Array.isArray(record.edges)) {
      for (const item of record.edges) {
        const edge = readEdge(item);
        if (edge) edges.push(edge);
      }
    }
    const extra = rest(record, ["nodes", "edges"]);
    return { ok: true, canvas: { nodes, edges, extra } };
  } catch {
    return { ok: false, detail: "这份画布没能打开" };
  }
}

export const openCanvas = parseCanvas;

export function serializeCanvas(canvas: CanvasDoc): string {
  const record: Record<string, unknown> = {
    ...(canvas.extra ?? {}),
    nodes: canvas.nodes.map(serializeNode),
    edges: canvas.edges.map(serializeEdge),
  };
  return `${JSON.stringify(record, null, 2)}\n`;
}

export function moveNode(canvas: CanvasDoc, id: string, x: number, y: number): CanvasDoc {
  return {
    ...canvas,
    nodes: canvas.nodes.map((node) => (node.id === id ? { ...node, x, y } : node)),
  };
}

export function replaceEdges(canvas: CanvasDoc, edges: readonly CanvasEdge[]): CanvasDoc {
  return { ...canvas, edges: [...edges] };
}

export function nodeLabel(node: CanvasNode): string {
  if (node.type === "text") return node.text?.trim() || "文字";
  if (node.type === "file") return node.file?.trim() || "文件";
  if (node.type === "link") return node.url?.trim() || "链接";
  if (node.type === "group") return node.label?.trim() || "分组";
  const raw = node.raw ?? {};
  for (const key of ["text", "label", "file", "url"] as const) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "节点";
}

export function canvasEditOffered(platform: string): boolean {
  return platform === "web";
}

export function nextZoom(current: number, direction: "in" | "out" | "reset"): number {
  if (direction === "reset") return 1;
  const next = direction === "in" ? current * 1.2 : current / 1.2;
  return Math.min(2.5, Math.max(0.4, Math.round(next * 100) / 100));
}

export function canvasFrame(nodes: readonly CanvasNode[]): { minX: number; minY: number; width: number; height: number } {
  if (nodes.length === 0) return { minX: 0, minY: 0, width: 320, height: 180 };
  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + node.width));
  const maxY = Math.max(...nodes.map((node) => node.y + node.height));
  return { minX, minY, width: Math.max(320, maxX - minX), height: Math.max(180, maxY - minY) };
}

export function placeNode(
  node: CanvasNode,
  frame: { minX: number; minY: number },
  zoom: number,
): { left: number; top: number; width: number; height: number } {
  return {
    left: (node.x - frame.minX) * zoom,
    top: (node.y - frame.minY) * zoom,
    width: Math.max(48, node.width * zoom),
    height: Math.max(32, node.height * zoom),
  };
}

export type FlowEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

export function edgesToFlow(edges: readonly CanvasEdge[]): FlowEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.fromNode,
    target: edge.toNode,
    sourceHandle: edge.fromSide,
    targetHandle: edge.toSide,
  }));
}

export function edgesFromFlow(rows: readonly FlowEdge[]): CanvasEdge[] {
  return rows.map((row, index) => ({
    id: row.id || `edge-${index + 1}`,
    fromNode: row.source,
    toNode: row.target,
    fromSide: row.sourceHandle || undefined,
    toSide: row.targetHandle || undefined,
  }));
}

/** 一行四格：旁白、静帧、评论、回复。手机只读这份，电脑可以拖。 */
export function reviewCanvasTemplate(): CanvasDoc {
  return {
    nodes: [
      { id: "row1-group", type: "group", x: 0, y: 0, width: 980, height: 220, label: "第 1 行" },
      { id: "row1-narration", type: "text", x: 20, y: 48, width: 220, height: 140, text: "旁白：今天先看这一镜" },
      { id: "row1-still", type: "file", x: 260, y: 48, width: 220, height: 140, file: "静帧.png" },
      { id: "row1-comment", type: "text", x: 500, y: 48, width: 220, height: 140, text: "评论：写在这里" },
      { id: "row1-reply", type: "text", x: 740, y: 48, width: 220, height: 140, text: "回复：待回复" },
    ],
    edges: [
      { id: "row1-e1", fromNode: "row1-narration", toNode: "row1-still", fromSide: "right", toSide: "left" },
      { id: "row1-e2", fromNode: "row1-still", toNode: "row1-comment", fromSide: "right", toSide: "left" },
      { id: "row1-e3", fromNode: "row1-comment", toNode: "row1-reply", fromSide: "right", toSide: "left" },
    ],
  };
}

export const createReviewCanvasRpc = defineRpc({
  name: "opc-core.notes.create-review-canvas",
  input: z.object({ nonce: z.string() }),
  output: z.object({
    ok: z.boolean(),
    detail: z.string(),
    path: z.string(),
  }),
});

export function buildReviewCanvasFile(nonce: string): { relative: string; text: string } {
  const safe = nonce.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24) || "x";
  return {
    relative: `${REVIEW_CANVAS_DIR}/审阅-${safe}.canvas`,
    text: serializeCanvas(reviewCanvasTemplate()),
  };
}

function readNode(value: unknown): CanvasNode | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id.trim()) return null;
  const type = typeof row.type === "string" ? row.type : "";
  const base = {
    id: row.id,
    x: finite(row.x, 0),
    y: finite(row.y, 0),
    width: finite(row.width, 200),
    height: finite(row.height, 80),
    color: typeof row.color === "string" ? row.color : undefined,
  };
  if (!KNOWN.has(type)) return { ...base, type: "raw", raw: { ...row } };
  return {
    ...base,
    type: type as CanvasNodeType,
    text: typeof row.text === "string" ? row.text : undefined,
    file: typeof row.file === "string" ? row.file : undefined,
    url: typeof row.url === "string" ? row.url : undefined,
    label: typeof row.label === "string" ? row.label : undefined,
    extra: rest(row, NODE_KEYS),
  };
}

function readEdge(value: unknown): CanvasEdge | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.fromNode !== "string" || typeof row.toNode !== "string") return null;
  return {
    id: row.id,
    fromNode: row.fromNode,
    toNode: row.toNode,
    fromSide: typeof row.fromSide === "string" ? row.fromSide : undefined,
    toSide: typeof row.toSide === "string" ? row.toSide : undefined,
    fromEnd: typeof row.fromEnd === "string" ? row.fromEnd : undefined,
    toEnd: typeof row.toEnd === "string" ? row.toEnd : undefined,
    color: typeof row.color === "string" ? row.color : undefined,
    label: typeof row.label === "string" ? row.label : undefined,
    extra: rest(row, EDGE_KEYS),
  };
}

function serializeNode(node: CanvasNode): Record<string, unknown> {
  if (node.raw) return { ...node.raw, id: node.id, x: node.x, y: node.y, width: node.width, height: node.height };
  const record: Record<string, unknown> = {
    ...(node.extra ?? {}),
    id: node.id,
    type: node.type,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  };
  if (node.color) record.color = node.color;
  if (node.type === "text") record.text = node.text ?? "";
  if (node.type === "file") record.file = node.file ?? "";
  if (node.type === "link") record.url = node.url ?? "";
  if (node.type === "group" && node.label) record.label = node.label;
  return record;
}

function serializeEdge(edge: CanvasEdge): Record<string, unknown> {
  const record: Record<string, unknown> = {
    ...(edge.extra ?? {}),
    id: edge.id,
    fromNode: edge.fromNode,
    toNode: edge.toNode,
  };
  if (edge.fromSide) record.fromSide = edge.fromSide;
  if (edge.toSide) record.toSide = edge.toSide;
  if (edge.fromEnd) record.fromEnd = edge.fromEnd;
  if (edge.toEnd) record.toEnd = edge.toEnd;
  if (edge.color) record.color = edge.color;
  if (edge.label) record.label = edge.label;
  return record;
}

function rest(record: Record<string, unknown>, keys: Iterable<string>): Record<string, unknown> | undefined {
  const skip = new Set(keys);
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!skip.has(key)) extra[key] = value;
  }
  return Object.keys(extra).length > 0 ? extra : undefined;
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
