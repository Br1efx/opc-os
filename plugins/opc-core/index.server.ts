import type { PluginServerContext } from "@getpaseo/plugin/server";
import { registerGateway } from "./server/gateway";
import { CORE_CARD_REVISION } from "./shared/card-ref";
import { shellSettings } from "./shared/shell";

/**
 * 外壳的服务端入口。
 * 登记主机级设置，并挂上网关快照 RPC。读 Magpie 的请求发生在 daemon 上。
 * 引用 card-protocol，是为了让插件编译器必须解析共享包。
 */
export default function contribute(server: PluginServerContext) {
  server.registerSettings(shellSettings);
  const stopGateway = registerGateway(server);
  void CORE_CARD_REVISION;
  return () => {
    stopGateway();
  };
}
