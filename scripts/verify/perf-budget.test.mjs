import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { scanPerf, validatePerfBudget } from "./perf-budget.mjs";
import { repoRoot } from "./root.mjs";

test("阈值必须与规范一致，且不能自称已经测量", () => {
  const result = scanPerf(repoRoot);
  assert.equal(result.ok, true, result.detail);

  const doc = JSON.parse(
    JSON.stringify({
      schemaVersion: 1,
      budgets: {
        "plugin-startup": { max: 300, unit: "ms" },
        "mobile-first-screen": { max: 1500, unit: "ms" },
        "resident-memory": { max: 150, unit: "MB" },
      },
      measurement: { enforced: false },
    }),
  );
  assert.deepEqual(validatePerfBudget(doc), []);
  doc.budgets["plugin-startup"].max = 5000;
  assert.match(validatePerfBudget(doc).join("\n"), /plugin-startup\.max/);
  doc.budgets["plugin-startup"].max = 300;
  doc.measurement.enforced = true;
  assert.match(validatePerfBudget(doc).join("\n"), /enforced 必须是 false/);
});

test("性能命令的 PASS 只属于配置", () => {
  const result = spawnSync(process.execPath, ["scripts/verify/perf-budget.mjs"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /性能测量未执行/);
  assert.match(result.stdout, /^DEFERRED  性能预算测量/m);
  assert.doesNotMatch(result.stdout, /^PASS  性能预算测量/m);
});
