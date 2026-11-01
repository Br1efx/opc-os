import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { MODULES, shellSettings, withModuleFlag, type ModuleFlags, type ModuleId } from "../shared/shell";
import { applyModuleFlags, useModuleRegistration } from "./module-host";
import { useScreenStyles } from "./screen-style";

export function ModuleSwitches({
  theme,
  compact,
  elder = false,
}: {
  theme: PluginScreenProps["theme"];
  compact: boolean;
  elder?: boolean;
}) {
  useModuleRegistration();
  const settings = useSettings(shellSettings);
  const styles = useScreenStyles(theme, compact, elder);
  const ready = settings.status === "ready";
  const [pending, setPending] = useState<ModuleFlags | null>(null);
  const shown = ready ? (pending ?? settings.values.modules) : null;

  useEffect(() => {
    if (settings.status !== "ready" || !pending) return;
    const saved = settings.values.modules;
    const caughtUp = MODULES.every((mod) => saved[mod.id] === pending[mod.id]);
    if (caughtUp) setPending(null);
  }, [settings, pending]);

  async function onToggle(id: ModuleId, enabled: boolean) {
    if (settings.status !== "ready" || settings.saving) return;
    const next = withModuleFlag(pending ?? settings.values.modules, id, enabled);
    setPending(next);
    applyModuleFlags(next);
    const saved = await settings.save({ modules: next }, settings.revision);
    if (!saved) {
      setPending(null);
      applyModuleFlags(settings.values.modules);
    }
  }

  return (
    <View>
      {settings.status === "loading" ? <Text style={styles.detail}>正在读取已保存的开关。</Text> : null}
      {settings.status === "error" ? (
        <View>
          <Text style={styles.detail}>读不到已保存的开关。{settings.error}</Text>
          <Pressable accessibilityRole="button" onPress={() => void settings.reload()}>
            <Text style={styles.action}>重试</Text>
          </Pressable>
        </View>
      ) : null}
      {settings.status === "invalid" ? (
        <View>
          <Text style={styles.detail}>已保存的开关无法使用。{settings.error}</Text>
          <Pressable accessibilityRole="button" onPress={() => void settings.reset()}>
            <Text style={styles.action}>恢复默认</Text>
          </Pressable>
        </View>
      ) : null}
      {MODULES.map((mod) => (
        <View key={mod.id} style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.name}>{mod.title}</Text>
            <Text style={styles.detail}>{mod.summary}</Text>
          </View>
          {shown ? (
            <Switch
              accessibilityLabel={mod.title}
              disabled={settings.saving}
              onValueChange={(enabled) => void onToggle(mod.id, enabled)}
              thumbColor={theme.colors.accentForeground}
              trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
              value={shown[mod.id]}
            />
          ) : null}
        </View>
      ))}
      {settings.saveError ? <Text style={styles.detail}>没保存上。{settings.saveError}</Text> : null}
    </View>
  );
}
