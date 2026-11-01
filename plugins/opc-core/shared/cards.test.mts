import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { SECTION12_CARD_TYPES } from "@opc-os/card-protocol";
import { parseViewDocument, queryCards, renderView } from "./bases.ts";
import {
  BUSINESS_LINES,
  CARD_WALL_REFRESH_MS,
  CARDS_ROOT,
  D5_TASK_HANDOFF,
  DEFAULT_VIEWS,
  PRESET_VIEW_IDS,
  PRIMARY_VIEW_IDS,
  VIEWS_DIR,
  applyCardAction,
  cardFromManual,
  createCardStore,
  formatCardTime,
  issueLine,
  parseCardDocument,
  readLibrary,
  renderCardDocument,
  sidebarAwaitingLabel,
  type CardFiles,
} from "./cards.ts";

const now = "2026-11-01T08:00:00.000Z";

function bucket(map: Map<string, string>) {
  return {
    async list() {
      return [...map].map(([name, text]) => ({ name, text }));
    },
    async write(name: string, text: string) {
      if (name.includes("/") || name.includes("..")) return "error" as const;
      map.set(name, text);
      return "ok" as const;
    },
  };
}

function memory(): CardFiles & { cards: Map<string, string>; views: Map<string, string>; workflows: Map<string, string> } {
  const cards = new Map<string, string>();
  const views = new Map<string, string>();
  const workflows = new Map<string, string>();
  const sessions = new Map<string, string>();
  const schedules = new Map<string, string>();
  const cardIo = bucket(cards);
  const viewIo = bucket(views);
  const workflowIo = bucket(workflows);
  const sessionIo = bucket(sessions);
  const scheduleIo = bucket(schedules);
  return {
    cards,
    views,
    workflows,
    listCards: cardIo.list,
    writeCard: cardIo.write,
    listViews: viewIo.list,
    writeView: viewIo.write,
    listWorkflows: workflowIo.list,
    writeWorkflow: workflowIo.write,
    listSessions: sessionIo.list,
    writeSession: sessionIo.write,
    listSchedules: scheduleIo.list,
    writeSchedule: scheduleIo.write,
  };
}

function seeds() {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "workflows");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".yaml"))
    .map((name) => ({ name, text: readFileSync(path.join(dir, name), "utf8") }));
}

function view(id: string) {
  const found = DEFAULT_VIEWS.find((item) => item.id === id);
  if (!found) throw new Error(id);
  return found;
}

test("卡片文件能往返，坏文件显示格式错误而不是丢掉", () => {
  const built = cardFromManual({
    title: "要做：卡片墙",
    oneLiner: "等你拍板",
    type: "decision",
    project: "插件开发",
    now,
    nonce: "abc",
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const text = renderCardDocument(built.card, built.props, "正文留在后面");
  const parsed = parseCardDocument(text);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.card.type, "decision");
  assert.equal(parsed.card.status, "inbox");
  assert.equal(parsed.card.title, "要做：卡片墙");
  assert.equal(parsed.props.project, "插件开发");
  assert.equal(parsed.body.trim(), "正文留在后面");

  const broken = parseCardDocument("---\nid: x\ntype: task\nstatus: open\ntitle: 坏的\noneLiner: \nowner:\n  kind: agent\n  id: a\nsource: manual\nevidence: []\nrelated: []\ntime: 2026-11-01T00:00:00.000Z\nunread: true\n---\n");
  assert.equal(broken.ok, false);
  assert.equal(broken.detail, "格式错误");
  if (!broken.ok) {
    assert.equal(broken.issues.some((issue) => issue.path === "status"), true);
    assert.match(issueLine(broken.issues[0] ?? { path: "", code: "not-object" }), /：/);
  }
  assert.equal(parseCardDocument("没有前言").ok, false);
});

test("十一个视图都能从定义文件读出，改属性和改定义会换栏", () => {
  assert.deepEqual(PRIMARY_VIEW_IDS, ["awaiting", "status-board", "business", "timeline"]);
  assert.deepEqual(PRESET_VIEW_IDS, ["inbox", "idea-wall", "pending", "reminders", "by-project", "tasks", "stuck"]);
  assert.equal(DEFAULT_VIEWS.length, 11);
  for (const item of DEFAULT_VIEWS) {
    const parsed = parseViewDocument(renderView(item));
    assert.equal(parsed.ok, true, item.id);
    if (parsed.ok) assert.deepEqual(parsed.view, item);
  }

  const cards = [
    bag({ id: "plugin", project: "插件开发", status: "inbox", type: "task", time: now }),
    bag({ id: "dad", project: "父亲 AI 芝麻馆", status: "active", type: "topic", time: "2026-10-31T08:00:00.000Z" }),
    bag({ id: "public", project: "Build in Public", status: "incubating", type: "material", time: "2026-11-01T09:00:00.000Z" }),
  ];
  const board = queryCards(cards, view("status-board"), { now });
  assert.deepEqual(
    board.groups.map((group) => group.title),
    ["收件箱", "孵化中", "推进中", "已沉淀", "搁置", "归档"],
  );
  assert.deepEqual(board.groups[0]?.cards.map((item) => item.id), ["plugin"]);
  const moved = queryCards(
    cards.map((item) => (item.id === "plugin" ? { ...item, status: "active" } : item)),
    view("status-board"),
    { now },
  );
  assert.deepEqual(moved.groups.find((group) => group.key === "inbox")?.cards, []);
  assert.deepEqual(moved.groups.find((group) => group.key === "active")?.cards.map((item) => item.id), ["plugin", "dad"]);

  const lines = queryCards(cards, view("business"), { now });
  assert.deepEqual(
    lines.groups.map((group) => group.title),
    [...BUSINESS_LINES],
  );
  const retitled = queryCards(
    cards.map((item) => (item.id === "plugin" ? { ...item, project: "父亲 AI 芝麻馆" } : item)),
    view("business"),
    { now },
  );
  assert.deepEqual(retitled.groups.find((group) => group.key === "插件开发")?.cards, []);
  assert.deepEqual(
    retitled.groups.find((group) => group.key === "父亲 AI 芝麻馆")?.cards.map((item) => item.id),
    ["plugin", "dad"],
  );

  const timeline = queryCards(cards, view("timeline"), { now });
  assert.deepEqual(timeline.matched.map((item) => item.id), ["public", "plugin"]);
  const ideas = queryCards(cards, view("idea-wall"), { now });
  assert.deepEqual(ideas.matched.map((item) => item.id), ["dad"]);
  const reminders = queryCards(
    [bag({ id: "soon", type: "task", time: "2026-11-03T00:00:00.000Z" }), bag({ id: "old", type: "task", time: "2026-01-01T00:00:00.000Z" })],
    view("reminders"),
    { now },
  );
  assert.deepEqual(reminders.matched.map((item) => item.id), ["soon"]);
});

test("同意、打回、指派和归档让等你处理减少，转成任务进入开发流", async () => {
  const files = memory();
  const store = createCardStore(files, CARDS_ROOT, seeds());
  const turn = await store.writeTurn({
    agentId: "builder",
    title: "写完了",
    outcome: "completed",
    now,
    nonce: "one",
  });
  assert.equal(turn.ok, true);
  const manual = await store.createManual({
    title: "跟进",
    oneLiner: "还在收件箱",
    type: "task",
    project: "插件开发",
    now,
    nonce: "two",
  });
  assert.equal(manual.ok, true);
  const first = readLibrary(await store.load(now));
  assert.equal(first.awaiting, 2);
  assert.equal(first.views.length, 11);
  assert.equal(CARD_WALL_REFRESH_MS < 60_000, true);
  assert.equal(sidebarAwaitingLabel(first.awaiting), "等你处理 2");
  assert.equal(sidebarAwaitingLabel(null), "等你处理");
  assert.equal(formatCardTime(now), "2026-11-01 08:00");
  assert.equal(/[A-Za-z]/.test(formatCardTime(now)), false);

  const question = first.valid.find((item) => item.card.type === "question");
  assert.ok(question);
  const approved = await store.act({ id: question.card.id, action: { action: "approve" }, now });
  assert.equal(approved.ok, true);
  assert.equal(approved.delivery?.agentId, "builder");
  assert.match(approved.delivery?.text ?? "", /同意/);
  assert.equal(readLibrary(await store.load(now)).awaiting, 1);

  const task = readLibrary(await store.load(now)).valid.find((item) => item.card.type === "task");
  assert.ok(task);
  const rejected = await store.act({ id: task.card.id, action: { action: "reject", reason: "  " }, now });
  assert.equal(rejected.ok, false);
  assert.match(rejected.detail, /理由/);
  const sent = await store.act({ id: task.card.id, action: { action: "reject", reason: "范围不对" }, now });
  assert.equal(sent.delivery, null);
  assert.match(sent.detail, /不是 Agent/);
  assert.equal(readLibrary(await store.load(now)).awaiting, 0);
  const reread = parseCardDocument(files.cards.get(task.name) ?? "");
  assert.equal(reread.ok, true);
  if (reread.ok) assert.match(reread.body, /^$/);

  const again = await store.createManual({
    title: "再来一张",
    oneLiner: "",
    type: "asset",
    project: "",
    now,
    nonce: "three",
  });
  assert.equal(again.ok, true);
  assert.equal(readLibrary(await store.load(now)).awaiting, 1);
  const asset = readLibrary(await store.load(now)).valid.find((item) => item.card.id === again.id);
  assert.ok(asset);
  const assigned = await store.act({ id: asset.card.id, action: { action: "assign", agentId: "editor" }, now });
  assert.equal(assigned.delivery?.agentId, "editor");
  assert.match(assigned.delivery?.text ?? "", /指派/);
  const afterAssign = readLibrary(await store.load(now));
  assert.equal(afterAssign.awaiting, 0);
  assert.equal(afterAssign.valid.find((item) => item.card.id === again.id)?.card.status, "active");

  const parked = await store.createManual({
    title: "先放着",
    oneLiner: "",
    type: "material",
    project: "插件开发",
    now,
    nonce: "four",
  });
  assert.equal(parked.ok, true);
  const started = await store.act({ id: parked.id, action: { action: "to-task" }, now });
  assert.equal(started.ok, true);
  assert.equal(started.delivery?.agentId, "builder");
  assert.equal(started.delivery?.role, "实现");
  const converted = readLibrary(await store.load(now)).valid.find((item) => item.card.id === parked.id);
  assert.equal(converted?.card.type, "task");
  assert.equal(converted?.card.status, "active");
  assert.equal(converted?.card.workflow, "dev");
  assert.equal(converted?.card.stage, "build");
  assert.equal(converted?.props.handoff, D5_TASK_HANDOFF);
  assert.match(converted?.body ?? "", /进入「实现」/);
  assert.equal(readLibrary(await store.load(now)).awaiting, 0);
  await store.act({ id: parked.id, action: { action: "archive" }, now });
  assert.equal(readLibrary(await store.load(now)).awaiting, 0);
  assert.equal(readLibrary(await store.load(now)).valid.find((item) => item.card.id === parked.id)?.card.status, "archived");
});

test("已有视图不被覆盖，非法卡片不进入等你处理，写入接口只有一处", async () => {
  const files = memory();
  files.views.set("awaiting.yaml", "id: awaiting\ntitle: 改过的队列\nlayout: list\nfilter:\n  op: eq\n  field: status\n  value: inbox\n");
  files.cards.set("bad.md", "这不是卡片\n");
  const store = createCardStore(files, CARDS_ROOT, seeds());
  const direct = await store.writeCard(
    {
      id: "card-hand",
      type: "topic",
      status: "inbox",
      title: "外部写入",
      oneLiner: "同一入口",
      owner: { kind: "agent", id: "grok" },
      source: "reserved",
      evidence: [],
      related: [],
      time: now,
      unread: true,
    },
    { project: "父亲 AI 芝麻馆" },
  );
  assert.equal(direct.ok, true);
  const reading = readLibrary(await store.load(now));
  assert.match(files.views.get("awaiting.yaml") ?? "", /改过的队列/);
  assert.equal(reading.views.find((item) => item.id === "awaiting")?.title, "改过的队列");
  assert.equal(reading.views.length, 11);
  assert.equal(reading.invalid.length, 1);
  assert.equal(reading.invalid[0]?.detail, "格式错误");
  assert.equal(reading.awaiting, 1);
  assert.equal(reading.valid[0]?.props.project, "父亲 AI 芝麻馆");
  assert.equal(CARDS_ROOT, "/home/br1efx/notes/cards");
  assert.equal(VIEWS_DIR, "_views");
  const empty = applyCardAction(reading.valid[0].card, {}, { action: "assign", agentId: "../evil" });
  assert.equal(empty.ok, false);
});

test("术语表、决定记录和界面文案对齐卡片墙", () => {
  const root = new URL("../../../", import.meta.url);
  const glossary = readFileSync(new URL("docs/glossary.md", root), "utf8");
  const adr = readFileSync(new URL("adr/0005-d3-card-wall.md", root), "utf8");
  for (const row of SECTION12_CARD_TYPES) {
    assert.equal(glossary.includes(row.kind), true, row.kind);
    assert.equal(adr.includes(row.kind), true, row.kind);
  }
  assert.match(adr, /\/home\/br1efx\/notes\/cards\//);
  assert.match(adr, /decision/);
  assert.match(glossary, /决策/);
  const screen = readFileSync(new URL("../client/card-wall.tsx", import.meta.url), "utf8");
  for (const word of ["同意", "打回", "指派", "转成任务", "归档", "格式错误", "新建卡片"]) {
    assert.equal(screen.includes(word), true, word);
  }
  assert.equal(screen.includes("hover"), false);
  assert.equal(screen.includes("onMouse"), false);
  assert.equal(screen.includes("onHover"), false);
});

function bag(patch: Record<string, unknown>) {
  return {
    id: "card-1",
    type: "task",
    status: "inbox",
    title: "一张卡",
    oneLiner: "摘要",
    owner: { kind: "agent", id: "builder" },
    source: "manual",
    evidence: [],
    related: [],
    time: now,
    unread: true,
    ...patch,
  };
}
