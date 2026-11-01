/** 调度员只路由。备注最多 30 个词，代码拒绝等待。 */

export const DISPATCHER_MODEL = {
  route: "DeepSeek T3",
  via: "Magpie",
  escalate: "DeepSeek T2",
} as const;

export const NOTE_WORD_LIMIT = 30;

const SLEEP = /\bsleep\b|长等待|等待\s*\d+/i;

export function countWords(text: string): number {
  const cjk = text.match(/\p{Script=Han}/gu)?.length ?? 0;
  const rest = text.replace(/\p{Script=Han}/gu, " ").trim();
  const latin = rest ? rest.split(/\s+/).filter(Boolean).length : 0;
  return cjk + latin;
}

export function truncateWords(text: string, limit = NOTE_WORD_LIMIT): string {
  const chars = [...text.trim()];
  let words = 0;
  let end = 0;
  let index = 0;
  while (index < chars.length && words < limit) {
    const char = chars[index] ?? "";
    if (/\p{Script=Han}/u.test(char)) {
      words += 1;
      end = index + 1;
      index += 1;
      continue;
    }
    if (/\s/u.test(char)) {
      index += 1;
      continue;
    }
    while (index < chars.length && !/\s/u.test(chars[index] ?? "") && !/\p{Script=Han}/u.test(chars[index] ?? "")) {
      index += 1;
    }
    words += 1;
    end = index;
  }
  return chars.slice(0, end).join("").trim();
}

export function guardDispatcher(command: string, note: string): { ok: true; note: string } | { ok: false; detail: string } {
  if (command === "sleep" || SLEEP.test(command) || SLEEP.test(note)) {
    return { ok: false, detail: "调度员不能等待" };
  }
  if (!["accept", "attach", "stop", "ignore"].includes(command)) {
    return { ok: false, detail: "调度员只能接单、挂单、停止或忽略" };
  }
  if (countWords(note) > NOTE_WORD_LIMIT) return { ok: false, detail: "备注不能超过 30 个词" };
  return { ok: true, note: note.trim() };
}

const PRIVILEGE = /给我开权限|给我管理员|提权|sudo|所有权限/g;

/** 评论正文不能变成授权。提权字样从范围里拿掉。 */
export function scopeOf(text: string): string {
  const cleaned = text.replace(PRIVILEGE, "").replace(/\s+/g, " ").trim();
  return (cleaned || "所请求的改动").slice(0, 120);
}

export function widensScope(text: string): boolean {
  return /扩大范围|整个仓库|所有权限|给我开权限/.test(text);
}

export function toolsForRole(role: string): "route" | "execute" | "none" {
  if (role === "dispatcher" || role === "调度员" || role === "secretary" || role === "总秘书") return "route";
  if (role === "executor" || role === "执行器") return "execute";
  return "none";
}

export const EXECUTOR_TOOLS = [
  { name: "opc_intake_read", title: "读取" },
  { name: "opc_intake_ack", title: "确认" },
  { name: "opc_intake_report", title: "汇报" },
  { name: "opc_intake_handback", title: "交回" },
  { name: "opc_intake_follow", title: "关注" },
  { name: "opc_intake_unrelated", title: "无关" },
] as const;

export const ROUTING_TOOLS = [{ name: "opc_intake_route", title: "路由" }] as const;

export const EXECUTOR_USER = "br1efx";
export const AUTO_MERGE = false;
export const GITHUB_BOT = "briefx-bot";
export const GITHUB_REPO = "Br1efx/opc-os";
export const AUTO_PREFIX = "这是自动 Agent 写的";

export function formatAuto(text: string): string {
  const body = text.trim();
  if (body.startsWith(AUTO_PREFIX)) return body;
  return `${AUTO_PREFIX}\n${body}`;
}

export const EXECUTOR_RULES = "你在独立工作副本里干活。不要合并。不要扩大授权范围。做完用汇报说明结果。";
