import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createNodeNoteFiles, isBroadRoot, resolveNotePath, shouldSkipDir } from "./notes-fs.ts";

test("工作区外和不是 Markdown 的路径不能写", () => {
  assert.equal(resolveNotePath("/vault", "笔记/a.md"), path.resolve("/vault/笔记/a.md"));
  assert.equal(resolveNotePath("/vault", "/vault/笔记/a.md"), path.resolve("/vault/笔记/a.md"));
  assert.equal(resolveNotePath("/vault", "/etc/passwd.md"), null);
  assert.equal(resolveNotePath("/vault", "../secret.md"), null);
  assert.equal(resolveNotePath("/vault", "readme.txt"), null);
  assert.equal(resolveNotePath("", "a.md"), null);
  assert.equal(isBroadRoot("/"), true);
  assert.equal(isBroadRoot("/vault"), false);
  assert.equal(shouldSkipDir("node_modules"), true);
  assert.equal(shouldSkipDir("notes"), false);
});

test("Markdown 按原文比较后再写，node_modules 里的文件不列出来", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opc-notes-"));
  try {
    await fs.writeFile(path.join(root, "a.md"), "原文", "utf8");
    await fs.mkdir(path.join(root, "node_modules"));
    await fs.writeFile(path.join(root, "node_modules", "skip.md"), "跳过", "utf8");
    const files = createNodeNoteFiles();
    const listed = await files.listMarkdown(root);
    assert.deepEqual(listed, [path.join(root, "a.md")]);
    assert.equal(await files.write(path.join(root, "a.md"), "新的", "旧的"), "conflict");
    assert.equal(await files.write(path.join(root, "a.md"), "新的", "原文"), "ok");
    assert.equal((await files.read(path.join(root, "a.md")))?.text, "新的");
    assert.equal(await files.write(path.join(root, "b.md"), "新建", null), "ok");
    assert.equal(await files.write(path.join(root, "b.md"), "再建", null), "conflict");
    assert.deepEqual(await files.listMarkdown("/"), []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
