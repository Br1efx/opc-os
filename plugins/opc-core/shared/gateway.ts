import { CARD_STATUSES, CARD_TYPES, parseCard, type Card } from "@opc-os/card-protocol";
import { z } from "zod";

/** 人 × 项目 × 角色 × 模块。打在出站请求和数据仓记录上。 */
export type Tags = {
  person: string;
  project: string;
  role: string;
  module: string;
};

export const GATEWAY_DEFAULTS = {
  probe: false,
  spendLimitUsd: 25,
  person: "me",
  project: "opc",
  role: "owner",
  module: "m3-gateway",
} as const;

/** 电脑端嵌 Magpie 网页。只绑本机，插件不读取 MAGPIE_WEB_KEY。 */
export const MAGPIE_WEB_ORIGIN = "http://127.0.0.1:3430";

export const GATEWAY_TABS = [
  { id: "usage", title: "额度用量" },
  { id: "route", title: "路由" },
  { id: "requests", title: "请求日志" },
  { id: "health", title: "供应商健康" },
  { id: "guard", title: "防封状态" },
  { id: "host", title: "主机资源" },
  { id: "breaker", title: "成本熔断" },
] as const;

export type GatewayTabId = (typeof GATEWAY_TABS)[number]["id"];

/**
 * 仓库里没有这两块的独立实现，也不新造一份。
 * Token Ledger 用 Magpie 用量的 cost 代替。
 * Host monitor 用网关自报的进程信息代替，不采集 CPU / 内存。
 * 关掉模块 m3-gateway 就会从侧栏卸掉。
 * Paseo 的 registerUsageSource 会去发现登录，这里不用。
 */
export const UNLOADED = {
  tokenLedger:
    "仓库里没有单独的 Token Ledger。今日花费就是 Magpie 用量里的 cost。关掉本模块即卸掉，不另起账本。Paseo 的 registerUsageSource 会发现登录，这里不用它。",
  hostMonitor:
    "仓库里没有 Host monitor。这里只显示网关自报的进程，不采集 CPU 或内存。关掉模块「网关与监控」就从侧栏卸掉。",
} as const;

export const GUARD_TEXT =
  "只读。不改 Magpie 限流，不关闭账号发现（现网为了 Cursor 订阅模型开着，不要设 MAGPIE_NO_ACCOUNTS），不启用 Claude 订阅桥。";

const USAGE_EVIDENCE = "http://127.0.0.1:3425/v1/magpie/usage?period=today";
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);
const HTTP_URL = /^(https?):\/\/(\[[^\]]+\]|[^/?#:]+)(?::(\d+))?([^?#]*)(\?[^#]*)?$/i;

/** React Native 自带的 URL 类型没有 hostname。这里自己拆，避免界面端和 daemon 各看一套。 */
export type HttpLocation = {
  protocol: string;
  hostname: string;
  port: string;
  origin: string;
  pathname: string;
  search: string;
};

export type Line = { title: string; detail: string };

export type FetchDoc = { ok: boolean; body: unknown };

const lineSchema = z.object({ title: z.string(), detail: z.string() });

const cardSchema = z.object({
  id: z.string(),
  type: z.enum(CARD_TYPES),
  status: z.enum(CARD_STATUSES),
  title: z.string(),
  oneLiner: z.string(),
  owner: z.object({ kind: z.enum(["person", "agent"]), id: z.string() }),
  source: z.string(),
  evidence: z.array(z.string()),
  related: z.array(z.string()),
  time: z.string(),
  unread: z.boolean(),
});

export const gatewaySnapshotSchema = z.object({
  source: z.enum(["mock", "live", "unreachable"]),
  probe: z.boolean(),
  todayUsd: z.number().nullable(),
  calls: z.number().nullable(),
  spendLabel: z.string(),
  note: z.string(),
  ledgerNote: z.string(),
  hello: z.object({
    ok: z.boolean(),
    name: z.string(),
    version: z.string(),
    detail: z.string(),
  }),
  quotas: z.array(lineSchema),
  route: lineSchema,
  requests: z.array(lineSchema),
  providers: z.array(lineSchema),
  guard: lineSchema,
  host: lineSchema,
  breaker: z.object({
    limitUsd: z.number(),
    tripped: z.boolean(),
    card: cardSchema.nullable(),
  }),
  datad: z.object({
    status: z.enum(["stored", "down", "skipped"]),
    detail: z.string(),
  }),
  tags: z.object({
    person: z.string(),
    project: z.string(),
    role: z.string(),
    module: z.string(),
  }),
  appKey: z.string(),
  time: z.string(),
});

export type GatewaySnapshot = z.infer<typeof gatewaySnapshotSchema>;

export type PlannedRead = { key: "hello" | "models" | "quotas" | "usage" | "requests" | "route" | "info"; urls: string[] };

export function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** 本机网关认 `magpie-opc-<模块>` 这把钥匙，用来在用量里标出调用方。 */
export function appKey(module: string): string {
  const name = slug(module);
  if (!name) throw new Error("模块名不能为空");
  return `magpie-opc-${name}`;
}

export function sessionOf(tags: Tags): string {
  const parts = [slug(tags.person), slug(tags.project), slug(tags.role), slug(tags.module)];
  if (parts.some((part) => part === "")) throw new Error("标签不能为空");
  return ["opc", ...parts].join("-");
}

/** 出站请求统一打上标签。空模块或空标签直接拒绝，避免记成一笔无名花费。 */
export function tagHeaders(tags: Tags): Record<string, string> {
  const key = appKey(tags.module);
  return {
    authorization: `Bearer ${key}`,
    "x-api-key": key,
    "x-opc-person": tags.person.trim(),
    "x-opc-project": tags.project.trim(),
    "x-opc-role": tags.role.trim(),
    "x-opc-module": tags.module.trim(),
    "x-magpie-session": sessionOf(tags),
    "user-agent": `opc-os/${slug(tags.module)}`,
  };
}

/** 网关、网页口、数据仓都只允许本机。拒绝 0.0.0.0 和局域网。 */
export function assertLoopback(origin: string): HttpLocation {
  const match = HTTP_URL.exec(origin.trim());
  if (!match) throw new Error("地址不合法，只允许本机");
  const protocol = `${match[1].toLowerCase()}:`;
  if (protocol !== "http:" && protocol !== "https:") throw new Error("地址不合法，只允许本机");
  const rawHost = match[2] ?? "";
  const hostname = rawHost.startsWith("[") ? rawHost.slice(1, -1) : rawHost.toLowerCase();
  if (!LOOPBACK.has(hostname)) throw new Error(`网关和网页口只允许本机，拒绝 ${hostname}`);
  const port = match[3] ?? "";
  const hostText = rawHost.startsWith("[") ? rawHost : hostname;
  return {
    protocol,
    hostname,
    port,
    origin: `${protocol}//${hostText}${port ? `:${port}` : ""}`,
    pathname: match[4] || "/",
    search: match[5] ?? "",
  };
}

export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 0.01) return value.toFixed(2);
  return value.toFixed(6);
}

/**
 * 花费达到或超过限额时生成一张问题卡。
 * 花费未知、限额不是有限非负数时不报警，避免把探测失败当成超支。
 */
export function costAlertCard(input: {
  spentUsd: number | null;
  limitUsd: number;
  now: string;
  source: "mock" | "live" | "unreachable";
  tags: Tags;
}): { tripped: true; card: Card } | null {
  const { spentUsd, limitUsd } = input;
  if (spentUsd == null || !Number.isFinite(spentUsd) || !Number.isFinite(limitUsd) || limitUsd < 0) return null;
  if (spentUsd < limitUsd) return null;
  const day = input.now.slice(0, 10);
  const card: Card = {
    id: `gateway-cost-${day || "unknown"}`,
    type: "question",
    status: "inbox",
    title: "成本熔断",
    oneLiner: `${input.tags.person} / ${input.tags.project} / ${input.tags.role} / ${input.tags.module}：今日花费 ${formatUsd(spentUsd)} 美元，限额 ${formatUsd(limitUsd)} 美元。`,
    owner: { kind: "agent", id: "opc-gateway" },
    source: `magpie:${input.source}`,
    evidence: [USAGE_EVIDENCE],
    related: [],
    time: input.now,
    unread: true,
  };
  const parsed = parseCard(card);
  if (!parsed.ok) throw new Error("熔断卡没有通过卡片协议");
  return { tripped: true, card: parsed.card };
}

/** 正式路径在前。用量和请求日志在 404 时再试任务里写的短路径。额度带 kept=1，不主动找供应商刷新。 */
export function requestPlan(origin: string, session: string): PlannedRead[] {
  const root = assertLoopback(origin).origin;
  const url = (path: string) => `${root}${path.startsWith("/") ? path : `/${path}`}`;
  const encoded = encodeURIComponent(session);
  return [
    { key: "hello", urls: [url("/api/hello")] },
    { key: "models", urls: [url("/v1/models")] },
    { key: "quotas", urls: [url("/v1/magpie/quotas?kept=1")] },
    {
      key: "usage",
      urls: [url("/v1/magpie/usage?period=today"), url("/usage?period=today"), url("/api/usage?period=today")],
    },
    {
      key: "requests",
      urls: [
        url("/v1/magpie/usage/requests?period=today&limit=20"),
        url("/usage/requests?period=today&limit=20"),
      ],
    },
    {
      key: "route",
      urls: [url(`/v1/magpie/route?session=${encoded}`), url(`/route?session=${encoded}`)],
    },
    { key: "info", urls: [url("/v1")] },
  ];
}

export function mockSnapshot(tags: Tags, limitUsd: number, now: string): GatewaySnapshot {
  const hello = { ok: true, name: "magpie", version: "mock", detail: "模拟的 hello，没有访问网关" };
  return finishSnapshot({
    source: "mock",
    probe: false,
    todayUsd: 1.25,
    calls: 2,
    note: "这是模拟数据。打开真机探测后，才向本机网关读 hello、额度和用量。",
    hello,
    quotas: [{ title: "模拟额度", detail: "不是这台电脑上的 Magpie。" }],
    route: { title: "模拟路由", detail: "真机探测关闭时不查询路由。" },
    requests: [{ title: "模拟请求", detail: "没有请求日志。" }],
    providers: [{ title: "模拟供应商", detail: "没有健康检查。" }],
    guard: { title: "防封状态", detail: GUARD_TEXT },
    host: { title: "主机资源", detail: UNLOADED.hostMonitor },
    tags,
    time: now,
    limitUsd,
    datad: { status: "skipped", detail: "还没有写入 opc-datad。" },
  });
}

export function interpretMagpie(input: {
  probe: boolean;
  tags: Tags;
  limitUsd: number;
  now: string;
  hello: FetchDoc;
  quotas: FetchDoc;
  usage: FetchDoc;
  requests: FetchDoc;
  route: FetchDoc;
  models: FetchDoc;
  info: FetchDoc;
}): GatewaySnapshot {
  const usage = usageNumbers(input.usage);
  const live = input.usage.ok;
  const pid = pidOf(input.info);
  const hostDetail = pid == null ? UNLOADED.hostMonitor : `${UNLOADED.hostMonitor} 网关进程 ${pid}。`;
  const errors = usage.errors;
  const guardDetail = errors != null && errors > 0 ? `${GUARD_TEXT}今日错误 ${errors} 次。` : GUARD_TEXT;
  return finishSnapshot({
    source: live ? "live" : "unreachable",
    probe: input.probe,
    todayUsd: live ? usage.cost : null,
    calls: live ? usage.calls : null,
    note: live ? "数字来自这台电脑上的 Magpie。" : "真机探测没有读到用量。下面不是模拟花费。",
    hello: helloOf(input.hello),
    quotas: input.quotas.ok ? quotaLines(input.quotas.body) : [{ title: "额度", detail: "额度接口没有回应。" }],
    route: input.route.ok ? routeLine(input.route.body) : { title: "路由", detail: "路由没读到。" },
    requests: input.requests.ok ? requestLines(input.requests.body) : [{ title: "请求", detail: "请求日志没读到。" }],
    providers: input.models.ok
      ? providerLines(input.models.body)
      : [{ title: "供应商", detail: "模型列表没读到。" }],
    guard: { title: "防封状态", detail: guardDetail },
    host: { title: "主机资源", detail: hostDetail },
    tags: input.tags,
    time: input.now,
    limitUsd: input.limitUsd,
    datad: { status: "skipped", detail: "还没有写入 opc-datad。" },
  });
}

function finishSnapshot(input: {
  source: GatewaySnapshot["source"];
  probe: boolean;
  todayUsd: number | null;
  calls: number | null;
  note: string;
  hello: GatewaySnapshot["hello"];
  quotas: Line[];
  route: Line;
  requests: Line[];
  providers: Line[];
  guard: Line;
  host: Line;
  tags: Tags;
  time: string;
  limitUsd: number;
  datad: GatewaySnapshot["datad"];
}): GatewaySnapshot {
  const alert = costAlertCard({
    spentUsd: input.todayUsd,
    limitUsd: input.limitUsd,
    now: input.time,
    source: input.source,
    tags: input.tags,
  });
  const snap: GatewaySnapshot = {
    source: input.source,
    probe: input.probe,
    todayUsd: input.todayUsd,
    calls: input.calls,
    spendLabel: input.todayUsd == null ? "还没有读到今日花费" : `${formatUsd(input.todayUsd)} 美元`,
    note: input.note,
    ledgerNote: UNLOADED.tokenLedger,
    hello: input.hello,
    quotas: input.quotas,
    route: input.route,
    requests: input.requests,
    providers: input.providers,
    guard: input.guard,
    host: input.host,
    breaker: {
      limitUsd: input.limitUsd,
      tripped: alert?.tripped ?? false,
      card: alert
        ? { ...alert.card, evidence: [...alert.card.evidence], related: [...alert.card.related] }
        : null,
    },
    datad: input.datad,
    tags: input.tags,
    appKey: appKey(input.tags.module),
    time: input.time,
  };
  return gatewaySnapshotSchema.parse(snap);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return "";
}

function numberField(record: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function firstArray(body: unknown, keys: readonly string[]): unknown[] | null {
  if (Array.isArray(body)) return body;
  if (!isRecord(body)) return null;
  for (const key of keys) {
    if (Array.isArray(body[key])) return body[key];
  }
  return null;
}

function readCost(body: Record<string, unknown>): number | null {
  const direct = numberField(body, ["cost", "costUsd", "cost_usd"]);
  if (direct != null) return direct;
  if (isRecord(body.totals)) return numberField(body.totals, ["cost", "costUsd"]);
  return null;
}

function usageNumbers(doc: FetchDoc): { cost: number | null; calls: number | null; errors: number | null } {
  if (!doc.ok || !isRecord(doc.body)) return { cost: null, calls: null, errors: null };
  return {
    cost: readCost(doc.body),
    calls: numberField(doc.body, ["calls"]),
    errors: numberField(doc.body, ["errors"]),
  };
}

function helloOf(doc: FetchDoc): GatewaySnapshot["hello"] {
  if (!doc.ok || !isRecord(doc.body)) return { ok: false, name: "", version: "", detail: "没有连上 Magpie" };
  const name = stringField(doc.body, ["name"]) || "magpie";
  const version = stringField(doc.body, ["version"]);
  return { ok: true, name, version, detail: [name, version].filter(Boolean).join(" ") };
}

function pidOf(doc: FetchDoc): number | null {
  if (!doc.ok || !isRecord(doc.body)) return null;
  const pid = doc.body.pid;
  return typeof pid === "number" && Number.isFinite(pid) ? pid : null;
}

function quotaLines(body: unknown): Line[] {
  const data = firstArray(body, ["data", "quotas", "accounts"]);
  if (!data || data.length === 0) {
    return [{ title: "额度", detail: "接口有响应，但没有账户窗口。账号发现保持现网状态，这里不关闭。" }];
  }
  return data.slice(0, 8).map((item) => {
    if (!isRecord(item)) return { title: "额度", detail: "有一条读不懂的额度。" };
    const provider = stringField(item, ["provider", "id", "name"]) || "未命名";
    const user = stringField(item, ["user", "account", "label"]);
    const remain = numberField(item, ["remainingPct", "remaining"]);
    const bits = [user, remain == null ? "" : `剩余 ${remain}%`].filter(Boolean);
    return { title: user ? `${provider} · ${user}` : provider, detail: bits.join(" · ") || "已读到额度" };
  });
}

function routeLine(body: unknown): Line {
  if (!isRecord(body)) return { title: "路由", detail: "没有路由记录" };
  const model = stringField(body, ["model", "picked", "route"]) || "未选定";
  const provider = stringField(body, ["provider"]);
  const fallbacks = Array.isArray(body.fallbacks)
    ? body.fallbacks.filter((item): item is string => typeof item === "string" && item.trim() !== "")
    : [];
  const detail = [model, provider, fallbacks.length > 0 ? `回退 ${fallbacks.join("、")}` : ""].filter(Boolean).join(" · ");
  return { title: "当前路由", detail };
}

function requestLines(body: unknown): Line[] {
  const rows = firstArray(body, ["rows", "data", "requests"]);
  if (!rows || rows.length === 0) return [{ title: "请求", detail: "今日还没有请求记录" }];
  return rows.slice(0, 8).map((row) => {
    if (!isRecord(row)) return { title: "请求", detail: "有一条读不懂的请求" };
    const model = stringField(row, ["model", "served", "req"]) || "未命名模型";
    const agent = stringField(row, ["agent", "agentName"]);
    const cost = numberField(row, ["cost", "costUsd"]);
    const detail = [agent, cost == null ? "" : `${formatUsd(cost)} 美元`].filter(Boolean).join(" · ");
    return { title: model, detail: detail || "已记录" };
  });
}

function providerLines(body: unknown): Line[] {
  const data = firstArray(body, ["data", "models"]);
  if (!data) return [{ title: "供应商", detail: "模型列表没读到" }];
  const counts = new Map<string, number>();
  for (const item of data) {
    if (!isRecord(item)) continue;
    const name = stringField(item, ["owned_by", "provider"]) || "未命名";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  if (counts.size === 0) return [{ title: "供应商", detail: "网关没有列出模型" }];
  return [...counts].slice(0, 8).map(([name, count]) => ({ title: name, detail: `${count} 个模型` }));
}
