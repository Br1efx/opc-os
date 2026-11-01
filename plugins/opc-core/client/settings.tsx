import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Text, View } from "react-native";
import { ElderSwitch } from "./elder-switch";
import { ModuleSwitches } from "./module-switches";
import { useScreenStyles } from "./screen-style";
import { StatusBar } from "./status-bar";
import { useShellElder } from "./ui-chrome";

function SettingsBody({ theme, layout, host, framed }: PluginSurfaceProps & { framed: boolean }) {
  const { chrome, enabled, elder } = useShellElder(host.label);
  const styles = useScreenStyles(theme, layout.compact, elder);
  return (
    <View style={framed ? { flex: 1, backgroundColor: theme.colors.surface0 } : undefined}>
      {enabled ? <StatusBar compact={layout.compact} elder={elder} theme={theme} /> : null}
      <View style={framed ? styles.screen : undefined}>
        {framed ? <Text style={styles.title}>设置</Text> : null}
        <Text style={styles.detail}>模块开关保存在这台主机上。重新打开仍然有效。</Text>
        {enabled ? <ElderSwitch chrome={chrome} styles={styles} theme={theme} /> : null}
        <ModuleSwitches compact={layout.compact} elder={elder} theme={theme} />
      </View>
    </View>
  );
}

/** 插件自己的「设置」页面。 */
export function SettingsScreen(props: PluginSurfaceProps) {
  return <SettingsBody {...props} framed />;
}

/** Paseo 设置 → 插件 里的同一份开关。页面边距由宿主负责。 */
export function SettingsHostScreen(props: PluginSurfaceProps) {
  return <SettingsBody {...props} framed={false} />;
}
