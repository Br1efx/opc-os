import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { Pressable, Switch, Text, View } from "react-native";
import { useScreenStyles } from "./screen-style";
import type { UiChrome } from "./ui-chrome";

export function ElderSwitch({
  chrome,
  theme,
  styles,
}: {
  chrome: UiChrome;
  theme: PluginScreenProps["theme"];
  styles: ReturnType<typeof useScreenStyles>;
}) {
  return (
    <View>
      <Text style={styles.detail}>
        父亲的面板默认开。你的面板默认关。当前是{chrome.panelText}。开关记在这台面板上，重新打开仍然有效。
      </Text>
      {chrome.problem ? <Text style={styles.detail}>{chrome.problem}</Text> : null}
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.name}>老人模式</Text>
        </View>
        <Switch
          accessibilityLabel="老人模式"
          disabled={!chrome.ready || chrome.saving}
          onValueChange={(on) => void chrome.setElder(on)}
          thumbColor={theme.colors.accentForeground}
          trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
          value={chrome.elder}
        />
      </View>
      {chrome.choice !== "auto" ? (
        <Pressable accessibilityRole="button" onPress={() => void chrome.resetElder()}>
          <Text style={styles.action}>恢复面板默认</Text>
        </Pressable>
      ) : null}
      {chrome.saveError ? <Text style={styles.detail}>没保存上。{chrome.saveError}</Text> : null}
      {chrome.phase === "error" ? (
        <Pressable accessibilityRole="button" onPress={() => void chrome.retry()}>
          <Text style={styles.action}>重试</Text>
        </Pressable>
      ) : null}
      {chrome.phase === "invalid" ? (
        <Pressable accessibilityRole="button" onPress={() => void chrome.resetAll()}>
          <Text style={styles.action}>恢复默认</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
