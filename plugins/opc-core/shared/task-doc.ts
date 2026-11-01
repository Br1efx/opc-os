import type { Card } from "@opc-os/card-protocol";
import { parseYamlSubset, type Yaml } from "./bases";
import { emptyMeta, type TaskMeta, type TaskRuntime, type Transition } from "./workflow";

const START = "<!-- opc-task -->";
const END = "<!-- /opc-task -->";

export function readTaskMeta(body: string): { prose: string; meta: TaskMeta; detail: string } {
  const start = body.indexOf(START);
  const end = body.indexOf(END);
  if (start < 0 || end < start) return { prose: body, meta: emptyMeta(), detail: "" };
  const prose = body.slice(0, start).replace(/\s+$/, "");
  const yaml = parseYamlSubset(body.slice(start + START.length, end));
  if (!yaml.ok || !isRecord(yaml.value)) return { prose, meta: emptyMeta(), detail: "任务附注读不懂" };
  return { prose, meta: metaFrom(yaml.value), detail: "" };
}

export function writeTaskMeta(prose: string, meta: TaskMeta): string {
  const head = prose.replace(/\s+$/, "");
  const block = `${START}\n${emitMeta(meta)}\n${END}\n`;
  return head ? `${head}\n\n${block}` : block;
}

function metaFrom(value: { [key: string]: Yaml }): TaskMeta {
  const timeline: { at: string; text: string }[] = [];
  if (Array.isArray(value.timeline)) {
    for (const item of value.timeline) {
      if (!isRecord(item) || typeof item.at !== "string" || typeof item.text !== "string") continue;
      timeline.push({ at: item.at, text: item.text });
    }
  }
  return {
    stageSince: textOf(value.stageSince),
    gap: textOf(value.gap),
    questionId: textOf(value.questionId),
    question: textOf(value.question),
    pendingAgent: textOf(value.pendingAgent),
    pendingText: textOf(value.pendingText),
    holdTurn: textOf(value.holdTurn),
    timeline,
  };
}

function emitMeta(meta: TaskMeta): string {
  const lines = [
    `stageSince: ${quote(meta.stageSince)}`,
    `gap: ${quote(meta.gap)}`,
    `questionId: ${quote(meta.questionId)}`,
    `question: ${quote(meta.question)}`,
    `pendingAgent: ${quote(meta.pendingAgent)}`,
    `pendingText: ${quote(meta.pendingText)}`,
    `holdTurn: ${quote(meta.holdTurn)}`,
  ];
  if (meta.timeline.length === 0) lines.push("timeline: []");
  else {
    lines.push("timeline:");
    for (const item of meta.timeline) {
      lines.push(`  - at: ${quote(item.at)}`);
      lines.push(`    text: ${quote(item.text)}`);
    }
  }
  return lines.join("\n");
}

export function runtimeFromCard(card: Card, meta: TaskMeta): TaskRuntime {
  return {
    goal: card.goal ?? "",
    acceptance: [...(card.acceptance ?? [])],
    due: card.due ?? "",
    dependsOn: [...(card.dependsOn ?? [])],
    workflow: card.workflow ?? "",
    stage: card.stage ?? "",
    failCount: card.failCount ?? 0,
    ladderLevel: card.ladderLevel ?? 0,
    evidence: [...card.evidence],
    assignee: card.owner.kind === "agent" ? card.owner.id : "",
    meta,
  };
}

export function applyTransition(card: Card, transition: Transition): Card {
  const runtime = transition.runtime;
  return {
    ...card,
    type: "task",
    status: transition.status,
    owner: transition.owner,
    unread: transition.unread,
    evidence: runtime.evidence,
    goal: runtime.goal,
    acceptance: runtime.acceptance,
    due: runtime.due,
    dependsOn: runtime.dependsOn,
    workflow: runtime.workflow,
    stage: runtime.stage,
    failCount: runtime.failCount,
    ladderLevel: runtime.ladderLevel,
  };
}

function textOf(value: Yaml | undefined): string {
  return typeof value === "string" ? value : "";
}

function quote(value: string): string {
  if (value === "" || value !== value.trim() || /^(?:true|false|null|~)$/.test(value) || /[:#\n"'[\]{},&*!|>%@`]/.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, "\\n")}"`;
  }
  return value;
}

function isRecord(value: Yaml): value is { [key: string]: Yaml } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
