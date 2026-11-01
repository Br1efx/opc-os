import type { PluginHookContext, PluginServerContext, PluginSettings } from "@getpaseo/plugin/server";
import { defineAgentTool } from "@getpaseo/plugin/server";
import { z } from "zod";
import { actionFromFields, createCardStore } from "../shared/cards";
import {
  actCardRpc,
  archiveSessionsRpc,
  createCardRpc,
  createScheduleRpc,
  holdDeliveryRpc,
  listCardsRpc,
  listSchedulesRpc,
  listSessionsRpc,
  recordSessionsRpc,
  startTaskRpc,
} from "../shared/cards-rpc";
import { dispatchRole, type RolePort } from "../shared/dispatch";
import { shellSettings } from "../shared/shell";
import { TASK_AGENT_CWD, TASK_AGENT_PROVIDER } from "../shared/workflow";
import { createNodeCardFiles } from "./cards-fs";
import { WORKFLOW_SEEDS } from "./workflow-seeds";

const closed = "任务与工作流已关闭";

function rolePort(paseo: PluginHookContext["paseo"]): RolePort {
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

async function moduleOn(
  settings: PluginSettings<(typeof shellSettings)["schema"]>,
  id: "m2-card-wall" | "m4-tasks",
): Promise<boolean> {
  const state = await settings.read();
  if (state.status !== "ready") return true;
  return state.values.modules[id] !== false;
}

/**
 * 卡片墙和任务的服务端。
 * 写卡只有 `store.writeCard` 这一处。回合结束先认领任务，没有对应任务才另写问题卡。
 * 架构里的 agent.turn.after 在 SDK 0.14.0 上是 agent.turn_ended。
 */
export function registerCards(
  server: PluginServerContext,
  settings: PluginSettings<(typeof shellSettings)["schema"]>,
): () => void {
  const store = createCardStore(createNodeCardFiles(), undefined, WORKFLOW_SEEDS);
  const tasksOn = () => moduleOn(settings, "m4-tasks");
  const cardsOn = () => moduleOn(settings, "m2-card-wall");

  server.handle(listCardsRpc, async (input) => {
    const library = await store.load(input.now);
    return {
      now: library.now,
      root: library.root,
      cards: library.cards,
      views: library.views,
      workflows: library.workflows,
    };
  });
  server.handle(createCardRpc, async (input) => {
    if (!(await cardsOn())) return { ok: false, detail: "卡片墙已关闭", id: "" };
    const result = await store.createManual(input);
    return { ok: result.ok, detail: result.detail, id: result.id };
  });
  server.handle(actCardRpc, async (input) => {
    if (!(await cardsOn())) return { ok: false, detail: "卡片墙已关闭", delivery: null };
    const action = actionFromFields(input);
    if (!action) return { ok: false, detail: "没有这个动作", delivery: null };
    if (!(await tasksOn())) {
      if (action.action === "to-task") return store.convertTypeOnly({ id: input.id, now: input.now });
      if (action.action === "accept-task" || action.action === "add-evidence" || action.action === "answer" || action.action === "ask") {
        return { ok: false, detail: closed, delivery: null };
      }
    }
    return store.act({ id: input.id, action, now: input.now });
  });
  server.handle(startTaskRpc, async (input) => {
    if (!(await tasksOn())) return { ok: false, detail: closed, id: "", delivery: null };
    return store.startFromTemplate(input);
  });
  server.handle(holdDeliveryRpc, async (input) => {
    if (!(await tasksOn())) return { ok: false, detail: closed };
    return store.holdDelivery(input);
  });
  server.handle(listSchedulesRpc, async () => {
    if (!(await tasksOn())) return { ok: false, detail: closed, items: [] };
    return { ok: true, detail: "", items: await store.schedules() };
  });
  server.handle(createScheduleRpc, async (input) => {
    if (!(await tasksOn())) return { ok: false, detail: closed, command: "", enabled: false as const };
    return store.createSchedule(input);
  });
  server.handle(listSessionsRpc, async (input) => {
    if (!(await tasksOn())) return { ok: false, detail: closed, sessions: [], preview: [] };
    const listed = await store.sessions(input.query, input.now);
    return { ok: true, detail: "", sessions: listed.sessions, preview: listed.preview };
  });
  server.handle(recordSessionsRpc, async (input) => {
    if (!(await tasksOn())) return { ok: false, detail: closed };
    return store.recordSessions(input);
  });
  server.handle(archiveSessionsRpc, async (input) => {
    if (!(await tasksOn())) return { ok: false, detail: closed };
    const result = await store.archiveTracked(input);
    return { ok: result.ok, detail: result.detail };
  });

  const taskTools = [
    defineAgentTool({
      name: "opc_task_evidence",
      title: "记下证据",
      description: "把一条证据写到你正在做的任务卡上。只记证据，不推进步骤。",
      input: z.object({ text: z.string().min(1) }),
      async execute(input, context) {
        if (!(await tasksOn())) return { isError: true, text: closed };
        const result = await store.reportFromAgent({
          agentId: context.agent.id,
          kind: "evidence",
          text: input.text,
          now: new Date().toISOString(),
        });
        return { isError: !result.ok, text: result.detail };
      },
    }),
    defineAgentTool({
      name: "opc_task_ask",
      title: "问一个问题",
      description: "向负责人问一个问题。已经有未回答的问题时会拒绝。不要一次问多个。",
      input: z.object({ question: z.string().min(1) }),
      async execute(input, context) {
        if (!(await tasksOn())) return { isError: true, text: closed };
        const result = await store.reportFromAgent({
          agentId: context.agent.id,
          kind: "ask",
          text: input.question,
          now: new Date().toISOString(),
        });
        return { isError: !result.ok, text: result.detail };
      },
    }),
    defineAgentTool({
      name: "opc_task_fail",
      title: "报告失败",
      description: "这一步做失败了。调用后本回合结束不再重复计失败。",
      input: z.object({ reason: z.string().min(1) }),
      async execute(input, context) {
        if (!(await tasksOn())) return { isError: true, text: closed };
        const result = await store.reportFromAgent({
          agentId: context.agent.id,
          kind: "fail",
          text: input.reason,
          now: new Date().toISOString(),
        });
        return { isError: !result.ok, text: result.detail };
      },
    }),
  ];

  const stopOpen = server.before("agent.session_open", async ({ request }) => {
    if (!(await tasksOn())) return;
    const names = new Set(request.tools.map((tool) => tool.name));
    const extra = taskTools.filter((tool) => !names.has(tool.name));
    if (extra.length === 0) return;
    return { ...request, tools: [...request.tools, ...extra] };
  });
  const stopEnded = server.on("agent.turn_ended", async (event, context) => {
    if (!(await cardsOn())) return;
    const now = new Date().toISOString();
    try {
      if (await tasksOn()) {
        const claimed = await store.consumeTurn({
          agentId: event.agent.id,
          outcome: event.outcome.kind,
          now,
        });
        if (claimed.detail !== "没有对应的任务") {
          if (claimed.delivery) {
            const sent = await dispatchRole(rolePort(context.paseo), claimed.delivery);
            if (!sent.ok && claimed.taskId) {
              await store.holdDelivery({
                id: claimed.taskId,
                agentId: claimed.delivery.agentId,
                text: claimed.delivery.text,
                clear: false,
                now,
              });
            }
          }
          return;
        }
      }
      await store.writeTurn({
        agentId: event.agent.id,
        title: event.agent.title,
        outcome: event.outcome.kind,
        now,
        nonce: Math.random().toString(36).slice(2, 10),
      });
    } catch {
      // 目录写不进去时，不挡住这一轮别的钩子。
    }
  });
  return () => {
    stopOpen();
    stopEnded();
  };
}
