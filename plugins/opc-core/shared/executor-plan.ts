import { EXECUTOR_RULES } from "./dispatcher";

/** 建执行器时交给宿主的参数。没有合并，也没有钥匙。 */
export type ExecutorPlan = {
  cwd: string;
  title: string;
  prompt: string;
  idempotencyKey: string;
  labels: { "opc-role": "executor"; "opc-ticket": string };
  config: { provider: string; systemPrompt: string };
};

export function planExecutorAgent(input: { ticketId: string; title: string; cwd: string; provider: string }): ExecutorPlan {
  const ticketId = input.ticketId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
  return {
    cwd: input.cwd,
    title: (input.title || "工单").slice(0, 80),
    prompt: `${EXECUTOR_RULES}\n工单：${input.title}`,
    idempotencyKey: `intake-${ticketId || "ticket"}`,
    labels: { "opc-role": "executor", "opc-ticket": input.ticketId },
    config: { provider: input.provider, systemPrompt: EXECUTOR_RULES },
  };
}
