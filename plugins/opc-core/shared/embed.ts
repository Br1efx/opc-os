import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/** 只认 opc-html 围栏。普通 html 代码块不当成可运行嵌入。 */
const FENCE = /```opc-html[^\n]*\n([\s\S]*?)```/g;

export const EMBED_SANDBOX = "allow-scripts";
export const EMBED_TITLE = "嵌入的 HTML";
export const EMBED_HINT = "到电脑查看动态";
export const EMBED_FALLBACK = "暂不可预览";

export function listEmbeds(markdown: string): { html: string }[] {
  const found: { html: string }[] = [];
  for (const match of markdown.matchAll(FENCE)) found.push({ html: match[1] ?? "" });
  return found;
}

export function embedAttributeList(html: string): { name: string; value: string }[] {
  return [
    { name: "sandbox", value: EMBED_SANDBOX },
    { name: "referrerpolicy", value: "no-referrer" },
    { name: "srcdoc", value: html },
    { name: "title", value: EMBED_TITLE },
  ];
}

export function applyEmbedAttributes(el: { setAttribute(name: string, value: string): void }, html: string): void {
  for (const attr of embedAttributeList(html)) el.setAttribute(attr.name, attr.value);
}

export function previewEmbedHtml(shot: { ok: boolean; dataUri?: string }): {
  kind: "image" | "fallback";
  src: string;
  detail: string;
  hint: string;
} {
  if (shot.ok && shot.dataUri) return { kind: "image", src: shot.dataUri, detail: "", hint: EMBED_HINT };
  return { kind: "fallback", src: "", detail: EMBED_FALLBACK, hint: EMBED_HINT };
}

export const embedPreviewRpc = defineRpc({
  name: "opc-core.notes.embed-preview",
  input: z.object({ html: z.string().max(200_000) }),
  output: z.object({
    kind: z.enum(["image", "fallback"]),
    src: z.string(),
    detail: z.string(),
    hint: z.string(),
  }),
});
