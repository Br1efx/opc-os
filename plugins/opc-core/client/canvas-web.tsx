import { useLayoutEffect, useRef, type ComponentType, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import {
  edgesFromFlow,
  edgesToFlow,
  moveNode,
  nextZoom,
  nodeLabel,
  parseCanvas,
  replaceEdges,
  serializeCanvas,
  type CanvasDoc,
  type FlowEdge,
} from "../shared/canvas";
import { FLOW_STYLE } from "./flow-style";

declare function require(id: string): unknown;

type FlowNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { label: string };
  style: { width: number; height: number };
  draggable: boolean;
};

type FlowChange = {
  type: string;
  id: string;
  dragging?: boolean;
  position?: { x: number; y: number };
};

type FlowApi = {
  setViewport(viewport: { x: number; y: number; zoom: number }): Promise<void> | void;
};

type FlowModule = {
  ReactFlow: ComponentType<{
    nodes: FlowNode[];
    edges: FlowEdge[];
    nodeTypes: Record<string, ComponentType<{ data: { label: string } }>>;
    onNodesChange: (changes: FlowChange[]) => void;
    onEdgesChange: (changes: FlowChange[]) => void;
    onConnect: (connection: FlowEdge) => void;
    fitView?: boolean;
    deleteKeyCode?: string;
    children?: ReactNode;
  }>;
  ReactFlowProvider: ComponentType<{ children?: ReactNode }>;
  Background: ComponentType;
  Handle: ComponentType<{ type: "source" | "target"; position: string; id: string }>;
  Position: { Left: string; Right: string };
  useNodesState: (nodes: FlowNode[]) => [FlowNode[], (next: FlowNode[]) => void, (changes: FlowChange[]) => void];
  useEdgesState: (edges: FlowEdge[]) => [FlowEdge[], (updater: FlowEdge[] | ((current: FlowEdge[]) => FlowEdge[])) => void, (changes: FlowChange[]) => void];
  useReactFlow: () => FlowApi;
  addEdge: (edge: FlowEdge, edges: FlowEdge[]) => FlowEdge[];
};

let nodeTypes: Record<string, ComponentType<{ data: { label: string } }>> | null = null;

function typesFor(flow: FlowModule) {
  if (nodeTypes) return nodeTypes;
  function OpcNode({ data }: { data: { label: string } }) {
    return (
      <View style={{ width: "100%", height: "100%", padding: 8 }}>
        <flow.Handle id="left" position={flow.Position.Left} type="target" />
        <flow.Handle id="right" position={flow.Position.Right} type="source" />
        <Text>{data.label}</Text>
      </View>
    );
  }
  nodeTypes = { opc: OpcNode };
  return nodeTypes;
}

function loadFlow(): FlowModule {
  return require("@xyflow/react") as FlowModule;
}

/** 电脑上的拖拽。水印留着，不关掉。 */
export function CanvasFlow({
  text,
  accent,
  onCommit,
}: {
  text: string;
  accent: string;
  onCommit(next: string): void;
}) {
  const flow = loadFlow();
  return (
    <flow.ReactFlowProvider>
      <FlowInner accent={accent} flow={flow} onCommit={onCommit} text={text} />
    </flow.ReactFlowProvider>
  );
}

function FlowInner({
  flow,
  text,
  accent,
  onCommit,
}: {
  flow: FlowModule;
  text: string;
  accent: string;
  onCommit(next: string): void;
}) {
  const opened = parseCanvas(text);
  const initial = opened.ok ? opened.canvas : { nodes: [], edges: [] };
  const canvasRef = useRef<CanvasDoc>(initial);
  const zoomRef = useRef(1);
  const host = useRef<View>(null);
  const [nodes, , onNodesChange] = flow.useNodesState(toNodes(initial));
  const [edges, setEdges, onEdgesChange] = flow.useEdgesState(edgesToFlow(initial.edges));
  const api = flow.useReactFlow();

  useLayoutEffect(() => {
    injectStyle(host.current);
  }, []);

  function commit(next: CanvasDoc) {
    canvasRef.current = next;
    onCommit(serializeCanvas(next));
  }

  function handleNodes(changes: FlowChange[]) {
    onNodesChange(changes);
    let next = canvasRef.current;
    let moved = false;
    for (const change of changes) {
      if (change.type === "position" && change.dragging === false && change.position) {
        next = moveNode(next, change.id, change.position.x, change.position.y);
        moved = true;
      }
    }
    if (moved) commit(next);
  }

  function handleEdges(changes: FlowChange[]) {
    onEdgesChange(changes);
    const removed = new Set(changes.filter((change) => change.type === "remove").map((change) => change.id));
    if (removed.size === 0) return;
    commit({ ...canvasRef.current, edges: canvasRef.current.edges.filter((edge) => !removed.has(edge.id)) });
  }

  function handleConnect(connection: FlowEdge) {
    const id = `e-${canvasRef.current.edges.length + 1}`;
    setEdges((current) => {
      const next = flow.addEdge({ ...connection, id }, current);
      commit(replaceEdges(canvasRef.current, edgesFromFlow(next)));
      return next;
    });
  }

  function zoom(direction: "in" | "out" | "reset") {
    const next = nextZoom(zoomRef.current, direction);
    zoomRef.current = next;
    void api.setViewport({ x: 0, y: 0, zoom: next });
  }

  const action = { color: accent, marginRight: 16 };
  return (
    <View ref={host} style={{ flex: 1, minHeight: 360 }}>
      <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingVertical: 8 }}>
        <Pressable accessibilityRole="button" onPress={() => zoom("in")}>
          <Text style={action}>放大</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => zoom("out")}>
          <Text style={action}>缩小</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => zoom("reset")}>
          <Text style={action}>还原</Text>
        </Pressable>
      </View>
      <View style={{ flex: 1, minHeight: 320 }}>
        <flow.ReactFlow
          deleteKeyCode="Backspace"
          edges={edges}
          fitView
          nodeTypes={typesFor(flow)}
          nodes={nodes}
          onConnect={handleConnect}
          onEdgesChange={handleEdges}
          onNodesChange={handleNodes}
        >
          <flow.Background />
        </flow.ReactFlow>
      </View>
    </View>
  );
}

function toNodes(canvas: CanvasDoc): FlowNode[] {
  return canvas.nodes.map((node) => ({
    id: node.id,
    type: "opc",
    position: { x: node.x, y: node.y },
    data: { label: nodeLabel(node) },
    style: { width: node.width, height: node.height },
    draggable: true,
  }));
}

function injectStyle(parent: unknown) {
  const host = parent as {
    ownerDocument?: {
      getElementById(id: string): unknown;
      createElement(tag: string): { id: string; textContent: string };
      head?: { appendChild(node: { id: string; textContent: string }): void };
    };
  } | null;
  const doc = host?.ownerDocument;
  if (!doc?.getElementById || !doc.createElement || !doc.head) return;
  if (doc.getElementById("opc-flow-style")) return;
  const style = doc.createElement("style");
  style.id = "opc-flow-style";
  style.textContent = FLOW_STYLE;
  doc.head.appendChild(style);
}
