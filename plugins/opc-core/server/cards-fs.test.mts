import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CARDS_ROOT } from "../shared/cards.ts";
import { createNodeCardFiles, resolveInside } from "./cards-fs.ts";

test("卡片目录固定在主力机笔记库，路径不能跳出根", () => {
  assert.equal(CARDS_ROOT, "/home/br1efx/notes/cards");
  const root = "/tmp/opc-cards";
  assert.equal(resolveInside(root, "a.md"), path.resolve(root, "a.md"));
  assert.equal(resolveInside(root, "../secret.md"), null);
  assert.equal(resolveInside(root, "nested/a.md"), null);
  assert.equal(resolveInside(root, ".hidden.md"), null);
  assert.equal(resolveInside(path.join(root, "_views"), "awaiting.yaml"), path.resolve(root, "_views/awaiting.yaml"));
});

test("只列出根上的 Markdown，视图目录和符号链接不算卡片", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opc-cards-"));
  try {
    const files = createNodeCardFiles(root);
    assert.equal(await files.writeCard("../escape.md", "no"), "error");
    assert.equal(await files.writeCard("ok.md", "卡片"), "ok");
    await fs.mkdir(path.join(root, "_views"));
    await fs.writeFile(path.join(root, "_views", "hidden.md"), "不该出现");
    await fs.symlink(path.join(root, "ok.md"), path.join(root, "link.md"));
    const listed = await files.listCards();
    assert.deepEqual(
      listed.map((item) => item.name),
      ["ok.md"],
    );
    assert.equal(await files.writeView("../awaiting.yaml", "no"), "error");
    assert.equal(await files.writeView("awaiting.yaml", "id: awaiting\n"), "ok");
    assert.deepEqual(
      (await files.listViews()).map((item) => item.name),
      ["awaiting.yaml"],
    );
    assert.equal((await files.listCards()).some((item) => item.text.includes("不该出现")), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
