import assert from "node:assert/strict";
import test from "node:test";
import {
  CARD_FIELDS,
  CARD_PROTOCOL_REVISION,
  CARD_TYPE_LABELS,
  CARD_TYPES,
  hasCardShape,
  parseCard,
} from "./index.ts";

const sample = {
  id: "card-1",
  type: "task",
  status: "open",
  title: "写 verify",
  oneLiner: "先把字段形状钉住",
  owner: { kind: "agent", id: "builder" },
  source: "d1",
  evidence: ["docs/verify.md"],
  related: ["card-0"],
  time: "2026-10-31T00:00:00Z",
  unread: true,
};

test("协议修订号是 d1", () => {
  assert.equal(CARD_PROTOCOL_REVISION, "d1");
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

test("类型覆盖选题、任务、资产、问题和素材", () => {
  assert.deepEqual(CARD_TYPES, ["topic", "task", "asset", "question", "material"]);
  assert.deepEqual(CARD_TYPE_LABELS, {
    topic: "选题",
    task: "任务",
    asset: "资产",
    question: "问题",
    material: "素材",
  });
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

test("未知类型、空标识或坏时间不通过校验", () => {
  assert.equal(hasCardShape({ ...sample, type: "probe" }), false);
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
