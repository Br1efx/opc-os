import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { formatItem } from "./report.mjs";
import { repoRoot } from "./root.mjs";

/** 与架构规范 §5 的数字一致。改这些数字会让检查失败。 */
export const REQUIRED_BUDGETS = {
  "plugin-startup": { max: 300, unit: "ms" },
  "mobile-first-screen": { max: 1500, unit: "ms" },
  "resident-memory": { max: 150, unit: "MB" },
};

export function validatePerfBudget(doc) {
  const errors = [];
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return ["性能预算文件不是对象"];
  if (doc.schemaVersion !== 1) errors.push("schemaVersion 必须是 1");
  if (!doc.budgets || typeof doc.budgets !== "object" || Array.isArray(doc.budgets)) {
    errors.push("缺少 budgets");
    return errors;
  }
  for (const [id, expected] of Object.entries(REQUIRED_BUDGETS)) {
    const got = doc.budgets[id];
    if (!got) {
      errors.push(`缺少 ${id}`);
      continue;
    }
    if (got.max !== expected.max) errors.push(`${id}.max 必须是 ${expected.max}，实际是 ${got.max}`);
    if (got.unit !== expected.unit) errors.push(`${id}.unit 必须是 ${expected.unit}，实际是 ${got.unit}`);
  }
  for (const id of Object.keys(doc.budgets)) {
    if (!REQUIRED_BUDGETS[id]) errors.push(`未登记的预算 ${id}`);
  }
  if (!doc.measurement || doc.measurement.enforced !== false) {
    errors.push("measurement.enforced 必须是 false。还没有测量结果，不能标成已执行。");
  }
  return errors;
}

export function scanPerf(root) {
  const file = path.join(root, "config/perf-budget.json");
  if (!fs.existsSync(file)) return { ok: false, detail: "缺少 config/perf-budget.json" };
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return { ok: false, detail: `config/perf-budget.json 无法解析：${error.message}` };
  }
  const errors = validatePerfBudget(doc);
  if (errors.length > 0) return { ok: false, detail: errors.join("\n") };
  return {
    ok: true,
    detail: "阈值文件可解析，且启动 300ms、手机首屏 1500ms、常驻内存 150MB 与规范一致。这不是测量通过。",
  };
}

export const PERF_MEASUREMENT = {
  title: "性能预算测量",
  disposition: "deferred",
  detail: "未测量。没有 Paseo 计时或采样结果。索引任务走低优先级也没有数值门槛，未检查。",
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = scanPerf(repoRoot);
  console.log("性能测量未执行。下面的 PASS 只表示阈值文件有效。");
  console.log(formatItem({ title: "性能预算配置", disposition: result.ok ? "pass" : "fail", detail: result.detail }));
  console.log(formatItem(PERF_MEASUREMENT));
  process.exit(result.ok ? 0 : 1);
}
