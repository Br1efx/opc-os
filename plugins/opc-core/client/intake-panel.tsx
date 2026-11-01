import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { intakeSnapshotRpc } from "../shared/intake-rpc";

export const INTAKE_TABS = ["等你处理", "来源", "事件", "评估", "执行", "设置"] as const;
export type IntakeTab = (typeof INTAKE_TABS)[number];

const PERSON = new Set(["输入未送达", "等你回答", "等你验收", "受阻", "失败"]);

type Snapshot = {
  ok: boolean;
  detail: string;
  mode: "off" | "observe" | "auto";
  policyText: string;
  home: string;
  model: string;
  sources: { id: string; title: string; detail: string }[];
  events: { at: string; text: string }[];
  evals: { id: string; text: string; kind: string }[];
  runs: { ticketId: string; title: string; stage: string; worktree: string }[];
};

export function IntakePanel({ theme, tab: controlled }: { theme: PluginScreenProps["theme"]; tab?: IntakeTab }) {
  const snapshot = useRpc(intakeSnapshotRpc);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const [own, setOwn] = useState<IntakeTab>("等你处理");
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const tab = controlled ?? own;
  const muted = theme.colors.foregroundMuted;
  const text = theme.colors.foreground;
  const styles = useMemo(
    () => ({
      tab: { color: muted, marginRight: 16, paddingVertical: 10, minHeight: 44 },
      tabOn: { color: text, marginRight: 16, paddingVertical: 10, minHeight: 44 },
      row: { flexDirection: "row" as const, flexWrap: "wrap" as const, marginTop: 8 },
      line: { color: muted, marginTop: 8 },
      name: { color: text, marginTop: 12 },
    }),
    [muted, text],
  );

  useEffect(() => {
    let live = true;
    void snapshotRef
      .current({ now: new Date().toISOString() })
      .then((next) => {
        if (live) setData(next);
      })
      .catch((cause: unknown) => {
        if (live) setError(cause instanceof Error ? cause.message : "没读到接单状态");
      });
    return () => {
      live = false;
    };
  }, []);

  const runs = data?.runs ?? [];
  const waiting = runs.filter((item) => PERSON.has(item.stage));

  return (
    <View>
      {controlled ? null : (
        <View style={styles.row}>
          {INTAKE_TABS.map((item) => (
            <Pressable key={item} accessibilityRole="button" accessibilityLabel={item} onPress={() => setOwn(item)}>
              <Text style={tab === item ? styles.tabOn : styles.tab}>{item}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {error ? <Text style={styles.line}>{error}</Text> : null}
      {data && !data.ok ? <Text style={styles.line}>{data.detail}</Text> : null}
      {tab === "等你处理" ? (
        <View>
          <Text style={styles.line}>按工单阶段表。同一张卡只进一个阶段。</Text>
          {waiting.length === 0 ? <Text style={styles.line}>现在没有等你处理的工单。</Text> : null}
          {waiting.map((item) => (
            <Text key={item.ticketId} style={styles.name}>
              {item.stage} · {item.title}
            </Text>
          ))}
        </View>
      ) : null}
      {tab === "来源" ? (
        <View>
          {(data?.sources ?? []).map((item) => (
            <Text key={item.id} style={styles.line}>
              {item.title}：{item.detail}
            </Text>
          ))}
        </View>
      ) : null}
      {tab === "事件" ? (
        <View>
          {(data?.events ?? []).length === 0 ? <Text style={styles.line}>还没有事件。</Text> : null}
          {(data?.events ?? []).map((item) => (
            <Text key={`${item.at}-${item.text}`} style={styles.line}>
              {item.text}
            </Text>
          ))}
        </View>
      ) : null}
      {tab === "评估" ? (
        <View>
          <Text style={styles.line}>当前模式：{data?.mode === "auto" ? "自动" : data?.mode === "off" ? "关闭" : "观察"}</Text>
          {(data?.evals ?? []).length === 0 ? <Text style={styles.line}>还没有评估。</Text> : null}
          {(data?.evals ?? []).map((item) => (
            <Text key={item.id} style={styles.line}>
              {item.kind} {item.text}
            </Text>
          ))}
        </View>
      ) : null}
      {tab === "执行" ? (
        <View>
          <Text style={styles.line}>{data?.model || "调度模型待实测。"}</Text>
          <Text style={styles.line}>执行器用户 br1efx。不自动合并。</Text>
          {runs.length === 0 ? <Text style={styles.line}>还没有工单。</Text> : null}
          {runs.map((item) => (
            <Text key={item.ticketId} style={styles.line}>
              {item.stage} · {item.title} · {item.worktree}
            </Text>
          ))}
        </View>
      ) : null}
      {tab === "设置" ? (
        <View>
          <Text style={styles.line}>只读。要改策略，编辑 agent-kit/shared/policy.yaml。这里不保存。</Text>
          <Text style={styles.line}>状态目录：{data?.home || ""}</Text>
          <Text accessibilityLabel="策略" style={styles.line}>
            {data?.policyText || "还没有策略文本。"}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
