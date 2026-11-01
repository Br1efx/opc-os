import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

const fileSchema = z.object({
  name: z.string(),
  text: z.string(),
});

const deliverySchema = z.object({
  agentId: z.string(),
  text: z.string(),
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
    action: z.enum(["approve", "reject", "assign", "to-task", "archive"]),
    reason: z.string(),
    agentId: z.string(),
    now: z.string(),
  }),
  output: z.object({
    ok: z.boolean(),
    detail: z.string(),
    delivery: deliverySchema.nullable(),
  }),
});
