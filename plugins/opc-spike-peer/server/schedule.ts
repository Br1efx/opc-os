import { execCommand } from "@getpaseo/plugin/server";

/**
 * 插件后台调用 paseo schedule 的形状。
 * 本文件不被 index.server.ts 调用，避免插件一加载就去连 daemon。
 * 真机验证前不要从 contribute() 里调用。
 */
export async function createSpikeSchedule(cwd: string): Promise<{ stdout: string; stderr: string }> {
  return execCommand("paseo", [
    "schedule",
    "create",
    "--every",
    "24h",
    "--cwd",
    cwd,
    "--name",
    "opc-os-s4",
    "--provider",
    "codex",
    "--json",
    "opc-os spike S4 noop. Do not call tools.",
  ]);
}

export async function deleteSpikeSchedule(id: string): Promise<{ stdout: string; stderr: string }> {
  return execCommand("paseo", ["schedule", "delete", "--json", id]);
}
