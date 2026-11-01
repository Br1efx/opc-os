import type { PluginFilePanelProps } from "@getpaseo/plugin/client";
import type { Decoration, EditorView, EditorViewConfig } from "@codemirror/view";
import { Platform } from "react-native";
import { isComposingKey, lockFilterResult, lockShade, lockSpans, replaceDocumentSpec } from "../shared/notes";

declare function require(id: string): unknown;

export interface NoteSelection {
  from: number;
  to: number;
  text: string;
}

export interface NoteEditorHandlers {
  onChange(text: string): void;
  onSelection(selection: NoteSelection): void;
  onAsk(excerpt: string): void;
}

export interface NoteEditorHandle {
  /** 换成磁盘上的文本，不算用户编辑。 */
  setText(text: string): void;
  /** 换成新文本，并走保存。批注写回用这个。 */
  replaceText(text: string): void;
  getText(): string;
  getSelection(): NoteSelection;
  destroy(): void;
}

interface MenuNode {
  textContent: string | null;
  style: { cssText: string };
  setAttribute(name: string, value: string): void;
  addEventListener(type: string, listener: (event: { stopPropagation(): void }) => void): void;
  appendChild(child: MenuNode): void;
  remove(): void;
}

interface MenuDocument {
  body: { appendChild(node: MenuNode): void } | null;
  createElement(tag: string): MenuNode;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

function editorDocument(view: EditorView): MenuDocument | null {
  const owner = (view.dom as unknown as { ownerDocument?: MenuDocument }).ownerDocument;
  return owner?.body ? owner : null;
}

/** 右键菜单只在网页编辑器里出现。节点从编辑器自己的文档创建。 */
function openAskMenu(
  view: EditorView,
  x: number,
  y: number,
  colors: { surface: string; foreground: string; border: string },
  onPick: () => void,
): () => void {
  const owner = editorDocument(view);
  if (!owner?.body) return () => {};
  const menu = owner.createElement("div");
  menu.setAttribute("role", "menu");
  menu.style.cssText = [
    "position:fixed",
    `left:${x}px`,
    `top:${y}px`,
    "z-index:40",
    `background:${colors.surface}`,
    `color:${colors.foreground}`,
    `border:1px solid ${colors.border}`,
    "border-radius:6px",
    "padding:4px",
  ].join(";");
  const item = owner.createElement("button");
  item.textContent = "问 Agent";
  item.setAttribute("type", "button");
  item.setAttribute("role", "menuitem");
  item.style.cssText = `display:block;padding:6px 10px;border:0;background:transparent;color:${colors.foreground};cursor:pointer;`;
  const close = () => {
    menu.remove();
    owner.removeEventListener("mousedown", close);
    owner.removeEventListener("keydown", close);
  };
  item.addEventListener("mousedown", (event) => event.stopPropagation());
  item.addEventListener("click", (event) => {
    event.stopPropagation();
    close();
    onPick();
  });
  menu.appendChild(item);
  owner.body.appendChild(menu);
  owner.addEventListener("mousedown", close);
  owner.addEventListener("keydown", close);
  return close;
}

/**
 * 浏览器专用入口。tsconfig 没有 DOM，这里不写 document / window 这两个全局名字。
 * CodeMirror 只在网页平台、并且真的要挂载时才加载。
 */
export function mountNoteEditor(
  parent: unknown,
  text: string,
  theme: PluginFilePanelProps["theme"],
  handlers: NoteEditorHandlers,
): NoteEditorHandle | null {
  if (Platform.OS !== "web" || parent == null) return null;
  const { EditorState, RangeSetBuilder } = require("@codemirror/state") as typeof import("@codemirror/state");
  const { EditorView, keymap, lineNumbers, Decoration } =
    require("@codemirror/view") as typeof import("@codemirror/view");
  const { defaultKeymap, history, historyKeymap } =
    require("@codemirror/commands") as typeof import("@codemirror/commands");
  const { markdown } = require("@codemirror/lang-markdown") as typeof import("@codemirror/lang-markdown");
  const { syntaxHighlighting, defaultHighlightStyle } =
    require("@codemirror/language") as typeof import("@codemirror/language");
  const shade = lockShade(theme.colors.foreground);
  const lockMark = Decoration.mark({ class: "cm-opc-lock cm-opc-lock-start" });
  let applyingHostText = false;
  let closeMenu = () => {};
  let view: EditorView;

  function selectionOf(state: { selection: { main: { from: number; to: number; empty: boolean } }; sliceDoc(from: number, to: number): string }): NoteSelection {
    const main = state.selection.main;
    return { from: main.from, to: main.to, text: main.empty ? "" : state.sliceDoc(main.from, main.to) };
  }

  function publishSelection() {
    handlers.onSelection(selectionOf(view.state));
  }

  view = new EditorView({
    parent: parent as EditorViewConfig["parent"],
    state: EditorState.create({
      doc: text,
      extensions: [
        markdown(),
        syntaxHighlighting(defaultHighlightStyle),
        lineNumbers(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ lang: "zh-CN", "aria-label": "笔记" }),
        EditorView.theme({
          "&": {
            height: "100%",
            color: theme.colors.foreground,
            backgroundColor: theme.colors.surface0,
          },
          ".cm-scroller": { overflow: "auto" },
          ".cm-content": { padding: "16px", caretColor: theme.colors.foreground },
          ".cm-gutters": {
            backgroundColor: theme.colors.surface0,
            color: theme.colors.foregroundMuted,
            border: "none",
          },
          ".cm-opc-lock": { backgroundColor: shade },
          ".cm-opc-lock-start::before": { content: '"🔒 "' },
        }),
        EditorState.changeFilter.of((transaction) =>
          transaction.docChanged ? lockFilterResult(transaction.startState.doc.toString()) : true,
        ),
        EditorView.decorations.of((current) => {
          const builder = new RangeSetBuilder<Decoration>();
          for (const span of lockSpans(current.state.doc.toString())) {
            if (span.to > span.from) builder.add(span.from, span.to, lockMark);
          }
          return builder.finish();
        }),
        EditorView.domEventHandlers({
          keydown(event) {
            if (isComposingKey(event)) return false;
            return false;
          },
          contextmenu(event, current) {
            const main = current.state.selection.main;
            if (main.empty || isComposingKey(event)) return false;
            event.preventDefault();
            closeMenu();
            const excerpt = current.state.sliceDoc(main.from, main.to);
            const point = event as { clientX?: number; clientY?: number };
            closeMenu = openAskMenu(
              current,
              point.clientX ?? 8,
              point.clientY ?? 8,
              {
                surface: theme.colors.surface1,
                foreground: theme.colors.foreground,
                border: theme.colors.border,
              },
              () => handlers.onAsk(excerpt),
            );
            return true;
          },
        }),
        EditorView.updateListener.of((update) => {
          if (applyingHostText) return;
          if (update.docChanged) handlers.onChange(update.state.doc.toString());
          if (update.docChanged || update.selectionSet) publishSelection();
        }),
      ],
    }),
  });

  function applyText(next: string, notify: boolean) {
    if (view.state.doc.toString() === next) return;
    applyingHostText = true;
    try {
      view.dispatch(replaceDocumentSpec(view.state.doc.length, next));
    } finally {
      applyingHostText = false;
    }
    publishSelection();
    if (notify) handlers.onChange(view.state.doc.toString());
  }

  return {
    setText(next) {
      applyText(next, false);
    },
    replaceText(next) {
      applyText(next, true);
    },
    getText() {
      return view.state.doc.toString();
    },
    getSelection() {
      return selectionOf(view.state);
    },
    destroy() {
      closeMenu();
      view.destroy();
    },
  };
}
