import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { classifyMobile, exitCodeForMobile } from "./mobile.mjs";
import { repoRoot } from "./root.mjs";

const ready = {
  clientEntry: true,
  homeScreen: true,
  reactNativeDeclared: true,
  paseoOnPath: false,
};

test("没有工具链时是 deferred，退出码 2，不是通过", () => {
  const result = classifyMobile(ready);
  assert.equal(result.disposition, "deferred");
  assert.equal(exitCodeForMobile(result.disposition), 2);
});

test("找到 paseo 但没有打包命令时失败，而不是通过", () => {
  const result = classifyMobile({ ...ready, paseoOnPath: true });
  assert.equal(result.disposition, "fail");
  assert.equal(exitCodeForMobile(result.disposition), 1);
});

test("入口缺失时失败", () => {
  const result = classifyMobile({ ...ready, homeScreen: false });
  assert.equal(result.disposition, "fail");
  assert.match(result.lines.join("\n"), /home\.tsx/);
});

test("命令本身不会以 0 表示打包通过", () => {
  const result = spawnSync(process.execPath, ["scripts/verify/mobile.mjs"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /^PASS  手机端打包/m);
});
