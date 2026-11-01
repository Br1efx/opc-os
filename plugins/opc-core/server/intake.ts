import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { PluginHookContext, PluginServerContext, PluginSessionOpenRequest, PluginSettings } from "@getpaseo/plugin/server";
import { defineAgentTool } from "@getpaseo/plugin/server";
import { ticketStage } from "@opc-os/intake-core";
import { z } from "zod";
import { DISPATCHER_MODEL, EXECUTOR_RULES, formatAuto, toolsForRole } from "../shared/dispatcher";
import { planExecutorAgent } from "../shared/executor-plan";
import { commentCreateArgs, commentListArgs, githubCommand, parseComments, SOURCE_PORTS } from "../shared/github-source";
import { renderIntakeCard } from "../shared/intake-card";
import { IntakeFlow } from "../shared/intake-flow";
import { intakeSnapshotRpc } from "../shared/intake-rpc";
import { stageLabel } from "../shared/intake-await";
import { DEFAULT_POLICY_TEXT } from "../shared/policy-default";
import { parsePolicy, type PolicyDocument } from "../shared/policy";
import { shellSettings } from "../shared/shell";
import { createNodeCardFiles } from "./cards-fs";
import { openIntakeDb, readFlowState, resolveOpcHome, writeFlowState } from "./intake-db";
import { createTicketWorktree } from "./worktree";

type Settings = PluginSettings<(typeof shellSettings)["schema"]>;

type CardNotice = { id: string; title: string; oneLiner: string; at: string };

let bridge: ((input: CardNotice) => void) | null = null;

/** 卡片墙在写完卡之后调用。接单引擎还没挂上时什么都不做。 */
export function intakeFromCard(input: CardNotice): void {
  bridge?.(input);
}

export function registerIntake(server: PluginServerContext, settings: Settings): () => void {
  const home = resolveOpcHome();
  const db = openIntakeDb(path.join(home.path, "intake.sqlite"));
  const loaded = loadPolicy();
  const flow = new IntakeFlow({
    policy: loaded.policy,
    snapshot: readFlowState(db),
    onStart: ({ ticketId }) => {
      const repo = process.env.OPC_REPO || "";
      if (!repo) {
        flow.mark("没有 OPC_REPO，工作副本留待真机");
        return;
      }
      const made = createTicketWorktree({ repo, root: path.join(home.path, "worktrees"), ticketId });
      flow.mark(`${made.detail}。${EXECUTOR_RULES}`);
    },
  });
  let policyText = loaded.text;
  const files = createNodeCardFiles();
  if (home.detail) flowNote(flow, home.detail);
  flow.ensureSince(new Date().toISOString());
  if (!process.env.OPC_EXECUTOR_PROVIDER && !flow.wasAttempted("provider")) {
    flow.markAttempt("provider");
    flowNote(flow, "没有 OPC_EXECUTOR_PROVIDER，执行器 Agent 留待真机");
  }
  let paseo: PluginHookContext["paseo"] | null = null;

  const persist = () => {
    writeFlowState(db, flow.snapshot());
    void syncCards(flow, files);
  };

  bridge = (input) => {
    refreshPolicy();
    flow.fromCard(input);
    persist();
  };

  const executorTools = [
    defineAgentTool({
      name: "opc_intake_read",
      title: "读取",
      description: "读取这张工单的目标和范围。",
      input: z.object({}),
      async execute(_input, context) {
        return { text: flow.readTicket(flow.ticketForAgent(context.agent.id)) };
      },
    }),
    defineAgentTool({
      name: "opc_intake_ack",
      title: "确认",
      description: "确认已经回复过来人。不要再发第二封确认。",
      input: z.object({}),
      async execute() {
        return { text: "确认已经随接单发出" };
      },
    }),
    defineAgentTool({
      name: "opc_intake_report",
      title: "汇报",
      description: "汇报进展、等待、就绪、受阻或失败。",
      input: z.object({ state: z.string(), summary: z.string() }),
      async execute(input, context) {
        const ticketId = flow.ticketForAgent(context.agent.id);
        if (!ticketId) return { isError: true, text: "没有这张工单" };
        const state = input.state === "ready" || input.state === "blocked" || input.state === "failed" || input.state === "waiting" || input.state === "progress" ? input.state : "progress";
        const result = flow.reportState(ticketId, state, input.summary);
        persist();
        return { isError: result.kind === "error", text: result.detail };
      },
    }),
    defineAgentTool({
      name: "opc_intake_handback",
      title: "交回",
      description: "这句要求超出本工单，交回去另开。",
      input: z.object({ triggerId: z.string(), reason: z.string() }),
      async execute(input, context) {
        const ticketId = flow.ticketForAgent(context.agent.id);
        if (!ticketId) return { isError: true, text: "没有这张工单" };
        const result = flow.handback(ticketId, input.triggerId, input.reason);
        persist();
        return { isError: result.kind === "error", text: result.detail };
      },
    }),
    defineAgentTool({
      name: "opc_intake_follow",
      title: "关注",
      description: "关注相关话题，只作上下文。",
      input: z.object({ source: z.string(), id: z.string() }),
      async execute(input, context) {
        const ticketId = flow.ticketForAgent(context.agent.id);
        if (!ticketId) return { isError: true, text: "没有这张工单" };
        const result = flow.follow(ticketId, input.source, input.id);
        persist();
        return { isError: result.kind === "error", text: result.detail };
      },
    }),
    defineAgentTool({
      name: "opc_intake_unrelated",
      title: "无关",
      description: "这个话题和本工单无关。",
      input: z.object({ thread: z.string(), reason: z.string() }),
      async execute(input, context) {
        const ticketId = flow.ticketForAgent(context.agent.id);
        if (!ticketId) return { isError: true, text: "没有这张工单" };
        const result = flow.unrelated(ticketId, input.thread, input.reason);
        persist();
        return { isError: result.kind === "error", text: result.detail };
      },
    }),
  ];
  const routingTools = [
    defineAgentTool({
      name: "opc_intake_route",
      title: "路由",
      description: "只接单、挂单、停止或忽略。不能等待。备注最多 30 个词。",
      input: z.object({ command: z.string(), note: z.string() }),
      async execute(input) {
        const result = flow.route(input.command, input.note);
        persist();
        return { isError: !result.ok, text: result.detail };
      },
    }),
  ];

  const stopOpen = server.before("agent.session_open", async ({ request }, context) => {
    paseo = context.paseo;
    const ticketId = request.labels["opc-ticket"] || "";
    if (ticketId) {
      flow.bindAgent(request.agentId, ticketId);
      persist();
    }
    const role = roleOf(request);
    const set = toolsForRole(role);
    if (set === "none") return;
    const adding = set === "route" ? routingTools : executorTools;
    const names = new Set(request.tools.map((tool) => tool.name));
    const extra = adding.filter((tool) => !names.has(tool.name));
    if (extra.length === 0) return;
    return { ...request, tools: [...request.tools, ...extra] };
  });
  const stopEnded = server.on("agent.turn_ended", async (event, context) => {
    paseo = context.paseo;
    const ticketId = flow.ticketForAgent(event.agent.id);
    if (!ticketId) return;
    flow.onTurnEnded(ticketId);
    persist();
  });

  server.handle(intakeSnapshotRpc, async (_input, context) => {
    paseo = context.paseo;
    if (!(await tasksOn(settings))) {
      return emptySnapshot("任务与工作流已关闭", home.path);
    }
    refreshPolicy();
    await launchPending();
    return panel(flow, policyText, home.path, home.detail);
  });

  const timer = setInterval(() => {
    refreshPolicy();
    pollGithub();
    flow.deliver((item) => sendComment(item.text, item.thread));
    persist();
  }, 20_000);
  timer.unref?.();

  function refreshPolicy() {
    const next = loadPolicy();
    policyText = next.text;
    if (next.policy.mode !== flow.policy.mode || JSON.stringify(next.policy.allow) !== JSON.stringify(flow.policy.allow)) {
      flow.setPolicy(next.policy);
      persist();
    }
  }

  function pollGithub() {
    if (!process.env.OPC_GITHUB_TOKEN) return;
    try {
      const since = flow.githubSince || new Date().toISOString();
      const command = githubCommand(commentListArgs(since), process.env);
      const result = spawnSync(command.command, command.args, { env: command.env, encoding: "utf8" });
      if (result.status !== 0) {
        flowNote(flow, "GitHub 轮询没有成功");
        return;
      }
      const added = flow.ingestComments(parseComments(JSON.parse(result.stdout || "[]")));
      if (added.added > 0) flowNote(flow, `新评论 ${added.added} 条`);
    } catch {
      flowNote(flow, "GitHub 轮询没有成功");
    }
  }

  async function launchPending(): Promise<void> {
    const provider = process.env.OPC_EXECUTOR_PROVIDER || "";
    if (!provider || !paseo) return;
    for (const ticket of flow.snapshot().tickets) {
      if (ticket.ended) continue;
      if (flow.agentForTicket(ticket.id) || flow.wasAttempted(ticket.id)) continue;
      const cwd = path.join(home.path, "worktrees", ticket.id);
      try {
        const handle = await paseo.agents.create(planExecutorAgent({ ticketId: ticket.id, title: ticket.title, cwd, provider }));
        flow.bindAgent(handle.id, ticket.id);
        flowNote(flow, "已建执行器");
      } catch {
        flow.markAttempt(ticket.id);
        flowNote(flow, "执行器 Agent 没有建起来，需真机验证");
      }
      persist();
    }
  }

  return () => {
    bridge = null;
    clearInterval(timer);
    stopOpen();
    stopEnded();
    persist();
    db.close();
  };
}

function sendComment(text: string, thread: string): boolean {
  const issue = /^issue-(\d+)$/.exec(thread)?.[1] ?? "";
  if (!issue) return true;
  if (!process.env.OPC_GITHUB_TOKEN) return false;
  const command = githubCommand(commentCreateArgs(issue, formatAuto(text)), process.env);
  const result = spawnSync(command.command, command.args, { env: command.env, encoding: "utf8" });
  return result.status === 0;
}

function flowNote(flow: IntakeFlow, text: string): void {
  flow.mark(text);
}

function panel(flow: IntakeFlow, policyText: string, home: string, detail: string) {
  const state = flow.snapshot();
  return {
    ok: true,
    detail,
    mode: flow.policy.mode,
    policyText,
    home,
    model: `${DISPATCHER_MODEL.route}，经 ${DISPATCHER_MODEL.via}。不准再升 ${DISPATCHER_MODEL.escalate}。待实测。`,
    sources: SOURCE_PORTS.map((item) => ({ id: item.id, title: item.title, detail: item.enabled ? item.detail : item.detail })),
    events: [...state.events].reverse().slice(0, 20),
    evals: [...state.decisions].reverse().slice(0, 20).map((decision) => ({
      id: decision.id,
      kind: decision.audit && decision.audit.would_accept === true ? "本来会接单" : decision.kind,
      text: decision.reason.map((reason) => reason.code).join("，"),
    })),
    runs: state.tickets.map((ticket) => {
      const stage = ticketStage(ticket);
      const action = "action" in stage && stage.action ? stage.action : "";
      return {
        ticketId: ticket.id,
        title: ticket.title,
        stage: stageLabel(stage.stage, action),
        worktree: path.join(home, "worktrees", ticket.id),
      };
    }),
  };
}

function emptySnapshot(detail: string, home: string) {
  return {
    ok: false,
    detail,
    mode: "observe" as const,
    policyText: "",
    home,
    model: "",
    sources: [],
    events: [],
    evals: [],
    runs: [],
  };
}

function loadPolicy(): { text: string; policy: PolicyDocument } {
  const candidates = [process.env.OPC_POLICY_FILE, path.resolve("agent-kit/shared/policy.yaml")].filter(
    (item): item is string => typeof item === "string" && item !== "",
  );
  for (const file of candidates) {
    try {
      const text = fs.readFileSync(file, "utf8");
      const parsed = parsePolicy(text);
      if (parsed.ok) return { text, policy: parsed.policy };
    } catch {
      // 换下一条路径
    }
  }
  const parsed = parsePolicy(DEFAULT_POLICY_TEXT);
  if (!parsed.ok) return { text: DEFAULT_POLICY_TEXT, policy: { mode: "observe", allow: [], rules: [], admission: {} } };
  return { text: DEFAULT_POLICY_TEXT, policy: parsed.policy };
}

async function tasksOn(settings: Settings): Promise<boolean> {
  const state = await settings.read();
  if (state.status !== "ready") return true;
  return state.values.modules["m4-tasks"] !== false;
}

async function syncCards(flow: IntakeFlow, files: ReturnType<typeof createNodeCardFiles>): Promise<void> {
  for (const card of flow.cards) {
    try {
      await files.writeCard(`${card.id}.md`, renderIntakeCard(card));
    } catch {
      // 卡片目录不在这台机器上时，工单仍留在 sqlite。
    }
  }
}

function roleOf(request: PluginSessionOpenRequest): string {
  return request.labels["opc-role"] || request.title || "";
}

export function ensureWorktree(repo: string, root: string, ticketId: string): { ok: boolean; path: string; detail: string } {
  return createTicketWorktree({ repo, root, ticketId });
}

