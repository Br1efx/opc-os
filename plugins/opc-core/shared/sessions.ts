/** 会话清理和历史搜索。只归档，不删除。 */

export type TrackedSession = {
  id: string;
  title: string;
  kind: "agent" | "schedule";
  updatedAt: string;
  archived: boolean;
};

export type CleanupPreview = {
  id: string;
  title: string;
  reason: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** 只认任务角色或定时标记。没有标记的会话不进清理和历史。 */
export function trackedKind(labels: Record<string, unknown> | null | undefined): "agent" | "schedule" | null {
  if (!labels) return null;
  const schedule = labels["opc-schedule"];
  if (schedule === true || schedule === "true") return "schedule";
  const role = labels["opc-role"];
  if (typeof role === "string" && role.trim() !== "") return "agent";
  return null;
}

export function previewCleanup(sessions: readonly TrackedSession[], now: string, idleMs = DAY_MS): CleanupPreview[] {
  const nowMs = Date.parse(now);
  if (Number.isNaN(nowMs)) return [];
  const found: CleanupPreview[] = [];
  for (const session of sessions) {
    if (session.archived) continue;
    const updated = Date.parse(session.updatedAt);
    if (Number.isNaN(updated) || nowMs - updated < idleMs) continue;
    found.push({
      id: session.id,
      title: session.title,
      reason: session.kind === "schedule" ? "定时任务会话闲置，可归档" : "子会话闲置，可归档",
    });
  }
  return found;
}

/** 把选中的会话标成已归档。返回的列表仍包含全部会话。 */
export function archiveSessions(sessions: readonly TrackedSession[], ids: readonly string[], now: string): TrackedSession[] {
  void now;
  const chosen = new Set(ids);
  return sessions.map((session) => (chosen.has(session.id) ? { ...session, archived: true } : { ...session }));
}

/** 只读搜索。已归档的会话也在结果里。 */
export function searchSessions(sessions: readonly TrackedSession[], query: string): TrackedSession[] {
  const text = query.trim();
  if (!text) return sessions.map((session) => ({ ...session }));
  return sessions.filter((session) => session.title.includes(text) || session.id.includes(text)).map((session) => ({ ...session }));
}
