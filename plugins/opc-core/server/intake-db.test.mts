import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { IntakeFlow, mentionTrigger } from "../shared/intake-flow.ts";
import { defaultPolicy } from "../shared/policy.ts";
import { openIntakeDb, readFlowState, resolveOpcHome, writeFlowState } from "./intake-db.ts";
import { createTicketWorktree, worktreeArgs } from "./worktree.ts";

test("重启后不重复发送，也不重复开 PR", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "opc-intake-"));
  const db = openIntakeDb(path.join(dir, "intake.sqlite"));
  const flow = new IntakeFlow({
    policy: { ...defaultPolicy(), mode: "auto" },
    finish: "ready",
    snapshot: readFlowState(db),
  });
  const result = flow.ingest(
    mentionTrigger({
      id: "restart-1",
      text: "改一下标题",
      actor: "Br1efx",
      at: "2026-11-01T00:00:00.000Z",
      thread: "issue-4",
    }),
  );
  assert.equal(result.kind, "accepted");
  let sends = 0;
  flow.deliver(() => {
    sends += 1;
    return sends > 1;
  });
  assert.equal(flow.outbox.filter((item) => item.status === "sent").length, 1);
  assert.equal(flow.outbox.some((item) => item.status === "pending"), true);
  let opened = 0;
  const number = flow.openPull(result.ticketId, () => {
    opened += 1;
    return 41;
  });
  assert.equal(number, 41);
  writeFlowState(db, flow.snapshot());
  db.close();

  const again = openIntakeDb(path.join(dir, "intake.sqlite"));
  const restored = new IntakeFlow({
    policy: { ...defaultPolicy(), mode: "auto" },
    finish: "ready",
    snapshot: readFlowState(again),
  });
  const sentBefore = sends;
  restored.advance(60_000);
  restored.deliver(() => {
    sends += 1;
    return true;
  });
  assert.equal(sends, sentBefore + 1);
  assert.equal(restored.outbox.filter((item) => item.status === "sent").length, 2);
  const same = restored.openPull(result.ticketId, () => {
    opened += 1;
    return 99;
  });
  assert.equal(same, 41);
  assert.equal(opened, 1);
  again.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("每张工单一个工作副本，参数里没有合并", () => {
  assert.equal(worktreeArgs("/tmp/wt", "intake-t").includes("merge"), false);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "opc-wt-"));
  const repo = path.join(dir, "repo");
  fs.mkdirSync(repo);
  const run = (args: string[]) => {
    const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  };
  run(["init", "-b", "main"]);
  run(["config", "user.email", "br1efx@example.com"]);
  run(["config", "user.name", "br1efx"]);
  fs.writeFileSync(path.join(repo, "README.md"), "hello\n");
  run(["add", "README.md"]);
  run(["commit", "-m", "init"]);
  const made = createTicketWorktree({ repo, root: path.join(dir, "worktrees"), ticketId: "ticket-1" });
  assert.equal(made.ok, true, made.detail);
  assert.equal(fs.existsSync(path.join(made.path, "README.md")), true);
  const branch = spawnSync("git", ["branch", "--list", "intake-ticket-1"], { cwd: repo, encoding: "utf8" });
  assert.equal(branch.stdout.includes("intake-ticket-1"), true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("写不了指定目录时改到当前用户目录", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "opc-home-"));
  const preferred = path.join(dir, "opc");
  const ready = resolveOpcHome(preferred);
  assert.equal(ready.fallback, false);
  assert.equal(ready.path, preferred);
  const blocked = path.join(dir, "file");
  fs.writeFileSync(blocked, "x");
  const fell = resolveOpcHome(blocked);
  assert.equal(fell.fallback, true);
  assert.equal(fell.detail.includes("需真机"), true);
  fs.rmSync(dir, { recursive: true, force: true });
});
