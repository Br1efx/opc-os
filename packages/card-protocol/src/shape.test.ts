import assert from "node:assert/strict";
import test from "node:test";
import {
  CARD_FIELDS,
  CARD_PROTOCOL_REVISION,
  CARD_STATUSES,
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

test("协议修订号从 d1 加一", () => {
  assert.equal(CARD_PROTOCOL_REVISION, "d2");
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
