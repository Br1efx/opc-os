import assert from "node:assert/strict";
import test from "node:test";
import {
  CARD_FIELDS,
  CARD_PROTOCOL_REVISION,
  CARD_STATUSES,
  TASK_FIELDS,
  CARD_STATUS_LABELS,
  CARD_TYPE_LABELS,
  CARD_TYPES,
  SECTION12_CARD_TYPES,
  hasCardShape,
  parseCard,
} from "./index.ts";

const sample = {
  id: "card-1",
  type: "task",
  status: "inbox",
  title: "写 verify",
  oneLiner: "先把字段形状钉住",
  owner: { kind: "agent", id: "builder" },
  source: "d1",
  evidence: ["docs/verify.md"],
  related: ["card-0"],
  time: "2026-10-31T00:00:00Z",
  unread: true,
};

test("协议修订号是 d3", () => {
  assert.equal(CARD_PROTOCOL_REVISION, "d3");
});

test("字段名与架构说明一致", () => {
  assert.deepEqual(CARD_FIELDS, [
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
  ]);
});

test("类型覆盖选题、任务、资产、问题、素材和决策", () => {
  assert.deepEqual(CARD_TYPES, ["topic", "task", "asset", "question", "material", "decision"]);
  assert.deepEqual(CARD_TYPE_LABELS, {
    topic: "选题",
    task: "任务",
    asset: "资产",
    question: "问题",
    material: "素材",
    decision: "决策",
  });
});

test("状态是收件箱到归档的生命周期", () => {
  assert.deepEqual(CARD_STATUSES, ["inbox", "incubating", "active", "settled", "shelved", "archived"]);
  assert.deepEqual(CARD_STATUS_LABELS, {
    inbox: "收件箱",
    incubating: "孵化中",
    active: "推进中",
    settled: "已沉淀",
    shelved: "搁置",
    archived: "归档",
  });
  for (const status of CARD_STATUSES) {
    const parsed = parseCard({ ...sample, status });
    assert.equal(parsed.ok, true, status);
  }
});

test("§1.2 的笔记种类映射到协议类型，其中复盘是决策", () => {
  assert.deepEqual(
    SECTION12_CARD_TYPES.map((row) => [row.kind, row.type]),
    [
      ["想法", "topic"],
      ["随笔", "material"],
      ["资料", "asset"],
      ["链接", "material"],
      ["视频", "material"],
      ["提醒", "task"],
      ["复盘", "decision"],
    ],
  );
  const decision = parseCard({ ...sample, type: "decision", status: "settled" });
  assert.equal(decision.ok, true);
});

test("完整对象通过形状检查和校验", () => {
  assert.equal(hasCardShape(sample), true);
  const parsed = parseCard(sample);
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.card.owner.kind, "agent");
});

test("负责人必须是人或 Agent", () => {
  assert.equal(hasCardShape({ ...sample, owner: "builder" }), false);
  const person = parseCard({ ...sample, owner: { kind: "person", id: "me" } });
  assert.equal(person.ok, true);
  const unknown = parseCard({ ...sample, owner: { kind: "team", id: "me" } });
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.issues.some((issue) => issue.path === "owner.kind"), true);
});

test("未知类型、未知状态、空标识或坏时间不通过校验", () => {
  assert.equal(hasCardShape({ ...sample, type: "probe" }), false);
  assert.equal(hasCardShape({ ...sample, status: "open" }), false);
  const legacy = parseCard({ ...sample, status: "open" });
  assert.equal(legacy.ok, false);
  if (!legacy.ok) assert.equal(legacy.issues.some((issue) => issue.path === "status" && issue.code === "unknown"), true);
  const blank = parseCard({ ...sample, status: "  " });
  assert.equal(blank.ok, false);
  if (!blank.ok) assert.equal(blank.issues.some((issue) => issue.path === "status" && issue.code === "empty"), true);
  const emptyId = parseCard({ ...sample, id: "  " });
  assert.equal(emptyId.ok, false);
  if (!emptyId.ok) assert.equal(emptyId.issues.some((issue) => issue.path === "id"), true);
  const badTime = parseCard({ ...sample, time: "昨天" });
  assert.equal(badTime.ok, false);
  if (!badTime.ok) assert.equal(badTime.issues.some((issue) => issue.path === "time"), true);
  const emptyEvidence = parseCard({ ...sample, evidence: ["ok", ""] });
  assert.equal(emptyEvidence.ok, false);
});

test("d2 的卡没有任务字段也能通过，任务可以带上 d3 字段", () => {
  assert.equal(hasCardShape(sample), true);
  assert.equal(parseCard(sample).ok, true);
  assert.deepEqual(TASK_FIELDS, [
    "goal",
    "acceptance",
    "due",
    "dependsOn",
    "workflow",
    "stage",
    "failCount",
    "ladderLevel",
  ]);
  const task = {
    ...sample,
    goal: "做完验收",
    acceptance: ["验证通过"],
    due: "2026-11-08T00:00:00Z",
    dependsOn: ["card-0"],
    workflow: "dev",
    stage: "build",
    failCount: 0,
    ladderLevel: 1,
  };
  assert.equal(hasCardShape(task), true);
  const parsed = parseCard(task);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.card.stage, "build");
    assert.equal(parsed.card.ladderLevel, 1);
    assert.equal(parsed.card.status, "inbox");
  }
  const fromText = parseCard({ ...sample, failCount: "2", ladderLevel: "0" });
  assert.equal(fromText.ok, true);
  if (fromText.ok) {
    assert.equal(fromText.card.failCount, 2);
    assert.equal(fromText.card.ladderLevel, 0);
  }
});

test("任务字段类型不对，或别的类型带了步骤，就不通过", () => {
  assert.equal(hasCardShape({ ...sample, failCount: "0" }), false);
  assert.equal(hasCardShape({ ...sample, acceptance: "一条" }), false);
  const negative = parseCard({ ...sample, ladderLevel: -1 });
  assert.equal(negative.ok, false);
  if (!negative.ok) assert.equal(negative.issues.some((issue) => issue.path === "ladderLevel"), true);
  const fractional = parseCard({ ...sample, failCount: 1.5 });
  assert.equal(fractional.ok, false);
  const emptyAcceptance = parseCard({ ...sample, acceptance: ["通过", ""] });
  assert.equal(emptyAcceptance.ok, false);
  const badDue = parseCard({ ...sample, due: "下周" });
  assert.equal(badDue.ok, false);
  if (!badDue.ok) assert.equal(badDue.issues.some((issue) => issue.path === "due"), true);
  const topic = parseCard({ ...sample, type: "topic", stage: "build" });
  assert.equal(topic.ok, false);
  if (!topic.ok) assert.equal(topic.issues.some((issue) => issue.path === "stage" && issue.code === "unknown"), true);
  assert.equal(hasCardShape({ ...sample, type: "topic", workflow: "dev" }), false);
});

test("缺字段、类型不对或不是对象时不通过", () => {
  const { unread: _unread, ...rest } = sample;
  assert.equal(hasCardShape(rest), false);
  assert.equal(hasCardShape({ ...sample, unread: "yes" }), false);
  assert.equal(hasCardShape({ ...sample, evidence: ["ok", 1] }), false);
  assert.equal(hasCardShape({ ...sample, related: "card-0" }), false);
  assert.equal(hasCardShape({ ...sample, title: 1 }), false);
  assert.equal(hasCardShape(null), false);
  assert.equal(hasCardShape([]), false);
  assert.equal(parseCard(null).ok, false);
});
