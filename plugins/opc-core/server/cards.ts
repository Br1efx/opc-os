import type { PluginServerContext, PluginSettings } from "@getpaseo/plugin/server";
import { actionFromFields, createCardStore } from "../shared/cards";
import { actCardRpc, createCardRpc, listCardsRpc } from "../shared/cards-rpc";
import { shellSettings } from "../shared/shell";
import { createNodeCardFiles } from "./cards-fs";

async function cardsEnabled(settings: PluginSettings<(typeof shellSettings)["schema"]>): Promise<boolean> {
  const state = await settings.read();
  if (state.status !== "ready") return true;
  return state.values.modules["m2-card-wall"] !== false;
}

/**
 * 卡片墙的服务端。
 * 写卡只有 `store.writeCard` 这一处。回合结束、人手动新建和以后的定时任务都调用它。
 * 架构里的 agent.turn.after 在 SDK 0.14.0 上是 agent.turn_ended。
 */
export function registerCards(
  server: PluginServerContext,
  settings: PluginSettings<(typeof shellSettings)["schema"]>,
): () => void {
  const store = createCardStore(createNodeCardFiles());
  server.handle(listCardsRpc, async (input) => {
    const library = await store.load(input.now);
    return { now: library.now, root: library.root, cards: library.cards, views: library.views };
  });
  server.handle(createCardRpc, async (input) => {
    if (!(await cardsEnabled(settings))) return { ok: false, detail: "卡片墙已关闭", id: "" };
    const result = await store.createManual(input);
    return { ok: result.ok, detail: result.detail, id: result.id };
  });
  server.handle(actCardRpc, async (input) => {
    if (!(await cardsEnabled(settings))) return { ok: false, detail: "卡片墙已关闭", delivery: null };
    const action = actionFromFields(input);
    if (!action) return { ok: false, detail: "没有这个动作", delivery: null };
    return store.act({ id: input.id, action, now: input.now });
  });
  const stopEnded = server.on("agent.turn_ended", async (event) => {
    if (!(await cardsEnabled(settings))) return;
    try {
      await store.writeTurn({
        agentId: event.agent.id,
        title: event.agent.title,
        outcome: event.outcome.kind,
        now: new Date().toISOString(),
        nonce: Math.random().toString(36).slice(2, 10),
      });
    } catch {
      // 目录写不进去时，不挡住这一轮别的钩子。
    }
  });
  return () => {
    stopEnded();
  };
}
