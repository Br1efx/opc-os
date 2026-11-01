import {
  PluginFileConflictError,
  PluginFileDeletedError,
  useFileText,
  usePaseo,
  useRpc,
  type PluginFilePanelProps,
} from "@getpaseo/plugin/client";
import { Loading, TextInput, useToast } from "@getpaseo/plugin/client/ui";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  addComment,
  askAgentPrompt,
  checkNoteSaveRpc,
  listComments,
  lockShade,
  noteSegments,
  pickAgent,
  replyToComment,
  resolveComment,
  type NoteComment,
} from "../shared/notes";
import { EmbedSection } from "./embed-section";
import { mountNoteEditor, type NoteEditorHandle, type NoteSelection } from "./web";

const SAVE_DELAY_MS = 500;

type SaveState = "loading" | "ready" | "conflict" | "deleted";

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : "没完成";
}

function Comments({
  text,
  theme,
  onCommit,
}: {
  text: string;
  theme: PluginFilePanelProps["theme"];
  onCommit(next: string): void;
}) {
  const toast = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const comments = listComments(text);
  const shade = lockShade(theme.colors.foreground);
  const styles = useMemo(
    () => ({
      block: {
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        backgroundColor: theme.colors.surface0,
        maxHeight: 280,
      },
      row: { paddingHorizontal: 16, paddingVertical: 8 },
      title: { color: theme.colors.foreground },
      muted: { color: theme.colors.foregroundMuted, marginTop: 4 },
      quote: { color: theme.colors.foreground, backgroundColor: shade, marginTop: 4 },
      action: { color: theme.colors.accent, marginRight: 16 },
      input: {
        color: theme.colors.foreground,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 6,
        marginTop: 8,
      },
      actions: { flexDirection: "row" as const, marginTop: 8 },
    }),
    [shade, theme],
  );

  function reply(comment: NoteComment) {
    const body = drafts[comment.id] ?? "";
    const changed = replyToComment(text, comment.id, body, "人", new Date().toISOString());
    if (!changed.ok) {
      toast.error(changed.detail);
      return;
    }
    setDrafts((current) => ({ ...current, [comment.id]: "" }));
    onCommit(changed.text);
  }

  function resolve(comment: NoteComment) {
    const changed = resolveComment(text, comment.id);
    if (!changed.ok) {
      toast.error(changed.detail);
      return;
    }
    onCommit(changed.text);
  }

  return (
    <ScrollView style={styles.block}>
      <View style={styles.row}>
        <Text style={styles.title}>批注 {comments.length} 条</Text>
      </View>
      {comments.map((comment) => (
        <View key={comment.id} style={styles.row}>
          <Text style={styles.title}>
            {comment.id} · {comment.status === "open" ? "未解决" : "已解决"}
          </Text>
          <Text style={styles.quote}>{comment.quote}</Text>
          <Text style={styles.muted}>{comment.note}</Text>
          {comment.replies.map((item) => (
            <Text key={`${item.at}-${item.author}`} style={styles.muted}>
              {item.author}：{item.body}
            </Text>
          ))}
          {comment.status === "open" ? (
            <View>
              <TextInput
                onChangeText={(value) => setDrafts((current) => ({ ...current, [comment.id]: value }))}
                placeholder="回复"
                style={styles.input}
                value={drafts[comment.id] ?? ""}
              />
              <View style={styles.actions}>
                <Pressable accessibilityRole="button" onPress={() => reply(comment)}>
                  <Text style={styles.action}>回复</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => resolve(comment)}>
                  <Text style={styles.action}>解决</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

function NotesEditor({ file, tab, theme, workspaceId, navigation, layout }: PluginFilePanelProps) {
  const { setModified } = tab;
  const parent = useRef<View>(null);
  const editor = useRef<NoteEditorHandle | null>(null);
  const saved = useRef("");
  const unsaved = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handlers = useRef({
    onChange(_text: string) {},
    onSelection(_selection: NoteSelection) {},
    onAsk(_excerpt: string) {},
  });
  const [state, setState] = useState<SaveState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [selection, setSelection] = useState<NoteSelection>({ from: 0, to: 0, text: "" });
  const [menuExcerpt, setMenuExcerpt] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const checkSave = useRpc(checkNoteSaveRpc);
  const paseo = usePaseo();
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const text = await file.readText();
      saved.current = text;
      unsaved.current = null;
      setBody(text);
      setModified(false);
      editor.current?.setText(text);
      setError(null);
      setState("ready");
    } catch (cause) {
      setError(messageOf(cause));
    }
  }, [file, setModified]);

  const save = useCallback(
    async (force: boolean) => {
      const next = unsaved.current;
      if (next === null) return;
      let checked: { ok: boolean; detail: string };
      try {
        checked = await checkSave({ baseText: saved.current, nextText: next });
      } catch (cause) {
        setError(messageOf(cause));
        return;
      }
      if (!checked.ok) {
        unsaved.current = null;
        setModified(false);
        editor.current?.setText(saved.current);
        setBody(saved.current);
        setError(checked.detail);
        return;
      }
      try {
        await file.writeText(next, { force });
      } catch (cause) {
        if (cause instanceof PluginFileConflictError) setState("conflict");
        else if (cause instanceof PluginFileDeletedError) setState("deleted");
        else setError(messageOf(cause));
        return;
      }
      saved.current = next;
      if (unsaved.current === next) {
        unsaved.current = null;
        setModified(false);
      }
      setError(null);
      setState("ready");
    },
    [checkSave, file, setModified],
  );

  handlers.current.onChange = (next) => {
    unsaved.current = next;
    setBody(next);
    setModified(true);
    if (saveTimer.current !== undefined) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(false), SAVE_DELAY_MS);
  };
  handlers.current.onSelection = setSelection;

  useLayoutEffect(() => {
    editor.current = mountNoteEditor(parent.current, saved.current, theme, {
      onChange: (next) => handlers.current.onChange(next),
      onSelection: (next) => handlers.current.onSelection(next),
      onAsk: (excerpt) => handlers.current.onAsk(excerpt),
    });
    return () => {
      editor.current?.destroy();
      editor.current = null;
    };
  }, [theme]);

  useEffect(() => {
    void load();
    const unwatch = file.watch((event) => {
      if (event.type === "deleted") setState("deleted");
      else if (unsaved.current === null) void load();
      else setState("conflict");
    });
    return () => {
      unwatch();
      if (saveTimer.current !== undefined) clearTimeout(saveTimer.current);
      if (unsaved.current !== null) {
        const pending = unsaved.current;
        void checkSave({ baseText: saved.current, nextText: pending })
          .then((checked) => {
            if (!checked.ok) return;
            return file.writeText(pending);
          })
          .catch((cause: unknown) => {
            console.warn(`没写上 ${file.name}：${messageOf(cause)}`);
          });
      }
    };
  }, [checkSave, file, load]);

  const ask = useCallback(
    async (excerpt: string) => {
      const prompt = askAgentPrompt(file.path, excerpt);
      try {
        const listed = await paseo.agents.list({
          sort: [{ key: "updated_at", direction: "desc" }],
          page: { limit: 100 },
          filter: { includeArchived: true, includeInternal: true },
        });
        const agent = pickAgent(
          listed.entries.map((entry) => entry.agent),
          workspaceId,
        );
        if (!agent) {
          toast.error("这个工作区里还没有可问的 Agent");
          return;
        }
        await paseo.agents.ref(agent.id).send(prompt, { activeTurnBehavior: "steer" });
        navigation?.openAgent({ agentId: agent.id });
        toast.show("已发给 Agent，回复会进当前对话");
        setMenuExcerpt(null);
      } catch (cause) {
        toast.error(messageOf(cause));
      }
    },
    [file.path, navigation, paseo, toast, workspaceId],
  );
  handlers.current.onAsk = (excerpt) => {
    setMenuExcerpt(excerpt);
    void ask(excerpt);
  };

  function addNote() {
    const current = editor.current?.getText() ?? body;
    const picked = editor.current?.getSelection() ?? selection;
    const added = addComment(current, picked.from, picked.to, note, new Date().toISOString());
    if (!added.ok) {
      toast.error(added.detail);
      return;
    }
    setNote("");
    editor.current?.replaceText(added.text);
  }

  const styles = useMemo(
    () => ({
      panel: { flex: 1, minHeight: 0, backgroundColor: theme.colors.surface0 },
      editor: { flex: 1, minHeight: 120 },
      banner: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: theme.colors.surface1,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      },
      bannerText: { flex: 1, color: theme.colors.foreground },
      error: { color: theme.colors.statusDanger, paddingHorizontal: 16, paddingVertical: 8 },
      action: { color: theme.colors.accent },
      input: {
        flex: 1,
        color: theme.colors.foreground,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 6,
      },
    }),
    [theme],
  );
  const excerpt = menuExcerpt ?? selection.text;

  return (
    <View style={styles.panel}>
      {state === "conflict" ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>文件在磁盘上被改过。</Text>
          <Pressable accessibilityRole="button" onPress={() => void load()}>
            <Text style={styles.action}>重新读取</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => void save(true)}>
            <Text style={styles.action}>仍然覆盖</Text>
          </Pressable>
        </View>
      ) : null}
      {state === "deleted" ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>文件已被删掉。这里的修改还留着。</Text>
        </View>
      ) : null}
      {excerpt.trim() ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>问 Agent</Text>
          <Pressable accessibilityRole="button" onPress={() => void ask(excerpt)}>
            <Text style={styles.action}>问 Agent</Text>
          </Pressable>
          <TextInput onChangeText={setNote} placeholder="批注" style={styles.input} value={note} />
          <Pressable accessibilityRole="button" onPress={addNote}>
            <Text style={styles.action}>加上</Text>
          </Pressable>
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View ref={parent} style={styles.editor} />
      {state === "loading" && !error ? <Loading /> : null}
      <EmbedSection platform={layout.platform} text={body} theme={theme} />
      <Comments
        onCommit={(next) => editor.current?.replaceText(next)}
        text={body}
        theme={theme}
      />
    </View>
  );
}

function NotesReader({ file, theme, layout }: PluginFilePanelProps) {
  const disk = useFileText(file);
  const [local, setLocal] = useState<string | null>(null);
  const checkSave = useRpc(checkNoteSaveRpc);
  const toast = useToast();
  const diskText = disk.status === "ready" ? disk.text : "";
  const text = local ?? diskText;

  useEffect(() => {
    if (disk.status === "ready") setLocal(null);
  }, [disk.status, diskText]);

  const styles = useMemo(
    () => ({
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      text: { color: theme.colors.foreground, padding: 16 },
      lock: { color: theme.colors.foreground, backgroundColor: lockShade(theme.colors.foreground) },
      error: { color: theme.colors.statusDanger, padding: 16 },
      hint: { color: theme.colors.foregroundMuted, paddingHorizontal: 16, paddingTop: 12 },
    }),
    [theme],
  );

  async function commit(next: string) {
    let checked: { ok: boolean; detail: string };
    try {
      checked = await checkSave({ baseText: text, nextText: next });
    } catch (cause) {
      toast.error(messageOf(cause));
      return;
    }
    if (!checked.ok) {
      toast.error(checked.detail);
      return;
    }
    try {
      await file.writeText(next);
    } catch (cause) {
      if (cause instanceof PluginFileConflictError) toast.error("文件在别处被改过，请再试一次");
      else if (cause instanceof PluginFileDeletedError) toast.error("文件已被删掉");
      else toast.error(messageOf(cause));
      return;
    }
    setLocal(next);
  }

  if (disk.status === "loading" && local === null) return <Loading />;
  if (disk.status === "error" && local === null) return <Text style={styles.error}>{disk.error.message}</Text>;
  return (
    <View style={styles.screen}>
      <Text style={styles.hint}>手机上只读。问 Agent 和加批注在电脑上选中文字后使用。</Text>
      <ScrollView>
        <Text selectable style={styles.text}>
          {noteSegments(text).map((segment, index) =>
            segment.kind === "lock" ? (
              <Text key={`${segment.id}-${index}`} style={styles.lock}>
                {`🔒 ${segment.text}`}
              </Text>
            ) : (
              <Text key={`text-${index}`}>{segment.text}</Text>
            ),
          )}
        </Text>
      </ScrollView>
      <EmbedSection platform={layout.platform} text={text} theme={theme} />
      <Comments onCommit={(next) => void commit(next)} text={text} theme={theme} />
    </View>
  );
}

export function NotesFilePanel(props: PluginFilePanelProps) {
  if (props.layout.platform !== "web") return <NotesReader {...props} />;
  return <NotesEditor {...props} />;
}
