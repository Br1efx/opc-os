import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { usePaseo, useRpc } from "@getpaseo/plugin/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { listCardsRpc, archiveSessionsRpc, createScheduleRpc, listSchedulesRpc, listSessionsRpc, recordSessionsRpc } from "../shared/cards-rpc";
import { parseWorkflow, flowOf, type Workflow } from "../shared/workflow";
import { trackedKind, type TrackedSession } from "../shared/sessions";
import { notifyCardWallRefresh } from "./card-wall";
import { IntakePanel } from "./intake-panel";
import { useScreenStyles } from "./screen-style";
import { StartTaskForm } from "./task-start";

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : "没完成";
}

export function TasksScreen({ theme, layout }: PluginScreenProps) {
  const styles = useScreenStyles(theme, layout.compact);
  const listCards = useRpc(listCardsRpc);
  const listSchedules = useRpc(listSchedulesRpc);
  const createSchedule = useRpc(createScheduleRpc);
  const listSessions = useRpc(listSessionsRpc);
  const recordSessions = useRpc(recordSessionsRpc);
  const archiveSessions = useRpc(archiveSessionsRpc);
  const paseo = usePaseo();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [schedules, setSchedules] = useState<{ id: string; title: string; command: string; detail: string; enabled: false }[]>([]);
  const [sessions, setSessions] = useState<TrackedSession[]>([]);
  const [preview, setPreview] = useState<{ id: string; title: string; reason: string }[]>([]);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState("");
  const listCardsRef = useRef(listCards);
  const listSchedulesRef = useRef(listSchedules);
  const listSessionsRef = useRef(listSessions);
  listCardsRef.current = listCards;
  listSchedulesRef.current = listSchedules;
  listSessionsRef.current = listSessions;

  async function pullSessions(nextQuery: string) {
    const listed = await listSessionsRef.current({ query: nextQuery, now: new Date().toISOString() });
    if (!listed.ok) {
      setNotice(listed.detail);
      setSessions([]);
      setPreview([]);
      return;
    }
    setSessions(listed.sessions);
    setPreview(listed.preview);
  }

  useEffect(() => {
    let live = true;
    void listCardsRef
      .current({ now: new Date().toISOString() })
      .then((library) => {
        if (!live) return;
        const next: Workflow[] = [];
        const problems: string[] = [];
        for (const file of library.workflows) {
          const parsed = parseWorkflow(file.text);
          if (parsed.ok) next.push(parsed.workflow);
          else problems.push(`${file.name}：${parsed.detail}`);
        }
        setWorkflows(next);
        setErrors(problems);
      })
      .catch((cause: unknown) => {
        if (live) setNotice(messageOf(cause));
      });
    void listSchedulesRef
      .current({})
      .then((result) => {
        if (!live) return;
        if (!result.ok) setNotice(result.detail);
        setSchedules(result.items);
      })
      .catch((cause: unknown) => {
        if (live) setNotice(messageOf(cause));
      });
    void listSessionsRef
      .current({ query: "", now: new Date().toISOString() })
      .then((listed) => {
        if (!live) return;
        if (!listed.ok) {
          setNotice(listed.detail);
          return;
        }
        setSessions(listed.sessions);
        setPreview(listed.preview);
      })
      .catch((cause: unknown) => {
        if (live) setNotice(messageOf(cause));
      });
    return () => {
      live = false;
    };
  }, []);

  const inputStyle = useMemo(
    () => ({
      color: theme.colors.foreground,
      borderColor: theme.colors.border,
      borderWidth: 1,
      minHeight: 44,
      marginTop: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
    }),
    [theme],
  );

  async function makeSchedule(id: string) {
    try {
      const result = await createSchedule({ id, now: new Date().toISOString() });
      setNotice(result.detail);
      setCopied(result.command);
    } catch (cause) {
      setNotice(messageOf(cause));
    }
  }

  async function syncAgents() {
    try {
      const listed = await paseo.agents.list();
      const sessionsToRecord: TrackedSession[] = [];
      for (const entry of listed.entries) {
        const kind = trackedKind(entry.agent.labels);
        if (!kind) continue;
        sessionsToRecord.push({
          id: entry.agent.id,
          title: entry.agent.title?.trim() || entry.agent.id,
          kind,
          updatedAt: entry.agent.updatedAt,
          archived: Boolean(entry.agent.archivedAt),
        });
      }
      const recorded = await recordSessions({ sessions: sessionsToRecord, now: new Date().toISOString() });
      setNotice(recorded.ok ? `已登记 ${sessionsToRecord.length} 个带标记的会话` : recorded.detail);
      await pullSessions(query);
    } catch (cause) {
      setNotice(`没有读到会话。需真机验证。${messageOf(cause)}`);
    }
  }

  async function archivePreview() {
    const ids = preview.map((item) => item.id);
    if (ids.length === 0) {
      setNotice("没有可归档的会话");
      return;
    }
    try {
      for (const id of ids) {
        await paseo.agents.ref(id).archive();
      }
    } catch (cause) {
      setNotice(`归档没有送到宿主。需真机验证。${messageOf(cause)}`);
      return;
    }
    const result = await archiveSessions({ ids, now: new Date().toISOString() });
    setNotice(result.detail);
    await pullSessions(query);
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.surface0 }} contentContainerStyle={{ padding: layout.compact ? 16 : 24, paddingBottom: 48 }}>
      <Text style={styles.title}>任务与工作流</Text>
      <IntakePanel theme={theme} />
      <Text style={styles.detail}>模板在笔记库里。改文件后刷新，下一步按新模板走。需真机验证的步骤不会在这里假装已经跑过。</Text>
      {notice ? <Text style={styles.detail}>{notice}</Text> : null}
      {errors.map((item) => (
        <Text key={item} style={{ color: theme.colors.statusDanger, marginTop: 8 }}>
          {item}
        </Text>
      ))}
      {workflows.map((workflow) => (
        <View key={workflow.id} style={{ marginTop: 16 }}>
          <Text style={styles.name}>{workflow.title}</Text>
          <Text style={styles.detail}>{workflow.summary}</Text>
          {flowOf(workflow, "").map((step, index) => (
            <Text key={step.id} style={styles.detail}>
              {index + 1}. {step.title} · {step.role} · {step.kind}
              {step.live ? ` · ${step.live}` : ""}
            </Text>
          ))}
        </View>
      ))}
      <StartTaskForm
        accent={theme.colors.accent}
        border={theme.colors.border}
        foreground={theme.colors.foreground}
        muted={theme.colors.foregroundMuted}
        onDone={(detail) => {
          setNotice(detail);
          notifyCardWallRefresh();
        }}
        theme={theme}
        workflows={workflows}
      />
      <Text style={{ ...styles.name, marginTop: 24 }}>定时任务</Text>
      <Text style={styles.detail}>只生成命令，默认不启用。选中命令后可以复制。需真机验证。</Text>
      {schedules.map((item) => (
        <View key={item.id} style={{ marginTop: 12 }}>
          <Text style={styles.name}>{item.title}</Text>
          <Text style={styles.detail}>{item.detail}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`生成${item.title}的命令`} onPress={() => void makeSchedule(item.id)}>
            <Text style={styles.action}>生成命令</Text>
          </Pressable>
        </View>
      ))}
      {copied ? (
        <TextInput accessibilityLabel="可复制的命令" editable={false} multiline selectTextOnFocus style={inputStyle} value={copied} />
      ) : null}
      <Text style={{ ...styles.name, marginTop: 24 }}>会话</Text>
      <Text style={styles.detail}>只看带任务标记或已登记的会话。清理先给出预览，归档后仍可搜索，不会删除。</Text>
      <TextInput
        accessibilityLabel="搜索会话"
        onChangeText={setQuery}
        onSubmitEditing={() => void pullSessions(query)}
        placeholder="搜索标题或标识，含已归档"
        placeholderTextColor={theme.colors.foregroundMuted}
        style={inputStyle}
        value={query}
      />
      <Pressable accessibilityRole="button" onPress={() => void pullSessions(query)}>
        <Text style={styles.action}>搜索</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => void syncAgents()}>
        <Text style={styles.action}>登记带标记的会话</Text>
      </Pressable>
      {preview.length > 0 ? (
        <View style={{ marginTop: 12 }}>
          <Text style={styles.name}>可归档</Text>
          {preview.map((item) => (
            <Text key={item.id} style={styles.detail}>
              {item.title} · {item.reason}
            </Text>
          ))}
          <Pressable accessibilityRole="button" onPress={() => void archivePreview()}>
            <Text style={styles.action}>归档这些</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.detail}>现在没有闲置到可以归档的会话。</Text>
      )}
      {sessions.map((item) => (
        <Text key={item.id} style={styles.detail}>
          {item.title}
          {item.archived ? " · 已归档" : ""}
        </Text>
      ))}
    </ScrollView>
  );
}
