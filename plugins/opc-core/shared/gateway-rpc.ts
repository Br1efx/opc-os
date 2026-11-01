import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { gatewaySnapshotSchema } from "./gateway";

/** 手机和电脑都走这条 RPC。读本机 Magpie 的工作留在 daemon 上。 */
export const gatewaySnapshot = defineRpc({
  name: "gateway.snapshot",
  input: z.object({
    probe: z.boolean(),
    spendLimitUsd: z.number().min(0).max(1_000_000),
    person: z.string().min(1).max(64),
    project: z.string().min(1).max(64),
    role: z.string().min(1).max(64),
    module: z.string().min(1).max(64),
    now: z.string().min(1),
  }),
  output: gatewaySnapshotSchema,
});
