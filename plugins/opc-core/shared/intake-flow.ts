import {
  Engine,
  MemoryRepositories,
  runningAssignment,
  ticketStage,
  UserError,
  type Assignment,
  type Candidate,
  type Decision,
  type Thread,
  type Ticket,
  type Trigger,
  type TriggerDisposition,
} from "@opc-os/intake-core";
import { AUTO_MERGE, formatAuto, GITHUB_BOT, guardDispatcher, scopeOf, truncateWords, widensScope } from "./dispatcher";
import { stageLabel } from "./intake-await";
import type { IntakeCard } from "./intake-card";
import { mentionsBot, type GithubComment } from "./github-source";
import { senderAllowed, type PolicyDocument } from "./policy";
import { retryDelayMs } from "./retry";

export type OutboxItem = {
  id: string;
  text: string;
  kind: "acknowledgement" | "reply" | "notice";
  ticketId: string;
  thread: string;
  status: "pending" | "sent" | "dropped";
  attempts: number;
  nextAt: number;
};

export type PullRecord = { ticketId: string; number: number; status: "open" };

export type IntakeEvent = { at: string; text: string };

export type FlowSnapshot = {
  triggers: Trigger[];
  dispositions: { id: string; value: TriggerDisposition }[];
  threads: Thread[];
  tickets: Ticket[];
  decisions: Decision[];
  outbox: OutboxItem[];
  pulls: PullRecord[];
  observed: string[];
  events: IntakeEvent[];
  cards: IntakeCard[];
  triggerIds: string[];
  seenCommentIds: string[];
  agents: { agentId: string; ticketId: string }[];
  attempts: string[];
  githubSince: string;
  nowMs: number;
};

export type IngestResult = { kind: string; detail: string; ticketId: string };

type FinishMode = "ready" | "wait";

export type FlowOptions = {
  policy: PolicyDocument;
  snapshot?: FlowSnapshot | null;
  nowMs?: number;
  finish?: FinishMode;
  onStart?: (input: { ticketId: string; title: string }) => void;
};

export function mentionTrigger(input: {
  id: string;
  text: string;
  actor: string;
  at: string;
  source?: string;
  thread?: string;
}): Trigger {
  const source = input.source ?? "github";
  const thread = input.thread ?? "issue-1";
  return {
    id: input.id,
    source,
    threads: [{ source, id: thread }],
    actor: { source, id: input.actor },
    human: true,
    addressed: "mention",
    at: input.at,
    text: input.text,
    channel: { source, thread, address: { message: input.id } },
    meta: {},
  };
}

export class IntakeFlow {
  readonly repo = new MemoryRepositories();
  readonly outbox: OutboxItem[] = [];
  readonly pulls: PullRecord[] = [];
  readonly events: IntakeEvent[] = [];
  readonly cards: IntakeCard[] = [];
  readonly observed: string[] = [];
  readonly seenCommentIds: string[] = [];
  readonly agents: { agentId: string; ticketId: string }[] = [];
  readonly attempts: string[] = [];
  githubSince = "";
  triggerIds: string[] = [];
  nowMs: number;
  finish: FinishMode;
  policy: PolicyDocument;
  private readonly onStart?: (input: { ticketId: string; title: string }) => void;
  private requests: Candidate[] = [];
  private launches: { ticket: Ticket; assignment: Assignment }[] = [];
  private readonly engine: Engine;

  constructor(options: FlowOptions) {
    this.policy = options.policy;
    this.nowMs = options.nowMs ?? Date.parse("2026-11-01T00:00:00.000Z");
    this.finish = options.finish ?? "wait";
    this.onStart = options.onStart;
    if (options.snapshot) this.restore(options.snapshot);
    this.engine = new Engine({
      repo: this.repo,
      policy: () => this.enginePolicy(),
      scope: { scope: () => ({ listened: true, observed: false }) },
      assessor: {
        request: (candidate) => {
          this.requests.push(candidate);
        },
        release: () => undefined,
      },
      executor: {
        start: (ticket, assignment) => {
          this.launches.push({ ticket, assignment });
          this.onStart?.({ ticketId: ticket.id, title: ticket.title });
        },
        deliver: () => undefined,
        stop: () => undefined,
      },
      outbox: {
        send: (message) => {
          if (this.outbox.some((item) => item.id === message.id)) return;
          this.outbox.push({
            id: message.id,
            text: message.text,
            kind: message.kind,
            ticketId: message.ticketId ?? "",
            thread: message.channel.thread,
            status: "pending",
            attempts: 0,
            nextAt: this.nowMs,
          });
        },
        status: (id) => this.outbox.find((item) => item.id === id)?.status,
        withdraw: (id) => {
          const item = this.outbox.find((row) => row.id === id);
          if (item && item.status === "pending") item.status = "dropped";
        },
      },
      now: () => new Date(this.nowMs).toISOString(),
    });
  }

  snapshot(): FlowSnapshot {
    const triggers = this.triggerIds.flatMap((id) => {
      const trigger = this.repo.triggers.get(id);
      return trigger ? [trigger] : [];
    });
    const dispositions = this.triggerIds.flatMap((id) => {
      const value = this.repo.triggers.disposition(id);
      return value ? [{ id, value }] : [];
    });
    const threads = this.repo.threads.list();
    const decisions = threads.flatMap((thread) => this.repo.decisions.byThread(thread.key));
    return {
      triggers,
      dispositions,
      threads,
      tickets: this.repo.tickets.list(),
      decisions,
      outbox: this.outbox.map((item) => ({ ...item })),
      pulls: this.pulls.map((item) => ({ ...item })),
      observed: [...this.observed],
      events: this.events.map((item) => ({ ...item })),
      cards: this.cards.map((item) => ({ ...item })),
      triggerIds: [...this.triggerIds],
      seenCommentIds: [...this.seenCommentIds],
      agents: this.agents.map((item) => ({ ...item })),
      attempts: [...this.attempts],
      githubSince: this.githubSince,
      nowMs: this.nowMs,
    };
  }

  setPolicy(policy: PolicyDocument): void {
    const was = this.policy.mode;
    this.policy = policy;
    if (was !== "auto" && policy.mode === "auto") this.promote();
  }

  ingest(trigger: Trigger): IngestResult {
    const next = this.splitScope(trigger);
    if (!this.triggerIds.includes(next.id)) this.triggerIds.push(next.id);
    let received: string;
    try {
      received = this.engine.receive(next);
    } catch (error) {
      return { kind: "error", detail: this.explain(error), ticketId: "" };
    }
    if (received !== "stored") {
      this.note(`没有重复处理：${received}`);
      return { kind: received, detail: "这条已经见过", ticketId: "" };
    }
    return this.evaluate(next);
  }

  ingestComments(comments: readonly GithubComment[], bot = GITHUB_BOT): { added: number } {
    let added = 0;
    for (const comment of comments) {
      if (this.seenCommentIds.includes(comment.id)) continue;
      this.seenCommentIds.push(comment.id);
      if (comment.at > this.githubSince) this.githubSince = comment.at;
      if (comment.login.toLowerCase() === bot.toLowerCase()) continue;
      if (!mentionsBot(comment.body, bot)) continue;
      this.ingest(
        mentionTrigger({
          id: `gh-${comment.id}`,
          text: comment.body,
          actor: comment.login,
          at: comment.at || new Date(this.nowMs).toISOString(),
          thread: `issue-${comment.issue}`,
        }),
      );
      added += 1;
    }
    return { added };
  }

  fromCard(input: { id: string; title: string; oneLiner: string; actor?: string; at: string }): IngestResult {
    const text = [input.title, input.oneLiner].filter(Boolean).join("。");
    return this.ingest(
      mentionTrigger({
        id: `card-${input.id}`,
        text,
        actor: input.actor || "br1efx",
        source: "card",
        thread: input.id,
        at: input.at,
      }),
    );
  }

  onTurnEnded(ticketId: string): void {
    const ticket = this.repo.tickets.get(ticketId);
    const assignment = ticket ? runningAssignment(ticket) : undefined;
    if (!ticket || !assignment) return;
    this.engine.turnEnded(ticketId, assignment.id);
    const fresh = this.repo.tickets.get(ticketId);
    const state = fresh ? runningAssignment(fresh)?.report?.state ?? fresh.assignments.at(-1)?.report?.state : undefined;
    if (state === "ready" || state === "blocked" || state === "failed" || state === "dropped" || state === "waiting") {
      this.syncCard(ticketId);
      return;
    }
    try {
      this.engine.report(ticketId, { state: "waiting", summary: "这一轮结束，先等下一条消息" });
    } catch (error) {
      this.note(this.explain(error));
    }
    this.syncCard(ticketId);
  }

  readTicket(ticketId: string): string {
    const ticket = this.repo.tickets.get(ticketId);
    if (!ticket) return "没有这张工单";
    return `${ticket.title}\n范围：${ticket.mandate.scope}`;
  }

  reportState(ticketId: string, state: "progress" | "waiting" | "ready" | "blocked" | "failed" | "dropped", summary: string): IngestResult {
    if (state === "ready") return this.reportReady(ticketId, summary);
    try {
      this.engine.report(ticketId, { state, summary });
    } catch (error) {
      return { kind: "error", detail: this.explain(error), ticketId };
    }
    this.syncCard(ticketId);
    return { kind: state, detail: summary, ticketId };
  }

  handback(ticketId: string, triggerId: string, reason: string): IngestResult {
    try {
      const queued = this.engine.handback(ticketId, triggerId, reason);
      return { kind: queued ? "queued" : "kept", detail: queued ? "已交回" : "先留在原工单", ticketId };
    } catch (error) {
      return { kind: "error", detail: this.explain(error), ticketId };
    }
  }

  follow(ticketId: string, source: string, id: string): IngestResult {
    try {
      const followed = this.engine.followForContext(ticketId, { source, id });
      return { kind: followed ? "followed" : "already", detail: followed ? "已关注" : "已经在看", ticketId };
    } catch (error) {
      return { kind: "error", detail: this.explain(error), ticketId };
    }
  }

  unrelated(ticketId: string, thread: string, reason: string): IngestResult {
    try {
      this.engine.markUnrelated(ticketId, thread, reason);
      return { kind: "removed", detail: "已标成无关", ticketId };
    } catch (error) {
      return { kind: "error", detail: this.explain(error), ticketId };
    }
  }

  route(command: string, note: string): { ok: boolean; detail: string } {
    const guarded = guardDispatcher(command, note);
    if (!guarded.ok) return guarded;
    this.note(`调度：${command} ${guarded.note}`.trim());
    return { ok: true, detail: "已路由" };
  }

  reportReady(ticketId: string, summary = "做完了，请验收。"): IngestResult {
    try {
      this.engine.report(ticketId, { state: "ready", summary });
      this.engine.reply({ purpose: "result", ticketId, text: formatAuto(summary) });
    } catch (error) {
      return { kind: "error", detail: this.explain(error), ticketId };
    }
    this.syncCard(ticketId);
    const stage = ticketStage(this.repo.tickets.get(ticketId)!);
    return { kind: stage.stage, detail: stageLabel(stage.stage, "action" in stage ? stage.action ?? "" : ""), ticketId };
  }

  deliver(send: (item: OutboxItem) => boolean): string[] {
    const sent: string[] = [];
    for (const item of this.outbox) {
      if (item.status !== "pending" || item.nextAt > this.nowMs) continue;
      let ok = false;
      try {
        ok = send(item);
      } catch {
        ok = false;
      }
      if (ok) {
        item.status = "sent";
        sent.push(item.id);
      } else {
        item.attempts += 1;
        item.nextAt = this.nowMs + retryDelayMs(item.attempts - 1);
      }
    }
    return sent;
  }

  openPull(ticketId: string, open: () => number): number {
    if (AUTO_MERGE) throw new Error("不自动合并");
    const found = this.pulls.find((item) => item.ticketId === ticketId);
    if (found) return found.number;
    const number = open();
    this.pulls.push({ ticketId, number, status: "open" });
    this.note(`已开 PR #${number}，不合并`);
    return number;
  }

  advance(ms: number): void {
    this.nowMs += ms;
  }

  mark(text: string): void {
    this.note(text.slice(0, 80));
  }

  ensureSince(at: string): void {
    if (!this.githubSince) this.githubSince = at;
  }

  bindAgent(agentId: string, ticketId: string): void {
    if (!agentId || !ticketId) return;
    const found = this.agents.find((item) => item.agentId === agentId);
    if (found) found.ticketId = ticketId;
    else this.agents.push({ agentId, ticketId });
  }

  ticketForAgent(agentId: string): string {
    return this.agents.find((item) => item.agentId === agentId)?.ticketId ?? "";
  }

  agentForTicket(ticketId: string): string {
    return this.agents.find((item) => item.ticketId === ticketId)?.agentId ?? "";
  }

  markAttempt(id: string): void {
    if (!this.attempts.includes(id)) this.attempts.push(id);
  }

  wasAttempted(id: string): boolean {
    return this.attempts.includes(id);
  }

  private evaluate(trigger: Trigger): IngestResult {
    this.requests = [];
    try {
      this.engine.evaluateDue();
    } catch (error) {
      return { kind: "error", detail: this.explain(error), ticketId: "" };
    }
    const candidate = [...this.requests].reverse().find((item) => item.triggers.some((row) => row.id === trigger.id));
    this.requests = [];
    if (!candidate) {
      this.note("未准入");
      return { kind: "gated", detail: "未准入", ticketId: "" };
    }
    if (this.policy.mode !== "auto") {
      try {
        this.engine.decide(trigger.id, {
          kind: "ignore",
          reason: "本来会接单",
          audit: { would_accept: true },
          evalId: candidate.evalId,
        });
      } catch (error) {
        return { kind: "error", detail: this.explain(error), ticketId: "" };
      }
      if (!this.observed.includes(trigger.id)) this.observed.push(trigger.id);
      this.note("本来会接单");
      return { kind: "would-accept", detail: "本来会接单", ticketId: "" };
    }
    return this.accept(trigger, candidate);
  }

  private accept(trigger: Trigger, candidate: Candidate): IngestResult {
    const guarded = guardDispatcher("accept", truncateWords(trigger.text));
    if (!guarded.ok) return { kind: "refused", detail: guarded.detail, ticketId: "" };
    let decision: Decision;
    try {
      decision = this.engine.decide(trigger.id, {
        kind: "accept",
        title: trigger.text.replace(/\s+/g, " ").trim().slice(0, 40) || "开发需求",
        scope: scopeOf(trigger.text),
        reason: "已接单",
        acknowledgement: formatAuto("已接上，开始做。"),
        note: guarded.note,
        evalId: candidate.evalId,
      });
    } catch (error) {
      return { kind: "error", detail: this.explain(error), ticketId: "" };
    }
    const ticketId = decision.ticketId ?? "";
    const seen = this.observed.indexOf(trigger.id);
    if (seen >= 0) this.observed.splice(seen, 1);
    this.settle();
    if (ticketId) this.syncCard(ticketId);
    this.note(ticketId ? "已接单" : "已决定");
    return { kind: "accepted", detail: "已接单", ticketId };
  }

  private promote(): void {
    for (const id of [...this.observed]) {
      const trigger = this.repo.triggers.get(id);
      if (!trigger) continue;
      let queued = false;
      try {
        queued = this.engine.reevaluate(id);
      } catch {
        queued = false;
      }
      if (!queued) continue;
      this.requests = [];
      this.engine.evaluateDue();
      const candidate = [...this.requests].reverse().find((item) => item.triggers.some((row) => row.id === id));
      this.requests = [];
      if (!candidate) continue;
      this.accept(trigger, candidate);
    }
  }

  private settle(): void {
    while (this.launches.length > 0) {
      const next = this.launches.shift();
      if (!next) return;
      this.engine.assignmentStarted(next.ticket.id, next.assignment.id);
      this.engine.bindThread(next.ticket.id, { source: "worktree", id: next.ticket.id }, true);
      const current = this.repo.tickets.get(next.ticket.id);
      const running = current ? runningAssignment(current) : undefined;
      if (current && running && current.undelivered.length > 0) {
        const ids = [...current.undelivered];
        this.engine.inputsDelivered(current.id, running.id, ids);
        this.engine.inputsRead(current.id, ids);
      }
      if (this.finish === "ready") this.reportReady(next.ticket.id);
    }
  }

  private syncCard(ticketId: string): void {
    const ticket = this.repo.tickets.get(ticketId);
    if (!ticket) return;
    const stage = ticketStage(ticket);
    const action = "action" in stage && stage.action ? stage.action : "";
    const intakeStage = stage.stage === "person" ? "person" : stage.stage === "working" && action === "queued" ? "queued" : stage.stage;
    const status = stage.stage === "person" ? "inbox" : stage.stage === "ended" ? "settled" : "active";
    const card: IntakeCard = {
      id: cardIdFor(ticketId),
      title: ticket.title,
      oneLiner: stageLabel(stage.stage, action),
      status,
      intakeTicket: ticketId,
      intakeStage,
      intakeAction: action,
      time: new Date(this.nowMs).toISOString(),
    };
    const index = this.cards.findIndex((item) => item.intakeTicket === ticketId);
    if (index >= 0) this.cards[index] = card;
    else this.cards.push(card);
  }

  private splitScope(trigger: Trigger): Trigger {
    const thread = trigger.threads[0];
    if (!thread || !widensScope(trigger.text)) return trigger;
    const key = `${thread.source}:${thread.id}`;
    const existing = this.repo.threads.get(key);
    const live = existing?.subscriptions.some((id) => {
      const ticket = this.repo.tickets.get(id);
      return !!ticket && !ticket.ended;
    });
    if (!live) return trigger;
    return {
      ...trigger,
      threads: [{ source: thread.source, id: `${thread.id}-scope-${trigger.id}` }],
    };
  }

  private enginePolicy() {
    const policy = this.policy;
    const version = `${policy.mode}:${policy.allow.map((item) => `${item.source}/${item.id}`).join(",")}`;
    return {
      version,
      paused: false,
      evalTimeoutMs: 120_000,
      gate: (trigger: Trigger) => {
        if (policy.mode === "off") return { admissible: false as const, reason: "mode_off" };
        if (!trigger.human) return { admissible: false as const, reason: "not_human" };
        if (!senderAllowed(policy, trigger.actor.source, trigger.actor.id)) {
          return { admissible: false as const, reason: "not_a_member" };
        }
        if (!trigger.addressed) return { admissible: false as const, reason: "no_mention" };
        return {
          admissible: true as const,
          strength: "explicit" as const,
          basis: {
            via: "addressed" as const,
            addressed: trigger.addressed,
            source: trigger.source,
            sender: trigger.actor.id,
          },
        };
      },
      revalidate: (mandate: { actor: { source: string; id: string } }) =>
        senderAllowed(policy, mandate.actor.source, mandate.actor.id),
      admitsInferred: () => false,
    };
  }

  private restore(snapshot: FlowSnapshot): void {
    this.nowMs = snapshot.nowMs;
    this.triggerIds = [...snapshot.triggerIds];
    for (const trigger of snapshot.triggers) this.repo.triggers.save(trigger);
    for (const item of snapshot.dispositions) this.repo.triggers.saveDisposition(item.id, item.value);
    for (const thread of snapshot.threads) this.repo.threads.save(thread);
    for (const ticket of [...snapshot.tickets].reverse()) this.repo.tickets.save(ticket);
    for (const decision of snapshot.decisions) this.repo.decisions.save(decision);
    this.outbox.push(...snapshot.outbox.map((item) => ({ ...item })));
    this.pulls.push(...snapshot.pulls.map((item) => ({ ...item })));
    this.observed.push(...snapshot.observed);
    this.events.push(...snapshot.events.map((item) => ({ ...item })));
    this.cards.push(...snapshot.cards.map((item) => ({ ...item })));
    this.seenCommentIds.push(...snapshot.seenCommentIds);
    this.agents.push(...(snapshot.agents ?? []).map((item) => ({ ...item })));
    this.attempts.push(...(snapshot.attempts ?? []));
    this.githubSince = snapshot.githubSince ?? "";
  }

  private note(text: string): void {
    this.events.push({ at: new Date(this.nowMs).toISOString(), text });
    if (this.events.length > 80) this.events.shift();
  }

  private explain(error: unknown): string {
    if (error instanceof UserError) return error.message;
    return error instanceof Error ? error.message : "没完成";
  }
}

function cardIdFor(ticketId: string): string {
  const clean = ticketId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24) || "x";
  return `in${clean}`;
}
