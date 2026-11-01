/** 工单阶段表。第一条命中，和引擎的 ticketStage 顺序一致。 */

export const STAGE_TABLE = [
  { stage: "person", action: "delivery", label: "输入未送达" },
  { stage: "person", action: "answer", label: "等你回答" },
  { stage: "person", action: "review", label: "等你验收" },
  { stage: "person", action: "blocked", label: "受阻" },
  { stage: "person", action: "failed", label: "失败" },
  { stage: "working", action: "queued", label: "排队" },
  { stage: "idle", action: "", label: "等新消息" },
  { stage: "working", action: "", label: "工作中" },
] as const;

export function stageLabel(stage: string, action = ""): string {
  if (stage === "ended") return "已结束";
  const found = STAGE_TABLE.find((row) => row.stage === stage && row.action === action);
  if (found) return found.label;
  if (stage === "working") return "工作中";
  if (stage === "idle") return "等新消息";
  if (stage === "person") return "等你处理";
  return "工作中";
}

export type AwaitingCard = {
  id: string;
  intakeTicket?: string;
  intakeStage?: string;
  inInboxView: boolean;
};

/**
 * 有工单的卡只按阶段表算进「等你处理」。
 * 没有工单的卡仍用原来的收件箱视图。同一张卡只算一次。
 */
export function awaitingCardIds(cards: readonly AwaitingCard[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    if (seen.has(card.id)) continue;
    const hit = card.intakeTicket ? card.intakeStage === "person" : card.inInboxView;
    if (!hit) continue;
    seen.add(card.id);
    ids.push(card.id);
  }
  return ids;
}

export function isIntakeAwaiting(props: { intakeTicket?: string; intakeStage?: string }, inInboxView: boolean): boolean {
  if (props.intakeTicket) return props.intakeStage === "person";
  return inInboxView;
}
