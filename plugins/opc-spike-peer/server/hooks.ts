import type { Card } from "@opc-os/card-protocol";
import { hasCardShape } from "@opc-os/card-protocol";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { defineAgentTool } from "@getpaseo/plugin/server";
import { z } from "zod";

const spikeCard: Card = {
  id: "spike-s3",
  type: "task",
  status: "inbox",
  title: "S3",
  oneLiner: "timeline probe",
  owner: { kind: "agent", id: "spike" },
  source: "opc-spike-peer",
  evidence: [],
  related: [],
  time: "2026-10-31T00:00:00.000Z",
  unread: true,
};

/**
 * 按 @getpaseo/plugin 0.14.0 的真实钩子名注册。
 * 架构页写的是 agent.open.before / agent.turn.after，SDK 里没有这两个名字。
 * 没有 Paseo 宿主时，这些回调不会运行。
 */
export function registerSpikeHooks(server: PluginServerContext): void {
  server.before("agent.session_open", ({ request }) => ({
    ...request,
    tools: [
      ...request.tools,
      defineAgentTool({
        name: "opc_spike_note_card",
        title: "记下探针卡",
        description: "S3 探针。没有正在运行的 Paseo Agent 时不会被调用。",
        input: z.object({ title: z.string() }),
        execute(input) {
          const card: Card = { ...spikeCard, title: input.title };
          if (!hasCardShape(card)) return { isError: true, text: "card shape rejected" };
          return {
            text: card.title,
            structuredContent: {
              id: card.id,
              type: card.type,
              status: card.status,
              title: card.title,
              oneLiner: card.oneLiner,
              owner: { kind: card.owner.kind, id: card.owner.id },
              source: card.source,
              evidence: [...card.evidence],
              related: [...card.related],
              time: card.time,
              unread: card.unread,
            },
          };
        },
      }),
    ],
  }));

  server.on("agent.turn_ended", async (event, context) => {
    const card = spikeCard;
    await context.paseo.agents.ref(event.agent.id).timeline.append({
      type: "plugin",
      id: card.id,
      kind: "opc-card",
      version: 1,
      data: {
        id: card.id,
        type: card.type,
        status: card.status,
        title: card.title,
        oneLiner: card.oneLiner,
        owner: { kind: card.owner.kind, id: card.owner.id },
        source: card.source,
        evidence: [...card.evidence],
        related: [...card.related],
        time: card.time,
        unread: card.unread,
      },
    });
  });
}
