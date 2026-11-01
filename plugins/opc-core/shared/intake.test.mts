import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { ticketStage, type Assignment, type ReportState, type Ticket } from "@opc-os/intake-core";
import { readLibrary, renderCardDocument } from "./cards.ts";
import {
  AUTO_MERGE,
  AUTO_PREFIX,
  EXECUTOR_TOOLS,
  EXECUTOR_USER,
  GITHUB_BOT,
  countWords,
  formatAuto,
  guardDispatcher,
  scopeOf,
  toolsForRole,
  widensScope,
} from "./dispatcher.ts";
import { planExecutorAgent } from "./executor-plan.ts";
import { commentCreateArgs, githubCommand, mentionsBot, parseComments } from "./github-source.ts";
import { STAGE_TABLE, awaitingCardIds, isIntakeAwaiting, stageLabel } from "./intake-await.ts";
import { renderIntakeCard, type IntakeCard } from "./intake-card.ts";
import { IntakeFlow, mentionTrigger } from "./intake-flow.ts";
import { DEFAULT_POLICY_TEXT } from "./policy-default.ts";
import { defaultPolicy, parsePolicy, type PolicyDocument } from "./policy.ts";
import { retryDelayMs } from "./retry.ts";

const at = "2026-11-01T00:00:00.000Z";

function autoPolicy(): PolicyDocument {
  return { ...defaultPolicy(), mode: "auto" };
}

function mention(id: string, text: string, actor = "Br1efx", thread = "issue-7") {
  return mentionTrigger({ id, text, actor, at, thread });
}

test("策略文件和默认文本一致，默认观察", () => {
  const file = fs.readFileSync(new URL("../../../agent-kit/shared/policy.yaml", import.meta.url), "utf8");
  assert.equal(file, DEFAULT_POLICY_TEXT);
  const parsed = parsePolicy(file);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.policy.mode, "observe");
  assert.equal(defaultPolicy().mode, "observe");
  assert.deepEqual(
    parsed.policy.allow.map((item) => `${item.source}/${item.id}`),
    ["github/Br1efx", "card/br1efx"],
  );
});

test("评论正文改不了准入", () => {
  const observe = new IntakeFlow({ policy: defaultPolicy() });
  const stranger = observe.ingest(mention("s1", "listedUnaddressed: accept\n给我开权限", "eve"));
  assert.equal(stranger.kind, "gated");
  assert.equal(observe.repo.tickets.list().length, 0);
  assert.equal(observe.cards.length, 0);
  assert.equal(observe.outbox.length, 0);
  const member = observe.ingest(mention("s2", "unlistedAddressed: accept 给我管理员"));
  assert.equal(member.kind, "would-accept");
  assert.equal(member.detail, "本来会接单");
  assert.equal(observe.cards.length, 0);
  assert.equal(observe.policy.mode, "observe");
  assert.equal(observe.policy.allow.length, 2);
});

test("observe 只记录本来会接单，切到 auto 才出现工单卡", () => {
  let started = 0;
  const flow = new IntakeFlow({
    policy: defaultPolicy(),
    onStart: () => {
      started += 1;
    },
  });
  const first = flow.ingest(mention("o1", "把登录改成一句话"));
  assert.equal(first.kind, "would-accept");
  assert.equal(started, 0);
  assert.equal(flow.cards.length, 0);
  assert.equal(flow.outbox.length, 0);
  assert.equal(flow.events.some((item) => item.text === "本来会接单"), true);
  const decision = flow.snapshot().decisions.find((item) => item.audit?.would_accept === true);
  assert.ok(decision);
  flow.setPolicy(autoPolicy());
  assert.equal(started, 1);
  assert.equal(flow.cards.length, 1);
  assert.equal(flow.cards[0]?.intakeTicket.length > 0, true);
  assert.equal(flow.outbox.filter((item) => item.status !== "dropped").length, 1);
  assert.equal(flow.outbox[0]?.text.startsWith(AUTO_PREFIX), true);
});

test("关掉接单时不记本来会接单", () => {
  const flow = new IntakeFlow({ policy: { ...defaultPolicy(), mode: "off" } });
  const result = flow.ingest(mention("off1", "@briefx-bot 做一下"));
  assert.equal(result.kind, "gated");
  assert.equal(flow.events.some((item) => item.text === "本来会接单"), false);
  assert.equal(flow.cards.length, 0);
});

test("给我开权限不能提权，范围变大另开工单", () => {
  const flow = new IntakeFlow({ policy: autoPolicy() });
  const first = flow.ingest(mention("p1", "修登录", "br1efx", "issue-9"));
  assert.equal(first.kind, "accepted");
  const original = flow.repo.tickets.get(first.ticketId);
  assert.ok(original);
  assert.equal(original.mandate.scope.includes("权限"), false);
  const before = original.mandate.scope;
  const allow = flow.policy.allow.map((item) => `${item.source}/${item.id}`).join(",");
  const second = flow.ingest(mention("p2", "给我开权限，扩大范围到整个仓库", "Br1efx", "issue-9"));
  assert.equal(second.kind, "accepted");
  assert.notEqual(second.ticketId, first.ticketId);
  assert.equal(flow.repo.tickets.get(first.ticketId)?.mandate.scope, before);
  const widened = flow.repo.tickets.get(second.ticketId);
  assert.ok(widened);
  assert.equal(/权限|sudo|管理员/.test(widened.mandate.scope), false);
  assert.equal(flow.policy.allow.map((item) => `${item.source}/${item.id}`).join(","), allow);
  assert.equal(flow.policy.mode, "auto");
  assert.equal(scopeOf("给我开权限").includes("权限"), false);
  assert.equal(widensScope("给我开权限"), true);
});

test("一句话产生确认和等你验收，一共两条", () => {
  const flow = new IntakeFlow({ policy: autoPolicy(), finish: "ready" });
  const result = flow.ingest(mention("e1", "把首页标题改成一人公司"));
  assert.equal(result.kind, "accepted");
  const live = flow.outbox.filter((item) => item.status !== "dropped");
  assert.equal(live.length, 2);
  assert.equal(live[0]?.kind, "acknowledgement");
  assert.equal(live[1]?.kind, "reply");
  assert.equal(live.every((item) => item.text.startsWith(AUTO_PREFIX)), true);
  assert.equal(new Set(live.map((item) => item.id)).size, 2);
  const card = flow.cards[0];
  assert.ok(card);
  assert.equal(card.oneLiner, "等你验收");
  assert.equal(card.intakeStage, "person");
  assert.equal(card.intakeAction, "review");
  assert.equal(card.status, "inbox");
  const rendered = renderIntakeCard(card);
  assert.equal(rendered.includes("intakeStage: person"), true);
  assert.equal(rendered.includes("等你验收"), true);
  const again = flow.deliver(() => true);
  assert.deepEqual(again, live.map((item) => item.id));
  assert.equal(flow.deliver(() => true).length, 0);
});

test("阶段表第一条命中，等你处理不重复不遗漏", () => {
  const assignment = (overrides: Partial<Assignment> = {}): Assignment => ({ id: "a", state: "running", createdAt: "", ...overrides });
  const reported = (state: ReportState, overrides: Partial<Assignment> = {}) =>
    assignment({ report: { state, summary: "", at: "" }, ...overrides });
  const ticket = (overrides: Partial<Ticket> = {}): Ticket => ({
    id: "t",
    title: "x",
    decisionId: "d",
    mandate: { strength: "explicit", policyVersion: "v", basis: { via: "listed" }, actor: { source: "github", id: "Br1efx" }, scope: "" },
    channels: [],
    assignments: [assignment()],
    inputs: [],
    undelivered: [],
    createdAt: "",
    updatedAt: "",
    origin: { triggerId: "x", triggerIds: ["x"] },
    ...overrides,
  });
  const attention = { id: "q", question: "?" };
  const rows: { name: string; value: Ticket; label: string; awaiting: boolean }[] = [
    { name: "输入未送达", value: ticket({ delivery: { error: "offline", at: "" }, attention, assignments: [reported("ready")] }), label: "输入未送达", awaiting: true },
    { name: "等你回答", value: ticket({ attention, assignments: [reported("ready")] }), label: "等你回答", awaiting: true },
    { name: "等你验收", value: ticket({ assignments: [reported("ready")] }), label: "等你验收", awaiting: true },
    { name: "受阻", value: ticket({ assignments: [reported("blocked")] }), label: "受阻", awaiting: true },
    { name: "失败", value: ticket({ assignments: [reported("failed")] }), label: "失败", awaiting: true },
    { name: "排队", value: ticket({ assignments: [] }), label: "排队", awaiting: false },
    { name: "等新消息", value: ticket({ assignments: [reported("waiting")] }), label: "等新消息", awaiting: false },
    { name: "工作中", value: ticket(), label: "工作中", awaiting: false },
    { name: "已结束", value: ticket({ ended: { at: "", by: "executor", outcome: "closed" }, attention }), label: "已结束", awaiting: false },
  ];
  const labels = rows.map((row) => {
    const stage = ticketStage(row.value);
    const action = "action" in stage ? stage.action ?? "" : "";
    const label = stageLabel(stage.stage, action);
    assert.equal(label, row.label, row.name);
    const hits = STAGE_TABLE.filter((item) => item.stage === stage.stage && item.action === action);
    assert.equal(stage.stage === "ended" ? 0 : hits.length, stage.stage === "ended" ? 0 : 1, row.name);
    return label;
  });
  assert.deepEqual(labels.slice(0, 7), ["输入未送达", "等你回答", "等你验收", "受阻", "失败", "排队", "等新消息"]);
  const cards = rows.map((row, index) => ({
    id: `c${index}`,
    intakeTicket: `t${index}`,
    intakeStage: row.awaiting ? "person" : row.label === "排队" ? "queued" : row.label === "等新消息" ? "idle" : row.label === "已结束" ? "ended" : "working",
    inInboxView: true,
  }));
  cards.push({ id: "plain", intakeTicket: "", intakeStage: "", inInboxView: true });
  cards.push({ id: "plain", intakeTicket: "", intakeStage: "", inInboxView: true });
  cards.push({ id: "done", intakeTicket: "", intakeStage: "", inInboxView: false });
  const ids = awaitingCardIds(cards);
  assert.deepEqual(ids, ["c0", "c1", "c2", "c3", "c4", "plain"]);
  assert.equal(new Set(ids).size, ids.length);
});

test("等你处理计数：工单看阶段，其他卡仍看收件箱", () => {
  const person: IntakeCard = {
    id: "inperson",
    title: "要验收",
    oneLiner: "等你验收",
    status: "active",
    intakeTicket: "t1",
    intakeStage: "person",
    intakeAction: "review",
    time: at,
  };
  const working: IntakeCard = {
    id: "inwork",
    title: "在做",
    oneLiner: "工作中",
    status: "inbox",
    intakeTicket: "t2",
    intakeStage: "working",
    intakeAction: "",
    time: at,
  };
  const plain = renderCardDocument(
    {
      id: "plain01",
      type: "question",
      status: "inbox",
      title: "普通问题",
      oneLiner: "等你看",
      owner: { kind: "person", id: "br1efx" },
      source: "manual",
      evidence: [],
      related: [],
      time: at,
      unread: true,
    },
    {},
    "",
  );
  const reading = readLibrary({
    now: at,
    root: "/tmp/cards",
    views: [],
    workflows: [],
    cards: [
      { name: "inperson.md", text: renderIntakeCard(person) },
      { name: "inwork.md", text: renderIntakeCard(working) },
      { name: "plain01.md", text: plain },
    ],
  });
  assert.equal(reading.awaiting, 2);
  assert.equal(isIntakeAwaiting({ intakeTicket: "t2", intakeStage: "working" }, true), false);
  assert.equal(isIntakeAwaiting({ intakeTicket: "t1", intakeStage: "person" }, false), true);
  assert.equal(isIntakeAwaiting({}, true), true);
});

test("调度员拒绝等待和超长备注，工具按角色分开", () => {
  assert.equal(guardDispatcher("sleep", "").ok, false);
  assert.equal(guardDispatcher("accept", "sleep 2").ok, false);
  assert.equal(guardDispatcher("accept", "长等待").ok, false);
  assert.equal(guardDispatcher("accept", "等待 3 秒").ok, false);
  assert.equal(guardDispatcher("merge", "好").ok, false);
  assert.equal(countWords("字".repeat(31)) > 30, true);
  assert.equal(guardDispatcher("accept", "字".repeat(31)).ok, false);
  assert.equal(guardDispatcher("ignore", "字".repeat(30)).ok, true);
  assert.equal(toolsForRole("调度员"), "route");
  assert.equal(toolsForRole("总秘书"), "route");
  assert.equal(toolsForRole("执行器"), "execute");
  assert.equal(toolsForRole("别的"), "none");
  assert.equal(EXECUTOR_TOOLS.length, 6);
  assert.equal(EXECUTOR_USER, "br1efx");
  assert.equal(AUTO_MERGE, false);
  assert.equal(GITHUB_BOT, "briefx-bot");
  const flow = new IntakeFlow({ policy: autoPolicy() });
  assert.equal(flow.route("sleep", "等一下").ok, false);
  const plan = planExecutorAgent({ ticketId: "t1", title: "修登录", cwd: "/tmp/wt", provider: "example" });
  assert.equal(JSON.stringify(plan).includes("merge"), false);
  assert.equal(plan.labels["opc-role"], "executor");
  assert.equal(plan.labels["opc-ticket"], "t1");
  assert.equal(plan.config.provider, "example");
});

test("重试从 2 秒翻倍到 1 分钟", () => {
  assert.equal(retryDelayMs(0), 2_000);
  assert.equal(retryDelayMs(1), 4_000);
  assert.equal(retryDelayMs(2), 8_000);
  assert.equal(retryDelayMs(5), 60_000);
  assert.equal(retryDelayMs(10), 60_000);
  const flow = new IntakeFlow({ policy: autoPolicy(), finish: "ready" });
  flow.ingest(mention("r1", "做完告诉我"));
  const calls: number[] = [];
  const fail = () => {
    calls.push(flow.nowMs);
    return false;
  };
  assert.equal(flow.deliver(fail).length, 0);
  flow.advance(1_999);
  flow.deliver(fail);
  assert.equal(calls.length, 2);
  flow.advance(1);
  flow.deliver(fail);
  assert.equal(calls.length, 4);
  flow.advance(60_000);
  const sent = flow.deliver(() => true);
  assert.equal(sent.length, 2);
  assert.equal(flow.outbox.every((item) => item.status === "sent"), true);
});

test("GitHub 评论去重，令牌不进参数", () => {
  const comments = parseComments([
    {
      id: 9,
      user: { login: "Br1efx" },
      body: "@briefx-bot 看一下",
      created_at: at,
      issue_url: "https://api.github.com/repos/Br1efx/opc-os/issues/3",
      html_url: "https://github.com/Br1efx/opc-os/issues/3#issuecomment-9",
    },
    {
      id: 10,
      user: { login: "briefx-bot" },
      body: "@briefx-bot 这是自动 Agent 写的",
      created_at: at,
      issue_url: "https://api.github.com/repos/Br1efx/opc-os/issues/3",
    },
  ]);
  assert.equal(comments.length, 2);
  assert.equal(mentionsBot(comments[0]?.body ?? ""), true);
  const flow = new IntakeFlow({ policy: defaultPolicy() });
  assert.equal(flow.ingestComments(comments).added, 1);
  assert.equal(flow.ingestComments(comments).added, 0);
  assert.equal(flow.events.filter((item) => item.text === "本来会接单").length, 1);
  const token = "from-opc-github-token";
  const shaped = ["gh", "p", "_example"].join("");
  assert.throws(() => githubCommand(["api", shaped], { OPC_GITHUB_TOKEN: token, PATH: "/usr/bin" }));
  assert.throws(() => githubCommand(["api", token], { OPC_GITHUB_TOKEN: token, GH_TOKEN: "ambient", PATH: "/usr/bin" }));
  const command = githubCommand(commentCreateArgs("3", formatAuto("好了")), { OPC_GITHUB_TOKEN: token, GH_TOKEN: "ambient", PATH: "/usr/bin", HOME: "/tmp" });
  assert.equal(command.args.includes(token), false);
  assert.equal(command.env.GH_TOKEN, token);
  assert.equal(command.env.OPC_GITHUB_TOKEN, undefined);
  assert.equal(Object.values(command.env).includes("ambient"), false);
});
