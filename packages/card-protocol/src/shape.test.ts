import assert from "node:assert/strict";
import test from "node:test";
import { CARD_FIELDS, CARD_PROTOCOL_REVISION, hasCardShape } from "./index.ts";

const sample = {
  id: "card-1",
  type: "task",
  status: "open",
  title: "写 verify",
  oneLiner: "先把字段形状钉住",
  owner: "builder",
  source: "d0",
  evidence: ["docs/verify.md"],
  related: ["card-0"],
  time: "2026-10-31T00:00:00Z",
  unread: true,
};

test("协议修订号仍是 stub", () => {
  assert.equal(CARD_PROTOCOL_REVISION, "stub");
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

test("完整对象通过形状检查", () => {
  assert.equal(hasCardShape(sample), true);
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
});
