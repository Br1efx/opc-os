import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { Text, View } from "react-native";
import { ModuleSwitches } from "./module-switches";
import { useScreenStyles } from "./screen-style";

export function HomeScreen({ theme, layout }: PluginScreenProps) {
  const styles = useScreenStyles(theme, layout.compact);
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>一人公司 OS</Text>
      <Text style={styles.detail}>打开的模块会出现在侧栏。关掉之后，对应页面和侧栏入口会卸掉。</Text>
      <ModuleSwitches compact={layout.compact} theme={theme} />
    </View>
  );
}
