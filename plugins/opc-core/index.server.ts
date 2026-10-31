import type { PluginServerContext } from "@getpaseo/plugin/server";
import { CORE_CARD_REVISION } from "./shared/card-ref";
import { shellSettings } from "./shared/shell";

/**
 * 外壳的服务端入口。
 * 登记主机级设置，供界面端的模块开关读写。不注册业务 RPC。
 * 引用 card-protocol，是为了让插件编译器必须解析共享包。
 */
export default function contribute(server: PluginServerContext) {
  server.registerSettings(shellSettings);
  void CORE_CARD_REVISION;
  return () => {};
}
