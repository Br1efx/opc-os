import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLibrary, resolveLibraryPath } from "./library-fs.ts";

test("笔记库只列出笔记和画布，拒绝跳出目录", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opc-lib-"));
  await fs.mkdir(path.join(root, "cards"), { recursive: true });
  await fs.mkdir(path.join(root, "node_modules"), { recursive: true });
  await fs.mkdir(path.join(root, "片"), { recursive: true });
  await fs.writeFile(path.join(root, "cards", "a.md"), "卡片");
  await fs.writeFile(path.join(root, "node_modules", "b.md"), "依赖");
  await fs.writeFile(path.join(root, "片", "镜头.md"), "正文");
  await fs.writeFile(path.join(root, "片", "跳过.txt"), "不是笔记");
  const library = createLibrary(root);
  const listed = await library.list();
  assert.deepEqual(listed.map((file) => file.relative), ["片/镜头.md"]);
  assert.equal(resolveLibraryPath(root, "../密钥.md"), null);
  assert.equal(resolveLibraryPath(root, "cards/a.md"), null);
  const written = await library.writeNew("视频审阅/审阅-a.canvas", "{}\n");
  assert.equal(written.ok, true);
  const again = await library.writeNew("视频审阅/审阅-a.canvas", "{}\n");
  assert.equal(again.ok, false);
  const names = (await library.list()).map((file) => file.relative);
  assert.ok(names.includes("视频审阅/审阅-a.canvas"));
  assert.ok(names.includes("片/镜头.md"));
});
