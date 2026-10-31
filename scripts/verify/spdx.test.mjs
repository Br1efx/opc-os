import assert from "node:assert/strict";
import test from "node:test";
import { evaluateSpdx } from "./spdx.mjs";

const allow = ["MIT", "Apache-2.0", "BSD-3-Clause", "ISC", "CC0-1.0", "MPL-2.0"];
const exceptions = ["LLVM-exception"];

function ok(expression) {
  return evaluateSpdx(expression, allow, exceptions).ok;
}

test("允许列表中的标识通过", () => {
  assert.equal(ok("MIT"), true);
  assert.equal(ok("Apache-2.0"), true);
  assert.equal(ok("MPL-2.0"), true);
});

test("OR 里有一个允许的标识即可", () => {
  assert.equal(ok("(MIT OR GPL-3.0-only)"), true);
  assert.equal(ok("(MIT OR CC0-1.0)"), true);
});

test("AND 和单独的 copyleft 失败", () => {
  assert.equal(ok("(MIT AND GPL-3.0-only)"), false);
  assert.equal(ok("GPL-3.0-only"), false);
  assert.equal(ok("AGPL-3.0-only"), false);
  assert.equal(ok("LGPL-2.1-only"), false);
  const gpl = evaluateSpdx("GPL-3.0-only", allow, exceptions);
  assert.match(gpl.reason, /拒绝 GPL-3.0-only/);
});

test("未知、空、专有和无法解析的表达式失败", () => {
  assert.equal(ok("CC-BY-4.0"), false);
  assert.equal(ok("UNLICENSED"), false);
  assert.equal(ok(""), false);
  assert.equal(ok("SEE LICENSE IN LICENSE"), false);
  assert.equal(ok("mit"), false);
});

test("WITH 只放行列出的例外", () => {
  assert.equal(ok("Apache-2.0 WITH LLVM-exception"), true);
  assert.equal(ok("Apache-2.0 WITH No-Such-exception"), false);
});
