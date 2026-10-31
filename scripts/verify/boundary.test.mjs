import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { checkBoundary, importViolation, scanBoundary } from "./boundary.mjs";
import { repoRoot } from "./root.mjs";

const config = JSON.parse(fs.readFileSync(new URL("../../config/directory-boundary.json", import.meta.url), "utf8"));

test("当前仓库满足目录边界", () => {
  const result = scanBoundary(repoRoot);
  assert.equal(result.ok, true, result.detail);
});

test("模块目录里的代码和未声明目录失败", () => {
  const errors = checkBoundary(
    [
      { path: "plugins/opc-core/modules/m1-notes/note.ts", source: "export const n = 1;\n" },
      { path: "plugins/opc-core/modules/m9-extra/README.md" },
      { path: "plugins/opc-core/scratch.ts", source: "export {}\n" },
    ],
    config,
  );
  assert.match(errors.join("\n"), /note\.ts/);
  assert.match(errors.join("\n"), /m9-extra/);
  assert.match(errors.join("\n"), /scratch\.ts/);
});

test("packages 不能引用插件，界面端和服务端不能交叉引用", () => {
  assert.match(
    importViolation(
      "packages/card-protocol/src/index.ts",
      "../../../plugins/opc-core/index.client.tsx",
      config.pluginRoot,
    ),
    /packages 不能引用 plugins/,
  );
  assert.equal(
    importViolation("packages/card-protocol/src/index.ts", "./shape.ts", config.pluginRoot),
    null,
  );
  assert.match(
    importViolation("plugins/opc-core/index.server.ts", "react-native", config.pluginRoot),
    /react-native/,
  );
  assert.match(
    importViolation("plugins/opc-core/index.client.tsx", "@getpaseo/plugin/server", config.pluginRoot),
    /服务端 SDK/,
  );
  assert.match(
    importViolation("plugins/opc-core/index.client.tsx", "../opc-grok/index.client.tsx", config.pluginRoot),
    /另一个插件/,
  );
  assert.equal(
    importViolation("plugins/opc-core/index.client.tsx", "./client/home", config.pluginRoot),
    null,
  );
  assert.equal(
    importViolation("plugins/opc-core/index.client.tsx", "@opc-os/card-protocol", config.pluginRoot),
    null,
  );
});
