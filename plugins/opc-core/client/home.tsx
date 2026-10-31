import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useMemo } from "react";
import { Text, View } from "react-native";

export function HomeScreen({ theme, layout }: PluginScreenProps) {
  const styles = useMemo(
    () => ({
      screen: {
        flex: 1,
        padding: layout.compact ? 16 : 24,
        backgroundColor: theme.colors.surface0,
      },
      title: {
        color: theme.colors.foreground,
        fontSize: layout.compact ? 22 : 28,
      },
      detail: {
        color: theme.colors.foregroundMuted,
        marginTop: 8,
      },
    }),
    [theme, layout.compact],
  );

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>一人公司 OS</Text>
      <Text style={styles.detail}>核心插件外壳。模块尚未接入。</Text>
    </View>
  );
}
