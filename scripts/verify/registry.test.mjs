import assert from "node:assert/strict";
import test from "node:test";
import { installDocumentErrors, scanRegistry } from "./registry.mjs";
import { repoRoot } from "./root.mjs";

test("仓库里的 registry 能被 Paseo 0.14 当成安装文档", () => {
  const scan = scanRegistry(repoRoot);
  assert.equal(scan.ok, true, scan.detail);
});

test("短 SHA、大写 owner 和空 remote 都不能当安装文档", () => {
  assert.deepEqual(installDocumentErrors({ id: "Br1efx/opc-core", artifact: { kind: "git", remote: "https://example.com/a.git", commit: "ec4a1df" } }), [
    "id 必须是小写的 owner/slug",
    "artifact.commit 必须是 40 到 64 位小写 SHA",
  ]);
  assert.ok(installDocumentErrors({ id: "br1efx/opc-core", artifact: { kind: "npm" } }).some((item) => item.includes("git")));
  assert.ok(
    installDocumentErrors({
      id: "br1efx/opc-core",
      artifact: {
        kind: "git",
        remote: "",
        commit: "ec4a1df803c556f5c650aaea4fa2284b204f3396",
        pluginPath: "plugins:opc-core",
      },
    }).length >= 2,
  );
});
