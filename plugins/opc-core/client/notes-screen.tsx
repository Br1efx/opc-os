import { useRpc, type PluginScreenProps } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/ui";
import { Pressable, Text, View } from "react-native";
import { createReviewCanvasRpc } from "../shared/canvas";
import { moduleById } from "../shared/shell";
import { useScreenStyles } from "./screen-style";

export function NotesScreen(props: PluginScreenProps) {
  const styles = useScreenStyles(props.theme, props.layout.compact);
  const create = useRpc(createReviewCanvasRpc);
  const toast = useToast();
  const mod = moduleById("m1-notes");

  async function makeCanvas() {
    try {
      const result = await create({ nonce: Math.random().toString(36).slice(2, 10) });
      if (!result.ok) toast.error(result.detail);
      else toast.show(result.path ? `${result.detail}：${result.path}` : result.detail);
    } catch {
      toast.error("没写回画布");
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{mod.title}</Text>
      <Text style={styles.detail}>{mod.summary}</Text>
      <Pressable accessibilityRole="button" onPress={() => void makeCanvas()}>
        <Text style={styles.action}>生成审阅画布</Text>
      </Pressable>
    </View>
  );
}
