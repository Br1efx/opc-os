import type { PluginFilePanelProps } from "@getpaseo/plugin/client";
import type { EditorView, EditorViewConfig } from "@codemirror/view";
import { Platform } from "react-native";

export interface SpikeEditorHandle {
  destroy(): void;
}

/**
 * 浏览器专用入口。脚手架的 tsconfig 没有 DOM，所以不用 document / window。
 * CodeMirror 只在 Platform.OS === "web" 时动态加载。
 * 这不能证明手机端不会执行这段依赖。
 */
export async function mountSpikeEditor(
  parent: unknown,
  text: string,
  theme: PluginFilePanelProps["theme"],
  onChange: (text: string) => void,
): Promise<SpikeEditorHandle | null> {
  if (Platform.OS !== "web" || parent == null) return null;
  const { EditorState } = await import("@codemirror/state");
  const { EditorView, keymap } = await import("@codemirror/view");
  const { defaultKeymap } = await import("@codemirror/commands");
  const { markdown } = await import("@codemirror/lang-markdown");
  const view: EditorView = new EditorView({
    parent: parent as EditorViewConfig["parent"],
    state: EditorState.create({
      doc: text,
      extensions: [
        markdown(),
        keymap.of(defaultKeymap),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange(update.state.doc.toString());
        }),
      ],
    }),
  });
  return {
    destroy() {
      view.destroy();
    },
  };
}

/** 非网页平台走只读。调用方应渲染 React Native 的 Text，而不是编辑器。 */
export function spikeEditorIsEditable(): boolean {
  return Platform.OS === "web";
}
