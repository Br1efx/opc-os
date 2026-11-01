import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { WORKFLOW_SEEDS } from "./workflow-seeds.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.join(here, "..");

function runtimeSources(): string[] {
  const files = ["index.client.tsx", "index.server.ts"].map((name) => path.join(pluginRoot, name));
  for (const dirName of ["client", "server", "shared"]) {
    const dir = path.join(pluginRoot, dirName);
    for (const name of readdirSync(dir, { recursive: true })) {
      const fileName = String(name);
      if (!/\.(?:ts|tsx|mts)$/.test(fileName) || /\.test\.mts$/.test(fileName)) continue;
      files.push(path.join(dir, fileName));
    }
  }
  return files;
}

test("种进卡片库的模板和仓库 YAML 原文一致", () => {
  const dir = path.join(pluginRoot, "shared/workflows");
  const names = readdirSync(dir)
    .filter((name) => name.endsWith(".yaml"))
    .sort();
  assert.deepEqual(
    WORKFLOW_SEEDS.map((seed) => seed.name),
    names,
  );
  for (const seed of WORKFLOW_SEEDS) {
    assert.equal(seed.text, readFileSync(path.join(dir, seed.name), "utf8"));
  }
});

test("插件运行时代码不读取模块地址", () => {
  const offenders = runtimeSources().filter((file) => readFileSync(file, "utf8").includes("import.meta"));
  assert.deepEqual(
    offenders.map((file) => path.relative(pluginRoot, file)),
    [],
  );
});
