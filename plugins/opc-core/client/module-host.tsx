import type { PluginClientContext, PluginScreenProps, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useEffect } from "react";
import {
  moduleById,
  reconcileRegistrations,
  shellSettings,
  type ModuleFlags,
  type ModuleId,
} from "../shared/shell";
import { ModuleScreen } from "./module-screen";

const MODULE_ICONS: Record<ModuleId, string> = {
  "m1-notes": "NotebookPen",
  "m2-card-wall": "LayoutGrid",
  "m3-gateway": "Activity",
  "m4-tasks": "ListChecks",
  "m5-ui": "Palette",
  "m6-i18n": "Languages",
};

let bound: PluginClientContext | null = null;
const registrations = new Map<ModuleId, () => void>();

export function bindShellClient(client: PluginClientContext) {
  bound = client;
}

/** 按已保存的开关登记或卸下模块页面和侧栏项。 */
export function applyModuleFlags(flags: ModuleFlags) {
  if (!bound) return;
  const client = bound;
  reconcileRegistrations(
    registrations,
    flags,
    (id) => registerModule(client, id),
    (_id, remove) => remove(),
  );
}

export function disposeModuleRegistrations() {
  for (const remove of registrations.values()) remove();
  registrations.clear();
  bound = null;
}

function registerModule(client: PluginClientContext, id: ModuleId): () => void {
  const mod = moduleById(id);
  const removeScreen = client.addScreen({
    id: mod.id,
    title: mod.title,
    Component: function BoundModuleScreen(props: PluginScreenProps) {
      return <ModuleScreen {...props} moduleId={mod.id} />;
    },
  });
  const removeItem = client.addSidebarHeaderItem({
    id: mod.id,
    title: mod.title,
    Component: function ModuleItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
      return (
        <SidebarRow
          icon={MODULE_ICONS[mod.id]}
          label={mod.title}
          active={currentScreen?.screenId === mod.id}
          onPress={() => openScreen({ screenId: mod.id })}
        />
      );
    },
  });
  return () => {
    removeScreen();
    removeItem();
  };
}

/** 设置可读之后，把打开的模块登记进侧栏。关掉的不登记。 */
export function useModuleRegistration() {
  const settings = useSettings(shellSettings);
  const flags = settings.status === "ready" ? settings.values.modules : null;
  useEffect(() => {
    if (flags) applyModuleFlags(flags);
  }, [flags]);
}
