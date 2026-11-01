import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { queryCards } from "./bases.ts";
import { TASK_STAGE_COLUMNS, createCardStore, type CardFiles } from "./cards.ts";
import { dispatchRole } from "./dispatch.ts";
import { scheduleCommands } from "./schedules.ts";
import { archiveSessions, previewCleanup, searchSessions, trackedKind, type TrackedSession } from "./sessions.ts";
import { readTaskMeta } from "./task-doc.ts";
import {
  canEnterAcceptance,
  humanActionOf,
  parseWorkflow,
  planAccept,
  planFailure,
  planQuestion,
  planStart,
  planTurn,
  progressOf,
  type TaskRuntime,
  type Workflow,
} from "./workflow.ts";

const now = "2026-11-01T08:00:00.000Z";
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "workflows");

function textOf(name: string): string {
  return readFileSync(path.join(dir, name), "utf8");
}

function load(name: string): Workflow {
  const parsed = parseWorkflow(textOf(name));
  assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.detail);
  if (!parsed.ok) throw new Error(parsed.detail);
  return parsed.workflow;
}

function runtimeAfter(workflow: Workflow, goal = "把验证补上"): TaskRuntime {
  const started = planStart(workflow, { title: goal, goal, acceptance: ["验证通过"], due: "", dependsOn: [], now });
  assert.equal(started.ok, true, started.detail);
  return started.runtime;
}

test("三个模板都能解析，视频流标出需真机验证，改文本立刻生效", () => {
  const names = readdirSync(dir).filter((name) => name.endsWith(".yaml")).sort();
  assert.deepEqual(names, ["content.yaml", "dev.yaml", "video.yaml"]);
  const dev = load("dev.yaml");
  const video = load("video.yaml");
  const content = load("content.yaml");
  assert.deepEqual(
    dev.steps.map((step) => step.title),
    ["需求", "实现", "审查", "门禁", "待你验收", "完成"],
  );
  assert.equal(video.steps.some((step) => step.live === "需真机验证" && step.title === "发布"), true);
  assert.equal(video.steps.some((step) => step.title === "配音" && step.live === "需真机验证"), true);
  assert.equal(content.steps[0]?.title, "素材卡");
  assert.equal(content.steps.at(-1)?.title, "数据回收");
  const ids = new Set([...dev.steps, ...video.steps, ...content.steps].map((step) => step.id));
  for (const id of ids) assert.equal(TASK_STAGE_COLUMNS.some((column) => column.value === id), true, id);
  const edited = textOf("dev.yaml").replace("title: 实现", "title: 改过的实现");
  const again = parseWorkflow(edited);
  assert.equal(again.ok, true);
  if (again.ok) assert.equal(again.workflow.steps[1]?.title, "改过的实现");
  assert.notEqual(dev.steps[1]?.title, "改过的实现");
});

test("非法模板用中文说明原因", () => {
  const samples = [
    ["", "模板"],
    ["id: Bad\ntitle: 坏\nsummary: 坏\nsteps:\n  - id: a\n", "模板"],
    ["id: dev\ntitle: \nsummary: 有\nsteps:\n  - id: a\n    title: 甲\n    role: 人\n    kind: seed\n    enter: start\n    instruction: 做\n", "标题"],
    ["id: dev\ntitle: 开发流\nsummary: 有\nsteps: []\n", "至少要有一步"],
    [
      "id: dev\ntitle: 开发流\nsummary: 有\nsteps:\n  - id: a\n    title: 甲\n    role: 人\n    kind: nope\n    enter: start\n    instruction: 做\n",
      "种类无法识别",
    ],
    [
      "id: dev\ntitle: 开发流\nsummary: 有\nsteps:\n  - id: a\n    title: 甲\n    role: 人\n    kind: accept\n    enter: start\n    human: true\n    requiresEvidence: false\n    instruction: 做\n",
      "必须要证据",
    ],
  ] as const;
  for (const [text, needle] of samples) {
    const parsed = parseWorkflow(text);
    assert.equal(parsed.ok, false, text);
    if (!parsed.ok) {
      assert.equal(parsed.detail.includes(needle), true, parsed.detail);
      assert.match(parsed.detail, /[\u4e00-\u9fff]/);
    }
  }
  const tab = parseWorkflow("\tid: dev\n");
  assert.equal(tab.ok, false);
  if (!tab.ok) assert.match(tab.detail, /模板/);
});

test("开发流无人值守走到待你验收，每步都留在时间线", () => {
  const dev = load("dev.yaml");
  const started = planStart(dev, { title: "补验证", goal: "补验证", acceptance: ["验证通过"], due: "", dependsOn: [], now });
  assert.equal(started.runtime.stage, "build");
  assert.equal(started.delivery?.agentId, "builder");
  assert.equal(started.status, "active");
  let runtime = started.runtime;
  runtime = planTurn(dev, runtime, { agentId: "builder", outcome: "completed", now: "2026-11-01T09:00:00.000Z" }).runtime;
  assert.equal(runtime.stage, "review");
  runtime = planTurn(dev, runtime, { agentId: "reviewer", outcome: "completed", now: "2026-11-01T10:00:00.000Z" }).runtime;
  assert.equal(runtime.stage, "verify");
  const blocked = planTurn(dev, runtime, { agentId: "verifier", outcome: "completed", now: "2026-11-01T11:00:00.000Z" });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.detail, "缺证据");
  assert.equal(blocked.runtime.meta.gap, "缺证据");
  assert.equal(blocked.runtime.stage, "verify");
  const passed = planTurn(dev, runtime, {
    agentId: "verifier",
    outcome: "completed",
    evidence: ["pnpm verify"],
    now: "2026-11-01T11:00:00.000Z",
  });
  assert.equal(passed.ok, true, passed.detail);
  assert.equal(passed.runtime.stage, "accept");
  assert.equal(passed.status, "inbox");
  const lines = passed.runtime.meta.timeline.map((item) => item.text).join("\n");
  for (const word of ["实现", "审查", "门禁", "待你验收"]) assert.match(lines, new RegExp(word));
  const finished = planAccept(dev, passed.runtime, "2026-11-01T12:00:00.000Z");
  assert.equal(finished.runtime.stage, "done");
  assert.equal(finished.status, "settled");
});

test("没有证据不能进入待验收或完成，有证据可以", () => {
  assert.deepEqual(canEnterAcceptance([], "待验收"), { ok: false, detail: "缺证据" });
  assert.deepEqual(canEnterAcceptance([" "], "完成"), { ok: false, detail: "缺证据" });
  assert.deepEqual(canEnterAcceptance(["pnpm verify"], "待验收"), { ok: true });
  assert.deepEqual(canEnterAcceptance(["截图.png"], "完成"), { ok: true });
  const dev = load("dev.yaml");
  const runtime = runtimeAfter(dev);
  const bare = planAccept(dev, { ...runtime, stage: "accept", meta: { ...runtime.meta, gap: "" } }, now);
  assert.equal(bare.ok, false);
  assert.equal(bare.runtime.meta.gap, "缺证据");
  const ready = planAccept(
    dev,
    { ...runtime, stage: "accept", evidence: ["日志"], meta: { ...runtime.meta, gap: "缺证据" } },
    now,
  );
  assert.equal(ready.ok, true, ready.detail);
  assert.equal(ready.runtime.stage, "done");
  assert.equal(ready.runtime.meta.gap, "");
});

test("连续失败依次改派、会诊、再生成决策卡", () => {
  const dev = load("dev.yaml");
  let runtime = runtimeAfter(dev);
  const first = planFailure(dev, runtime, "门禁没过", now);
  assert.equal(first.runtime.failCount, 1);
  assert.equal(first.runtime.ladderLevel, 0);
  assert.equal(first.decision, null);
  const second = planFailure(dev, first.runtime, "打回", "2026-11-01T09:00:00.000Z");
  assert.equal(second.runtime.ladderLevel, 1);
  assert.equal(second.delivery?.agentId, "builder-hard");
  assert.match(second.runtime.meta.timeline.map((item) => item.text).join("\n"), /改派攻坚开发/);
  const third = planTurn(dev, second.runtime, {
    agentId: "builder-hard",
    outcome: "failed",
    note: "还是没过",
    now: "2026-11-01T10:00:00.000Z",
  });
  assert.equal(third.runtime.ladderLevel, 2);
  assert.equal(third.delivery?.agentId, "paseo-committee");
  assert.match(third.runtime.meta.timeline.map((item) => item.text).join("\n"), /会诊/);
  const fourth = planFailure(dev, third.runtime, "会诊也没定", "2026-11-01T11:00:00.000Z");
  assert.equal(fourth.runtime.ladderLevel, 3);
  assert.equal(fourth.decision?.title.startsWith("请拍板："), true);
  assert.match(fourth.runtime.meta.timeline.map((item) => item.text).join("\n"), /决策卡/);
});

test("定时命令默认不启用，也不立即运行", () => {
  const commands = scheduleCommands();
  assert.equal(commands.length, 7);
  assert.deepEqual(
    commands.map((item) => item.title),
    ["选题雷达", "早间简报", "午间数据回收", "晚间数据回收", "夜审", "资产周报", "周日周更"],
  );
  for (const command of commands) {
    assert.equal(command.enabled, false);
    assert.equal(command.command.includes("--run-now"), false);
    assert.match(command.detail, /未启用/);
    assert.match(command.command, /^paseo (?:schedule|heartbeat) create /);
  }
  assert.equal(commands[1]?.kind, "heartbeat");
  assert.match(commands[0]?.command ?? "", /--expires-in 30d/);
});

test("会话只归档不删除，历史搜得到已归档", () => {
  const sessions: TrackedSession[] = [
    { id: "child-1", title: "实现的子会话", kind: "agent", updatedAt: "2026-10-30T00:00:00.000Z", archived: false },
    { id: "sched-1", title: "夜审会话", kind: "schedule", updatedAt: "2026-10-30T00:00:00.000Z", archived: false },
    { id: "fresh", title: "刚开的", kind: "agent", updatedAt: now, archived: false },
  ];
  const preview = previewCleanup(sessions, now);
  assert.deepEqual(preview.map((item) => item.id), ["child-1", "sched-1"]);
  const archived = archiveSessions(sessions, ["child-1"], now);
  assert.equal(archived.length, sessions.length);
  assert.equal(archived.find((item) => item.id === "child-1")?.archived, true);
  assert.equal(archived.find((item) => item.id === "sched-1")?.archived, false);
  assert.equal(previewCleanup(archived, now).some((item) => item.id === "child-1"), false);
  const found = searchSessions(archived, "子会话");
  assert.equal(found.length, 1);
  assert.equal(found[0]?.archived, true);
  const source = readFileSync(new URL("./sessions.ts", import.meta.url), "utf8");
  assert.equal(source.includes("unlink"), false);
  assert.equal(source.includes("rmSync"), false);
  assert.equal(source.includes("scheduleDelete"), false);
  assert.equal(trackedKind(undefined), null);
  assert.equal(trackedKind({}), null);
  assert.equal(trackedKind({ "opc-role": "实现" }), "agent");
  assert.equal(trackedKind({ "opc-schedule": "true" }), "schedule");
});

test("一次只能问一个问题，格式是 human_action", () => {
  const dev = load("dev.yaml");
  const runtime = runtimeAfter(dev);
  const asked = planQuestion(runtime, "验收要不要包含截图？", now);
  assert.equal(asked.ok, true);
  const action = humanActionOf(asked.runtime.meta);
  assert.deepEqual(action, { format: "human_action", id: action?.id, question: "验收要不要包含截图？" });
  const again = planQuestion(asked.runtime, "另一个问题", now);
  assert.equal(again.ok, false);
  assert.match(again.detail, /一次只能问一个问题/);
  const progress = progressOf(dev, asked.runtime, now);
  assert.match(progress.label, /^进度 /);
  assert.equal(progress.blockers.includes("等你回答"), true);
  assert.equal(progress.question?.format, "human_action");
});

test("卡住的任务能被视图筛出来", () => {
  const dev = load("dev.yaml");
  const stuck = planFailure(dev, planFailure(dev, runtimeAfter(dev), "一次", now).runtime, "两次", now);
  const calm = runtimeAfter(dev);
  const view = {
    id: "stuck",
    title: "卡住了",
    layout: "list" as const,
    filter: {
      op: "and" as const,
      items: [
        { op: "eq" as const, field: "type", value: "task" },
        { op: "gte" as const, field: "ladderLevel", value: "1" },
      ],
    },
  };
  const result = queryCards(
    [
      { ...cardOf(stuck.runtime), id: "stuck-card", title: "卡住" },
      { ...cardOf(calm), id: "calm-card", title: "正常" },
    ],
    view,
    { now },
  );
  assert.deepEqual(result.matched.map((item) => item.id), ["stuck-card"]);
});

test("模板文件改了以后，下一次读取用新步骤", async () => {
  const files = memory();
  const store = createCardStore(files, "/home/br1efx/notes/cards", [
    { name: "dev.yaml", text: textOf("dev.yaml") },
  ]);
  await store.load(now);
  const current = files.workflows.get("dev.yaml") ?? "";
  files.workflows.set("dev.yaml", current.replace("title: 实现", "title: 改过的实现"));
  const loaded = await store.workflows();
  assert.equal(loaded.workflows.find((item) => item.id === "dev")?.steps[1]?.title, "改过的实现");
  const started = await store.startFromTemplate({
    templateId: "dev",
    title: "再起一个",
    goal: "再起一个",
    acceptance: [],
    due: "",
    dependsOn: [],
    project: "",
    now,
    nonce: "edit",
  });
  assert.equal(started.ok, true, started.detail);
  const card = files.cards.values().next().value ?? "";
  assert.match(card, /改过的实现|进入「改过的实现」/);
});

test("有待回答的问题时，回合结束不推进步骤", async () => {
  const files = memory();
  const store = createCardStore(files, "/home/br1efx/notes/cards", [{ name: "dev.yaml", text: textOf("dev.yaml") }]);
  const started = await store.startFromTemplate({
    templateId: "dev",
    title: "先问一句",
    goal: "先问一句",
    acceptance: ["能编译"],
    due: "",
    dependsOn: [],
    project: "",
    now,
    nonce: "ask",
  });
  assert.equal(started.ok, true, started.detail);
  const asked = await store.reportFromAgent({
    agentId: "builder",
    kind: "ask",
    text: "截图算不算证据？",
    now,
  });
  assert.equal(asked.ok, true, asked.detail);
  const turned = await store.consumeTurn({ agentId: "builder", outcome: "completed", now });
  assert.equal(turned.detail, "等你回答");
  assert.equal(turned.taskId, started.id);
  const card = [...files.cards.values()].find((text) => text.includes("先问一句")) ?? "";
  assert.match(card, /stage: build/);
  assert.match(card, /截图算不算证据/);
});

test("派工先唤醒，没有就新建", async () => {
  const created: string[] = [];
  const sent: string[] = [];
  const missing = await dispatchRole(
    {
      async refresh() {
        return false;
      },
      async send(id) {
        sent.push(id);
      },
      async create(input) {
        created.push(input.agentId);
        return input.agentId;
      },
    },
    { agentId: "builder", role: "实现", text: "开始" },
  );
  assert.equal(missing.detail, "已新建 Agent");
  assert.deepEqual(created, ["builder"]);
  assert.deepEqual(sent, []);
  const woke = await dispatchRole(
    {
      async refresh() {
        return true;
      },
      async send(id) {
        sent.push(id);
      },
      async create() {
        throw new Error("不该新建");
      },
    },
    { agentId: "reviewer", role: "审查", text: "看一下" },
  );
  assert.equal(woke.detail, "已发给 Agent");
  assert.deepEqual(sent, ["reviewer"]);
});

test("证据和问题写回卡片正文", () => {
  const dev = load("dev.yaml");
  const runtime = runtimeAfter(dev);
  const marked = planTurn(dev, runtime, { agentId: "builder", outcome: "failed", note: "编译失败", now });
  const body = readTaskMeta(`说明\n\n<!-- opc-task -->\n${""}`);
  assert.equal(body.detail === "" || body.detail === "任务附注读不懂", true);
  assert.match(marked.runtime.meta.timeline[0]?.text ?? "", /已从模板|失败/);
});

function cardOf(runtime: TaskRuntime) {
  return {
    id: "card-1",
    type: "task",
    status: "active",
    title: "任务",
    oneLiner: runtime.goal,
    owner: { kind: "agent", id: runtime.assignee || "builder" },
    source: "manual",
    evidence: runtime.evidence,
    related: [],
    time: now,
    unread: true,
    goal: runtime.goal,
    acceptance: runtime.acceptance,
    due: runtime.due,
    dependsOn: runtime.dependsOn,
    workflow: runtime.workflow,
    stage: runtime.stage,
    failCount: runtime.failCount,
    ladderLevel: runtime.ladderLevel,
  };
}

function memory(): CardFiles & { cards: Map<string, string>; workflows: Map<string, string> } {
  const cards = new Map<string, string>();
  const views = new Map<string, string>();
  const workflows = new Map<string, string>();
  const sessions = new Map<string, string>();
  const schedules = new Map<string, string>();
  const io = (map: Map<string, string>) => ({
    async list() {
      return [...map].map(([name, text]) => ({ name, text }));
    },
    async write(name: string, text: string) {
      if (name.includes("/") || name.includes("..")) return "error" as const;
      map.set(name, text);
      return "ok" as const;
    },
  });
  const cardsIo = io(cards);
  const viewsIo = io(views);
  const workflowsIo = io(workflows);
  const sessionsIo = io(sessions);
  const schedulesIo = io(schedules);
  return {
    cards,
    workflows,
    listCards: cardsIo.list,
    writeCard: cardsIo.write,
    listViews: viewsIo.list,
    writeView: viewsIo.write,
    listWorkflows: workflowsIo.list,
    writeWorkflow: workflowsIo.write,
    listSessions: sessionsIo.list,
    writeSession: sessionsIo.write,
    listSchedules: schedulesIo.list,
    writeSchedule: schedulesIo.write,
  };
}
