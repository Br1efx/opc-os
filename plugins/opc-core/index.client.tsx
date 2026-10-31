import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { HomeScreen } from "./client/home";

const HOME_SCREEN_ID = "home";

function HomeItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="Blocks"
      label="一人公司 OS"
      active={currentScreen?.screenId === HOME_SCREEN_ID}
      onPress={() => openScreen({ screenId: HOME_SCREEN_ID })}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  client.addScreen({
    id: HOME_SCREEN_ID,
    title: "一人公司 OS",
    Component: HomeScreen,
  });
  client.addSidebarHeaderItem({
    id: HOME_SCREEN_ID,
    title: "一人公司 OS",
    Component: HomeItem,
  });
  return () => {};
}
