import assert from "node:assert/strict";
import test from "node:test";
import {
  MODULES,
  defaultModuleFlags,
  planModuleRegistration,
  reconcileRegistrations,
  shellSettings,
  withModuleFlag,
  type ModuleId,
} from "./shell.ts";

const ids = MODULES.map((mod) => mod.id);

test("默认六个模块都打开", () => {
  const flags = defaultModuleFlags();
  assert.deepEqual(ids, [
    "m1-notes",
    "m2-card-wall",
    "m3-gateway",
    "m4-tasks",
    "m5-ui",
    "m6-i18n",
  ]);
  for (const id of ids) assert.equal(flags[id], true);
});

test("空文档解析成默认开关，只关一个时其余仍打开", () => {
  const empty = shellSettings.schema.parse({});
  assert.deepEqual(empty.modules, defaultModuleFlags());
  const parsed = shellSettings.schema.parse({ modules: { "m2-card-wall": false } });
  assert.equal(parsed.modules["m2-card-wall"], false);
  assert.equal(parsed.modules["m1-notes"], true);
  assert.equal(parsed.modules["m6-i18n"], true);
});

test("关闭的模块从登记里拆掉，其余保留原来的登记", () => {
  const created: ModuleId[] = [];
  const destroyed: ModuleId[] = [];
  const current = new Map<ModuleId, { id: ModuleId }>();
  reconcileRegistrations(
    current,
    defaultModuleFlags(),
    (id) => {
      created.push(id);
      return { id };
    },
    (id) => destroyed.push(id),
  );
  assert.deepEqual(created, ids);
  const kept = current.get("m2-card-wall");
  created.length = 0;
  reconcileRegistrations(
    current,
    withModuleFlag(defaultModuleFlags(), "m1-notes", false),
    (id) => {
      created.push(id);
      return { id };
    },
    (id) => destroyed.push(id),
  );
  assert.deepEqual(created, []);
  assert.deepEqual(destroyed, ["m1-notes"]);
  assert.equal(current.has("m1-notes"), false);
  assert.equal(current.get("m2-card-wall"), kept);
});

test("已经关掉的模块再打开时只补登记这一个", () => {
  const flags = withModuleFlag(defaultModuleFlags(), "m4-tasks", false);
  const plan = planModuleRegistration(["m1-notes", "m2-card-wall"], flags);
  assert.deepEqual(plan.add, ["m3-gateway", "m5-ui", "m6-i18n"]);
  assert.deepEqual(plan.remove, []);
  const again = planModuleRegistration(["m1-notes", "m3-gateway", "m5-ui", "m6-i18n", "m2-card-wall"], {
    ...flags,
    "m4-tasks": true,
  });
  assert.deepEqual(again.add, ["m4-tasks"]);
  assert.deepEqual(again.remove, []);
});
