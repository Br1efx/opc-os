import assert from "node:assert/strict";
import test from "node:test";
import { parseCard } from "@opc-os/card-protocol";
import {
  GATEWAY_DEFAULTS,
  GATEWAY_TABS,
  MAGPIE_WEB_ORIGIN,
  UNLOADED,
  appKey,
  assertLoopback,
  costAlertCard,
  interpretMagpie,
  mockSnapshot,
  requestPlan,
  tagHeaders,
} from "./gateway.ts";
import { gatewaySettings } from "./gateway-settings.ts";

const tags = {
  person: "me",
  project: "opc",
  role: "owner",
  module: "m3-gateway",
};

test("应用钥匙按模块名生成，空模块拒绝", () => {
  assert.equal(appKey("m3-gateway"), "magpie-opc-m3-gateway");
  assert.equal(appKey("M3 Gateway"), "magpie-opc-m3-gateway");
  assert.throws(() => appKey(".."), /模块/);
});

test("打标签中间件带上人、项目、角色、模块和约定钥匙", () => {
  const headers = tagHeaders(tags);
  assert.equal(headers.authorization, "Bearer magpie-opc-m3-gateway");
  assert.equal(headers["x-api-key"], "magpie-opc-m3-gateway");
  assert.equal(headers["x-opc-person"], "me");
  assert.equal(headers["x-opc-project"], "opc");
  assert.equal(headers["x-opc-role"], "owner");
  assert.equal(headers["x-opc-module"], "m3-gateway");
  assert.equal(headers["x-magpie-session"], "opc-me-opc-owner-m3-gateway");
  assert.equal(headers["user-agent"], "opc-os/m3-gateway");
});

test("网关和网页口只接受本机地址", () => {
  assert.equal(assertLoopback(MAGPIE_WEB_ORIGIN).hostname, "127.0.0.1");
  assert.equal(assertLoopback("http://127.0.0.1:3425").port, "3425");
  assert.equal(assertLoopback("http://localhost:3475").hostname, "localhost");
  assert.throws(() => assertLoopback("http://0.0.0.0:3430"), /本机/);
  assert.throws(() => assertLoopback("http://10.1.2.3:3425"), /本机/);
  assert.throws(() => assertLoopback("https://usemagpie.ai"), /本机/);
});

test("探测计划先走 Magpie 正式路径，用量带今日，额度不刷新供应商", () => {
  const plan = requestPlan("http://127.0.0.1:3425", "opc-me-opc-owner-m3-gateway");
  const byKey = Object.fromEntries(plan.map((item) => [item.key, item.urls]));
  assert.deepEqual(byKey.hello, ["http://127.0.0.1:3425/api/hello"]);
  assert.deepEqual(byKey.models, ["http://127.0.0.1:3425/v1/models"]);
  assert.deepEqual(byKey.quotas, ["http://127.0.0.1:3425/v1/magpie/quotas?kept=1"]);
  assert.equal(byKey.usage[0], "http://127.0.0.1:3425/v1/magpie/usage?period=today");
  assert.equal(byKey.usage[1], "http://127.0.0.1:3425/usage?period=today");
  assert.equal(byKey.requests[0], "http://127.0.0.1:3425/v1/magpie/usage/requests?period=today&limit=20");
  assert.equal(byKey.requests[1], "http://127.0.0.1:3425/usage/requests?period=today&limit=20");
  assert.equal(
    byKey.route[0],
    "http://127.0.0.1:3425/v1/magpie/route?session=opc-me-opc-owner-m3-gateway",
  );
  assert.equal(byKey.route[1], "http://127.0.0.1:3425/route?session=opc-me-opc-owner-m3-gateway");
});

test("模拟数据标明今日花费，真机探测默认关闭", () => {
  const snap = mockSnapshot(tags, 25, "2026-11-01T00:00:00.000Z");
  assert.equal(snap.source, "mock");
  assert.equal(snap.probe, false);
  assert.equal(snap.todayUsd, 1.25);
  assert.match(snap.note, /模拟/);
  assert.match(snap.ledgerNote, /Token Ledger/);
  assert.match(snap.host.detail, /Host monitor/);
  assert.equal(snap.guard.detail.includes("Claude"), true);
  assert.equal(snap.breaker.tripped, false);
  assert.equal(snap.breaker.card, null);
  assert.deepEqual(
    GATEWAY_TABS.map((tab) => tab.title),
    ["额度用量", "路由", "请求日志", "供应商健康", "防封状态", "主机资源", "成本熔断"],
  );
  assert.match(UNLOADED.tokenLedger, /Token Ledger/);
  assert.match(UNLOADED.hostMonitor, /Host monitor/);
});

test("调低限额后生成可校验的熔断卡，高于花费则不触发", () => {
  const now = "2026-11-01T08:00:00.000Z";
  const tripped = costAlertCard({ spentUsd: 1.25, limitUsd: 0.5, now, source: "mock", tags });
  assert.ok(tripped);
  assert.equal(tripped.tripped, true);
  const parsed = parseCard(tripped.card);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.card.type, "question");
    assert.equal(parsed.card.status, "inbox");
    assert.equal(parsed.card.title, "成本熔断");
    assert.equal(parsed.card.unread, true);
    assert.match(parsed.card.oneLiner, /1\.25/);
    assert.match(parsed.card.oneLiner, /0\.50|0\.5/);
  }
  assert.equal(costAlertCard({ spentUsd: 1.25, limitUsd: 25, now, source: "mock", tags }), null);
  assert.equal(costAlertCard({ spentUsd: null, limitUsd: 0, now, source: "live", tags }), null);
});

test("正式用量里的 cost 是今日花费，短路径可以接上", () => {
  const live = interpretMagpie({
    probe: true,
    tags,
    limitUsd: 1,
    now: "2026-11-01T08:00:00.000Z",
    hello: { ok: true, body: { name: "magpie", version: "9" } },
    quotas: { ok: true, body: { object: "list", data: [{ provider: "cursor", user: "ada", remainingPct: 40 }] } },
    usage: { ok: true, body: { period: "today", cost: 3.5, calls: 4, errors: 1, input: 10, output: 20 } },
    requests: { ok: true, body: { rows: [{ model: "gpt", agent: "opc", cost: 0.2, in: 3, out: 4, provider: "cursor" }] } },
    route: { ok: true, body: { model: "cursor/gpt", provider: "cursor", fallbacks: ["backup"] } },
    models: { ok: true, body: { data: [{ id: "cursor/gpt", owned_by: "cursor" }] } },
    info: { ok: true, body: { name: "magpie", version: "9", pid: 42 } },
  });
  assert.equal(live.source, "live");
  assert.equal(live.todayUsd, 3.5);
  assert.equal(live.calls, 4);
  assert.match(live.quotas[0].title, /cursor/);
  assert.match(live.route.detail, /cursor\/gpt/);
  assert.match(live.requests[0].title, /gpt/);
  assert.match(live.providers[0].title, /cursor/);
  assert.match(live.host.detail, /42/);
  assert.match(live.guard.detail, /只读/);
  assert.equal(live.breaker.tripped, true);
  assert.equal(live.breaker.card?.title, "成本熔断");
});

test("网关设置默认不探测，限额 25 美元", () => {
  const parsed = gatewaySettings.schema.parse({});
  assert.equal(parsed.probe, false);
  assert.equal(parsed.spendLimitUsd, GATEWAY_DEFAULTS.spendLimitUsd);
  assert.equal(parsed.module, "m3-gateway");
  assert.equal(parsed.person, "me");
});
