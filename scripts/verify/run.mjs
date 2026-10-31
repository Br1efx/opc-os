import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { scanBoundary } from "./boundary.mjs";
import { scanLicenses } from "./license-scan.mjs";
import { scanManifest } from "./manifest.mjs";
import { inspectMobile } from "./mobile.mjs";
import { PERF_MEASUREMENT, scanPerf } from "./perf-budget.mjs";
import { enforcedExitCode, formatSummary, toMarkdown } from "./report.mjs";
import { repoRoot } from "./root.mjs";

function runPnpm(script) {
  const result = spawnSync("pnpm", [script], { cwd: repoRoot, stdio: "inherit" });
  return result.status === 0;
}

function fromScan(title, scan) {
  try {
    const result = scan(repoRoot);
    return { title, disposition: result.ok ? "pass" : "fail", detail: result.detail ?? "" };
  } catch (error) {
    return {
      title,
      disposition: "fail",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

console.log("pnpm verify：DEFERRED 不是通过。只有 FAIL 会让本命令退出 1。\n");

const items = [
  { title: "类型检查", disposition: runPnpm("typecheck") ? "pass" : "fail", detail: "" },
  { title: "单元测试", disposition: runPnpm("test") ? "pass" : "fail", detail: "" },
  fromScan("目录边界", scanBoundary),
  fromScan("许可证扫描", scanLicenses),
  fromScan("权限清单对照", scanManifest),
  fromScan("性能预算配置", scanPerf),
  PERF_MEASUREMENT,
];

const mobile = inspectMobile(repoRoot);
items.push({
  title: "手机端打包",
  disposition: mobile.disposition,
  detail: mobile.lines.join("\n"),
});

const text = formatSummary(items);
console.log(`\n${text}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, toMarkdown(items));
}
process.exit(enforcedExitCode(items));
