import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { Component, type ReactNode } from "react";
import { Text, View } from "react-native";
import { moduleById, type ModuleId } from "../shared/shell";
import { CardWallScreen } from "./card-wall";
import { GatewayScreen } from "./gateway-screen";
import { NotesScreen } from "./notes-screen";
import { useScreenStyles } from "./screen-style";
import { StatusBar } from "./status-bar";
import { TasksScreen } from "./tasks-screen";
import { UiScreen } from "./ui-screen";
import { useShellElder } from "./ui-chrome";

class ModuleBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

export function ModuleScreen(props: PluginScreenProps & { moduleId: ModuleId }) {
  const styles = useScreenStyles(props.theme, props.layout.compact);
  const { enabled, elder } = useShellElder(props.host.label);
  return (
    <View style={{ flex: 1, backgroundColor: props.theme.colors.surface0 }}>
      {enabled ? <StatusBar compact={props.layout.compact} elder={elder} theme={props.theme} /> : null}
      <ModuleBoundary
        fallback={
          <View style={styles.screen}>
            <Text style={styles.title}>这块坏了</Text>
          </View>
        }
      >
        <View style={{ flex: 1 }}>
          <ModuleBody {...props} elder={elder} />
        </View>
      </ModuleBoundary>
    </View>
  );
}

function ModuleBody({ moduleId, elder, ...props }: PluginScreenProps & { moduleId: ModuleId; elder: boolean }) {
  if (moduleId === "m1-notes") return <NotesScreen {...props} />;
  if (moduleId === "m2-card-wall") return <CardWallScreen {...props} elder={elder} />;
  if (moduleId === "m3-gateway") return <GatewayScreen {...props} />;
  if (moduleId === "m4-tasks") return <TasksScreen {...props} />;
  if (moduleId === "m5-ui") return <UiScreen {...props} />;
  const mod = moduleById(moduleId);
  const styles = useScreenStyles(props.theme, props.layout.compact);
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{mod.title}</Text>
      <Text style={styles.detail}>{mod.summary}</Text>
    </View>
  );
}
