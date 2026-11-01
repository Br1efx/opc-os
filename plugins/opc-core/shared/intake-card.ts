import type { Card, CardStatus } from "@opc-os/card-protocol";
import { renderCardDocument, type CardProps } from "./cards";

export type IntakeCard = {
  id: string;
  title: string;
  oneLiner: string;
  status: CardStatus;
  intakeTicket: string;
  intakeStage: string;
  intakeAction: string;
  time: string;
};

export function renderIntakeCard(card: IntakeCard): string {
  const protocol: Card = {
    id: card.id,
    type: "task",
    status: card.status,
    title: card.title,
    oneLiner: card.oneLiner,
    owner: { kind: "agent", id: "executor" },
    source: "opc-intake",
    evidence: card.intakeAction === "review" ? ["intake:result"] : [],
    related: [],
    time: card.time,
    unread: true,
    goal: card.title,
    acceptance: ["等你验收"],
    due: "",
    dependsOn: [],
    workflow: "",
    stage: card.intakeAction === "review" ? "等你验收" : card.oneLiner,
    failCount: 0,
    ladderLevel: 0,
  };
  const props: CardProps = {
    intakeTicket: card.intakeTicket,
    intakeStage: card.intakeStage,
    intakeAction: card.intakeAction,
    handoff: "d5b-intake",
  };
  return renderCardDocument(protocol, props, card.oneLiner);
}
