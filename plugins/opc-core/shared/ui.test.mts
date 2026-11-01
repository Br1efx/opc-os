import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { mockSnapshot } from "./gateway.ts";
import {
  DAD_PHONE_WIDTH,
  DEFAULT_UI_TEXT,
  UI_CONFIG_FILE,
  arrangeSidebar,
  collapsedMap,
  defaultUiDocument,
  elderDefault,
  faceFromAgent,
  fitsThumb,
  loadUiConfig,
  panelIdFromEnv,
  panelIdFromText,
  panelLabel,
  parseUiDocument,
  preferPanel,
  resolveElder,
  rowLabel,
  sectionLabel,
  signalsFromGateway,
  statusStrip,
  typeMetricsForWidth,
  uiSettings,
  withCollapsed,
} from "./ui.ts";

const env = (values: Record<string, string | undefined>) => values;

test("内置分组含总秘书、主力开发，以及攻坚、调度员、写作", () => {
  const doc = defaultUiDocument();
  const chief = doc.groups.find((group) => group.displayName === "总秘书");
  const builder = doc.groups.find((group) => group.displayName === "主力开发");
  assert.ok(chief);
  assert.equal(chief?.icon, "🧠");
  assert.ok(chief?.match.includes("chief"));
  assert.ok(builder);
  assert.equal(builder?.icon, "🔨");
  assert.ok(doc.groups.some((group) => group.match.includes("攻坚")));
  assert.ok(doc.groups.some((group) => group.displayName === "调度员"));
  assert.ok(doc.groups.some((group) => group.displayName === "写作"));
  assert.equal(doc.foldCompleted, true);
  assert.equal(doc.title.prefixIcon, true);
});

test("仓库里的分组文件就是内置默认，改显示名后分组跟着变", () => {
  const text = fs.readFileSync(new URL("./ui/groups.yaml", import.meta.url), "utf8");
  assert.equal(text, DEFAULT_UI_TEXT);
  const parsed = parseUiDocument(text);
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(parsed.document, defaultUiDocument());

  const renamed = parseUiDocument(`
groups:
  - id: builder
    displayName: 主力工程师
    icon: ⚒️
    order: 5
    match:
      - builder-a
`);
  assert.equal(renamed.ok, true);
  if (!renamed.ok) return;
  const sections = arrangeSidebar(
    [faceFromAgent({ id: "builder-a", title: "修卡片墙", labels: { "opc-role": "主力开发" }, status: "idle" })],
    renamed.document,
  );
  assert.equal(sections[0]?.displayName, "主力工程师");
  assert.equal(sections[0]?.icon, "⚒️");
  assert.match(sections[0]?.rows[0]?.label ?? "", /修卡片墙/);
  assert.match(sections[0]?.rows[0]?.label ?? "", /⚒️/);
});

test("非法分组配置用中文说明，不把英文错误抛出去", () => {
  const cases = [
    ["", /分组配置是空的/],
    ["{", /分组配置读不懂/],
    ["groups: 1", /分组列表/],
    ["title: 粗", /标题样式/],
    [
      `groups:
  - id: Chief
    displayName: 总秘书
    icon: 🧠
    match:
      - chief
`,
      /小写/,
    ],
    [
      `groups:
  - id: chief
    displayName: ""
    icon: 🧠
    match:
      - chief
`,
      /显示名/,
    ],
    [
      `groups:
  - id: other
    displayName: 其他
    icon: 📎
    match:
      - x
`,
      /留给/,
    ],
  ] as const;
  for (const [text, pattern] of cases) {
    const parsed = parseUiDocument(text);
    assert.equal(parsed.ok, false, text);
    if (parsed.ok) continue;
    assert.match(parsed.detail, pattern);
    assert.doesNotMatch(parsed.detail, /\b(error|invalid|undefined|JSON|YAML)\b/i);
  }
});

test("JSON 分组也能读，文件优先于内置，坏文件不冒充成功", () => {
  const json = JSON.stringify({
    foldCompleted: false,
    title: { weight: "粗体", color: "正文色", prefixIcon: false },
    groups: [{ id: "chief", displayName: "总秘书", icon: "🧠", order: 1, collapsed: true, match: ["chief"] }],
  });
  const parsed = parseUiDocument(json);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.document.title.weight, "700");
    assert.equal(parsed.document.title.color, "foreground");
    assert.equal(parsed.document.title.prefixIcon, false);
    assert.equal(parsed.document.groups[0]?.collapsed, true);
  }
  const loaded = loadUiConfig([{ name: "groups.json", text: json }]);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.source, "file");
  const yamlWins = loadUiConfig([
    { name: "groups.json", text: json },
    { name: "groups.yaml", text: "groups: [" },
  ]);
  assert.equal(yamlWins.ok, false);
  assert.equal(yamlWins.fileName, "groups.yaml");
  assert.match(yamlWins.detail, /分组配置/);
  const missing = loadUiConfig([]);
  assert.equal(missing.ok, true);
  assert.equal(missing.source, "builtin");
  assert.deepEqual(missing.document, defaultUiDocument());
});

test("侧边栏按显示名和图标分组，空组也留着，已完成的会话收进折叠区", () => {
  const doc = defaultUiDocument();
  const sections = arrangeSidebar(
    [
      faceFromAgent({ id: "chief", title: "总秘书", labels: { "opc-role": "总秘书" }, status: "idle" }),
      faceFromAgent({
        id: "builder-a",
        title: "修测试",
        labels: { "opc-role": "实现" },
        status: "idle",
        requiresAttention: true,
      }),
      faceFromAgent({ id: "old", title: "昨天的审查", labels: { "opc-role": "审查员" }, status: "closed" }),
      faceFromAgent({ id: "archived", title: "已归档写作", labels: { "opc-role": "写作" }, status: "idle", archivedAt: "2026-11-01T00:00:00.000Z" }),
      faceFromAgent({ id: "stray", title: "临时会话", labels: {}, status: "running" }),
      faceFromAgent({ id: "hidden", title: "内部", labels: { "opc-role": "总秘书" }, status: "idle", internal: true }),
    ],
    doc,
  );
  const chief = sections.find((section) => section.displayName === "总秘书");
  const builder = sections.find((section) => section.displayName === "主力开发");
  const done = sections.find((section) => section.id === "completed");
  const other = sections.find((section) => section.id === "other");
  assert.ok(chief);
  assert.equal(chief?.icon, "🧠");
  assert.deepEqual(chief?.rows.map((row) => row.id), ["chief"]);
  assert.ok(builder);
  assert.equal(builder?.rows[0]?.id, "builder-a");
  assert.match(builder?.rows[0]?.label ?? "", /等你/);
  assert.equal(builder?.rows[0]?.weight, doc.title.weight);
  assert.equal(sections.indexOf(chief as (typeof sections)[number]) < sections.indexOf(builder as (typeof sections)[number]), true);
  assert.ok(done);
  assert.equal(done?.collapsed, true);
  assert.deepEqual(done?.rows.map((row) => row.id).sort(), ["archived", "old"]);
  assert.equal(sections.find((section) => section.displayName === "审查员")?.rows.some((row) => row.id === "old"), false);
  assert.equal(sections.find((section) => section.displayName === "写作")?.rows.some((row) => row.id === "archived"), false);
  assert.equal(chief?.rows.some((row) => row.id === "hidden"), false);
  assert.ok(other);
  assert.equal(other?.rows[0]?.id, "stray");
  assert.match(sectionLabel(done as NonNullable<typeof done>), /已收起/);
  const opened = arrangeSidebar(
    [faceFromAgent({ id: "chief", title: "总秘书", status: "closed" })],
    doc,
    { completed: false },
  );
  assert.equal(opened.find((section) => section.id === "completed")?.collapsed, false);
});

test("标题可以关掉前缀图标，未命名会话有中文占位", () => {
  const doc = defaultUiDocument();
  const face = faceFromAgent({ id: "x", title: "  ", status: "idle" });
  assert.equal(rowLabel("🔨", face, doc.title), "🔨 未命名会话");
  assert.equal(rowLabel("🔨", face, { ...doc.title, prefixIcon: false }), "未命名会话");
});

test("dad 默认开老人模式，me 默认关，手动选择盖过默认", () => {
  assert.equal(uiSettings.schema.parse({}).elder, "auto");
  assert.deepEqual(uiSettings.schema.parse({}).collapsed, []);
  assert.equal(elderDefault("dad"), true);
  assert.equal(elderDefault("me"), false);
  assert.equal(elderDefault("unknown"), false);
  assert.equal(resolveElder("auto", "dad"), true);
  assert.equal(resolveElder("auto", "me"), false);
  assert.equal(resolveElder("auto", "unknown"), false);
  assert.equal(resolveElder("on", "me"), true);
  assert.equal(resolveElder("off", "dad"), false);
  assert.equal(panelLabel("dad"), "父亲的面板");
  assert.equal(panelLabel("me"), "你的面板");
  assert.equal(panelIdFromEnv(env({ OPC_PANEL: "dad", USER: "me" })), "dad");
  assert.equal(panelIdFromEnv(env({ USER: "dad" })), "dad");
  assert.equal(panelIdFromEnv(env({ LOGNAME: "me" })), "me");
  assert.equal(panelIdFromEnv(env({ PASEO_HOME: "/home/dad/.paseo" })), "dad");
  assert.equal(panelIdFromEnv(env({ HOME: "/home/me" })), "me");
  assert.equal(panelIdFromEnv(env({ USER: "br1efx", HOME: "/home/br1efx" })), "unknown");
  assert.equal(panelIdFromText("dad"), "dad");
  assert.equal(panelIdFromText("父亲的面板"), "dad");
  assert.equal(panelIdFromText("me"), "me");
  assert.equal(preferPanel("unknown", "dad"), "dad");
  assert.equal(preferPanel("me", "dad"), "me");
  assert.deepEqual(withCollapsed([{ id: "chief", on: true }], "chief", false), [{ id: "chief", on: false }]);
  assert.equal(collapsedMap([{ id: "chief", on: true }]).chief, true);
});

test("父亲手机宽度下老人模式的主按钮不用捏合也能点到", () => {
  const elder = typeMetricsForWidth(true, DAD_PHONE_WIDTH);
  const plain = typeMetricsForWidth(false, DAD_PHONE_WIDTH);
  assert.equal(DAD_PHONE_WIDTH, 360);
  assert.equal(fitsThumb(elder, DAD_PHONE_WIDTH), true);
  assert.equal(plain.title, 22);
  assert.equal(plain.body, 16);
  assert.equal(plain.hitMin, 44);
  assert.ok(elder.hitMin >= 56);
  assert.ok(elder.body >= 22);
  assert.ok(elder.title > plain.title);
  assert.ok(elder.gap > plain.gap);
  assert.equal(elder.stacked, true);
  assert.equal(elder.fullWidth, true);
});

test("状态条同时给出门卫、额度和主机负载，缺信号时用中文占位且不假绿", () => {
  const mock = mockSnapshot(
    { person: "me", project: "opc", role: "owner", module: "m3-gateway" },
    25,
    "2026-11-01T00:00:00.000Z",
  );
  const absent = statusStrip(signalsFromGateway(mock));
  assert.deepEqual(absent.map((item) => item.label), ["门卫", "额度", "主机负载"]);
  for (const item of absent) {
    assert.equal(item.tone, "unknown");
    assert.match(item.text, /暂无数据/);
    assert.equal(item.text.includes("🟢"), false);
  }
  const empty = statusStrip(null);
  assert.equal(empty.every((item) => item.tone === "unknown" && item.text.includes("暂无数据")), true);

  const live = statusStrip({
    guardDetail: "出口正常，已放行",
    quotaDetails: ["剩余 40%", "账号剩余 12%"],
    hostDetail: "网关进程 9。负载 7%",
  });
  assert.equal(live[0]?.text, "门卫 🟢");
  assert.equal(live[0]?.tone, "ok");
  assert.equal(live[1]?.text, "额度剩余 12%");
  assert.equal(live[1]?.tone, "unknown");
  assert.equal(live[2]?.text, "主机负载 7%");
  assert.equal(live[2]?.tone, "unknown");

  const cut = statusStrip({ guardDetail: "已放行，随后切断", quotaDetails: [], hostDetail: "网关进程 9。" });
  assert.equal(cut[0]?.text, "门卫 🔴");
  assert.equal(cut[0]?.tone, "bad");
  assert.match(cut[2]?.text ?? "", /暂无数据/);
  assert.equal(UI_CONFIG_FILE, "/home/br1efx/notes/cards/_ui/groups.yaml");
});
