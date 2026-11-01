import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { EditorState } from "@codemirror/state";
import {
  addComment,
  askAgentPrompt,
  captureBaselines,
  checkSave,
  isComposingKey,
  listComments,
  lockFilterResult,
  lockShade,
  lockSpans,
  pickAgent,
  replaceDocumentSpec,
  replyToComment,
  resolveComment,
  restoreBaselines,
  restoreLocks,
  sha256,
  withNotesRules,
  type NoteFiles,
} from "./notes.ts";

const NOW = "2026-11-01T00:00:00.000Z";

test("sha256 对得上公开测试向量", () => {
  assert.equal(sha256(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("没有结束标记的锁定开头不算锁定", () => {
  assert.deepEqual(lockSpans("<!-- lock:start a -->还没结束"), []);
});

test("锁定区只读范围含标记，区外的中文插入不受影响", () => {
  const text = "甲\n<!-- lock:start scene -->\n冻结\n<!-- lock:end -->\n乙";
  const spans = lockSpans(text);
  assert.equal(spans.length, 1);
  assert.equal(spans[0].id, "scene");
  assert.equal(spans[0].inner, "\n冻结\n");
  const state = EditorState.create({
    doc: text,
    extensions: [
      EditorState.changeFilter.of((tr) => (tr.docChanged ? lockFilterResult(tr.startState.doc.toString()) : true)),
    ],
  });
  const typed = state.update({ changes: { from: 0, insert: "中文" } });
  assert.ok(typed.state.doc.toString().startsWith("中文"));
  const lockAt = typed.state.doc.toString().indexOf("冻结");
  const blocked = typed.state.update({ changes: { from: lockAt, to: lockAt + 2, insert: "改掉" } });
  assert.match(blocked.state.doc.toString(), /冻结/);
  assert.doesNotMatch(blocked.state.doc.toString(), /改掉/);
  const reloaded = blocked.state.update(replaceDocumentSpec(blocked.state.doc.length, "<!-- lock:start scene -->\n新的\n<!-- lock:end -->"));
  assert.match(reloaded.state.doc.toString(), /新的/);
});

test("回合结束后按哈希把锁定区写回去，区外的修改留下", () => {
  const before = "前言\n<!-- lock:start scene -->\n剧本\n<!-- lock:end -->\n后记";
  const after = "前言改了\n<!-- lock:start scene -->\n剧本被改\n<!-- lock:end -->\n后记";
  const restored = restoreLocks(after, lockSpans(before).map((span) => ({ id: span.id, inner: span.inner, block: span.block })));
  assert.deepEqual(restored.restoredIds, ["scene"]);
  assert.equal(restored.text, "前言改了\n<!-- lock:start scene -->\n剧本\n<!-- lock:end -->\n后记");
  assert.equal(checkSave(before, after).ok, false);
  assert.equal(checkSave(before, restored.text).ok, true);
});

test("锁定区被整段删掉时按原文补回，并放在批注区之前", () => {
  const before = "<!-- lock:start scene -->剧本<!-- lock:end -->\n\n%% comments %%\n";
  const restored = restoreLocks("只剩别的\n\n%% comments %%\n", [
    { id: "scene", inner: "剧本", block: "<!-- lock:start scene -->剧本<!-- lock:end -->" },
  ]);
  assert.deepEqual(restored.restoredIds, ["scene"]);
  assert.ok(restored.text.indexOf("<!-- lock:start scene -->") < restored.text.indexOf("%% comments %%"));
  assert.match(restored.text, /剧本/);
});

test("批注可以列出来、回复、解决，十条都走一遍", () => {
  let text = "开头\n<!-- lock:start scene -->\n剧本\n<!-- lock:end -->\n";
  const ids: string[] = [];
  for (let index = 0; index < 10; index += 1) {
    const token = `段${index + 1}`;
    const from = text.length;
    text += token;
    const added = addComment(text, from, text.length, `看这里${index + 1}`, NOW);
    assert.equal(added.ok, true);
    if (!added.ok) return;
    text = added.text;
    ids.push(added.id);
  }
  assert.equal(listComments(text).filter((comment) => comment.status === "open").length, 10);
  for (const id of ids) {
    const replied = replyToComment(text, id, "已改，改了措辞", "agent:demo", NOW);
    assert.equal(replied.ok, true);
    if (!replied.ok) return;
    text = replied.text;
  }
  for (const id of ids) {
    const resolved = resolveComment(text, id);
    assert.equal(resolved.ok, true);
    if (!resolved.ok) return;
    text = resolved.text;
  }
  const comments = listComments(text);
  assert.equal(comments.length, 10);
  assert.ok(comments.every((comment) => comment.status === "resolved" && comment.replies.length === 1));
  assert.doesNotMatch(text, /\{==/);
  assert.match(text, /剧本/);
  assert.equal(checkSave("<!-- lock:start scene -->\n剧本\n<!-- lock:end -->\n", text).ok, true);
});

test("锁定区里的批注不能被解决掉", () => {
  const text = "<!-- lock:start scene -->{==剧本==}{>>先别改<<}<!-- lock:end -->\n";
  const [comment] = listComments(text);
  assert.ok(comment);
  const resolved = resolveComment(text, comment.id);
  assert.equal(resolved.ok, false);
  assert.match(text, /\{==剧本==\}/);
});

test("同一段原文没有批注线程时，列出来的标识稳定", () => {
  const text = "前文 {==摘录==}{>>记一下<<} 后文";
  assert.equal(listComments(text)[0].id, listComments(text)[0].id);
  const again = listComments(text)[0].id;
  assert.equal(listComments(`${text}\n`)[0].id, again);
});

test("问 Agent 的提示带上文件和摘录，规则只追加一次", () => {
  const prompt = askAgentPrompt("笔记/选题.md", "  这一段  ");
  assert.match(prompt, /笔记\/选题\.md/);
  assert.match(prompt, /这一段/);
  assert.match(askAgentPrompt("a.md", "字".repeat(9000)), /已截断/);
  const once = withNotesRules("原有提示");
  assert.match(once, /原有提示/);
  assert.match(once, /lock:start/);
  assert.match(once, /list_comments/);
  assert.equal(withNotesRules(once), once);
});

test("选最近更新、未归档、属于这个工作区的对话", () => {
  const picked = pickAgent(
    [
      { id: "old", workspaceId: "w", archivedAt: null, updatedAt: "2026-10-01T00:00:00.000Z" },
      { id: "new", workspaceId: "w", archivedAt: null, updatedAt: "2026-11-01T00:00:00.000Z" },
      { id: "gone", workspaceId: "w", archivedAt: "2026-11-02T00:00:00.000Z", updatedAt: "2026-12-01T00:00:00.000Z" },
      { id: "other", workspaceId: "else", archivedAt: null, updatedAt: "2026-12-01T00:00:00.000Z" },
      { id: "hidden", workspaceId: "w", archivedAt: null, updatedAt: "2026-12-02T00:00:00.000Z", internal: true },
    ],
    "w",
  );
  assert.equal(picked?.id, "new");
  assert.equal(pickAgent([], "w"), null);
});

test("组字期间的按键留给输入法，灰底按前景色区分", () => {
  assert.equal(isComposingKey({ isComposing: true, keyCode: 65 }), true);
  assert.equal(isComposingKey({ keyCode: 229 }), true);
  assert.equal(isComposingKey({ isComposing: false, keyCode: 65 }), false);
  assert.equal(lockShade("#111111"), "#d9d9d9");
  assert.equal(lockShade("#f5f5f5"), "#3a3a3a");
});

test("文件被改掉锁定区后能从快照还原，删掉的文件按快照写回", async () => {
  const original = "<!-- lock:start scene -->剧本<!-- lock:end -->\n正文";
  const store = new Map<string, string>([["/vault/a.md", original.replace("剧本", "被改")]]);
  const files: NoteFiles = {
    async read(filePath) {
      const text = store.get(filePath);
      return text === undefined ? null : { text };
    },
    async write(filePath, text, expected) {
      const current = store.get(filePath);
      if (expected === null) {
        if (current !== undefined) return "conflict";
        store.set(filePath, text);
        return "ok";
      }
      if (current === undefined) return "missing";
      if (current !== expected) return "conflict";
      store.set(filePath, text);
      return "ok";
    },
    async listMarkdown() {
      return [...store.keys()];
    },
  };
  const baselines = [
    {
      path: "/vault/a.md",
      text: original,
      snaps: lockSpans(original).map((span) => ({ id: span.id, inner: span.inner, block: span.block })),
    },
    {
      path: "/vault/gone.md",
      text: original,
      snaps: lockSpans(original).map((span) => ({ id: span.id, inner: span.inner, block: span.block })),
    },
  ];
  const restored = await restoreBaselines(files, baselines);
  assert.equal(store.get("/vault/a.md"), original);
  assert.doesNotMatch(store.get("/vault/a.md") ?? "", /被改/);
  assert.equal(store.get("/vault/gone.md"), original);
  assert.ok(restored.some((item) => item.path === "/vault/a.md" && item.restoredIds.includes("scene")));
  assert.ok(restored.some((item) => item.path === "/vault/gone.md" && item.rebuilt));
  const captured = await captureBaselines(files, "/vault");
  assert.ok(captured.every((item) => item.snaps.length > 0));
});

test("编辑器把中文、锁定过滤和只读挂在网页入口上", () => {
  const source = readFileSync(new URL("../client/web.ts", import.meta.url), "utf8");
  assert.match(source, /Platform\.OS !== "web"/);
  assert.match(source, /lang: "zh-CN"/);
  assert.match(source, /lockFilterResult/);
  assert.match(source, /replaceDocumentSpec/);
  assert.match(source, /cm-opc-lock/);
  assert.match(source, /require\("@codemirror\/view"\)/);
  assert.doesNotMatch(source, /inputHandler/);
  assert.doesNotMatch(source, /^import (?!type).*@codemirror\//m);
  const server = readFileSync(new URL("../server/notes.ts", import.meta.url), "utf8");
  assert.match(server, /server\.on\("agent\.turn_ended"/);
  assert.match(server, /server\.before\("agent\.session_open"/);
  assert.match(server, /name: "list_comments"/);
  assert.match(server, /name: "reply_comment"/);
  assert.match(server, /name: "resolve_comment"/);
  assert.doesNotMatch(server, /agent\.turn\.after/);
  assert.doesNotMatch(server, /agent\.open\.before/);
});
