import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { usePaseo, useRpc } from "@getpaseo/plugin/client";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { holdDeliveryRpc, startTaskRpc } from "../shared/cards-rpc";
import { BUSINESS_LINES } from "../shared/cards";
import type { Workflow } from "../shared/workflow";
import { deliverRole } from "./dispatch";

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : "没完成";
}

/** 从模板起一张任务，并按第一步的角色建或醒 Agent。 */
export function StartTaskForm({
  workflows,
  theme,
  accent,
  muted,
  foreground,
  border,
  onDone,
}: {
  workflows: readonly Workflow[];
  theme: PluginScreenProps["theme"];
  accent: string;
  muted: string;
  foreground: string;
  border: string;
  onDone: (detail: string) => void;
}) {
  const start = useRpc(startTaskRpc);
  const hold = useRpc(holdDeliveryRpc);
  const paseo = usePaseo();
  const [templateId, setTemplateId] = useState(workflows[0]?.id ?? "dev");
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [acceptance, setAcceptance] = useState("");
  const [due, setDue] = useState("");
  const [dependsOn, setDependsOn] = useState("");
  const [project, setProject] = useState("");
  const [busy, setBusy] = useState(false);
  const inputStyle = {
    color: foreground,
    borderColor: border,
    borderWidth: 1,
    minHeight: 44,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  };

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await start({
        templateId,
        title,
        goal,
        acceptance: acceptance.split("\n"),
        due,
        dependsOn: dependsOn.split(/[\s,，]+/).filter(Boolean),
        project,
        now: new Date().toISOString(),
        nonce: Math.random().toString(36).slice(2, 10),
      });
      if (result.ok && result.delivery) {
        const sent = await deliverRole(paseo, result.delivery);
        if (!sent.ok) {
          await hold({
            id: result.id,
            agentId: result.delivery.agentId,
            text: result.delivery.text,
            clear: false,
            now: new Date().toISOString(),
          }).catch(() => undefined);
        }
        onDone(sent.ok ? sent.detail : `${result.detail}。${sent.detail}`);
      } else {
        onDone(result.detail);
      }
      if (result.ok) {
        setTitle("");
        setGoal("");
        setAcceptance("");
      }
    } catch (cause) {
      onDone(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ color: foreground }}>从模板起任务</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
        {workflows.map((item) => (
          <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.title} onPress={() => setTemplateId(item.id)}>
            <Text style={{ color: templateId === item.id ? foreground : muted, marginRight: 16, minHeight: 44, paddingVertical: 10 }}>
              {item.title}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput accessibilityLabel="任务标题" onChangeText={setTitle} placeholder="任务标题" placeholderTextColor={theme.colors.foregroundMuted} style={inputStyle} value={title} />
      <TextInput accessibilityLabel="目标" onChangeText={setGoal} placeholder="目标" placeholderTextColor={theme.colors.foregroundMuted} style={inputStyle} value={goal} />
      <TextInput
        accessibilityLabel="验收标准"
        multiline
        onChangeText={setAcceptance}
        placeholder="验收标准，一行一条"
        placeholderTextColor={theme.colors.foregroundMuted}
        style={inputStyle}
        value={acceptance}
      />
      <TextInput accessibilityLabel="截止时间" onChangeText={setDue} placeholder="截止时间，可空" placeholderTextColor={theme.colors.foregroundMuted} style={inputStyle} value={due} />
      <TextInput accessibilityLabel="依赖的卡片" onChangeText={setDependsOn} placeholder="依赖的卡片标识，用空格分开" placeholderTextColor={theme.colors.foregroundMuted} style={inputStyle} value={dependsOn} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
        <Pressable accessibilityRole="button" onPress={() => setProject("")}>
          <Text style={{ color: project === "" ? foreground : muted, marginRight: 16, minHeight: 44, paddingVertical: 10 }}>不指定</Text>
        </Pressable>
        {BUSINESS_LINES.map((item) => (
          <Pressable key={item} accessibilityRole="button" accessibilityLabel={item} onPress={() => setProject(item)}>
            <Text style={{ color: project === item ? foreground : muted, marginRight: 16, minHeight: 44, paddingVertical: 10 }}>{item}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable accessibilityRole="button" disabled={busy || workflows.length === 0} onPress={() => void submit()}>
        <Text style={{ color: accent, marginTop: 8, minHeight: 44 }}>开始</Text>
      </Pressable>
    </View>
  );
}
