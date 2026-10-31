import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { openOwnScreen } from "./client/cross-plugin";
import { HomeScreen } from "./client/home";
import { SpikePopup } from "./client/popup";

const HOME_SCREEN_ID = "home";

function HomeItem({ currentScreen, openScreen, openPopover }: PluginSidebarItemProps) {
  return (
    <>
      <SidebarRow
        icon="Blocks"
        label="OPC spike peer"
        active={currentScreen?.screenId === HOME_SCREEN_ID}
        onPress={() => openOwnScreen(openScreen)}
      />
      <SidebarRow icon="MessageCircle" label="S2 弹窗" onPress={() => openPopover(SpikePopup)} />
    </>
  );
}

export default function contribute(client: PluginClientContext) {
  client.addScreen({
    id: HOME_SCREEN_ID,
    title: "OPC spike peer",
    Component: HomeScreen,
  });
  client.addSidebarHeaderItem({
    id: HOME_SCREEN_ID,
    title: "OPC spike peer",
    Component: HomeItem,
  });
  return () => {};
}
