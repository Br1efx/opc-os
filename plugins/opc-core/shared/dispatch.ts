import type { StepDelivery } from "./workflow";

export type RolePort = {
  refresh(id: string): Promise<boolean>;
  send(id: string, text: string): Promise<void>;
  create(input: { agentId: string; role: string; text: string }): Promise<string>;
};

/** 先唤醒已有 Agent；没有再新建并送出第一句话。失败时留给真机。 */
export async function dispatchRole(
  port: RolePort,
  delivery: StepDelivery,
): Promise<{ ok: boolean; agentId: string; detail: string }> {
  try {
    const alive = await port.refresh(delivery.agentId);
    if (alive) {
      await port.send(delivery.agentId, delivery.text);
      return { ok: true, agentId: delivery.agentId, detail: "已发给 Agent" };
    }
  } catch {
    // 没有这个 Agent 时改为新建。
  }
  try {
    const id = await port.create({ agentId: delivery.agentId, role: delivery.role, text: delivery.text });
    return { ok: true, agentId: id || delivery.agentId, detail: "已新建 Agent" };
  } catch {
    return { ok: false, agentId: delivery.agentId, detail: "没有送到 Agent。需真机验证。" };
  }
}
