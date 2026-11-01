import {
  CARD_FIELDS,
  CARD_STATUSES,
  CARD_STATUS_LABELS,
  CARD_TYPE_LABELS,
  isCardType,
  parseCard,
  type Card,
  type CardIssue,
  type CardType,
} from "@opc-os/card-protocol";
import { parseViewDocument, parseYamlSubset, queryCards, renderView, type ViewDefinition } from "./bases";

/** 主力机笔记库里的卡片目录。视图文件在同级 `_views`。 */
export const CARDS_ROOT = "/home/br1efx/notes/cards";
export const VIEWS_DIR = "_views";

/** 侧栏和页面共用的刷新间隔。短于验收要求的一分钟。 */
export const CARD_WALL_REFRESH_MS = 15_000;

/** 转成任务时留下的标记。任务流本身留给后续阶段。 */
export const D5_TASK_HANDOFF = "d5-task";

export const BUSINESS_LINES = ["父亲 AI 芝麻馆", "Build in Public", "插件开发"] as const;

export const CARD_ISSUE_LABELS = {
  "not-object": "不是一张卡片",
  missing: "缺少字段",
  type: "类型不对",
  empty: "不能为空",
  unknown: "无法识别",
  time: "时间无效",
} as const satisfies Record<CardIssue["code"], string>;

export const PRIMARY_VIEW_IDS = ["awaiting", "status-board", "business", "timeline"] as const;
export const PRESET_VIEW_IDS = ["inbox", "idea-wall", "pending", "reminders", "by-project"] as const;

const STATUS_COLUMNS = CARD_STATUSES.map((status) => ({ value: status, title: CARD_STATUS_LABELS[status] }));

/** 四个主视图和五个预置视图。缺文件时由写入接口补上，已有文件不覆盖。 */
export const DEFAULT_VIEWS: readonly ViewDefinition[] = [
  {
    id: "awaiting",
    title: "等你处理",
    layout: "list",
    sort: [{ field: "time", direction: "desc" }],
    filter: { op: "eq", field: "status", value: "inbox" },
  },
  {
    id: "status-board",
    title: "状态看板",
    layout: "board",
    groupBy: "status",
    sort: [{ field: "time", direction: "desc" }],
    columns: STATUS_COLUMNS,
  },
  {
    id: "business",
    title: "业务线分栏",
    layout: "columns",
    groupBy: "project",
    sort: [{ field: "time", direction: "desc" }],
    columns: BUSINESS_LINES.map((name) => ({ value: name, title: name })),
  },
  {
    id: "timeline",
    title: "时间线",
    layout: "timeline",
    sort: [{ field: "time", direction: "desc" }],
    filter: { op: "dateRange", field: "time", from: "$todayStart", to: "$todayEnd" },
  },
  {
    id: "inbox",
    title: "收件箱",
    layout: "list",
    sort: [{ field: "time", direction: "desc" }],
    filter: { op: "eq", field: "status", value: "inbox" },
  },
  {
    id: "idea-wall",
    title: "想法墙",
    layout: "cards",
    sort: [{ field: "time", direction: "desc" }],
    filter: { op: "eq", field: "type", value: "topic" },
  },
  {
    id: "pending",
    title: "待拍板",
    layout: "list",
    sort: [{ field: "time", direction: "desc" }],
    filter: {
      op: "and",
      items: [
        {
          op: "or",
          items: [
            { op: "eq", field: "type", value: "question" },
            { op: "eq", field: "type", value: "decision" },
          ],
        },
        { op: "neq", field: "status", value: "settled" },
        { op: "neq", field: "status", value: "shelved" },
        { op: "neq", field: "status", value: "archived" },
      ],
    },
  },
  {
    id: "reminders",
    title: "近期提醒",
    layout: "list",
    sort: [{ field: "time", direction: "asc" }],
    filter: {
      op: "and",
      items: [
        { op: "eq", field: "type", value: "task" },
        { op: "dateRange", field: "time", from: "$now-7d", to: "$now+7d" },
      ],
    },
  },
  {
    id: "by-project",
    title: "按项目",
    layout: "columns",
    groupBy: "project",
    sort: [{ field: "time", direction: "desc" }],
  },
];

export function sidebarAwaitingLabel(count: number | null): string {
  if (count === null) return "等你处理";
  return `等你处理 ${count}`;
}

export function ownerLabel(owner: Card["owner"]): string {
  return owner.kind === "agent" ? `Agent ${owner.id}` : `人 ${owner.id}`;
}

export function typeLabel(type: CardType): string {
  return CARD_TYPE_LABELS[type];
}

export function statusLabel(status: Card["status"]): string {
  return CARD_STATUS_LABELS[status];
}

export function issueLine(issue: CardIssue): string {
  const where = issue.path ? issue.path : "整张卡";
  return `${where}：${CARD_ISSUE_LABELS[issue.code]}`;
}

/** 用数字时钟，避免运行环境把月份翻成英文。 */
export function formatCardTime(time: string): string {
  const parsed = Date.parse(time);
  if (Number.isNaN(parsed)) return time;
  const date = new Date(parsed);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function createCardId(prefix: string, now: string, nonce: string): string {
  const stamp = now.replace(/[^0-9]/g, "").slice(0, 14) || "0";
  const clean = nonce.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24) || "x";
  return `${prefix}-${stamp}-${clean}`.slice(0, 80);
}

export function cardFileName(id: string): string | null {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(id)) return null;
  return `${id}.md`;
}

export type CardProps = Record<string, string>;

export type ParsedCard =
  | { ok: true; card: Card; props: CardProps; body: string; detail: string }
  | { ok: false; issues: readonly CardIssue[]; props: CardProps; body: string; detail: string };

export function renderCardDocument(card: Card, props: CardProps = {}, body = ""): string {
  const lines = [
    "---",
    `id: ${yamlString(card.id)}`,
    `type: ${card.type}`,
    `status: ${card.status}`,
    `title: ${yamlString(card.title)}`,
    `oneLiner: ${yamlString(card.oneLiner)}`,
    "owner:",
    `  kind: ${card.owner.kind}`,
    `  id: ${yamlString(card.owner.id)}`,
    `source: ${yamlString(card.source)}`,
    ...yamlList("evidence", card.evidence),
    ...yamlList("related", card.related),
    `time: ${yamlString(card.time)}`,
    `unread: ${card.unread ? "true" : "false"}`,
  ];
  for (const [key, value] of Object.entries(props)) {
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(key) || value.trim() === "") continue;
    lines.push(`${key}: ${yamlString(value)}`);
  }
  lines.push("---");
  const text = body.replace(/^\n+/, "").replace(/\s+$/, "");
  return text ? `${lines.join("\n")}\n${text}\n` : `${lines.join("\n")}\n`;
}

export function parseCardDocument(text: string): ParsedCard {
  const source = text.replace(/^\uFEFF/, "");
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(source);
  if (!match) {
    return { ok: false, issues: [{ path: "", code: "not-object" }], props: {}, body: source, detail: "格式错误" };
  }
  const body = match[2] ?? "";
  const yaml = parseYamlSubset(match[1] ?? "");
  if (!yaml.ok || !isRecord(yaml.value)) {
    return { ok: false, issues: [{ path: "", code: "not-object" }], props: {}, body, detail: "格式错误" };
  }
  const props = stringProps(yaml.value);
  const parsed = parseCard(yaml.value);
  if (!parsed.ok) return { ok: false, issues: parsed.issues, props, body, detail: "格式错误" };
  return { ok: true, card: parsed.card, props, body, detail: "" };
}

export type CardAction =
  | { action: "approve" }
  | { action: "reject"; reason: string }
  | { action: "assign"; agentId: string }
  | { action: "to-task" }
  | { action: "archive" };

export type CardDelivery = { agentId: string; text: string };

export type ActionResult =
  | { ok: true; card: Card; props: CardProps; delivery: CardDelivery | null; detail: string }
  | { ok: false; detail: string };

export function applyCardAction(card: Card, props: CardProps, action: CardAction): ActionResult {
  if (action.action === "reject") {
    const reason = action.reason.trim();
    if (!reason) return { ok: false, detail: "打回要写理由" };
    if (reason.length > 2000) return { ok: false, detail: "理由太长" };
    return finish(card, props, "incubating", deliveryFor(card, `打回「${card.title}」。理由：${reason}`), "已打回", true);
  }
  if (action.action === "assign") {
    const agentId = action.agentId.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,120}$/.test(agentId)) return { ok: false, detail: "Agent 标识无效" };
    const next = { ...card, owner: { kind: "agent" as const, id: agentId }, status: "active" as const, unread: false };
    return {
      ok: true,
      card: next,
      props,
      delivery: { agentId, text: `这张卡「${card.title}」指派给你。` },
      detail: "已指派，正在发给 Agent",
    };
  }
  if (action.action === "to-task") {
    return {
      ok: true,
      card: { ...card, type: "task", unread: false },
      props: { ...props, handoff: D5_TASK_HANDOFF },
      delivery: null,
      detail: "已转成任务。工作流还没接上。",
    };
  }
  if (action.action === "archive") return finish(card, props, "archived", null, "已归档", false);
  const status = card.type === "question" || card.type === "decision" ? "settled" : "active";
  const text =
    status === "settled" ? `同意。这张「${card.title}」按这个决定沉淀。` : `同意。请继续推进「${card.title}」。`;
  return finish(card, props, status, deliveryFor(card, text), "已同意", true);
}

export function cardFromManual(input: {
  title: string;
  oneLiner: string;
  type: string;
  project: string;
  now: string;
  nonce: string;
  ownerId?: string;
}): { ok: true; card: Card; props: CardProps } | { ok: false; detail: string } {
  const title = input.title.trim();
  if (!title) return { ok: false, detail: "标题不能为空" };
  if (!isCardType(input.type)) return { ok: false, detail: "类型无法识别" };
  if (Number.isNaN(Date.parse(input.now))) return { ok: false, detail: "时间无效" };
  const ownerId = input.ownerId?.trim() || "me";
  const card: Card = {
    id: createCardId("card", input.now, input.nonce),
    type: input.type,
    status: "inbox",
    title: title.slice(0, 80),
    oneLiner: input.oneLiner.trim().slice(0, 200),
    owner: { kind: "person", id: ownerId },
    source: "manual",
    evidence: [],
    related: [],
    time: input.now,
    unread: true,
  };
  const parsed = parseCard(card);
  if (!parsed.ok) return { ok: false, detail: "这张卡没通过校验" };
  const props: CardProps = {};
  if (input.project.trim()) props.project = input.project.trim();
  return { ok: true, card: parsed.card, props };
}

export function cardFromTurn(input: {
  agentId: string;
  title?: string | null;
  outcome: "completed" | "failed" | "canceled";
  now: string;
  nonce: string;
}): Card | null {
  const agentId = input.agentId.trim();
  if (!agentId || Number.isNaN(Date.parse(input.now))) return null;
  const title = (input.title?.trim() || `Agent ${agentId} 完成了一轮`).slice(0, 80);
  const oneLiner =
    input.outcome === "failed"
      ? "这一轮失败了，等你处理。"
      : input.outcome === "canceled"
        ? "这一轮取消了，等你处理。"
        : "这一轮已经结束，等你处理。";
  const card: Card = {
    id: createCardId("turn", input.now, `${agentId}-${input.nonce}`),
    type: "question",
    status: "inbox",
    title,
    oneLiner,
    owner: { kind: "agent", id: agentId },
    source: "agent.turn_ended",
    evidence: [],
    related: [],
    time: input.now,
    unread: true,
  };
  const parsed = parseCard(card);
  return parsed.ok ? parsed.card : null;
}

export interface CardFiles {
  listCards(): Promise<{ name: string; text: string }[]>;
  writeCard(name: string, text: string): Promise<"ok" | "error">;
  listViews(): Promise<{ name: string; text: string }[]>;
  writeView(name: string, text: string): Promise<"ok" | "error">;
}

export type CardLibrary = {
  now: string;
  root: string;
  cards: { name: string; text: string }[];
  views: { name: string; text: string }[];
};

export type LibraryCard = {
  name: string;
  card: Card;
  props: CardProps;
  body: string;
  bag: Record<string, unknown>;
};

export type LibraryReading = {
  now: string;
  views: ViewDefinition[];
  viewErrors: { name: string; detail: string }[];
  valid: LibraryCard[];
  invalid: { name: string; issues: readonly CardIssue[]; detail: string }[];
  awaiting: number;
};

export function readLibrary(library: CardLibrary): LibraryReading {
  const views: ViewDefinition[] = [];
  const viewErrors: { name: string; detail: string }[] = [];
  for (const file of library.views) {
    const parsed = parseViewDocument(file.text);
    if (!parsed.ok) viewErrors.push({ name: file.name, detail: parsed.detail });
    else views.push(parsed.view);
  }
  const ordered = orderViews(views);
  const valid: LibraryCard[] = [];
  const invalid: { name: string; issues: readonly CardIssue[]; detail: string }[] = [];
  for (const file of library.cards) {
    const parsed = parseCardDocument(file.text);
    if (!parsed.ok) invalid.push({ name: file.name, issues: parsed.issues, detail: parsed.detail });
    else {
      valid.push({
        name: file.name,
        card: parsed.card,
        props: parsed.props,
        body: parsed.body,
        bag: { ...parsed.props, ...parsed.card },
      });
    }
  }
  const awaitingView = ordered.find((view) => view.id === "awaiting") ?? DEFAULT_VIEWS[0];
  const awaiting = awaitingView
    ? queryCards(
        valid.map((item) => item.bag),
        awaitingView,
        { now: library.now },
      ).matched.length
    : 0;
  return { now: library.now, views: ordered, viewErrors, valid, invalid, awaiting };
}

export type WriteCardResult = { ok: true; id: string; detail: string } | { ok: false; id: string; detail: string };

export function createCardStore(files: CardFiles, root = CARDS_ROOT) {
  async function ensureViews(): Promise<void> {
    const existing = await files.listViews();
    const ids = new Set<string>();
    for (const file of existing) {
      const parsed = parseViewDocument(file.text);
      if (parsed.ok) ids.add(parsed.view.id);
    }
    for (const view of DEFAULT_VIEWS) {
      if (ids.has(view.id)) continue;
      await files.writeView(`${view.id}.yaml`, renderView(view));
    }
  }

  async function put(card: Card, props: CardProps, body: string, fileName: string | null): Promise<WriteCardResult> {
    const parsed = parseCard(card);
    if (!parsed.ok) return { ok: false, id: card.id, detail: "这张卡没通过校验" };
    const name = fileName ?? cardFileName(parsed.card.id);
    if (!name) return { ok: false, id: card.id, detail: "卡片标识不能当成文件名" };
    const written = await files.writeCard(name, renderCardDocument(parsed.card, props, body));
    if (written !== "ok") return { ok: false, id: parsed.card.id, detail: "卡片没有写进目录" };
    return { ok: true, id: parsed.card.id, detail: "已写入" };
  }

  return {
    /** 定时任务、外部投递和一键收集以后都走这里，不另开写卡入口。 */
    writeCard(card: Card, props: CardProps = {}, body = ""): Promise<WriteCardResult> {
      return put(card, props, body, null);
    },
    async load(now: string): Promise<CardLibrary> {
      await ensureViews();
      return { now, root, cards: await files.listCards(), views: await files.listViews() };
    },
    async createManual(input: {
      title: string;
      oneLiner: string;
      type: string;
      project: string;
      now: string;
      nonce: string;
      ownerId?: string;
    }): Promise<WriteCardResult> {
      const built = cardFromManual(input);
      if (!built.ok) return { ok: false, id: "", detail: built.detail };
      const name = cardFileName(built.card.id);
      const existing = await files.listCards();
      if (name && existing.some((file) => file.name === name)) return { ok: false, id: built.card.id, detail: "已经有这张卡" };
      return put(built.card, built.props, "", null);
    },
    async writeTurn(input: {
      agentId: string;
      title?: string | null;
      outcome: "completed" | "failed" | "canceled";
      now: string;
      nonce: string;
    }): Promise<WriteCardResult> {
      const card = cardFromTurn(input);
      if (!card) return { ok: false, id: "", detail: "这一轮没有写成卡" };
      return put(card, {}, "", null);
    },
    async act(input: { id: string; action: CardAction; now: string }): Promise<{
      ok: boolean;
      detail: string;
      delivery: CardDelivery | null;
    }> {
      const library = await this.load(input.now);
      const reading = readLibrary(library);
      const found = reading.valid.find((item) => item.card.id === input.id);
      if (!found) return { ok: false, detail: "没有这张卡", delivery: null };
      const applied = applyCardAction(found.card, found.props, input.action);
      if (!applied.ok) return { ok: false, detail: applied.detail, delivery: null };
      const written = await put(applied.card, applied.props, found.body, found.name);
      if (!written.ok) return { ok: false, detail: written.detail, delivery: null };
      return { ok: true, detail: applied.detail, delivery: applied.delivery };
    },
  };
}

export function actionFromFields(input: { action: string; reason: string; agentId: string }): CardAction | null {
  if (input.action === "approve") return { action: "approve" };
  if (input.action === "reject") return { action: "reject", reason: input.reason };
  if (input.action === "assign") return { action: "assign", agentId: input.agentId };
  if (input.action === "to-task") return { action: "to-task" };
  if (input.action === "archive") return { action: "archive" };
  return null;
}

function finish(
  card: Card,
  props: CardProps,
  status: Card["status"],
  delivery: CardDelivery | null,
  verb: string,
  announce: boolean,
): ActionResult {
  const detail = !announce ? `${verb}。` : delivery ? `${verb}，正在发给 Agent` : `${verb}。负责人不是 Agent，没有发送。`;
  return { ok: true, card: { ...card, status, unread: false }, props, delivery, detail };
}

function deliveryFor(card: Card, text: string): CardDelivery | null {
  if (card.owner.kind !== "agent" || card.owner.id.trim() === "") return null;
  return { agentId: card.owner.id, text };
}

function orderViews(views: ViewDefinition[]): ViewDefinition[] {
  const rank = new Map<string, number>(DEFAULT_VIEWS.map((view, index) => [view.id, index]));
  return [...views].sort((left, right) => {
    const leftRank = rank.get(left.id) ?? 100;
    const rightRank = rank.get(right.id) ?? 100;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.title.localeCompare(right.title, "zh");
  });
}

function stringProps(value: Record<string, unknown>): CardProps {
  const props: CardProps = {};
  for (const [key, item] of Object.entries(value)) {
    if ((CARD_FIELDS as readonly string[]).includes(key)) continue;
    if (typeof item === "string" && item.trim() !== "") props[key] = item;
  }
  return props;
}

function yamlList(key: string, items: readonly string[]): string[] {
  if (items.length === 0) return [`${key}: []`];
  return [`${key}:`, ...items.map((item) => `  - ${yamlString(item)}`)];
}

function yamlString(value: string): string {
  if (value === "" || value !== value.trim() || /^(?:true|false|null|~)$/.test(value) || /[:#\n"'[\]{},&*!|>%@`]/.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, "\\n")}"`;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
