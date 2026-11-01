import type { CardOwner, CardStatus } from "@opc-os/card-protocol";
import { parseYamlSubset, type Yaml } from "./bases";

/** 工作流步骤种类。待验收和完成要证据，和生命周期状态不是一回事。 */
export const STEP_KINDS = ["seed", "agent", "gate", "human", "accept", "done"] as const;

export type StepKind = (typeof STEP_KINDS)[number];

export const STEP_KIND_LABELS = {
  seed: "起步",
  agent: "自动",
  gate: "门禁",
  human: "等人",
  accept: "待你验收",
  done: "完成",
} as const satisfies Record<StepKind, string>;

export type WorkflowStep = {
  id: string;
  title: string;
  role: string;
  agentId: string;
  kind: StepKind;
  instruction: string;
  requiresEvidence: boolean;
  timeoutMinutes: number | null;
  live: string;
  human: boolean;
};

export type Workflow = {
  id: string;
  title: string;
  summary: string;
  steps: WorkflowStep[];
};

export type TaskMeta = {
  stageSince: string;
  gap: string;
  questionId: string;
  question: string;
  pendingAgent: string;
  pendingText: string;
  holdTurn: string;
  timeline: { at: string; text: string }[];
};

export type TaskRuntime = {
  goal: string;
  acceptance: string[];
  due: string;
  dependsOn: string[];
  workflow: string;
  stage: string;
  failCount: number;
  ladderLevel: number;
  evidence: string[];
  assignee: string;
  meta: TaskMeta;
};

export type StepDelivery = {
  agentId: string;
  role: string;
  text: string;
};

export type Transition = {
  ok: boolean;
  detail: string;
  runtime: TaskRuntime;
  delivery: StepDelivery | null;
  decision: { title: string; oneLiner: string } | null;
  status: CardStatus;
  owner: CardOwner;
  unread: boolean;
  /** 为 false 时调用方不要落盘。缺证据这类拒绝仍然要落盘。 */
  write: boolean;
};

export type HumanAction = {
  format: "human_action";
  id: string;
  question: string;
};

export const LADDER_REASSIGN_ID = "builder-hard";
export const LADDER_COMMITTEE_ID = "paseo-committee";
export const TASK_AGENT_CWD = "/home/br1efx/notes";
export const TASK_AGENT_PROVIDER = "codex";

const ID_PATTERN = /^[a-z][a-z0-9-]{0,40}$/;
const LIVE_MARK = "需真机验证";

export function emptyMeta(now = ""): TaskMeta {
  return {
    stageSince: now,
    gap: "",
    questionId: "",
    question: "",
    pendingAgent: "",
    pendingText: "",
    holdTurn: "",
    timeline: [],
  };
}

export function parseWorkflow(text: string): { ok: true; workflow: Workflow } | { ok: false; detail: string } {
  const yaml = parseYamlSubset(text);
  if (!yaml.ok) return { ok: false, detail: yaml.detail.replaceAll("视图定义", "模板") };
  if (!isRecord(yaml.value)) return { ok: false, detail: "模板必须是一组属性" };
  const value = yaml.value;
  if (typeof value.id !== "string" || !ID_PATTERN.test(value.id)) return { ok: false, detail: "模板标识只能用小写英文、数字和短横线" };
  if (typeof value.title !== "string" || value.title.trim() === "") return { ok: false, detail: "模板要有标题" };
  if (typeof value.summary !== "string" || value.summary.trim() === "") return { ok: false, detail: "模板要有一句说明" };
  if (!Array.isArray(value.steps) || value.steps.length === 0) return { ok: false, detail: "模板至少要有一步" };
  const steps: WorkflowStep[] = [];
  const seen = new Set<string>();
  for (const item of value.steps) {
    const parsed = parseStep(item, steps.length === 0);
    if (!parsed.ok) return parsed;
    if (seen.has(parsed.step.id)) return { ok: false, detail: `步骤标识重复：${parsed.step.id}` };
    seen.add(parsed.step.id);
    steps.push(parsed.step);
  }
  return {
    ok: true,
    workflow: { id: value.id, title: value.title.trim(), summary: value.summary.trim(), steps },
  };
}

export function canEnterAcceptance(
  evidence: readonly string[],
  target: "待验收" | "完成",
): { ok: true } | { ok: false; detail: "缺证据" } {
  if (evidence.some((item) => item.trim() !== "")) return { ok: true };
  void target;
  return { ok: false, detail: "缺证据" };
}

export function humanActionOf(meta: TaskMeta): HumanAction | null {
  if (meta.questionId.trim() === "" || meta.question.trim() === "") return null;
  return { format: "human_action", id: meta.questionId, question: meta.question };
}

export function flowOf(workflow: Workflow, stage: string): { id: string; title: string; role: string; kind: string; live: string; current: boolean }[] {
  return workflow.steps.map((step) => ({
    id: step.id,
    title: step.title,
    role: step.role,
    kind: STEP_KIND_LABELS[step.kind],
    live: step.live,
    current: step.id === stage,
  }));
}

export function stageTitle(workflow: Workflow | null, stage: string): string {
  return workflow?.steps.find((step) => step.id === stage)?.title ?? "未命名步骤";
}

export type Progress = {
  label: string;
  ratio: number;
  blockers: string[];
  question: HumanAction | null;
};

export function progressOf(workflow: Workflow, runtime: TaskRuntime, now: string, settled: readonly string[] = []): Progress {
  const index = workflow.steps.findIndex((step) => step.id === runtime.stage);
  const step = index >= 0 ? workflow.steps[index] : undefined;
  const total = workflow.steps.length;
  const completed = step?.kind === "done" ? total : Math.max(index, 0);
  const ratio = total === 0 ? 0 : completed / total;
  return {
    label: step?.kind === "done" ? `进度 ${total}/${total}` : `进度 ${Math.max(index, 0)}/${total}`,
    ratio,
    blockers: blockersOf(workflow, runtime, now, settled),
    question: humanActionOf(runtime.meta),
  };
}

export function blockersOf(workflow: Workflow, runtime: TaskRuntime, now: string, settled: readonly string[]): string[] {
  const found: string[] = [];
  if (runtime.meta.gap === "缺证据") found.push("缺证据");
  for (const id of runtime.dependsOn) {
    if (!settled.includes(id)) found.push(`依赖还没完成：${id}`);
  }
  const step = workflow.steps.find((item) => item.id === runtime.stage);
  if (step?.timeoutMinutes && runtime.meta.stageSince) {
    const start = Date.parse(runtime.meta.stageSince);
    const current = Date.parse(now);
    if (!Number.isNaN(start) && !Number.isNaN(current) && current - start > step.timeoutMinutes * 60 * 1000) {
      found.push("这一步超时");
    }
  }
  if (runtime.meta.questionId) found.push("等你回答");
  if (step?.human) found.push("等你处理这一步");
  if (runtime.ladderLevel >= 3) found.push("等你拍板");
  return found;
}

export function planStart(
  workflow: Workflow,
  input: {
    title: string;
    goal: string;
    acceptance: readonly string[];
    due: string;
    dependsOn: readonly string[];
    now: string;
    settled?: readonly string[];
  },
): Transition {
  const goal = (input.goal.trim() || input.title.trim()).slice(0, 200);
  if (!goal) return stop(blankRuntime(workflow, input.now), "inbox", personOwner(), false, "目标不能为空");
  const acceptance = input.acceptance.map((item) => item.trim()).filter(Boolean);
  const due = input.due.trim();
  if (due && Number.isNaN(Date.parse(due))) return stop(blankRuntime(workflow, input.now), "inbox", personOwner(), false, "截止时间无效");
  const dependsOn = input.dependsOn.map((item) => item.trim()).filter(Boolean);
  const missing = dependsOn.filter((id) => !(input.settled ?? []).includes(id));
  const runtime = blankRuntime(workflow, input.now);
  runtime.goal = goal;
  runtime.acceptance = acceptance;
  runtime.due = due;
  runtime.dependsOn = dependsOn;
  runtime.evidence = [];
  pushTimeline(runtime, input.now, `已从模板「${workflow.title}」起任务`);
  if (missing.length > 0) {
    runtime.stage = workflow.steps[0]?.id ?? "";
    pushTimeline(runtime, input.now, `依赖还没完成：${missing.join("、")}`);
    return done(runtime, "inbox", personOwner(), true, null, `依赖还没完成：${missing[0]}`, false);
  }
  return land(workflow, runtime, 0, input.now, true);
}

export function planTurn(
  workflow: Workflow,
  runtime: TaskRuntime,
  event: {
    agentId: string;
    outcome: "completed" | "failed" | "canceled";
    evidence?: readonly string[];
    note?: string;
    now: string;
    settled?: readonly string[];
  },
): Transition {
  const current = currentStep(workflow, runtime);
  const note = event.note?.trim() || "";
  if (event.outcome !== "completed") {
    const reason = note || (event.outcome === "canceled" ? "这一轮取消了" : "这一轮失败了");
    return planFailure(workflow, runtime, reason, event.now);
  }
  if (!ownsTurn(runtime, current, event.agentId)) {
    return done(runtime, statusFor(current), ownerFor(runtime, current), false, null, "这轮和当前步骤无关", true, false);
  }
  if (runtime.ladderLevel === 2 && runtime.assignee === LADDER_COMMITTEE_ID) {
    pushTimeline(runtime, event.now, "会诊结束，等你看记录");
    return done(runtime, "active", agentOwner(LADDER_COMMITTEE_ID), true, null, "会诊结束，等你看记录", true);
  }
  addEvidence(runtime, event.evidence ?? []);
  if (current?.human) return done(runtime, "inbox", personOwner(current.role), true, null, "这一步等人", true);
  const index = workflow.steps.findIndex((step) => step.id === runtime.stage);
  return moveNext(workflow, runtime, index, event.now, event.settled ?? []);
}

export function planFailure(workflow: Workflow, runtime: TaskRuntime, reason: string, now: string): Transition {
  const next = cloneRuntime(runtime);
  next.failCount += 1;
  const why = reason.trim() || "失败";
  pushTimeline(next, now, `失败 ${next.failCount}：${why}`);
  if (next.ladderLevel >= 3) {
    pushTimeline(next, now, "仍在等你拍板");
    return done(next, "active", ownerFor(next, currentStep(workflow, next)), true, null, "仍在等你拍板", true);
  }
  if (next.ladderLevel === 0 && next.failCount < 2) {
    return done(next, "active", ownerFor(next, currentStep(workflow, next)), true, null, `已记下第 ${next.failCount} 次失败`, true);
  }
  if (next.ladderLevel === 0) {
    next.ladderLevel = 1;
    next.assignee = LADDER_REASSIGN_ID;
    const step = currentStep(workflow, next);
    pushTimeline(next, now, "卡住阶梯：改派攻坚开发");
    const delivery = {
      agentId: LADDER_REASSIGN_ID,
      role: "攻坚开发",
      text: deliveryText(workflow, next, step, "这一步已经失败两次，请攻坚并留下证据。"),
    };
    return done(next, "active", agentOwner(LADDER_REASSIGN_ID), true, delivery, "已改派攻坚开发", true);
  }
  if (next.ladderLevel === 1) {
    next.ladderLevel = 2;
    next.assignee = LADDER_COMMITTEE_ID;
    pushTimeline(next, now, "卡住阶梯：提交会诊");
    const delivery = {
      agentId: LADDER_COMMITTEE_ID,
      role: "会诊",
      text: deliveryText(workflow, next, currentStep(workflow, next), "请会诊这张任务为什么过不了，给出可以执行的下一步。"),
    };
    return done(next, "active", agentOwner(LADDER_COMMITTEE_ID), true, delivery, "已提交会诊", true);
  }
  next.ladderLevel = 3;
  pushTimeline(next, now, "卡住阶梯：已生成决策卡");
  const current = currentStep(workflow, next);
  return {
    ok: true,
    detail: "已生成决策卡，等你处理",
    runtime: next,
    delivery: null,
    decision: { title: `请拍板：${next.goal || "这张任务"}`, oneLiner: "连续失败，需要你决定怎么继续。" },
    status: "active",
    owner: ownerFor(next, current),
    unread: true,
    write: true,
  };
}

export function planHumanPass(
  workflow: Workflow,
  runtime: TaskRuntime,
  now: string,
  settled: readonly string[] = [],
): Transition {
  const step = currentStep(workflow, runtime);
  if (!step?.human) return stop(runtime, statusFor(step), ownerFor(runtime, step), false, "这一步还在自动做");
  if (step.kind === "done") return done(runtime, "settled", personOwner(step.role), false, null, "已经完成", true, false);
  if (step.kind === "accept") return planAccept(workflow, runtime, now);
  return moveNext(workflow, runtime, workflow.steps.findIndex((item) => item.id === runtime.stage), now, settled);
}

export function planAccept(workflow: Workflow, runtime: TaskRuntime, now: string): Transition {
  const step = currentStep(workflow, runtime);
  if (step?.kind !== "accept") return stop(runtime, statusFor(step), ownerFor(runtime, step), false, "现在还不能验收");
  const guard = canEnterAcceptance(runtime.evidence, "完成");
  if (!guard.ok) {
    const next = cloneRuntime(runtime);
    next.meta.gap = "缺证据";
    pushTimeline(next, now, "缺证据，不能完成");
    return stop(next, "inbox", personOwner(step.role), true, "缺证据", true);
  }
  return moveNext(workflow, runtime, workflow.steps.findIndex((item) => item.id === runtime.stage), now, []);
}

export function planEvidence(runtime: TaskRuntime, evidence: readonly string[], now: string): Transition {
  const text = evidence.map((item) => item.trim()).filter(Boolean);
  if (text.length === 0) return stop(runtime, "active", agentOwner(runtime.assignee || "me"), false, "证据不能为空");
  const next = cloneRuntime(runtime);
  addEvidence(next, text);
  pushTimeline(next, now, `记下证据：${text.join("、")}`);
  const owner = next.assignee ? agentOwner(next.assignee) : personOwner();
  return done(next, "active", owner, false, null, "已记下证据", true);
}

export function planQuestion(runtime: TaskRuntime, question: string, now: string): Transition {
  const text = question.trim();
  if (!text) return stop(runtime, "active", agentOwner(runtime.assignee || "me"), false, "问题不能为空");
  if (runtime.meta.questionId) return stop(runtime, "active", ownerFor(runtime, undefined), false, "一次只能问一个问题");
  const next = cloneRuntime(runtime);
  next.meta.questionId = `q-${now.replace(/[^0-9]/g, "").slice(0, 14) || "0"}`;
  next.meta.question = text.slice(0, 200);
  pushTimeline(next, now, "要问你一个问题");
  return done(next, "inbox", personOwner(), true, null, "已留下一个问题", true);
}

export function planAnswer(runtime: TaskRuntime, answer: string, now: string): Transition {
  const text = answer.trim();
  if (!runtime.meta.questionId) return stop(runtime, "active", ownerFor(runtime, undefined), false, "现在没有要回答的问题");
  if (!text) return stop(runtime, "inbox", personOwner(), false, "回答不能为空");
  const next = cloneRuntime(runtime);
  pushTimeline(next, now, `已回答：${text.slice(0, 200)}`);
  next.meta.questionId = "";
  next.meta.question = "";
  return done(next, "active", ownerFor(next, undefined), false, null, "已记下回答", true);
}

function parseStep(value: Yaml, first: boolean): { ok: true; step: WorkflowStep } | { ok: false; detail: string } {
  if (!isRecord(value)) return { ok: false, detail: "步骤读不懂" };
  if (typeof value.id !== "string" || !ID_PATTERN.test(value.id)) return { ok: false, detail: "步骤标识只能用小写英文、数字和短横线" };
  if (typeof value.title !== "string" || value.title.trim() === "") return { ok: false, detail: "步骤要有标题" };
  if (typeof value.role !== "string" || value.role.trim() === "") return { ok: false, detail: "步骤要写负责角色" };
  if (typeof value.kind !== "string" || !(STEP_KINDS as readonly string[]).includes(value.kind)) {
    return { ok: false, detail: "步骤种类无法识别" };
  }
  const kind = value.kind as StepKind;
  const enter = value.enter;
  if (enter !== "start" && enter !== "previous") return { ok: false, detail: "进入条件只能是开始或上一步" };
  if (first && enter !== "start") return { ok: false, detail: "第一步的进入条件必须是开始" };
  if (!first && enter === "start") return { ok: false, detail: "只有第一步的进入条件可以是开始" };
  if (typeof value.instruction !== "string" || value.instruction.trim() === "") return { ok: false, detail: "步骤要写交给负责人的话" };
  const human = value.human === true;
  const humanKind = kind === "human" || kind === "accept" || kind === "done";
  if (humanKind && !human) return { ok: false, detail: "人工步骤要标明等人" };
  if (!humanKind && human) return { ok: false, detail: "自动步骤不能标成人等" };
  let requiresEvidence = value.requiresEvidence === true || kind === "accept" || kind === "done";
  if ((kind === "accept" || kind === "done") && value.requiresEvidence === false) {
    return { ok: false, detail: "待验收和完成必须要证据" };
  }
  if (kind !== "accept" && kind !== "done") requiresEvidence = value.requiresEvidence === true;
  const agentKind = kind === "agent" || kind === "gate";
  const agentId = typeof value.agentId === "string" ? value.agentId : "";
  if (agentKind && !ID_PATTERN.test(agentId)) return { ok: false, detail: "负责的 Agent 标识无效" };
  if (!agentKind && agentId) return { ok: false, detail: "人工步骤不要写 Agent 标识" };
  let timeoutMinutes: number | null = null;
  if (value.timeoutMinutes !== undefined) {
    const parsed = typeof value.timeoutMinutes === "number" ? value.timeoutMinutes : Number(value.timeoutMinutes);
    if (!Number.isInteger(parsed) || parsed <= 0) return { ok: false, detail: "超时要写正整数" };
    timeoutMinutes = parsed;
  }
  let live = "";
  if (value.live !== undefined) {
    if (value.live !== LIVE_MARK) return { ok: false, detail: "真机标记只能写「需真机验证」" };
    live = LIVE_MARK;
  }
  return {
    ok: true,
    step: {
      id: value.id,
      title: value.title.trim(),
      role: value.role.trim(),
      agentId,
      kind,
      instruction: value.instruction.trim(),
      requiresEvidence,
      timeoutMinutes,
      live,
      human,
    },
  };
}

function land(workflow: Workflow, runtime: TaskRuntime, index: number, now: string, initial: boolean): Transition {
  const step = workflow.steps[index];
  if (!step) return stop(runtime, "active", personOwner(), false, "模板没有这一步");
  if (step.kind === "seed") {
    pushTimeline(runtime, now, `「${step.title}」已具备，继续下一步`);
    return land(workflow, runtime, index + 1, now, initial);
  }
  const guard = guardStep(step, runtime);
  if (!guard.ok) {
    runtime.meta.gap = "缺证据";
    pushTimeline(runtime, now, "缺证据");
    const previous = workflow.steps[index - 1];
    runtime.stage = previous?.id ?? step.id;
    return stop(runtime, statusFor(previous), ownerFor(runtime, previous), true, "缺证据", true);
  }
  if (runtime.ladderLevel === 1) runtime.ladderLevel = 0;
  runtime.stage = step.id;
  runtime.meta.stageSince = now;
  runtime.meta.gap = "";
  pushTimeline(runtime, now, `进入「${step.title}」${step.live ? `（${step.live}）` : ""}`);
  if (step.kind === "agent" || step.kind === "gate") {
    runtime.assignee = step.agentId;
    const delivery = { agentId: step.agentId, role: step.role, text: deliveryText(workflow, runtime, step, step.instruction) };
    return done(runtime, "active", agentOwner(step.agentId), true, delivery, `已交给${step.role}`, true);
  }
  if (step.kind === "done") {
    pushTimeline(runtime, now, "任务完成");
    return done(runtime, "settled", personOwner(step.role), false, null, "已完成", true);
  }
  return done(runtime, "inbox", personOwner(step.role), true, null, `到了「${step.title}」`, true);
}

function moveNext(workflow: Workflow, runtime: TaskRuntime, index: number, now: string, settled: readonly string[]): Transition {
  const missing = runtime.dependsOn.filter((id) => !settled.includes(id));
  if (missing.length > 0) {
    const next = cloneRuntime(runtime);
    pushTimeline(next, now, `依赖还没完成：${missing.join("、")}`);
    return stop(next, "active", ownerFor(next, currentStep(workflow, next)), true, `依赖还没完成：${missing[0]}`, true);
  }
  const next = cloneRuntime(runtime);
  if (index < 0) return stop(next, "active", personOwner(), false, "当前步骤不在模板里");
  if (index + 1 >= workflow.steps.length) {
    pushTimeline(next, now, "任务完成");
    return done(next, "settled", personOwner(), false, null, "已完成", true);
  }
  return land(workflow, next, index + 1, now, false);
}

function guardStep(step: WorkflowStep, runtime: TaskRuntime): { ok: true } | { ok: false } {
  if (!step.requiresEvidence && step.kind !== "accept" && step.kind !== "done") return { ok: true };
  return canEnterAcceptance(runtime.evidence, step.kind === "done" ? "完成" : "待验收").ok ? { ok: true } : { ok: false };
}

function deliveryText(workflow: Workflow, runtime: TaskRuntime, step: WorkflowStep | undefined, instruction: string): string {
  const acceptance = runtime.acceptance.length > 0 ? runtime.acceptance.join("；") : "按任务目标验收";
  const where = step ? `当前步骤是「${step.title}」。` : "";
  return `任务「${runtime.goal}」。工作流是${workflow.title}。${where}验收标准：${acceptance}。${instruction}`;
}

function ownsTurn(runtime: TaskRuntime, step: WorkflowStep | undefined, agentId: string): boolean {
  if (!agentId) return false;
  if (runtime.ladderLevel >= 1) return agentId === runtime.assignee;
  return agentId === runtime.assignee || agentId === step?.agentId;
}

function addEvidence(runtime: TaskRuntime, evidence: readonly string[]) {
  for (const item of evidence) {
    const text = item.trim();
    if (!text || runtime.evidence.includes(text)) continue;
    runtime.evidence.push(text);
  }
  if (runtime.evidence.length > 0) runtime.meta.gap = "";
}

function currentStep(workflow: Workflow, runtime: TaskRuntime): WorkflowStep | undefined {
  return workflow.steps.find((step) => step.id === runtime.stage);
}

function statusFor(step: WorkflowStep | undefined): CardStatus {
  if (!step) return "active";
  if (step.kind === "done") return "settled";
  if (step.human) return "inbox";
  return "active";
}

function ownerFor(runtime: TaskRuntime, step: WorkflowStep | undefined): CardOwner {
  if (runtime.ladderLevel === 1) return agentOwner(LADDER_REASSIGN_ID);
  if (runtime.ladderLevel === 2) return agentOwner(LADDER_COMMITTEE_ID);
  if (step?.agentId) return agentOwner(step.agentId);
  if (runtime.assignee && !step?.human) return agentOwner(runtime.assignee);
  return personOwner(step?.role || "人");
}

function agentOwner(id: string): CardOwner {
  return { kind: "agent", id: id || "builder" };
}

function personOwner(id = "人"): CardOwner {
  return { kind: "person", id };
}

function blankRuntime(workflow: Workflow, now: string): TaskRuntime {
  return {
    goal: "",
    acceptance: [],
    due: "",
    dependsOn: [],
    workflow: workflow.id,
    stage: workflow.steps[0]?.id ?? "",
    failCount: 0,
    ladderLevel: 0,
    evidence: [],
    assignee: "",
    meta: emptyMeta(now),
  };
}

function cloneRuntime(runtime: TaskRuntime): TaskRuntime {
  return {
    ...runtime,
    acceptance: [...runtime.acceptance],
    dependsOn: [...runtime.dependsOn],
    evidence: [...runtime.evidence],
    meta: { ...runtime.meta, timeline: runtime.meta.timeline.map((item) => ({ ...item })) },
  };
}

function pushTimeline(runtime: TaskRuntime, at: string, text: string) {
  runtime.meta.timeline.push({ at, text });
  if (runtime.meta.timeline.length > 80) runtime.meta.timeline.splice(0, runtime.meta.timeline.length - 80);
}

function done(
  runtime: TaskRuntime,
  status: CardStatus,
  owner: CardOwner,
  unread: boolean,
  delivery: StepDelivery | null,
  detail: string,
  ok: boolean,
  write = ok,
): Transition {
  return { ok, detail, runtime, delivery, decision: null, status, owner, unread, write };
}

function stop(
  runtime: TaskRuntime,
  status: CardStatus,
  owner: CardOwner,
  unread: boolean,
  detail: string,
  write = false,
): Transition {
  return done(runtime, status, owner, unread, null, detail, false, write);
}

function isRecord(value: Yaml): value is { [key: string]: Yaml } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
