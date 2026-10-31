import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/** 外壳里的六个模块。标识与 modules/ 目录、权限清单一致。 */
export const MODULES = [
  { id: "m1-notes", title: "笔记", summary: "笔记库。这一版只有入口，还没有编辑器。" },
  { id: "m2-card-wall", title: "卡片墙", summary: "动态看板。这一版只有入口，还没有卡片墙。" },
  { id: "m3-gateway", title: "网关与监控", summary: "用量和主机状态。这一版只有入口。" },
  { id: "m4-tasks", title: "任务与工作流", summary: "任务流水线。这一版只有入口。" },
  { id: "m5-ui", title: "界面优化", summary: "外观和布局。这一版只有入口。" },
  { id: "m6-i18n", title: "汉化", summary: "界面中文。术语表在仓库 docs/glossary.md，翻译还没接上。" },
] as const;

export type ModuleId = (typeof MODULES)[number]["id"];

export const moduleFlagsSchema = z.object({
  "m1-notes": z.boolean().default(true),
  "m2-card-wall": z.boolean().default(true),
  "m3-gateway": z.boolean().default(true),
  "m4-tasks": z.boolean().default(true),
  "m5-ui": z.boolean().default(true),
  "m6-i18n": z.boolean().default(true),
});

export type ModuleFlags = z.infer<typeof moduleFlagsSchema>;

/** 合理默认：六个入口都打开。关掉之后才从侧栏和页面登记里卸下。 */
export function defaultModuleFlags(): ModuleFlags {
  return {
    "m1-notes": true,
    "m2-card-wall": true,
    "m3-gateway": true,
    "m4-tasks": true,
    "m5-ui": true,
    "m6-i18n": true,
  };
}

/**
 * 主机上的外壳设置。Paseo 0.14 用 defineSettings 持久化。
 * 缺文档时按 schema 默认值，也就是六个模块都打开。
 */
export const shellSettings = defineSettings({
  id: "shell",
  scope: "host",
  version: 1,
  schema: z.object({
    modules: moduleFlagsSchema.default(defaultModuleFlags()),
  }),
});

export function moduleById(id: ModuleId): (typeof MODULES)[number] {
  const found = MODULES.find((mod) => mod.id === id);
  if (!found) throw new Error(`未知模块 ${id}`);
  return found;
}

export function withModuleFlag(flags: ModuleFlags, id: ModuleId, enabled: boolean): ModuleFlags {
  return { ...flags, [id]: enabled };
}

export function planModuleRegistration(
  registered: readonly ModuleId[],
  flags: ModuleFlags,
): { add: ModuleId[]; remove: ModuleId[] } {
  const registeredSet = new Set(registered);
  const add: ModuleId[] = [];
  const remove: ModuleId[] = [];
  for (const mod of MODULES) {
    const enabled = flags[mod.id];
    const has = registeredSet.has(mod.id);
    if (enabled && !has) add.push(mod.id);
    if (!enabled && has) remove.push(mod.id);
  }
  return { add, remove };
}

/**
 * 按开关补登记、拆登记。已经登记且仍然打开的项保持原对象，不重复创建。
 */
export function reconcileRegistrations<T>(
  current: Map<ModuleId, T>,
  flags: ModuleFlags,
  create: (id: ModuleId) => T,
  destroy: (id: ModuleId, value: T) => void,
): void {
  const plan = planModuleRegistration([...current.keys()], flags);
  for (const id of plan.remove) {
    const value = current.get(id);
    if (value === undefined) continue;
    destroy(id, value);
    current.delete(id);
  }
  for (const id of plan.add) current.set(id, create(id));
}
