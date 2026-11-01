import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { Text, View } from "react-native";
import { ModuleSwitches } from "./module-switches";
import { useScreenStyles } from "./screen-style";
import { StatusBar } from "./status-bar";
import { useShellElder } from "./ui-chrome";

export function HomeScreen({ theme, layout, host }: PluginScreenProps) {
  const { enabled, elder } = useShellElder(host.label);
  const styles = useScreenStyles(theme, layout.compact, elder);
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
      {enabled ? <StatusBar compact={layout.compact} elder={elder} theme={theme} /> : null}
      <View style={styles.screen}>
        <Text style={styles.title}>一人公司 OS</Text>
        <Text style={styles.detail}>打开的模块会出现在侧栏。关掉之后，对应页面和侧栏入口会卸掉。</Text>
        <ModuleSwitches compact={layout.compact} elder={elder} theme={theme} />
      </View>
    </View>
  );
}
