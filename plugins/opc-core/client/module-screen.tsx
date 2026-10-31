import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { Component, type ReactNode } from "react";
import { Text, View } from "react-native";
import { moduleById, type ModuleId } from "../shared/shell";
import { useScreenStyles } from "./screen-style";

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

function ModuleBody({ theme, layout, moduleId }: PluginScreenProps & { moduleId: ModuleId }) {
  const mod = moduleById(moduleId);
  const styles = useScreenStyles(theme, layout.compact);
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{mod.title}</Text>
      <Text style={styles.detail}>{mod.summary}</Text>
    </View>
  );
}
