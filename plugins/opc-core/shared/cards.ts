import {
  CARD_FIELDS,
  CARD_STATUSES,
  CARD_STATUS_LABELS,
  CARD_TYPE_LABELS,
  TASK_FIELDS,
  isCardType,
  parseCard,
  type Card,
  type CardIssue,
  type CardType,
} from "@opc-os/card-protocol";
import { parseViewDocument, parseYamlSubset, queryCards, renderView, type ViewDefinition } from "./bases";
import { scheduleCommands, renderScheduleRecord, type ScheduleCommand } from "./schedules";
import { archiveSessions, previewCleanup, searchSessions, type TrackedSession } from "./sessions";
import { applyTransition, readTaskMeta, runtimeFromCard, writeTaskMeta } from "./task-doc";
import {
  parseWorkflow,
  planAccept,
  planAnswer,
  planEvidence,
  planFailure,
  planHumanPass,
  planQuestion,
  planStart,
  planTurn,
  type StepDelivery,
  type Transition,
  type Workflow,
} from "./workflow";

/** 主力机笔记库里的卡片目录。视图、工作流、会话和定时任务记录都在这里。 */
export const CARDS_ROOT = "/home/br1efx/notes/cards";
export const VIEWS_DIR = "_views";
export const WORKFLOWS_DIR = "_workflows";
export const SESSIONS_DIR = "_sessions";
export const SCHEDULES_DIR = "_schedules";

/** 侧栏和页面共用的刷新间隔。短于验收要求的一分钟。 */
export const CARD_WALL_REFRESH_MS = 15_000;

/** 转成任务时留下的标记。工作流接在这张卡上。 */
export const D5_TASK_HANDOFF = "d5-task";

/** 任务视图按这些步骤分列。标识要和三个模板里的步骤一致。 */
export const TASK_STAGE_COLUMNS = [
  { value: "", title: "未开始" },
  { value: "demand", title: "需求" },
  { value: "build", title: "实现" },
  { value: "review", title: "审查" },
  { value: "verify", title: "门禁" },
  { value: "accept", title: "待你验收" },
  { value: "done", title: "完成" },
  { value: "material", title: "素材卡" },
  { value: "weekly", title: "周更母本" },
  { value: "adapt", title: "多平台改编" },
  { value: "post", title: "你发布" },
  { value: "recycle", title: "数据回收" },
  { value: "topic", title: "选题" },
  { value: "pitch", title: "立项" },
  { value: "script", title: "剧本" },
  { value: "script-review", title: "剧本挑错" },
  { value: "script-lock", title: "剧本冻结" },
  { value: "style", title: "风格" },
  { value: "style-lock", title: "风格冻结" },
  { value: "voice", title: "配音" },
  { value: "stills", title: "关键静帧" },
  { value: "anim", title: "动画初版" },
  { value: "audio", title: "配乐音效" },
  { value: "compliance", title: "合规检查" },
  { value: "release", title: "成片放行" },
  { value: "upload", title: "上传" },
  { value: "publish", title: "发布" },
  { value: "metrics", title: "数据监控" },
  { value: "retro", title: "复盘" },
  { value: "assets", title: "资产沉淀" },
] as const;

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
export const PRESET_VIEW_IDS = ["inbox", "idea-wall", "pending", "reminders", "by-project", "tasks", "stuck"] as const;

const STATUS_COLUMNS = CARD_STATUSES.map((status) => ({ value: status, title: CARD_STATUS_LABELS[status] }));

/** 四个主视图和七个预置视图。缺文件时由写入接口补上，已有文件不覆盖。 */
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
  {
    id: "tasks",
    title: "任务",
    layout: "board",
    groupBy: "stage",
    sort: [{ field: "time", direction: "desc" }],
    filter: { op: "eq", field: "type", value: "task" },
    columns: TASK_STAGE_COLUMNS.map((column) => ({ value: column.value, title: column.title })),
  },
  {
    id: "stuck",
    title: "卡住了",
    layout: "list",
    sort: [{ field: "time", direction: "desc" }],
    filter: {
      op: "and",
      items: [
        { op: "eq", field: "type", value: "task" },
        { op: "gte", field: "ladderLevel", value: "1" },
      ],
    },
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
  if (TASK_FIELDS.some((key) => card[key] !== undefined)) {
    lines.push(`goal: ${yamlString(card.goal ?? "")}`);
    lines.push(...yamlList("acceptance", card.acceptance ?? []));
    lines.push(`due: ${yamlString(card.due ?? "")}`);
    lines.push(...yamlList("dependsOn", card.dependsOn ?? []));
    lines.push(`workflow: ${yamlString(card.workflow ?? "")}`);
    lines.push(`stage: ${yamlString(card.stage ?? "")}`);
    lines.push(`failCount: ${card.failCount ?? 0}`);
    lines.push(`ladderLevel: ${card.ladderLevel ?? 0}`);
  }
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
  | { action: "archive" }
  | { action: "accept-task" }
  | { action: "answer"; answer: string }
  | { action: "add-evidence"; evidence: string }
  | { action: "ask"; question: string };

export type CardDelivery = { agentId: string; text: string; role: string };

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
      delivery: { agentId, text: `这张卡「${card.title}」指派给你。`, role: "" },
      detail: "已指派，正在发给 Agent",
    };
  }
  if (action.action === "to-task") {
    return { ok: false, detail: "转成任务要走工作流" };
  }
  if (action.action === "archive") return finish(card, props, "archived", null, "已归档", false);
  if (action.action !== "approve") return { ok: false, detail: "这张卡不在工作流里" };
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

export type NamedText = { name: string; text: string };

export interface CardFiles {
  listCards(): Promise<NamedText[]>;
  writeCard(name: string, text: string): Promise<"ok" | "error">;
  listViews(): Promise<NamedText[]>;
  writeView(name: string, text: string): Promise<"ok" | "error">;
  listWorkflows(): Promise<NamedText[]>;
  writeWorkflow(name: string, text: string): Promise<"ok" | "error">;
  listSessions(): Promise<NamedText[]>;
  writeSession(name: string, text: string): Promise<"ok" | "error">;
  listSchedules(): Promise<NamedText[]>;
  writeSchedule(name: string, text: string): Promise<"ok" | "error">;
}

export type WorkflowSeed = { name: string; text: string };

export type CardLibrary = {
  now: string;
  root: string;
  cards: NamedText[];
  views: NamedText[];
  workflows: NamedText[];
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

export function createCardStore(files: CardFiles, root = CARDS_ROOT, seeds: readonly WorkflowSeed[] = []) {
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

  async function ensureWorkflows(): Promise<void> {
    const existing = await files.listWorkflows();
    const ids = new Set<string>();
    for (const file of existing) {
      const parsed = parseWorkflow(file.text);
      if (parsed.ok) ids.add(parsed.workflow.id);
    }
    for (const seed of seeds) {
      const parsed = parseWorkflow(seed.text);
      if (!parsed.ok || ids.has(parsed.workflow.id)) continue;
      const name = fileNameOf(parsed.workflow.id, "yaml");
      if (!name) continue;
      await files.writeWorkflow(name, seed.text);
      ids.add(parsed.workflow.id);
    }
  }

  async function workflows(): Promise<{ workflows: Workflow[]; errors: { name: string; detail: string }[] }> {
    await ensureWorkflows();
    const workflows: Workflow[] = [];
    const errors: { name: string; detail: string }[] = [];
    for (const file of await files.listWorkflows()) {
      const parsed = parseWorkflow(file.text);
      if (!parsed.ok) errors.push({ name: file.name, detail: parsed.detail });
      else workflows.push(parsed.workflow);
    }
    return { workflows, errors };
  }

  async function workflowById(id: string): Promise<Workflow | null> {
    const loaded = await workflows();
    return loaded.workflows.find((item) => item.id === id) ?? null;
  }

  function persist(found: LibraryCard, transition: Transition): Promise<{ ok: boolean; detail: string; delivery: CardDelivery | null }> {
    if (!transition.write) return Promise.resolve({ ok: transition.ok, detail: transition.detail, delivery: null });
    const card = applyTransition(found.card, transition);
    const body = writeTaskMeta(readTaskMeta(found.body).prose, transition.runtime.meta);
    return put(card, found.props, body, found.name).then((written) => {
      if (!written.ok) return { ok: false, detail: written.detail, delivery: null };
      return { ok: transition.ok, detail: transition.detail, delivery: toDelivery(transition.delivery) };
    });
  }

  async function writeDecision(found: LibraryCard, transition: Transition, now: string): Promise<void> {
    if (!transition.decision) return;
    const card: Card = {
      id: createCardId("decision", now, `${found.card.id}-ladder`),
      type: "decision",
      status: "inbox",
      title: transition.decision.title.slice(0, 80),
      oneLiner: transition.decision.oneLiner,
      owner: { kind: "person", id: "人" },
      source: "ladder",
      evidence: [],
      related: [found.card.id],
      time: now,
      unread: true,
    };
    await put(card, { handoff: "ladder" }, "", null);
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
      await ensureWorkflows();
      return {
        now,
        root,
        cards: await files.listCards(),
        views: await files.listViews(),
        workflows: await files.listWorkflows(),
      };
    },
    workflows,
    async startFromTemplate(input: {
      templateId: string;
      title: string;
      goal: string;
      acceptance: readonly string[];
      due: string;
      dependsOn: readonly string[];
      project: string;
      now: string;
      nonce: string;
      settled?: readonly string[];
    }): Promise<{ ok: boolean; detail: string; id: string; delivery: CardDelivery | null }> {
      const workflow = await workflowById(input.templateId);
      if (!workflow) return { ok: false, detail: "没有这个模板", id: "", delivery: null };
      const settled =
        input.settled ??
        readLibrary(await this.load(input.now))
          .valid.filter((item) => item.card.status === "settled")
          .map((item) => item.card.id);
      const planned = planStart(workflow, { ...input, settled });
      if (!planned.write) return { ok: false, detail: planned.detail, id: "", delivery: null };
      const built = cardFromManual({
        title: input.title,
        oneLiner: input.goal || planned.runtime.goal,
        type: "task",
        project: input.project,
        now: input.now,
        nonce: input.nonce,
      });
      if (!built.ok) return { ok: false, detail: built.detail, id: "", delivery: null };
      const card = applyTransition({ ...built.card, evidence: [] }, planned);
      const props = { ...built.props, handoff: D5_TASK_HANDOFF };
      const written = await put(card, props, writeTaskMeta("", planned.runtime.meta), null);
      if (!written.ok) return { ok: false, detail: written.detail, id: written.id, delivery: null };
      return { ok: planned.ok, detail: planned.detail, id: written.id, delivery: toDelivery(planned.delivery) };
    },
    async schedules(): Promise<ScheduleCommand[]> {
      return scheduleCommands();
    },
    async createSchedule(input: { id: string; now: string }): Promise<{ ok: boolean; detail: string; command: string; enabled: false }> {
      const command = scheduleCommands().find((item) => item.id === input.id);
      if (!command) return { ok: false, detail: "没有这个定时模板", command: "", enabled: false };
      const name = fileNameOf(command.id, "md");
      if (!name) return { ok: false, detail: "定时模板标识无效", command: "", enabled: false };
      const existing = await files.listSchedules();
      if (existing.some((file) => file.name === name)) {
        return { ok: true, detail: "已经有这条，仍未启用", command: command.command, enabled: false };
      }
      const written = await files.writeSchedule(name, renderScheduleRecord(command, input.now));
      if (written !== "ok") return { ok: false, detail: "定时记录没有写进目录", command: command.command, enabled: false };
      return { ok: true, detail: "已生成命令，未启用", command: command.command, enabled: false };
    },
    async sessions(query: string, now: string): Promise<{ sessions: TrackedSession[]; preview: { id: string; title: string; reason: string }[] }> {
      const sessions = (await files.listSessions()).flatMap((file) => {
        const parsed = parseSession(file.text);
        return parsed ? [parsed] : [];
      });
      return { sessions: searchSessions(sessions, query), preview: previewCleanup(sessions, now) };
    },
    async recordSessions(input: { sessions: TrackedSession[]; now: string }): Promise<{ ok: boolean; detail: string }> {
      for (const session of input.sessions) {
        const name = fileNameOf(session.id, "md");
        if (!name) continue;
        const written = await files.writeSession(name, renderSession(session));
        if (written !== "ok") return { ok: false, detail: "会话记录没有写进目录" };
      }
      return { ok: true, detail: "已记下会话" };
    },
    async archiveTracked(input: { ids: string[]; now: string }): Promise<{ ok: boolean; detail: string; sessions: TrackedSession[] }> {
      const current = (await files.listSessions()).flatMap((file) => {
        const parsed = parseSession(file.text);
        return parsed ? [parsed] : [];
      });
      const next = archiveSessions(current, input.ids, input.now);
      if (next.length !== current.length) return { ok: false, detail: "归档不能减少会话", sessions: current };
      for (const session of next) {
        if (!input.ids.includes(session.id)) continue;
        const name = fileNameOf(session.id, "md");
        if (!name) continue;
        const written = await files.writeSession(name, renderSession(session));
        if (written !== "ok") return { ok: false, detail: "会话没有归档", sessions: current };
      }
      return { ok: true, detail: "已归档，没有删除", sessions: next };
    },
    async consumeTurn(input: {
      agentId: string;
      outcome: "completed" | "failed" | "canceled";
      evidence?: readonly string[];
      note?: string;
      now: string;
    }): Promise<{ ok: boolean; detail: string; delivery: CardDelivery | null; decisionId: string; taskId: string }> {
      const found = await taskForAgent(input.agentId, input.now);
      if (!found) return { ok: false, detail: "没有对应的任务", delivery: null, decisionId: "", taskId: "" };
      const meta = readTaskMeta(found.body).meta;
      if (meta.holdTurn === "fail") {
        meta.holdTurn = "";
        const written = await put(found.card, found.props, writeTaskMeta(readTaskMeta(found.body).prose, meta), found.name);
        return {
          ok: written.ok,
          detail: written.ok ? "失败已经记过" : written.detail,
          delivery: null,
          decisionId: "",
          taskId: found.card.id,
        };
      }
      const workflow = await workflowById(found.card.workflow ?? "");
      if (!workflow) return { ok: false, detail: "任务的模板读不懂", delivery: null, decisionId: "", taskId: found.card.id };
      if (input.outcome === "completed" && meta.questionId) {
        return { ok: true, detail: "等你回答", delivery: null, decisionId: "", taskId: found.card.id };
      }
      const planned = planTurn(workflow, runtimeFromCard(found.card, meta), input);
      const saved = await persist(found, planned);
      let decisionId = "";
      if (planned.decision && planned.write) {
        decisionId = createCardId("decision", input.now, `${found.card.id}-ladder`);
        await writeDecision(found, planned, input.now);
      }
      return { ok: saved.ok, detail: saved.detail, delivery: saved.delivery, decisionId, taskId: found.card.id };
    },
    async reportFromAgent(input: {
      agentId: string;
      kind: "fail" | "evidence" | "ask";
      text: string;
      now: string;
    }): Promise<{ ok: boolean; detail: string }> {
      const found = await taskForAgent(input.agentId, input.now);
      if (!found) return { ok: false, detail: "没有对应的任务" };
      const workflow = await workflowById(found.card.workflow ?? "");
      if (!workflow) return { ok: false, detail: "任务的模板读不懂" };
      const runtime = runtimeFromCard(found.card, readTaskMeta(found.body).meta);
      const planned =
        input.kind === "fail"
          ? planFailure(workflow, runtime, input.text, input.now)
          : input.kind === "evidence"
            ? planEvidence(runtime, [input.text], input.now)
            : planQuestion(runtime, input.text, input.now);
      if (input.kind === "fail") planned.runtime.meta.holdTurn = "fail";
      const saved = await persist(found, planned);
      if (planned.decision && planned.write) await writeDecision(found, planned, input.now);
      return { ok: saved.ok, detail: saved.detail };
    },
    async holdDelivery(input: {
      id: string;
      agentId: string;
      text: string;
      clear: boolean;
      now: string;
    }): Promise<{ ok: boolean; detail: string }> {
      const library = await this.load(input.now);
      const found = readLibrary(library).valid.find((item) => item.card.id === input.id);
      if (!found) return { ok: false, detail: "没有这张卡" };
      const read = readTaskMeta(found.body);
      const meta = read.meta;
      meta.pendingAgent = input.clear ? "" : input.agentId;
      meta.pendingText = input.clear ? "" : input.text;
      const written = await put(found.card, found.props, writeTaskMeta(read.prose, meta), found.name);
      if (!written.ok) return { ok: false, detail: written.detail };
      return { ok: true, detail: input.clear ? "已清掉待发送" : "已记下待发送" };
    },
    async convertTypeOnly(input: { id: string; now: string }): Promise<{ ok: boolean; detail: string; delivery: null }> {
      const library = await this.load(input.now);
      const found = readLibrary(library).valid.find((item) => item.card.id === input.id);
      if (!found) return { ok: false, detail: "没有这张卡", delivery: null };
      if (found.card.workflow) return { ok: false, detail: "这张卡已经在工作流里", delivery: null };
      const card = { ...found.card, type: "task" as const };
      const written = await put(card, { ...found.props, handoff: D5_TASK_HANDOFF }, found.body, found.name);
      if (!written.ok) return { ok: false, detail: written.detail, delivery: null };
      return { ok: true, detail: "已改成任务。工作流已关闭。", delivery: null };
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
      if (input.action.action === "to-task" || found.card.workflow) {
        const special = await actOnTask(found, input.action, input.now);
        if (special) return special;
      }
      const applied = applyCardAction(found.card, found.props, input.action);
      if (!applied.ok) return { ok: false, detail: applied.detail, delivery: null };
      const written = await put(applied.card, applied.props, found.body, found.name);
      if (!written.ok) return { ok: false, detail: written.detail, delivery: null };
      return { ok: true, detail: applied.detail, delivery: applied.delivery };
    },
  };

  async function taskForAgent(agentId: string, now: string): Promise<LibraryCard | null> {
    await ensureViews();
    const reading = readLibrary({
      now,
      root,
      cards: await files.listCards(),
      views: await files.listViews(),
      workflows: await files.listWorkflows(),
    });
    const tasks = reading.valid.filter((item) => item.card.type === "task");
    const direct = tasks.find((item) => ownsAgent(item, agentId));
    if (direct) return direct;
    const loaded = await workflows();
    return (
      tasks.find((item) => {
        if ((item.card.ladderLevel ?? 0) >= 1) return false;
        const workflow = loaded.workflows.find((entry) => entry.id === item.card.workflow);
        return workflow?.steps.find((step) => step.id === item.card.stage)?.agentId === agentId;
      }) ?? null
    );
  }

  async function actOnTask(
    found: LibraryCard,
    action: CardAction,
    now: string,
  ): Promise<{ ok: boolean; detail: string; delivery: CardDelivery | null } | null> {
    if (action.action === "to-task") {
      if (found.card.workflow) return { ok: false, detail: "这张卡已经在工作流里", delivery: null };
      const workflow = await workflowById("dev");
      if (!workflow) return { ok: false, detail: "没有开发流模板", delivery: null };
      const planned = planStart(workflow, {
        title: found.card.title,
        goal: found.card.oneLiner || found.card.title,
        acceptance: [],
        due: "",
        dependsOn: [],
        now,
      });
      if (!planned.write) return { ok: false, detail: planned.detail, delivery: null };
      const card = applyTransition({ ...found.card, type: "task" }, planned);
      const props = { ...found.props, handoff: D5_TASK_HANDOFF };
      const written = await put(card, props, writeTaskMeta(readTaskMeta(found.body).prose, planned.runtime.meta), found.name);
      if (!written.ok) return { ok: false, detail: written.detail, delivery: null };
      return { ok: true, detail: planned.detail, delivery: toDelivery(planned.delivery) };
    }
    if (!found.card.workflow) return null;
    const workflow = await workflowById(found.card.workflow);
    if (!workflow) return { ok: false, detail: "任务的模板读不懂", delivery: null };
    const runtime = runtimeFromCard(found.card, readTaskMeta(found.body).meta);
    if (action.action === "reject") {
      if (action.reason.trim() === "") return { ok: false, detail: "打回要写理由", delivery: null };
      return persist(found, planFailure(workflow, runtime, action.reason, now));
    }
    if (action.action === "approve" || action.action === "accept-task") {
      const planned = action.action === "accept-task" ? planAccept(workflow, runtime, now) : planHumanPass(workflow, runtime, now);
      const saved = await persist(found, planned);
      return saved;
    }
    if (action.action === "add-evidence") return persist(found, planEvidence(runtime, [action.evidence], now));
    if (action.action === "ask") {
      const planned = planQuestion(runtime, action.question, now);
      if (planned.ok) planned.runtime.meta.holdTurn = "";
      return persist(found, planned);
    }
    if (action.action === "answer") return persist(found, planAnswer(runtime, action.answer, now));
    if (action.action === "archive" || action.action === "assign") return null;
    return null;
  }
}

export function actionFromFields(input: {
  action: string;
  reason: string;
  agentId: string;
  evidence?: string;
  answer?: string;
  question?: string;
}): CardAction | null {
  if (input.action === "approve") return { action: "approve" };
  if (input.action === "reject") return { action: "reject", reason: input.reason };
  if (input.action === "assign") return { action: "assign", agentId: input.agentId };
  if (input.action === "to-task") return { action: "to-task" };
  if (input.action === "archive") return { action: "archive" };
  if (input.action === "accept-task") return { action: "accept-task" };
  if (input.action === "add-evidence") return { action: "add-evidence", evidence: input.evidence ?? "" };
  if (input.action === "answer") return { action: "answer", answer: input.answer ?? "" };
  if (input.action === "ask") return { action: "ask", question: input.question ?? "" };
  return null;
}

function toDelivery(delivery: StepDelivery | null): CardDelivery | null {
  if (!delivery) return null;
  return { agentId: delivery.agentId, text: delivery.text, role: delivery.role };
}

function ownsAgent(item: LibraryCard, agentId: string): boolean {
  if (item.card.owner.kind === "agent" && item.card.owner.id === agentId) return true;
  return readTaskMeta(item.body).meta.pendingAgent === agentId;
}

function fileNameOf(id: string, ext: "md" | "yaml"): string | null {
  const pattern = ext === "yaml" ? /^[a-z][a-z0-9-]{0,40}$/ : /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
  if (!pattern.test(id)) return null;
  return `${id}.${ext}`;
}

function renderSession(session: TrackedSession): string {
  return [
    "---",
    `id: ${session.id}`,
    `title: ${yamlString(session.title)}`,
    `kind: ${session.kind}`,
    `updatedAt: ${yamlString(session.updatedAt)}`,
    `archived: ${session.archived ? "true" : "false"}`,
    "---",
    session.archived ? "已归档。没有删除。\n" : "仍在列表里。\n",
  ].join("\n");
}

function parseSession(text: string): TrackedSession | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text.replace(/^\uFEFF/, ""));
  if (!match) return null;
  const yaml = parseYamlSubset(match[1] ?? "");
  if (!yaml.ok || !isRecord(yaml.value)) return null;
  const value = yaml.value;
  if (typeof value.id !== "string" || typeof value.title !== "string" || typeof value.updatedAt !== "string") return null;
  if (value.kind !== "agent" && value.kind !== "schedule") return null;
  return {
    id: value.id,
    title: value.title,
    kind: value.kind,
    updatedAt: value.updatedAt,
    archived: value.archived === true || value.archived === "true",
  };
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
  return { agentId: card.owner.id, text, role: "" };
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
    if ((CARD_FIELDS as readonly string[]).includes(key) || (TASK_FIELDS as readonly string[]).includes(key)) continue;
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
