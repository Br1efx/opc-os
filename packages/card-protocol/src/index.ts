/**
 * 统一卡片协议。
 *
 * 字段与架构说明对齐：id、类型、状态、标题、一句话、负责人、来源、
 * 证据链接、关联卡、时间、未读。类型是选题、任务、资产、问题、素材、决策。
 * 负责人区分人和 Agent。状态是 §1.2 的生命周期。
 */

/** 修订号。d1 是可校验字段；d2 加上决策类型，并把状态收成生命周期。 */
export const CARD_PROTOCOL_REVISION = "d2" as const;

/** 要求出现的字段。顺序与架构说明一致。 */
export const CARD_FIELDS = [
  "id",
  "type",
  "status",
  "title",
  "oneLiner",
  "owner",
  "source",
  "evidence",
  "related",
  "time",
  "unread",
] as const;

export type CardField = (typeof CARD_FIELDS)[number];

/** 卡片类型。界面用中文，协议里用稳定的英文标识。 */
export const CARD_TYPES = ["topic", "task", "asset", "question", "material", "decision"] as const;

export type CardType = (typeof CARD_TYPES)[number];

export const CARD_TYPE_LABELS = {
  topic: "选题",
  task: "任务",
  asset: "资产",
  question: "问题",
  material: "素材",
  decision: "决策",
} as const satisfies Record<CardType, string>;

/**
 * §1.2 生命周期。
 * 收件箱 → 孵化中 → 推进中 → 已沉淀，末段分成搁置或归档。
 * 待办、进行中、待审、完成不属于这里。
 */
export const CARD_STATUSES = ["inbox", "incubating", "active", "settled", "shelved", "archived"] as const;

export type CardStatus = (typeof CARD_STATUSES)[number];

export const CARD_STATUS_LABELS = {
  inbox: "收件箱",
  incubating: "孵化中",
  active: "推进中",
  settled: "已沉淀",
  shelved: "搁置",
  archived: "归档",
} as const satisfies Record<CardStatus, string>;

/**
 * §1.2 笔记种类换成协议类型。
 * 协议的 type 不接受这些中文名。问题没有对应种类，留给要人拍板的卡。
 */
export const SECTION12_CARD_TYPES = [
  { kind: "想法", type: "topic" },
  { kind: "随笔", type: "material" },
  { kind: "资料", type: "asset" },
  { kind: "链接", type: "material" },
  { kind: "视频", type: "material" },
  { kind: "提醒", type: "task" },
  { kind: "复盘", type: "decision" },
] as const satisfies readonly { kind: string; type: CardType }[];

/** 负责人是人，或是 Agent。 */
export const OWNER_KINDS = ["person", "agent"] as const;

export type OwnerKind = (typeof OWNER_KINDS)[number];

export interface CardOwner {
  kind: OwnerKind;
  id: string;
}

/**
 * 一张卡。
 * `evidence` 是证据链接，`related` 是关联卡的 id。
 * `time` 是 ISO-8601 时间字符串。`status` 只能是生命周期里的值。
 */
export interface Card {
  id: string;
  type: CardType;
  status: CardStatus;
  title: string;
  oneLiner: string;
  owner: CardOwner;
  source: string;
  evidence: readonly string[];
  related: readonly string[];
  time: string;
  unread: boolean;
}

export type CardIssueCode = "not-object" | "missing" | "type" | "empty" | "unknown" | "time";

export interface CardIssue {
  path: string;
  code: CardIssueCode;
}

export type ParseCardResult = { ok: true; card: Card } | { ok: false; issues: readonly CardIssue[] };

const STRING_FIELDS = [
  "id",
  "status",
  "title",
  "oneLiner",
  "source",
  "time",
] as const satisfies readonly CardField[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function isCardType(value: unknown): value is CardType {
  return typeof value === "string" && (CARD_TYPES as readonly string[]).includes(value);
}

export function isCardStatus(value: unknown): value is CardStatus {
  return typeof value === "string" && (CARD_STATUSES as readonly string[]).includes(value);
}

export function isOwnerKind(value: unknown): value is OwnerKind {
  return value === "person" || value === "agent";
}

function isOwner(value: unknown): value is CardOwner {
  if (!isRecord(value)) return false;
  return isOwnerKind(value.kind) && typeof value.id === "string";
}

/**
 * 只检查字段在不在、类型是否对得上。
 * 不检查空字符串、时间格式或状态机。取值校验用 `parseCard`。
 */
export function hasCardShape(value: unknown): value is Card {
  if (!isRecord(value)) return false;
  for (const field of STRING_FIELDS) {
    if (typeof value[field] !== "string") return false;
  }
  return (
    isCardType(value.type) &&
    isCardStatus(value.status) &&
    isOwner(value.owner) &&
    isStringArray(value.evidence) &&
    isStringArray(value.related) &&
    typeof value.unread === "boolean"
  );
}

function push(issues: CardIssue[], path: string, code: CardIssueCode) {
  issues.push({ path, code });
}

function checkNonEmpty(issues: CardIssue[], path: string, value: string) {
  if (value.trim() === "") push(issues, path, "empty");
}

function checkStringList(issues: CardIssue[], path: string, value: readonly string[]) {
  value.forEach((item, index) => {
    if (item.trim() === "") push(issues, `${path}.${index}`, "empty");
  });
}

/**
 * 校验一张卡的取值。
 * 通过时返回同一份对象；不删除调用方多写的字段。
 */
export function parseCard(value: unknown): ParseCardResult {
  if (!isRecord(value)) return { ok: false, issues: [{ path: "", code: "not-object" }] };

  const issues: CardIssue[] = [];
  for (const field of STRING_FIELDS) {
    if (typeof value[field] !== "string") push(issues, field, "type");
  }
  if (!isCardType(value.type)) {
    push(issues, "type", value.type === undefined ? "missing" : "unknown");
  }
  if (typeof value.status === "string" && !isCardStatus(value.status)) {
    push(issues, "status", value.status.trim() === "" ? "empty" : "unknown");
  }
  if (!isRecord(value.owner)) {
    push(issues, "owner", "type");
  } else {
    if (!isOwnerKind(value.owner.kind)) push(issues, "owner.kind", "unknown");
    if (typeof value.owner.id !== "string") push(issues, "owner.id", "type");
    else checkNonEmpty(issues, "owner.id", value.owner.id);
  }
  if (!isStringArray(value.evidence)) push(issues, "evidence", "type");
  if (!isStringArray(value.related)) push(issues, "related", "type");
  if (typeof value.unread !== "boolean") push(issues, "unread", "type");

  if (issues.length > 0) return { ok: false, issues };

  const card = value as unknown as Card;
  checkNonEmpty(issues, "id", card.id);
  checkNonEmpty(issues, "title", card.title);
  checkStringList(issues, "evidence", card.evidence);
  checkStringList(issues, "related", card.related);
  if (card.time.trim() === "" || Number.isNaN(Date.parse(card.time))) {
    push(issues, "time", "time");
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, card };
}
