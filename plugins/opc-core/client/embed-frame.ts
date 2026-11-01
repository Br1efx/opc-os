import { applyEmbedAttributes } from "../shared/embed";

type Frame = {
  setAttribute(name: string, value: string): void;
  remove(): void;
};

type Host = {
  ownerDocument?: {
    createElement(tag: string): Frame;
  };
  appendChild(node: Frame): void;
};

/** 电脑上的嵌入。节点从文件面板自己的文档创建，不碰全局 document。 */
export function mountEmbedFrames(parent: unknown, htmlList: readonly string[]): (() => void) | null {
  const host = parent as Host | null;
  const doc = host?.ownerDocument;
  if (!host || !doc?.createElement || typeof host.appendChild !== "function") return null;
  const frames: Frame[] = [];
  for (const html of htmlList) {
    const frame = doc.createElement("iframe");
    applyEmbedAttributes(frame, html);
    frame.setAttribute("style", "width:100%;min-height:180px;border:0;background:transparent;");
    host.appendChild(frame);
    frames.push(frame);
  }
  return () => {
    for (const frame of frames) frame.remove();
  };
}
