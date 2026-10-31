import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { Text, View } from "react-native";
import { useScreenStyles } from "./screen-style";

export function NotificationsScreen({ theme, layout }: PluginScreenProps) {
  const styles = useScreenStyles(theme, layout.compact);
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>通知</Text>
      <Text style={styles.detail}>通知会集中出现在这里。现在还没有新通知。</Text>
    </View>
  );
}
