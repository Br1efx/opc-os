import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { HomeScreen } from "./client/home";
import { bindShellClient, disposeModuleRegistrations, useModuleRegistration } from "./client/module-host";
import { NotificationsScreen } from "./client/notifications";
import { SettingsHostScreen, SettingsScreen } from "./client/settings";

const HOME_SCREEN_ID = "home";
const SETTINGS_SCREEN_ID = "settings";
const NOTIFICATIONS_SCREEN_ID = "notifications";

function HomeItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  useModuleRegistration();
  return (
    <SidebarRow
      icon="Blocks"
      label="一人公司 OS"
      active={currentScreen?.screenId === HOME_SCREEN_ID}
      onPress={() => openScreen({ screenId: HOME_SCREEN_ID })}
    />
  );
}

function SettingsItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  useModuleRegistration();
  return (
    <SidebarRow
      icon="Settings"
      label="设置"
      active={currentScreen?.screenId === SETTINGS_SCREEN_ID}
      onPress={() => openScreen({ screenId: SETTINGS_SCREEN_ID })}
    />
  );
}

function NotificationsItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  useModuleRegistration();
  return (
    <SidebarRow
      icon="Bell"
      label="通知"
      active={currentScreen?.screenId === NOTIFICATIONS_SCREEN_ID}
      onPress={() => openScreen({ screenId: NOTIFICATIONS_SCREEN_ID })}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  bindShellClient(client);
  const removals = [
    client.addScreen({ id: HOME_SCREEN_ID, title: "一人公司 OS", Component: HomeScreen }),
    client.addScreen({ id: SETTINGS_SCREEN_ID, title: "设置", Component: SettingsScreen }),
    client.addScreen({
      id: NOTIFICATIONS_SCREEN_ID,
      title: "通知",
      Component: NotificationsScreen,
    }),
    client.addSettingsScreen({
      id: "modules",
      title: "设置",
      icon: "Settings",
      Component: SettingsHostScreen,
    }),
    client.addSidebarHeaderItem({
      id: HOME_SCREEN_ID,
      title: "一人公司 OS",
      Component: HomeItem,
    }),
    client.addSidebarHeaderItem({
      id: SETTINGS_SCREEN_ID,
      title: "设置",
      Component: SettingsItem,
    }),
    client.addSidebarHeaderItem({
      id: NOTIFICATIONS_SCREEN_ID,
      title: "通知",
      Component: NotificationsItem,
    }),
  ];
  return () => {
    disposeModuleRegistrations();
    for (const remove of removals) remove();
  };
}
