import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

const rowSchema = z.object({
  id: z.string(),
  title: z.string(),
  detail: z.string(),
});

/** 面板只读。策略正文来自文件，这条 RPC 不接收修改。 */
export const intakeSnapshotRpc = defineRpc({
  name: "opc-core.intake.snapshot",
  input: z.object({ now: z.string() }),
  output: z.object({
    ok: z.boolean(),
    detail: z.string(),
    mode: z.enum(["off", "observe", "auto"]),
    policyText: z.string(),
    home: z.string(),
    model: z.string(),
    sources: z.array(rowSchema),
    events: z.array(z.object({ at: z.string(), text: z.string() })),
    evals: z.array(z.object({ id: z.string(), text: z.string(), kind: z.string() })),
    runs: z.array(z.object({ ticketId: z.string(), title: z.string(), stage: z.string(), worktree: z.string() })),
  }),
});
