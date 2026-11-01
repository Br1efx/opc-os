import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { Component, type ReactNode } from "react";
import { Text, View } from "react-native";
import { moduleById, type ModuleId } from "../shared/shell";
import { CardWallScreen } from "./card-wall";
import { GatewayScreen } from "./gateway-screen";
import { useScreenStyles } from "./screen-style";
import { TasksScreen } from "./tasks-screen";

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
  return (
    <ModuleBoundary
      fallback={
        <View style={styles.screen}>
          <Text style={styles.title}>这块坏了</Text>
        </View>
      }
    >
      <ModuleBody {...props} />
    </ModuleBoundary>
  );
}

function ModuleBody({ moduleId, ...props }: PluginScreenProps & { moduleId: ModuleId }) {
  if (moduleId === "m2-card-wall") return <CardWallScreen {...props} />;
  if (moduleId === "m3-gateway") return <GatewayScreen {...props} />;
  if (moduleId === "m4-tasks") return <TasksScreen {...props} />;
  const mod = moduleById(moduleId);
  const styles = useScreenStyles(props.theme, props.layout.compact);
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{mod.title}</Text>
      <Text style={styles.detail}>{mod.summary}</Text>
    </View>
  );
}
