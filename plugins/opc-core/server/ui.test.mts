import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadUiConfig } from "../shared/ui.ts";
import { readUiConfigFiles } from "./ui.ts";

test("分组文件改完再读就变，链接和过大的文件用中文拒绝", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opc-ui-"));
  const dir = path.join(root, "_ui");
  try {
    const missing = await readUiConfigFiles(path.join(root, "没有"));
    assert.equal(missing.ok, true);
    if (missing.ok) {
      const builtin = loadUiConfig(missing.files);
      assert.equal(builtin.source, "builtin");
      assert.equal(builtin.document.groups.some((group) => group.displayName === "总秘书"), true);
    }

    await fs.mkdir(dir);
    await fs.writeFile(
      path.join(dir, "groups.json"),
      JSON.stringify({
        groups: [{ id: "builder", displayName: "主力工程师", icon: "⚒️", order: 1, match: ["builder-a"] }],
      }),
      "utf8",
    );
    const json = await readUiConfigFiles(dir);
    assert.equal(json.ok, true);
    if (!json.ok) return;
    const renamed = loadUiConfig(json.files);
    assert.equal(renamed.ok, true);
    assert.equal(renamed.document.groups[0]?.displayName, "主力工程师");

    await fs.writeFile(path.join(dir, "groups.yaml"), "groups: [\n", "utf8");
    const yaml = await readUiConfigFiles(dir);
    assert.equal(yaml.ok, true);
    if (!yaml.ok) return;
    const broken = loadUiConfig(yaml.files);
    assert.equal(broken.ok, false);
    assert.equal(broken.fileName, "groups.yaml");
    assert.match(broken.detail, /分组配置/);
    assert.doesNotMatch(broken.detail, /\b(error|invalid|undefined|JSON|YAML)\b/i);

    await fs.rm(path.join(dir, "groups.yaml"));
    const secret = path.join(root, "secret.txt");
    await fs.writeFile(secret, "groups:\n  - id: chief\n    displayName: 总秘书\n    icon: 🧠\n    match:\n      - chief\n", "utf8");
    await fs.symlink(secret, path.join(dir, "groups.yaml"));
    const link = await readUiConfigFiles(dir);
    assert.equal(link.ok, false);
    if (!link.ok) assert.match(link.detail, /链接/);

    await fs.rm(path.join(dir, "groups.yaml"));
    await fs.writeFile(path.join(dir, "groups.yaml"), "a".repeat(256 * 1024 + 1), "utf8");
    const huge = await readUiConfigFiles(dir);
    assert.equal(huge.ok, false);
    if (!huge.ok) assert.match(huge.detail, /太大/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
