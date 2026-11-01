import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

const fileSchema = z.object({
  name: z.string(),
  text: z.string(),
});

const deliverySchema = z.object({
  agentId: z.string(),
  text: z.string(),
  role: z.string(),
});

const sessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(["agent", "schedule"]),
  updatedAt: z.string(),
  archived: z.boolean(),
});

/** 手机和电脑都走这几条。读盘和写盘留在服务端。 */
export const listCardsRpc = defineRpc({
  name: "opc-core.cards.list",
  input: z.object({ now: z.string() }),
  output: z.object({
    now: z.string(),
    root: z.string(),
    cards: z.array(fileSchema),
    views: z.array(fileSchema),
    workflows: z.array(fileSchema),
  }),
});

export const createCardRpc = defineRpc({
  name: "opc-core.cards.create",
  input: z.object({
    title: z.string(),
    oneLiner: z.string(),
    type: z.string(),
    project: z.string(),
    now: z.string(),
    nonce: z.string(),
  }),
  output: z.object({
    ok: z.boolean(),
    detail: z.string(),
    id: z.string(),
  }),
});

export const actCardRpc = defineRpc({
  name: "opc-core.cards.act",
  input: z.object({
    id: z.string(),
    action: z.enum([
      "approve",
      "reject",
      "assign",
      "to-task",
      "archive",
      "accept-task",
      "add-evidence",
      "answer",
      "ask",
    ]),
    reason: z.string(),
    agentId: z.string(),
    evidence: z.string(),
    answer: z.string(),
    question: z.string(),
    now: z.string(),
  }),
  output: z.object({
    ok: z.boolean(),
    detail: z.string(),
    delivery: deliverySchema.nullable(),
  }),
});

export const startTaskRpc = defineRpc({
  name: "opc-core.tasks.start",
  input: z.object({
    templateId: z.string(),
    title: z.string(),
    goal: z.string(),
    acceptance: z.array(z.string()),
    due: z.string(),
    dependsOn: z.array(z.string()),
    project: z.string(),
    now: z.string(),
    nonce: z.string(),
  }),
  output: z.object({
    ok: z.boolean(),
    detail: z.string(),
    id: z.string(),
    delivery: deliverySchema.nullable(),
  }),
});

export const holdDeliveryRpc = defineRpc({
  name: "opc-core.tasks.hold",
  input: z.object({
    id: z.string(),
    agentId: z.string(),
    text: z.string(),
    clear: z.boolean(),
    now: z.string(),
  }),
  output: z.object({
    ok: z.boolean(),
    detail: z.string(),
  }),
});

export const listSchedulesRpc = defineRpc({
  name: "opc-core.tasks.schedules",
  input: z.object({}),
  output: z.object({
    ok: z.boolean(),
    detail: z.string(),
    items: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        kind: z.enum(["schedule", "heartbeat"]),
        enabled: z.literal(false),
        command: z.string(),
        detail: z.string(),
      }),
    ),
  }),
});

export const createScheduleRpc = defineRpc({
  name: "opc-core.tasks.schedules.create",
  input: z.object({ id: z.string(), now: z.string() }),
  output: z.object({
    ok: z.boolean(),
    detail: z.string(),
    command: z.string(),
    enabled: z.literal(false),
  }),
});

export const listSessionsRpc = defineRpc({
  name: "opc-core.tasks.sessions",
  input: z.object({ query: z.string(), now: z.string() }),
  output: z.object({
    ok: z.boolean(),
    detail: z.string(),
    sessions: z.array(sessionSchema),
    preview: z.array(z.object({ id: z.string(), title: z.string(), reason: z.string() })),
  }),
});

export const recordSessionsRpc = defineRpc({
  name: "opc-core.tasks.sessions.record",
  input: z.object({ sessions: z.array(sessionSchema), now: z.string() }),
  output: z.object({ ok: z.boolean(), detail: z.string() }),
});

export const archiveSessionsRpc = defineRpc({
  name: "opc-core.tasks.sessions.archive",
  input: z.object({ ids: z.array(z.string()), now: z.string() }),
  output: z.object({ ok: z.boolean(), detail: z.string() }),
});
