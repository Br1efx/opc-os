import assert from "node:assert/strict";
import test from "node:test";
import { repoRoot } from "./root.mjs";
import { findSharedNodeImports, scanSharedBundle } from "./shared-bundle.mjs";

const PLUGIN = "plugins/opc-core";

function memoryResolve(sources, spec, from) {
  if (spec === "@opc-os/intake-core") return "packages/intake-core/src/index.ts";
  if (!spec.startsWith(".")) return null;
  const dir = from.split("/").slice(0, -1);
  const parts = [...dir];
  for (const part of spec.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  const joined = parts.join("/");
  if (sources.has(joined)) return joined;
  if (sources.has(`${joined}.ts`)) return `${joined}.ts`;
  return null;
}

function trace(sources, entries) {
  return findSharedNodeImports({
    pluginRoot: PLUGIN,
    entries,
    read: (file) => sources.get(file) ?? null,
    resolve: (spec, from) => memoryResolve(sources, spec, from),
  });
}

const coreSources = [
  [
    "packages/intake-core/src/index.ts",
    'export { ticketStage } from "./stage.ts";\nexport { Engine } from "./engine.ts";\nexport { key } from "./ids.ts";\n',
  ],
  ["packages/intake-core/src/stage.ts", "export function ticketStage() { return {}; }\n"],
  ["packages/intake-core/src/engine.ts", 'import { key } from "./ids.ts";\nexport class Engine {}\n'],
  [
    "packages/intake-core/src/ids.ts",
    'import { createHash } from "node:crypto";\nexport function key() { return createHash("sha256"); }\n',
  ],
];

test("服务端直接引用 intake-core 时，node:crypto 留在 server bundle", () => {
  const sources = new Map([
    ...coreSources,
    [`${PLUGIN}/index.server.ts`, 'import { start } from "./server/start";\n'],
    [`${PLUGIN}/server/start.ts`, 'import { ticketStage } from "@opc-os/intake-core";\n'],
  ]);
  assert.deepEqual(trace(sources, [`${PLUGIN}/index.server.ts`]), []);
});

test("shared 文件再引用同一个 barrel 时，node:crypto 进入 shared bundle", () => {
  const sources = new Map([
    ...coreSources,
    [`${PLUGIN}/index.server.ts`, 'import { start } from "./server/start";\n'],
    [
      `${PLUGIN}/server/start.ts`,
      'import { ticketStage } from "@opc-os/intake-core";\nimport { Flow } from "../shared/flow";\n',
    ],
    [`${PLUGIN}/shared/flow.ts`, 'import { Engine } from "@opc-os/intake-core";\nexport class Flow {}\n'],
  ]);
  const violations = trace(sources, [`${PLUGIN}/index.server.ts`]);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].specifier, "node:crypto");
  assert.equal(violations[0].importer, "packages/intake-core/src/ids.ts");
  assert.equal(violations[0].sharedFile, `${PLUGIN}/shared/flow.ts`);
});

test("当前插件入口的 shared 依赖图不含 Node 内置", () => {
  const result = scanSharedBundle(repoRoot);
  assert.equal(result.ok, true, result.detail);
});
