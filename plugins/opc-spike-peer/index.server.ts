import type { PluginServerContext } from "@getpaseo/plugin/server";
import { registerSpikeHooks } from "./server/hooks";

/**
 * 探针插件的服务端入口。
 * 只注册 S3 的钩子形状。不调用 paseo schedule，不注册 RPC。
 */
export default function contribute(server: PluginServerContext) {
  registerSpikeHooks(server);
  return () => {};
}
