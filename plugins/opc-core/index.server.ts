import type { PluginServerContext } from "@getpaseo/plugin/server";
import { registerCards } from "./server/cards";
import { registerCollect } from "./server/collect";
import { registerIntake } from "./server/intake";
import { registerGateway } from "./server/gateway";
import { registerNotes } from "./server/notes";
import { CORE_CARD_REVISION } from "./shared/card-ref";
import { shellSettings } from "./shared/shell";

/**
 * 外壳的服务端入口。
 * 登记主机级设置，挂上网关快照、笔记，以及卡片墙、任务工作流和回合结束推进。
 * 引用 card-protocol，是为了让插件编译器必须解析共享包。
 */
export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(shellSettings);
  const stopGateway = registerGateway(server);
  const stopNotes = registerNotes(server, settings);
  const cards = registerCards(server, settings);
  const stopIntake = registerIntake(server, settings);
  const stopCollect = registerCollect(server, settings, cards.store);
  void CORE_CARD_REVISION;
  return () => {
    stopCollect();
    stopIntake();
    stopGateway();
    stopNotes();
    cards.stop();
  };
}
