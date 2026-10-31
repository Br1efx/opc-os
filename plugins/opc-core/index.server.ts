import type { PluginServerContext } from "@getpaseo/plugin/server";

/**
 * D0 服务端入口。
 * 不注册 RPC、钩子或设置。保留此文件是为了占住 Paseo 的 server 运行时。
 */
export default function contribute(_server: PluginServerContext) {
  return () => {};
}
