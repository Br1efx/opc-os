import { spawnSync } from "node:child_process";
import path from "node:path";

/** 只建工作副本。参数里没有 merge。 */
export function worktreeArgs(dest: string, branch: string): string[] {
  return ["worktree", "add", "-b", branch, dest];
}

export function createTicketWorktree(input: {
  repo: string;
  root: string;
  ticketId: string;
  run?: (args: string[], cwd: string) => { code: number; stderr: string };
}): { ok: boolean; path: string; detail: string } {
  const safe = input.ticketId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "ticket";
  const dest = path.join(input.root, safe);
  const args = worktreeArgs(dest, `intake-${safe}`);
  if (args.includes("merge")) return { ok: false, path: dest, detail: "不自动合并" };
  const result = (input.run ?? git)(args, input.repo);
  if (result.code !== 0) return { ok: false, path: dest, detail: result.stderr || "工作副本没有建起来" };
  return { ok: true, path: dest, detail: "已建工作副本" };
}

function git(args: string[], cwd: string): { code: number; stderr: string } {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return { code: result.status ?? 1, stderr: result.stderr || result.stdout || "" };
}
