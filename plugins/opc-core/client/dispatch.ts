import { usePaseo } from "@getpaseo/plugin/client";
import { dispatchRole, type RolePort } from "../shared/dispatch";
import { TASK_AGENT_CWD, TASK_AGENT_PROVIDER, type StepDelivery } from "../shared/workflow";

type PaseoClient = ReturnType<typeof usePaseo>;

/** 把界面上的 usePaseo 收成按角色建或醒。创建时带上任务标记，避免清到别人的会话。 */
export function rolePort(paseo: PaseoClient): RolePort {
  return {
    async refresh(id) {
      const found = await paseo.agents.ref(id).refresh();
      if (!found?.agent) return false;
      return found.agent.archivedAt == null;
    },
    async send(id, text) {
      await paseo.agents.ref(id).send(text, { activeTurnBehavior: "steer" });
    },
    async create(input) {
      const handle = await paseo.agents.create({
        agentId: input.agentId,
        cwd: TASK_AGENT_CWD,
        prompt: input.text,
        title: input.role,
        labels: { "opc-role": input.role },
        config: { provider: TASK_AGENT_PROVIDER },
      });
      return handle.id;
    },
  };
}

export function deliverRole(paseo: PaseoClient, delivery: StepDelivery): Promise<{ ok: boolean; agentId: string; detail: string }> {
  return dispatchRole(rolePort(paseo), delivery);
}
