import type { PluginServerContext } from "@getpaseo/plugin/server";
import { registerGateway } from "./server/gateway";
import { registerNotes } from "./server/notes";
import { CORE_CARD_REVISION } from "./shared/card-ref";
import { shellSettings } from "./shared/shell";

/**
 * 外壳的服务端入口。
 * 登记主机级设置，挂上网关快照，以及笔记的保存检查、批注工具和锁定还原。
 * 引用 card-protocol，是为了让插件编译器必须解析共享包。
 */
export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(shellSettings);
  const stopGateway = registerGateway(server);
  const stopNotes = registerNotes(server, settings);
  void CORE_CARD_REVISION;
  return () => {
    stopGateway();
    stopNotes();
  };
}
