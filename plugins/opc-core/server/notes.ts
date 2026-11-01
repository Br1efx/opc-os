import type { PluginServerContext, PluginSettings } from "@getpaseo/plugin/server";
import { defineAgentTool } from "@getpaseo/plugin/server";
import { z } from "zod";
import {
  applyNoteChange,
  captureBaselines,
  checkNoteSaveRpc,
  checkSave,
  createNoticeLog,
  formatCommentList,
  listComments,
  listNoteNoticesRpc,
  lockNotice,
  replyToComment,
  resolveComment,
  restoreBaselines,
  withNotesRules,
  type FileBaseline,
} from "../shared/notes";
import { shellSettings } from "../shared/shell";
import { createNodeNoteFiles, resolveNotePath } from "./notes-fs";

const pathInput = z.object({ path: z.string().min(1) });

function commentTools(files: ReturnType<typeof createNodeNoteFiles>) {
  return [
    defineAgentTool({
      name: "list_comments",
      title: "列出批注",
      description:
        "列出工作区里某个 Markdown 的批注。处理批注时逐条读未解决项，改正文（不要改锁定区），再用 reply_comment 回复改了什么，然后等用户解决。",
      input: pathInput,
      async execute(input, context) {
        const filePath = resolveNotePath(context.agent.cwd, input.path);
        if (!filePath) return { isError: true, text: "只能处理当前工作区里的 Markdown" };
        const file = await files.read(filePath);
        if (!file) return { isError: true, text: "没有这个 Markdown 文件" };
        const comments = listComments(file.text);
        return {
          text: formatCommentList(comments),
          structuredContent: {
            comments: comments.map((comment) => ({
              id: comment.id,
              quote: comment.quote,
              note: comment.note,
              status: comment.status,
              replies: comment.replies.map((reply) => ({ ...reply })),
            })),
          },
        };
      },
    }),
    defineAgentTool({
      name: "reply_comment",
      title: "回复批注",
      description: "给一条批注追加回复。不会改锁定区。正文要改的话用你自己的编辑，改完再用这个工具说明改了什么。",
      input: pathInput.extend({
        id: z.string().min(1),
        body: z.string().min(1),
      }),
      async execute(input, context) {
        const filePath = resolveNotePath(context.agent.cwd, input.path);
        if (!filePath) return { isError: true, text: "只能处理当前工作区里的 Markdown" };
        const result = await applyNoteChange(files, filePath, (text) =>
          replyToComment(text, input.id, input.body, `agent:${context.agent.id}`, new Date().toISOString()),
        );
        if (!result.ok) return { isError: true, text: result.detail };
        return { text: `已回复 ${input.id}。` };
      },
    }),
    defineAgentTool({
      name: "resolve_comment",
      title: "解决批注",
      description: "把一条批注标成已解决，并去掉正文里的批注标记。只有用户明确说可以解决时才调用。锁定区里的批注会拒绝。",
      input: pathInput.extend({ id: z.string().min(1) }),
      async execute(input, context) {
        const filePath = resolveNotePath(context.agent.cwd, input.path);
        if (!filePath) return { isError: true, text: "只能处理当前工作区里的 Markdown" };
        const result = await applyNoteChange(files, filePath, (text) => resolveComment(text, input.id));
        if (!result.ok) return { isError: true, text: result.detail };
        return { text: `已解决 ${input.id}。原文里的批注标记已去掉。` };
      },
    }),
  ];
}

async function notesEnabled(settings: PluginSettings<(typeof shellSettings)["schema"]>): Promise<boolean> {
  const state = await settings.read();
  if (state.status !== "ready") return true;
  return state.values.modules["m1-notes"] !== false;
}

/**
 * 批注工具和锁定还原。
 * SDK 0.14.0 在会话打开时挂工具，在回合结束时比对锁定区哈希并还原。
 */
export function registerNotes(
  server: PluginServerContext,
  settings: PluginSettings<(typeof shellSettings)["schema"]>,
): () => void {
  const files = createNodeNoteFiles();
  const notices = createNoticeLog();
  const baselines = new Map<string, FileBaseline[]>();
  server.handle(checkNoteSaveRpc, (input) => checkSave(input.baseText, input.nextText));
  server.handle(listNoteNoticesRpc, () => ({ notices: notices.list() }));
  const stopCreate = server.before("agent.create", async ({ request }) => {
    if (!(await notesEnabled(settings))) return;
    return {
      ...request,
      config: {
        ...request.config,
        systemPrompt: withNotesRules(request.config.systemPrompt),
      },
    };
  });
  const stopOpen = server.before("agent.session_open", async ({ request }) => {
    if (!(await notesEnabled(settings))) return;
    const names = new Set(request.tools.map((tool) => tool.name));
    const extra = commentTools(files).filter((tool) => !names.has(tool.name));
    if (extra.length === 0) return;
    return { ...request, tools: [...request.tools, ...extra] };
  });
  const stopStarted = server.on("agent.turn_started", async (event) => {
    baselines.set(event.agent.id, await captureBaselines(files, event.agent.cwd));
  });
  const stopEnded = server.on("agent.turn_ended", async (event, context) => {
    const snapshot = baselines.get(event.agent.id);
    baselines.delete(event.agent.id);
    if (!snapshot || snapshot.length === 0) return;
    const hits = await restoreBaselines(files, snapshot);
    for (const hit of hits) {
      const notice = lockNotice(hit.path, hit.restoredIds, new Date().toISOString(), hit.rebuilt);
      notices.add(notice);
      try {
        await context.paseo.agents.ref(event.agent.id).timeline.append({
          type: "plugin",
          id: notice.id,
          kind: "opc-note-notice",
          version: 1,
          data: {
            title: notice.title,
            body: notice.body,
            path: notice.path,
            lockIds: notice.lockIds,
          },
        });
      } catch {
        // 对话时间线写不进去时，通知页里的这一条还在。
      }
    }
  });
  return () => {
    stopCreate();
    stopOpen();
    stopStarted();
    stopEnded();
  };
}
