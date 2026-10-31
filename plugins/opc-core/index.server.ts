import type { PluginServerContext } from "@getpaseo/plugin/server";
import { CORE_CARD_REVISION } from "./shared/card-ref";

/**
 * D0 服务端入口。
 * 不注册 RPC、钩子或设置。保留此文件是为了占住 Paseo 的 server 运行时。
 * 引用 card-protocol，是为了让插件编译器必须解析共享包。
 */
export default function contribute(_server: PluginServerContext) {
  void CORE_CARD_REVISION;
  return () => {};
}
