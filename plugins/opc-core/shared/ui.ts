import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import { parseYamlSubset } from "./bases";

/** 父亲手机常见逻辑宽度。布局断言用这个宽度，不代替真机。 */
export const DAD_PHONE_WIDTH = 360;

/** 分组文件放在卡片库的 `_ui/`。改完刷新即生效。插件只读，不写卡片。 */
export const UI_CONFIG_DIR = "/home/br1efx/notes/cards/_ui";
export const UI_CONFIG_FILE = `${UI_CONFIG_DIR}/groups.yaml`;
export const UI_FILE_NAMES = ["groups.yaml", "groups.yml", "groups.json"] as const;
export const UI_REFRESH_MS = 15_000;

const RESERVED_IDS = new Set(["other", "completed"]);
const ID_PATTERN = /^[a-z][a-z0-9-]{0,40}$/;

export const DEFAULT_UI_TEXT = `# 显示名分组。复制到卡片库的 _ui/groups.yaml 后，刷新即生效。
foldCompleted: true
title:
  weight: 半粗
  color: 强调色
  prefixIcon: true
groups:
  - id: chief
    displayName: 总秘书
    icon: 🧠
    order: 10
    collapsed: false
    match:
      - chief
      - 总秘书
  - id: builder
    displayName: 主力开发
    icon: 🔨
    order: 20
    collapsed: false
    match:
      - builder-a
      - 主力开发
      - 实现
  - id: strike
    displayName: 攻坚
    icon: 🛠️
    order: 30
    collapsed: false
    match:
      - builder-b
      - builder-hard
      - 攻坚
      - 攻坚开发
  - id: reviewer
    displayName: 审查员
    icon: 🔍
    order: 40
    collapsed: false
    match:
      - reviewer
      - 审查
      - 审查员
  - id: arbiter
    displayName: 裁判
    icon: ⚖️
    order: 50
    collapsed: false
    match:
      - arbiter
      - 裁判
  - id: dispatcher
    displayName: 调度员
    icon: 🚦
    order: 60
    collapsed: false
    match:
      - dispatcher
      - 调度员
  - id: writer
    displayName: 写作
    icon: ✍️
    order: 70
    collapsed: false
    match:
      - writer
      - 写作
      - 写作助理
      - 撰稿
      - 改编
  - id: grunt
    displayName: 杂务
    icon: 🧹
    order: 80
    collapsed: false
    match:
      - grunt
      - 杂务
  - id: advisor
    displayName: 顾问
    icon: 💬
    order: 90
    collapsed: false
    match:
      - dad-opus
      - 顾问
  - id: producer
    displayName: 制片人
    icon: 🎬
    order: 100
    collapsed: false
    match:
      - dad-chief
      - 制片人
  - id: animator
    displayName: 动画师
    icon: 🎨
    order: 110
    collapsed: false
    match:
      - dad-builder
      - 动画师
  - id: viewer
    displayName: 审片员
    icon: 👀
    order: 120
    collapsed: false
    match:
      - dad-reviewer
      - 审片员
  - id: hand
    displayName: 打杂
    icon: 📦
    order: 130
    collapsed: false
    match:
      - dad-grunt
      - 打杂
  - id: radar
    displayName: 选题雷达
    icon: 📡
    order: 140
    collapsed: false
    match:
      - radar
      - 选题雷达
  - id: analyst
    displayName: 数据分析师
    icon: 📊
    order: 150
    collapsed: false
    match:
      - analyst
      - 数据分析师
`;

export type PanelId = "dad" | "me" | "unknown";
export type ElderChoice = "auto" | "on" | "off";
export type TitleWeight = "400" | "500" | "600" | "700";
export type TitleColor = "accent" | "foreground" | "muted";

export type TitleStyle = {
  weight: TitleWeight;
  color: TitleColor;
  prefixIcon: boolean;
};

export type UiGroup = {
  id: string;
  displayName: string;
  icon: string;
  order: number;
  collapsed: boolean;
  match: string[];
};

export type UiDocument = {
  groups: UiGroup[];
  title: TitleStyle;
  foldCompleted: boolean;
};

export type UiLoad = {
  ok: boolean;
  source: "file" | "builtin";
  fileName: string;
  detail: string;
  document: UiDocument;
};

export type AgentFace = {
  id: string;
  title: string;
  role: string;
  status: string;
  archived: boolean;
  needsYou: boolean;
  internal: boolean;
};

export type SidebarRowModel = {
  id: string;
  label: string;
  weight: TitleWeight;
  color: TitleColor;
  needsYou: boolean;
};

export type SidebarSection = {
  id: string;
  displayName: string;
  icon: string;
  order: number;
  collapsed: boolean;
  rows: SidebarRowModel[];
};

export type TypeMetrics = {
  title: number;
  body: number;
  lineHeight: number;
  hitMin: number;
  gap: number;
  pad: number;
  stacked: boolean;
  fullWidth: boolean;
};

export type StatusTone = "ok" | "bad" | "unknown";

export type StatusItem = {
  id: "gate" | "quota" | "host";
  label: string;
  text: string;
  tone: StatusTone;
};

export type StatusSignals = {
  guardDetail: string;
  quotaDetails: readonly string[];
  hostDetail: string;
};

const titleWeightSchema = z.enum(["400", "500", "600", "700"]);
const titleColorSchema = z.enum(["accent", "foreground", "muted"]);

export const uiDocumentSchema = z.object({
  groups: z.array(
    z.object({
      id: z.string(),
      displayName: z.string(),
      icon: z.string(),
      order: z.number(),
      collapsed: z.boolean(),
      match: z.array(z.string()),
    }),
  ),
  title: z.object({
    weight: titleWeightSchema,
    color: titleColorSchema,
    prefixIcon: z.boolean(),
  }),
  foldCompleted: z.boolean(),
});

export const uiSnapshot = defineRpc({
  name: "ui.snapshot",
  input: z.object({}),
  output: z.object({
    panel: z.enum(["dad", "me", "unknown"]),
    ok: z.boolean(),
    detail: z.string(),
    source: z.enum(["file", "builtin"]),
    fileName: z.string(),
    path: z.string(),
    document: uiDocumentSchema,
  }),
});

export type UiSnapshot = z.infer<typeof uiSnapshot.output>;

/**
 * 老人模式按面板记住。auto 表示还没手动选过：dad 开，me 关。
 * 设置是主机一份。两个面板是两个 daemon，所以各记各的。
 */
export const uiSettings = defineSettings({
  id: "ui",
  scope: "host",
  version: 1,
  schema: z.object({
    elder: z.enum(["auto", "on", "off"]).default("auto"),
    collapsed: z
      .array(
        z.object({
          id: z.string().min(1).max(40),
          on: z.boolean(),
        }),
      )
      .default([]),
  }),
});

const WEIGHTS: Record<string, TitleWeight> = {
  "400": "400",
  "500": "500",
  "600": "600",
  "700": "700",
  常规: "400",
  中等: "500",
  半粗: "600",
  粗体: "700",
};

const COLORS: Record<string, TitleColor> = {
  accent: "accent",
  foreground: "foreground",
  muted: "muted",
  强调: "accent",
  强调色: "accent",
  正文: "foreground",
  正文色: "foreground",
  弱化: "muted",
  弱化色: "muted",
};

export function defaultUiDocument(): UiDocument {
  const parsed = parseUiDocument(DEFAULT_UI_TEXT);
  if (!parsed.ok) throw new Error(parsed.detail);
  return parsed.document;
}

export function parseUiDocument(text: string): { ok: true; document: UiDocument } | { ok: false; detail: string } {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (!trimmed) return fail("分组配置是空的");
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return validateUi(JSON.parse(trimmed) as unknown);
    } catch {
      return fail("分组配置读不懂");
    }
  }
  const yaml = parseYamlSubset(trimmed);
  if (!yaml.ok) return fail(yaml.detail);
  return validateUi(yaml.value);
}

export function loadUiConfig(files: readonly { name: string; text: string }[]): UiLoad {
  const chosen = UI_FILE_NAMES.map((name) => files.find((file) => file.name === name)).find((file) => file !== undefined);
  if (!chosen) {
    return { ok: true, source: "builtin", fileName: "", detail: "", document: defaultUiDocument() };
  }
  const parsed = parseUiDocument(chosen.text);
  if (!parsed.ok) {
    return { ok: false, source: "file", fileName: chosen.name, detail: parsed.detail, document: defaultUiDocument() };
  }
  return { ok: true, source: "file", fileName: chosen.name, detail: "", document: parsed.document };
}

export function faceFromAgent(agent: {
  id: string;
  title?: string | null;
  labels?: Readonly<Record<string, string>> | null;
  status?: string | null;
  archivedAt?: string | null;
  requiresAttention?: boolean | null;
  internal?: boolean | null;
}): AgentFace {
  return {
    id: agent.id,
    title: (agent.title ?? "").trim(),
    role: (agent.labels?.["opc-role"] ?? "").trim(),
    status: agent.status ?? "",
    archived: typeof agent.archivedAt === "string" && agent.archivedAt.trim() !== "",
    needsYou: agent.requiresAttention === true,
    internal: agent.internal === true,
  };
}

export function arrangeSidebar(
  agents: readonly AgentFace[],
  document: UiDocument,
  saved: Readonly<Record<string, boolean>> = {},
): SidebarSection[] {
  const active = new Map<string, AgentFace[]>();
  const loose: AgentFace[] = [];
  const done: AgentFace[] = [];
  for (const face of agents) {
    if (face.internal || face.id.trim() === "") continue;
    if (document.foldCompleted && (face.archived || face.status === "closed")) {
      done.push(face);
      continue;
    }
    const group = groupFor(face, document.groups);
    if (!group) loose.push(face);
    else {
      const list = active.get(group.id) ?? [];
      list.push(face);
      active.set(group.id, list);
    }
  }
  const sections = [...document.groups]
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map((group) =>
      sectionFrom(
        group.id,
        group.displayName,
        group.icon,
        group.order,
        flag(saved, group.id, group.collapsed),
        active.get(group.id) ?? [],
        document.title,
      ),
    );
  if (loose.length > 0) {
    sections.push(sectionFrom("other", "其他", "📎", 9000, flag(saved, "other", false), loose, document.title));
  }
  if (done.length > 0) {
    sections.push(sectionFrom("completed", "已完成", "✅", 10000, flag(saved, "completed", true), done, document.title));
  }
  return sections;
}

export function sectionLabel(section: Pick<SidebarSection, "icon" | "displayName" | "collapsed" | "rows">): string {
  const count = section.rows.length;
  const countText = count > 0 ? ` · ${count}` : "";
  const folded = section.collapsed && count > 0 ? "（已收起）" : "";
  return `${section.icon} ${section.displayName}${countText}${folded}`;
}

export function rowLabel(icon: string, face: Pick<AgentFace, "title" | "needsYou">, title: TitleStyle): string {
  const name = face.title.trim() || "未命名会话";
  const withIcon = title.prefixIcon && icon.trim() !== "" ? `${icon} ${name}` : name;
  return face.needsYou ? `${withIcon} · 等你` : withIcon;
}

export function elderDefault(panel: PanelId): boolean {
  return panel === "dad";
}

export function resolveElder(choice: ElderChoice, panel: PanelId): boolean {
  if (choice === "on") return true;
  if (choice === "off") return false;
  return elderDefault(panel);
}

export function panelLabel(panel: PanelId): string {
  if (panel === "dad") return "父亲的面板";
  if (panel === "me") return "你的面板";
  return "未能识别的面板";
}

export function panelIdFromText(value: string): PanelId {
  const text = value.trim().toLowerCase();
  if (text === "dad" || text === "父亲" || text === "父亲的面板") return "dad";
  if (text === "me" || text === "你" || text === "你的面板") return "me";
  return "unknown";
}

/** OPC_PANEL 优先，其次是 Linux 用户，再次是家目录。认不出就不把老人模式打开。 */
export function panelIdFromEnv(env: Record<string, string | undefined>): PanelId {
  const explicit = panelIdFromText(env.OPC_PANEL ?? "");
  if (explicit !== "unknown") return explicit;
  const user = panelIdFromText(env.USER ?? "");
  if (user !== "unknown") return user;
  const login = panelIdFromText(env.LOGNAME ?? "");
  if (login !== "unknown") return login;
  const fromPaseo = panelFromHome(env.PASEO_HOME);
  if (fromPaseo !== "unknown") return fromPaseo;
  return panelFromHome(env.HOME);
}

export function preferPanel(primary: PanelId, fallback: PanelId): PanelId {
  return primary === "unknown" ? fallback : primary;
}

export function withCollapsed(
  entries: readonly { id: string; on: boolean }[],
  id: string,
  on: boolean,
): { id: string; on: boolean }[] {
  return [...entries.filter((item) => item.id !== id), { id, on }];
}

export function collapsedMap(entries: readonly { id: string; on: boolean }[]): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const item of entries) map[item.id] = item.on;
  return map;
}

export function typeMetrics(elder: boolean, compact: boolean): TypeMetrics {
  return typeMetricsForWidth(elder, compact ? DAD_PHONE_WIDTH : 1280);
}

export function typeMetricsForWidth(elder: boolean, width: number): TypeMetrics {
  const phone = width <= 480;
  if (!elder) {
    return {
      title: phone ? 22 : 28,
      body: phone ? 16 : 18,
      lineHeight: phone ? 24 : 28,
      hitMin: 44,
      gap: 8,
      pad: phone ? 16 : 24,
      stacked: phone,
      fullWidth: phone,
    };
  }
  return {
    title: phone ? 30 : 36,
    body: phone ? 22 : 24,
    lineHeight: phone ? 34 : 38,
    hitMin: 56,
    gap: 16,
    pad: phone ? 20 : 28,
    stacked: true,
    fullWidth: true,
  };
}

/** 主操作纵向排满行宽，热区不低于 48，字号不小于 20。 */
export function fitsThumb(metrics: TypeMetrics, width: number): boolean {
  return (
    width >= 320 &&
    metrics.stacked &&
    metrics.fullWidth &&
    metrics.hitMin >= 48 &&
    metrics.body >= 20 &&
    metrics.lineHeight >= metrics.body + 8 &&
    metrics.gap >= 12
  );
}

export function signalsFromGateway(
  snapshot: { guard: { detail: string }; quotas: readonly { detail: string }[]; host: { detail: string } } | null,
): StatusSignals {
  if (!snapshot) return { guardDetail: "", quotaDetails: [], hostDetail: "" };
  return {
    guardDetail: snapshot.guard.detail,
    quotaDetails: snapshot.quotas.map((item) => item.detail),
    hostDetail: snapshot.host.detail,
  };
}

/**
 * 门卫只认防封说明里的放行或切断。没有这句话就写暂无数据。
 * 模拟 hello 不算绿灯。主机没有负载数字时也不画成正常。
 */
export function statusStrip(signals: StatusSignals | null): StatusItem[] {
  const input = signals ?? { guardDetail: "", quotaDetails: [], hostDetail: "" };
  return [gateItem(input.guardDetail), quotaItem(input.quotaDetails), hostItem(input.hostDetail)];
}

function fail(detail: string): { ok: false; detail: string } {
  const text = detail.replaceAll("视图定义", "分组配置");
  return { ok: false, detail: text.includes("分组配置") ? text : `分组配置${text}` };
}

function validateUi(value: unknown): { ok: true; document: UiDocument } | { ok: false; detail: string } {
  if (!isRecord(value)) return fail("分组配置必须是一组属性");
  if ("title" in value) {
    const title = readTitle(value.title);
    if (typeof title === "string") return fail(title);
    const groups = readGroups(value.groups);
    if (typeof groups === "string") return fail(groups);
    const fold = readBool(value.foldCompleted, true);
    if (fold === null) return fail("已完成会话是否收起只能写开或关");
    return { ok: true, document: { groups, title, foldCompleted: fold } };
  }
  const groups = readGroups(value.groups);
  if (typeof groups === "string") return fail(groups);
  const fold = readBool(value.foldCompleted, true);
  if (fold === null) return fail("已完成会话是否收起只能写开或关");
  return {
    ok: true,
    document: {
      groups,
      title: { weight: "600", color: "accent", prefixIcon: true },
      foldCompleted: fold,
    },
  };
}

function readTitle(value: unknown): TitleStyle | string {
  if (!isRecord(value)) return "标题样式必须是一组属性";
  const weight = value.weight === undefined || value.weight === "" ? "600" : WEIGHTS[String(value.weight).trim()];
  if (!weight) return "标题字重只能是常规、中等、半粗或粗体";
  const color = value.color === undefined || value.color === "" ? "accent" : COLORS[String(value.color).trim()];
  if (!color) return "标题颜色只能是强调色、正文色或弱化色";
  const prefixIcon = readBool(value.prefixIcon, true);
  if (prefixIcon === null) return "标题前缀图标只能写开或关";
  return { weight, color, prefixIcon };
}

function readGroups(value: unknown): UiGroup[] | string {
  if (!Array.isArray(value)) return "分组配置缺少分组列表";
  if (value.length === 0) return "分组配置至少要有一个分组";
  if (value.length > 40) return "分组太多，最多四十个";
  const groups: UiGroup[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    const where = `第 ${index + 1} 个分组`;
    if (!isRecord(item)) return `${where}读不懂`;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    if (!ID_PATTERN.test(id)) return `${where}的标识只能用小写英文、数字和短横线`;
    if (RESERVED_IDS.has(id)) return "这个分组标识留给未分组和已完成，请换一个";
    if (seen.has(id)) return `分组标识重复：${id}`;
    seen.add(id);
    const displayName = typeof item.displayName === "string" ? item.displayName.trim() : "";
    if (displayName === "") return `${where}缺少显示名`;
    if ([...displayName].length > 40) return `${where}的显示名太长`;
    const icon = typeof item.icon === "string" ? item.icon.trim() : "";
    if (icon === "") return `分组「${displayName}」缺少图标`;
    if ([...icon].length > 8) return `分组「${displayName}」的图标太长`;
    const order = readOrder(item.order, index);
    if (typeof order === "string") return order;
    const collapsed = readBool(item.collapsed, false);
    if (collapsed === null) return `分组「${displayName}」是否收起只能写开或关`;
    const match = readMatch(item.match, displayName);
    if (typeof match === "string") return match;
    groups.push({ id, displayName, icon, order, collapsed, match });
  }
  return groups;
}

function readMatch(value: unknown, displayName: string): string[] | string {
  if (!Array.isArray(value) || value.length === 0) return `分组「${displayName}」没有匹配名`;
  if (value.length > 40) return `分组「${displayName}」的匹配名太多`;
  const match: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.trim() === "") return `分组「${displayName}」有一条空的匹配名`;
    const token = item.trim();
    if ([...token].length > 40) return `分组「${displayName}」的匹配名太长`;
    match.push(token);
  }
  return match;
}

function readOrder(value: unknown, index: number): number | string {
  if (value === undefined || value === "") return (index + 1) * 10;
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d+$/.test(text)) return "分组顺序必须是非负整数";
  const order = Number(text);
  if (order > 10_000) return "分组顺序太大";
  return order;
}

function readBool(value: unknown, fallback: boolean): boolean | null {
  if (value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "是" || value === "开") return true;
  if (value === "false" || value === "否" || value === "关") return false;
  return null;
}

function groupFor(face: AgentFace, groups: readonly UiGroup[]): UiGroup | null {
  const ordered = [...groups].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return ordered.find((group) => matchesGroup(face, group)) ?? null;
}

function matchesGroup(face: AgentFace, group: UiGroup): boolean {
  const fields = [norm(face.id), norm(face.role), norm(face.title)].filter((item) => item !== "");
  if (group.match.some((token) => fields.includes(norm(token)))) return true;
  const name = norm(group.displayName);
  return name.length >= 2 && norm(face.title).includes(name);
}

function sectionFrom(
  id: string,
  displayName: string,
  icon: string,
  order: number,
  collapsed: boolean,
  faces: readonly AgentFace[],
  title: TitleStyle,
): SidebarSection {
  const rows = [...faces].sort(compareFaces).map((face) => ({
    id: face.id,
    label: rowLabel(icon, face, title),
    weight: title.weight,
    color: title.color,
    needsYou: face.needsYou,
  }));
  return { id, displayName, icon, order, collapsed, rows };
}

function compareFaces(a: AgentFace, b: AgentFace): number {
  if (a.needsYou !== b.needsYou) return a.needsYou ? -1 : 1;
  const title = a.title.localeCompare(b.title, "zh-CN");
  if (title !== 0) return title;
  return a.id.localeCompare(b.id);
}

function flag(saved: Readonly<Record<string, boolean>>, id: string, fallback: boolean): boolean {
  return Object.prototype.hasOwnProperty.call(saved, id) ? saved[id] === true : fallback;
}

function panelFromHome(value: string | undefined): PanelId {
  if (!value) return "unknown";
  const parts = value.split(/[/\\]/).filter((part) => part !== "");
  const index = parts.findIndex((part) => part.toLowerCase() === "home");
  if (index < 0) return "unknown";
  return panelIdFromText(parts[index + 1] ?? "");
}

function gateItem(detail: string): StatusItem {
  const bad = /切断|出口不对|未放行/.test(detail);
  const ok = /已放行|出口正常/.test(detail);
  if (bad) return { id: "gate", label: "门卫", text: "门卫 🔴", tone: "bad" };
  if (ok) return { id: "gate", label: "门卫", text: "门卫 🟢", tone: "ok" };
  return { id: "gate", label: "门卫", text: "门卫 暂无数据", tone: "unknown" };
}

function quotaItem(details: readonly string[]): StatusItem {
  const values: number[] = [];
  for (const detail of details) {
    for (const match of detail.matchAll(/剩余\s*(\d+(?:\.\d+)?)\s*%/g)) values.push(Number(match[1]));
  }
  if (values.length === 0) return { id: "quota", label: "额度", text: "额度 暂无数据", tone: "unknown" };
  return { id: "quota", label: "额度", text: `额度剩余 ${formatPct(Math.min(...values))}%`, tone: "unknown" };
}

function hostItem(detail: string): StatusItem {
  const preferred = /负载\s*[:：]?\s*(\d+(?:\.\d+)?)\s*%/.exec(detail);
  const fallback = /(?:CPU|cpu|处理器|内存)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*%/.exec(detail);
  const found = preferred ?? fallback;
  if (!found) return { id: "host", label: "主机负载", text: "主机负载 暂无数据", tone: "unknown" };
  return { id: "host", label: "主机负载", text: `主机负载 ${formatPct(Number(found[1]))}%`, tone: "unknown" };
}

function formatPct(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function norm(value: string): string {
  return value.trim().toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
