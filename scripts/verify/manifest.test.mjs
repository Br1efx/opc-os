import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { compareSources, detectCapabilities, scanManifest, validateManifest } from "./manifest.mjs";
import { repoRoot } from "./root.mjs";

const boundary = JSON.parse(
  fs.readFileSync(new URL("../../config/directory-boundary.json", import.meta.url), "utf8"),
);
const manifest = JSON.parse(
  fs.readFileSync(new URL("../../plugins/opc-core/permissions.manifest.json", import.meta.url), "utf8"),
);
const context = { pluginId: "opc-core", moduleIds: boundary.modules };

test("清单结构有效，未启用模块不能预先声明权限", () => {
  assert.deepEqual(validateManifest(manifest, context), []);
  assert.equal(manifest.modules["m1-notes"].enabled, true);
  assert.equal(manifest.modules["m2-card-wall"].enabled, true);
  assert.equal(manifest.modules["m2-card-wall"].network.enabled, false);
  assert.ok(manifest.modules["m2-card-wall"].filesystem.read.includes("/home/br1efx/notes/cards/"));
  assert.ok(manifest.modules["m2-card-wall"].filesystem.write.includes("/home/br1efx/notes/cards/_views/"));
  assert.equal(manifest.modules["m5-ui"].enabled, true);
  assert.equal(manifest.modules["m5-ui"].network.enabled, false);
  assert.deepEqual(manifest.modules["m5-ui"].filesystem.write, []);
  assert.ok(manifest.modules["m5-ui"].filesystem.read.includes("/home/br1efx/notes/cards/_ui/"));
  assert.equal(manifest.modules["m6-i18n"].enabled, false);
  assert.ok(manifest.filesystem.read.includes("**/*.md"));
  assert.ok(manifest.modules["m1-notes"].filesystem.write.includes("**/*.markdown"));
  const opened = structuredClone(manifest);
  opened.modules["m3-gateway"].network.enabled = true;
  opened.modules["m3-gateway"].network.hosts = ["api.example.com"];
  assert.match(validateManifest(opened, context).join("\n"), /m3-gateway 未启用/);
});

test("源码里的网络和文件 API 必须对上清单", () => {
  assert.deepEqual(detectCapabilities("export const name = 'home';\n"), {
    usesFs: false,
    usesNetwork: false,
    hosts: [],
    dynamicNetwork: false,
  });
  const fetchSource = 'const url = "https://Evil.Example/a";\nfetch(url);\n';
  const caps = detectCapabilities(fetchSource);
  assert.equal(caps.usesNetwork, true);
  assert.deepEqual(caps.hosts, ["evil.example"]);

  const emptyShell = structuredClone(manifest);
  emptyShell.filesystem.read = [];
  emptyShell.filesystem.write = [];
  const blocked = compareSources(
    emptyShell,
    [{ path: "plugins/opc-core/index.server.ts", source: 'import fs from "node:fs";\n' }],
    boundary.pluginRoot,
  );
  assert.match(blocked.join("\n"), /文件系统 API/);
  assert.deepEqual(
    compareSources(
      manifest,
      [{ path: "plugins/opc-core/server/notes-fs.ts", source: 'import fs from "node:fs/promises";\n' }],
      boundary.pluginRoot,
    ),
    [],
  );

  const allowed = structuredClone(manifest);
  allowed.network.enabled = true;
  allowed.network.hosts = ["evil.example"];
  assert.deepEqual(
    compareSources(
      allowed,
      [{ path: "plugins/opc-core/index.server.ts", source: fetchSource }],
      boundary.pluginRoot,
    ),
    [],
  );

  const dynamic = compareSources(
    allowed,
    [{ path: "plugins/opc-core/index.server.ts", source: "fetch(url);\n" }],
    boundary.pluginRoot,
  );
  assert.match(dynamic.join("\n"), /字面量/);
});

test("当前插件清单和源码一致", () => {
  const result = scanManifest(repoRoot);
  assert.equal(result.ok, true, result.detail);
});
