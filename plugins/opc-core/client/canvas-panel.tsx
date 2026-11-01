import {
  PluginFileConflictError,
  useFileText,
  type PluginFilePanelProps,
} from "@getpaseo/plugin/client";
import { Loading } from "@getpaseo/plugin/client/ui";
import { Component, useEffect, useState, type ReactNode } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import {
  canvasEditOffered,
  canvasFrame,
  nextZoom,
  nodeLabel,
  parseCanvas,
  placeNode,
  type CanvasDoc,
} from "../shared/canvas";

class CanvasBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

export function CanvasFilePanel(props: PluginFilePanelProps) {
  return (
    <CanvasBoundary
      fallback={
        <Text style={{ color: props.theme.colors.statusDanger, padding: 16 }}>这块画布没能画出来</Text>
      }
    >
      <CanvasBody {...props} />
    </CanvasBoundary>
  );
}

function CanvasBody({ file, theme, layout }: PluginFilePanelProps) {
  const disk = useFileText(file);
  const diskText = disk.status === "ready" ? disk.text : null;
  const [local, setLocal] = useState<string | null>(null);
  const [editing, setEditing] = useState(canvasEditOffered(layout.platform));
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLocal(null);
    setEditing(canvasEditOffered(layout.platform));
    setZoom(1);
    setError(null);
  }, [file.path, layout.platform]);

  async function commit(next: string) {
    try {
      await file.writeText(next);
      setLocal(next);
      setError(null);
    } catch (cause) {
      if (cause instanceof PluginFileConflictError) setError("文件在别处被改过");
      else setError("没写回画布");
    }
  }

  if (disk.status === "loading" && local === null) return <Loading />;
  if (disk.status === "error" && local === null) {
    return <Text style={{ color: theme.colors.statusDanger, padding: 16 }}>没读到这份画布</Text>;
  }
  const text = local ?? diskText ?? "";
  const opened = parseCanvas(text);
  const canEdit = canvasEditOffered(layout.platform);
  const styles = {
    screen: { flex: 1, backgroundColor: theme.colors.surface0 },
    bar: { flexDirection: "row" as const, alignItems: "center" as const, paddingHorizontal: 16, paddingVertical: 8 },
    action: { color: theme.colors.accent, marginRight: 16 },
    muted: { color: theme.colors.foregroundMuted },
    error: { color: theme.colors.statusDanger, paddingHorizontal: 16, paddingVertical: 8 },
    empty: { color: theme.colors.foregroundMuted, padding: 16 },
  };

  return (
    <View style={styles.screen}>
      <View style={styles.bar}>
        <Text style={styles.muted}>{canEdit && editing ? "拖拽编辑" : "只看"}</Text>
        {canEdit ? (
          <Pressable accessibilityRole="button" onPress={() => setEditing((value) => !value)}>
            <Text style={styles.action}>{editing ? "只看" : "拖拽编辑"}</Text>
          </Pressable>
        ) : null}
        {!editing || !canEdit ? (
          <>
            <Pressable accessibilityRole="button" onPress={() => setZoom((value) => nextZoom(value, "in"))}>
              <Text style={styles.action}>放大</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setZoom((value) => nextZoom(value, "out"))}>
              <Text style={styles.action}>缩小</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setZoom(nextZoom(zoom, "reset"))}>
              <Text style={styles.action}>还原</Text>
            </Pressable>
          </>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!opened.ok ? <Text style={styles.error}>{opened.detail}</Text> : null}
      {opened.ok && opened.canvas.nodes.length === 0 ? <Text style={styles.empty}>这里还没有节点</Text> : null}
      {opened.ok && canEdit && editing ? (
        <WebCanvas accent={theme.colors.accent} onCommit={(next) => void commit(next)} text={text} />
      ) : null}
      {opened.ok && (!canEdit || !editing) ? <CanvasReadOnly canvas={opened.canvas} theme={theme} zoom={zoom} /> : null}
    </View>
  );
}

function WebCanvas(props: { text: string; accent: string; onCommit(next: string): void }) {
  if (Platform.OS !== "web") return null;
  const { CanvasFlow } = require("./canvas-web") as typeof import("./canvas-web");
  return <CanvasFlow {...props} />;
}

declare function require(id: string): unknown;

function CanvasReadOnly({
  canvas,
  zoom,
  theme,
}: {
  canvas: CanvasDoc;
  zoom: number;
  theme: PluginFilePanelProps["theme"];
}) {
  const frame = canvasFrame(canvas.nodes);
  return (
    <ScrollView style={{ flex: 1 }}>
      <View style={{ width: frame.width * zoom + 32, height: frame.height * zoom + 32 }}>
        {canvas.nodes.map((node) => {
          const place = placeNode(node, frame, zoom);
          return (
            <View
              key={node.id}
              style={{
                position: "absolute",
                left: place.left + 8,
                top: place.top + 8,
                width: place.width,
                height: place.height,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface1,
                padding: 6,
              }}
            >
              <Text style={{ color: theme.colors.foreground }}>{nodeLabel(node)}</Text>
            </View>
          );
        })}
      </View>
      {canvas.edges.map((edge) => {
        const from = canvas.nodes.find((node) => node.id === edge.fromNode);
        const to = canvas.nodes.find((node) => node.id === edge.toNode);
        return (
          <Text key={edge.id} style={{ color: theme.colors.foregroundMuted, paddingHorizontal: 16, paddingBottom: 4 }}>
            {`从 ${from ? nodeLabel(from) : "节点"} 到 ${to ? nodeLabel(to) : "节点"}`}
          </Text>
        );
      })}
    </ScrollView>
  );
}
