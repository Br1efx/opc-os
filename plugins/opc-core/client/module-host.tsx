import type { PluginClientContext, PluginScreenProps, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef } from "react";
import {
  MODULES,
  moduleById,
  reconcileRegistrations,
  shellSettings,
  type ModuleFlags,
  type ModuleId,
} from "../shared/shell";
import { CardWallNav } from "./card-wall";
import { ModuleScreen } from "./module-screen";
import { NotesFilePanel } from "./notes-panel";

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
    Component: function ModuleItem(props: PluginSidebarItemProps) {
      if (mod.id === "m2-card-wall") return <CardWallNav {...props} />;
      return (
        <SidebarRow
          icon={MODULE_ICONS[mod.id]}
          label={mod.title}
          active={props.currentScreen?.screenId === mod.id}
          onPress={() => props.openScreen({ screenId: mod.id })}
        />
      );
    },
  });
  const removePanel =
    id === "m1-notes"
      ? client.addFilePanel({
          id: "opc-notes",
          title: "笔记",
          icon: "NotebookPen",
          files: { extensions: ["md", "markdown"] },
          Component: NotesFilePanel,
        })
      : null;
  return () => {
    removeScreen();
    removeItem();
    removePanel?.();
  };
}

/** 只编码六个开关的取值。对象身份不能当依赖：useSettings 每次渲染都会 parse 出新对象。 */
function moduleFlagsKey(flags: ModuleFlags): string {
  return MODULES.map((mod) => (flags[mod.id] ? "1" : "0")).join("");
}

/**
 * 设置可读之后，把打开的模块登记进侧栏。关掉的不登记。
 * 依赖是开关取值。若依赖整份对象，保存尚未返回时，侧栏渲染会用旧值把刚卸下的模块登记回去。
 */
export function useModuleRegistration() {
  const settings = useSettings(shellSettings);
  const flags = settings.status === "ready" ? settings.values.modules : null;
  const key = flags ? moduleFlagsKey(flags) : "";
  const flagsRef = useRef(flags);
  flagsRef.current = flags;
  useEffect(() => {
    const current = flagsRef.current;
    if (current) applyModuleFlags(current);
  }, [key]);
}
