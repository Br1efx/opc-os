import type { PluginOpenScreenInput, PluginSidebarItemProps } from "@getpaseo/plugin/client";

type HasPluginId = "pluginId" extends keyof PluginOpenScreenInput ? true : false;

/** 锁定类型事实：打开页面的参数里没有插件 id。SDK 一旦加上该字段，这里的赋值会失败。 */
export const openScreenAcceptsPluginId: HasPluginId = false;

export function openOwnScreen(openScreen: PluginSidebarItemProps["openScreen"]): void {
  openScreen({ screenId: "home" });
}

export function openOtherPluginScreen(openScreen: PluginSidebarItemProps["openScreen"]): void {
  // @ts-expect-error S6：类型只接受本插件的 screenId，不接受另一个插件的 id
  openScreen({ screenId: "home", pluginId: "opc-core" });
}
