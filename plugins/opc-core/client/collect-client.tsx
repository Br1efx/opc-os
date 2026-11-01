import type { PluginClientContext } from "@getpaseo/plugin/client";
import { collectUrlRpc, notesAttachment, parseCollectArgs } from "../shared/collect";

/** 斜杠和笔记库挑选。三个外部入口不在客户端连出去。 */
export function registerCollectClient(client: PluginClientContext): () => void {
  const removeSlash = client.addSlashCommand({
    name: "收集",
    description: "把网址收进收件箱",
    argumentHint: "网址 可选标题 #标签",
    context: "agent",
    async onSubmit(ctx) {
      const parsed = parseCollectArgs(ctx.args);
      if (!parsed.ok) throw new Error(parsed.detail);
      const result = await ctx.rpc(collectUrlRpc, {
        url: parsed.url,
        title: parsed.title,
        tags: parsed.tags,
        now: new Date().toISOString(),
        nonce: Math.random().toString(36).slice(2, 10),
      });
      if (!result.ok) throw new Error(result.detail);
      ctx.openScreen({ screenId: "m2-card-wall" });
    },
  });
  const removeSource = client.addAttachmentSource(notesAttachment);
  return () => {
    removeSlash();
    removeSource();
  };
}
