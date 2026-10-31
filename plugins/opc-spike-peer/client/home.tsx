import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useMemo } from "react";
import { Text, View } from "react-native";
import { PEER_CARD_REVISION } from "../shared/card-ref";
import { spikeEditorIsEditable } from "./web";

export function HomeScreen({ theme, layout }: PluginScreenProps) {
  const editable = spikeEditorIsEditable();
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
      <Text style={styles.title}>OPC spike peer</Text>
      <Text style={styles.detail}>card-protocol {PEER_CARD_REVISION}</Text>
      <Text style={styles.detail}>
        {editable ? "网页端编辑器入口已挂上，尚未在桌面打开。" : "当前平台只读，不挂编辑器。"}
      </Text>
    </View>
  );
}
