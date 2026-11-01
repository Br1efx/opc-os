import assert from "node:assert/strict";
import test from "node:test";
import { parseViewDocument, queryCards, renderView, type ViewDefinition } from "./bases.ts";

const now = "2026-11-01T08:00:00.000Z";

function card(patch: Record<string, unknown> = {}) {
  return {
    id: "card-1",
    type: "task",
    status: "inbox",
    title: "写卡片墙",
    oneLiner: "先把查询钉住",
    owner: { kind: "agent", id: "builder" },
    source: "manual",
    evidence: ["docs/a.md"],
    related: [],
    time: now,
    unread: true,
    project: "插件开发",
    ...patch,
  };
}

const listView: ViewDefinition = {
  id: "sample",
  title: "样例",
  layout: "list",
  sort: [{ field: "time", direction: "desc" }],
};

test("等于、不等于、包含、为空可以用并且和或者组合", () => {
  const cards = [
    card({ id: "a", title: "父亲 AI 芝麻馆选题", project: "父亲 AI 芝麻馆", evidence: [] }),
    card({ id: "b", type: "question", status: "active", project: "" }),
    card({ id: "c", owner: { kind: "person", id: "me" }, evidence: ["https://example.com/a"] }),
  ];
  const equals = queryCards(cards, {
    ...listView,
    filter: { op: "eq", field: "project", value: "父亲 AI 芝麻馆" },
  });
  assert.deepEqual(equals.matched.map((item) => item.id), ["a"]);

  const differs = queryCards(cards, {
    ...listView,
    filter: { op: "neq", field: "status", value: "inbox" },
  });
  assert.deepEqual(differs.matched.map((item) => item.id), ["b"]);

  const included = queryCards(cards, {
    ...listView,
    filter: { op: "contains", field: "title", value: "芝麻馆" },
  });
  assert.deepEqual(included.matched.map((item) => item.id), ["a"]);
  const link = queryCards(cards, {
    ...listView,
    filter: { op: "contains", field: "evidence", value: "example.com" },
  });
  assert.deepEqual(link.matched.map((item) => item.id), ["c"]);

  const blank = queryCards(cards, {
    ...listView,
    filter: { op: "or", items: [{ op: "empty", field: "project" }, { op: "empty", field: "evidence" }] },
  });
  assert.deepEqual(blank.matched.map((item) => item.id).sort(), ["a", "b"]);

  const both = queryCards(cards, {
    ...listView,
    filter: {
      op: "and",
      items: [
        { op: "eq", field: "owner.kind", value: "agent" },
        { op: "neq", field: "type", value: "question" },
      ],
    },
  });
  assert.deepEqual(both.matched.map((item) => item.id), ["a"]);
});

test("日期范围含今天和相对天数，边界算在内", () => {
  const cards = [
    card({ id: "today", time: "2026-11-01T00:00:00.000Z" }),
    card({ id: "yesterday", time: "2026-10-31T23:00:00.000Z" }),
    card({ id: "week", time: "2026-10-26T08:00:00.000Z" }),
    card({ id: "old", time: "2026-10-01T08:00:00.000Z" }),
    card({ id: "bad", time: "昨天" }),
  ];
  const today = queryCards(
    cards,
    { ...listView, filter: { op: "dateRange", field: "time", from: "$todayStart", to: "$todayEnd" } },
    { now },
  );
  assert.deepEqual(today.matched.map((item) => item.id), ["today"]);
  assert.equal(today.invalid.length, 1);

  const recent = queryCards(
    cards,
    { ...listView, filter: { op: "dateRange", field: "time", from: "$now-7d", to: "$now" } },
    { now },
  );
  assert.deepEqual(
    recent.matched.map((item) => item.id),
    ["today", "yesterday", "week"],
  );

  const closed = queryCards(cards, {
    ...listView,
    filter: { op: "dateRange", field: "time", from: "2026-11-01T00:00:00.000Z", to: "2026-11-01T00:00:00.000Z" },
  });
  assert.deepEqual(closed.matched.map((item) => item.id), ["today"]);
});

test("排序稳定，空值排在后面，分组会留下空列并接住新值", () => {
  const cards = [
    card({ id: "late", time: "2026-11-01T09:00:00.000Z", status: "inbox", title: "b" }),
    card({ id: "same-b", time: "2026-11-01T08:00:00.000Z", status: "shelved", title: "a" }),
    card({ id: "same-a", time: "2026-11-01T08:00:00.000Z", status: "active", title: "a" }),
    card({ id: "missing", time: "2026-11-01T07:00:00.000Z", status: "inbox", title: "c", project: "" }),
  ];
  const byTime = queryCards(cards, {
    ...listView,
    sort: [
      { field: "title", direction: "asc" },
      { field: "time", direction: "asc" },
    ],
  });
  assert.deepEqual(
    byTime.matched.map((item) => item.id),
    ["same-b", "same-a", "late", "missing"],
  );

  const grouped = queryCards(cards, {
    id: "board",
    title: "看板",
    layout: "board",
    groupBy: "status",
    columns: [
      { value: "inbox", title: "收件箱" },
      { value: "active", title: "推进中" },
      { value: "settled", title: "已沉淀" },
    ],
  });
  assert.deepEqual(
    grouped.groups.map((group) => [group.title, group.cards.map((item) => item.id)]),
    [
      ["收件箱", ["late", "missing"]],
      ["推进中", ["same-a"]],
      ["已沉淀", []],
      ["shelved", ["same-b"]],
    ],
  );

  const moved = queryCards(
    cards.map((item) => (item.id === "late" ? { ...item, status: "active" } : item)),
    {
      id: "board",
      title: "看板",
      layout: "board",
      groupBy: "status",
      columns: [
        { value: "inbox", title: "收件箱" },
        { value: "active", title: "推进中" },
      ],
    },
  );
  assert.deepEqual(moved.groups.find((group) => group.key === "inbox")?.cards.map((item) => item.id), ["missing"]);
  assert.deepEqual(moved.groups.find((group) => group.key === "active")?.cards.map((item) => item.id), ["late", "same-a"]);

  const projects = queryCards(cards, { id: "by-project", title: "按项目", layout: "columns", groupBy: "project" });
  assert.equal(projects.groups.some((group) => group.key === "" && group.title === "未填写"), true);
});

test("非法卡片不进分组，并留下问题", () => {
  const result = queryCards(
    [card({ id: "ok" }), { ...card({ id: "bad" }), status: "open" }, null, { ...card(), type: "probe" }],
    listView,
  );
  assert.deepEqual(result.matched.map((item) => item.id), ["ok"]);
  assert.equal(result.groups[0]?.cards.length, 1);
  assert.equal(result.invalid.length, 3);
  assert.equal(result.invalid[0]?.issues.some((issue) => issue.path === "status"), true);
  assert.equal(result.invalid[1]?.issues.some((issue) => issue.code === "not-object"), true);
  assert.equal(result.invalid[2]?.issues.some((issue) => issue.path === "type"), true);
});

test("视图定义写成 YAML 或 JSON 后再读回来，改筛选就会换结果", () => {
  const view: ViewDefinition = {
    id: "awaiting",
    title: "等你处理",
    layout: "list",
    sort: [{ field: "time", direction: "desc" }],
    filter: {
      op: "or",
      items: [
        { op: "eq", field: "status", value: "inbox" },
        { op: "and", items: [{ op: "eq", field: "type", value: "question" }, { op: "eq", field: "status", value: "active" }] },
      ],
    },
  };
  const yaml = parseViewDocument(renderView(view));
  assert.equal(yaml.ok, true);
  if (yaml.ok) assert.deepEqual(yaml.view, view);

  const json = parseViewDocument(JSON.stringify(view));
  assert.equal(json.ok, true);

  const commented = parseViewDocument(`# 备注\n${renderView(view)}`);
  assert.equal(commented.ok, true);

  const cards = [card({ id: "inbox" }), card({ id: "active", status: "active", type: "task" })];
  const before = queryCards(cards, view);
  assert.deepEqual(before.matched.map((item) => item.id), ["inbox"]);
  const edited = parseViewDocument(renderView({ ...view, filter: { op: "eq", field: "status", value: "active" } }));
  assert.equal(edited.ok, true);
  if (edited.ok) assert.deepEqual(queryCards(cards, edited.view).matched.map((item) => item.id), ["active"]);

  assert.equal(parseViewDocument("title: 缺标识\nlayout: list\n").ok, false);
  assert.equal(parseViewDocument("id: sample\ntitle: 样例\nlayout: list\nfilter:\n  op: regex\n  field: title\n").ok, false);
  assert.match(parseViewDocument("\t id: sample\n").detail, /制表符/);
});
