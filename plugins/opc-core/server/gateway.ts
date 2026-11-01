import type { PluginServerContext } from "@getpaseo/plugin/server";
import { loadGateway } from "./magpie";
import { gatewaySnapshot } from "../shared/gateway-rpc";
import { gatewaySettings } from "../shared/gateway-settings";

/** 登记网关设置，并让手机经 daemon 读本机 Magpie。 */
export function registerGateway(server: PluginServerContext): () => void {
  server.registerSettings(gatewaySettings);
  server.handle(gatewaySnapshot, (input) => loadGateway(input));
  return () => {};
}
