import type { PluginServerContext } from "@getpaseo/plugin/server";

/** 架构页上的钩子名。预期不能通过 @getpaseo/plugin 0.14.0 的类型检查。 */
export function registerLegacyNames(server: PluginServerContext): void {
  server.before("agent.open.before", ({ request }) => request);
  server.on("agent.turn.after", () => {});
}
