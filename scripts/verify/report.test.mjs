import assert from "node:assert/strict";
import test from "node:test";
import { enforcedExitCode, formatSummary } from "./report.mjs";

test("汇总里的 deferred 行不是 PASS，也不让总退出码失败", () => {
  const items = [
    { title: "类型检查", disposition: "pass", detail: "" },
    { title: "手机端打包", disposition: "deferred", detail: "未执行手机端打包。" },
    { title: "性能预算测量", disposition: "deferred", detail: "未测量。" },
  ];
  const text = formatSummary(items);
  const mobile = text.split("\n").find((line) => line.includes("手机端打包"));
  assert.match(mobile, /^DEFERRED  手机端打包$/);
  assert.doesNotMatch(mobile, /PASS/);
  assert.match(text, /未执行，不是通过：手机端打包、性能预算测量。/);
  assert.equal(enforcedExitCode(items), 0);
  assert.equal(
    enforcedExitCode([{ title: "许可证扫描", disposition: "fail", detail: "GPL" }]),
    1,
  );
});
