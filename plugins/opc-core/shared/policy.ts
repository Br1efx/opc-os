import { parseYamlSubset } from "./bases";
import { DEFAULT_POLICY_TEXT } from "./policy-default";

export const INTAKE_MODES = ["off", "observe", "auto"] as const;
export type IntakeMode = (typeof INTAKE_MODES)[number];

export type PolicyAllow = { source: string; id: string };

export type PolicyRule = { id: string; name: string; enabled: boolean; instruction: string };

export type PolicyDocument = {
  mode: IntakeMode;
  allow: PolicyAllow[];
  rules: PolicyRule[];
  admission: Record<string, Record<string, Record<string, string>>>;
};

export function defaultPolicy(): PolicyDocument {
  const parsed = parsePolicy(DEFAULT_POLICY_TEXT);
  if (!parsed.ok) throw new Error(parsed.detail);
  return parsed.policy;
}

export function parsePolicy(text: string): { ok: true; policy: PolicyDocument } | { ok: false; detail: string } {
  const yaml = parseYamlSubset(text);
  if (!yaml.ok || !isRecord(yaml.value)) return { ok: false, detail: "策略文件读不懂" };
  const mode = yaml.value.mode;
  if (mode !== "off" && mode !== "observe" && mode !== "auto") return { ok: false, detail: "接单模式只能是 off、observe 或 auto" };
  const allow = readAllow(yaml.value.allow);
  if (!allow) return { ok: false, detail: "名单格式不对" };
  const rules = readRules(yaml.value.rules);
  if (!rules) return { ok: false, detail: "主动规则格式不对" };
  const admission = readAdmission(yaml.value.admission);
  if (!admission) return { ok: false, detail: "准入表格式不对" };
  return { ok: true, policy: { mode, allow, rules, admission } };
}

/** 准入只看名单和模式，不读消息正文。 */
export function senderAllowed(policy: PolicyDocument, source: string, id: string): boolean {
  const wanted = id.toLowerCase();
  return policy.allow.some((item) => item.source === source && item.id.toLowerCase() === wanted);
}

function readAllow(value: unknown): PolicyAllow[] | null {
  if (!Array.isArray(value)) return null;
  const allow: PolicyAllow[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.source !== "string" || typeof item.id !== "string") return null;
    if (!item.source.trim() || !item.id.trim()) return null;
    allow.push({ source: item.source, id: item.id });
  }
  return allow;
}

function readRules(value: unknown): PolicyRule[] | null {
  if (!Array.isArray(value)) return null;
  const rules: PolicyRule[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    if (typeof item.id !== "string" || typeof item.name !== "string" || typeof item.instruction !== "string") return null;
    if (typeof item.enabled !== "boolean") return null;
    rules.push({ id: item.id, name: item.name, enabled: item.enabled, instruction: item.instruction });
  }
  return rules;
}

function readAdmission(value: unknown): PolicyDocument["admission"] | null {
  if (!isRecord(value)) return null;
  const admission: PolicyDocument["admission"] = {};
  for (const [source, rows] of Object.entries(value)) {
    if (!isRecord(rows)) return null;
    admission[source] = {};
    for (const [row, cells] of Object.entries(rows)) {
      if (!isRecord(cells)) return null;
      const next: Record<string, string> = {};
      for (const [cell, setting] of Object.entries(cells)) {
        if (typeof setting !== "string") return null;
        next[cell] = setting;
      }
      admission[source][row] = next;
    }
  }
  return admission;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
