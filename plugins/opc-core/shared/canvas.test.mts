import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReviewCanvasFile,
  canvasEditOffered,
  edgesFromFlow,
  moveNode,
  nextZoom,
  parseCanvas,
  reviewCanvasTemplate,
  serializeCanvas,
} from "./canvas.ts";

const sample = `{
  "nodes": [
    { "id": "a", "type": "text", "text": "旁白", "x": 0, "y": 0, "width": 100, "height": 40, "kept": true },
    { "id": "b", "type": "mystery", "label": "保留", "x": 10, "y": 20, "width": 30, "height": 40 }
  ],
  "edges": [{ "id": "e", "fromNode": "a", "toNode": "b", "fromSide": "right", "toSide": "left" }]
}`;

test("合法画布能读出节点，未知类型原样写回", () => {
  const opened = parseCanvas(sample);
  assert.equal(opened.ok, true);
  if (!opened.ok) return;
  assert.equal(opened.canvas.nodes[0]?.text, "旁白");
  assert.equal(opened.canvas.nodes[1]?.type, "raw");
  const moved = moveNode(opened.canvas, "b", 80, 90);
  const again = parseCanvas(serializeCanvas(moved));
  assert.equal(again.ok, true);
  if (!again.ok) return;
  const mystery = again.canvas.nodes.find((node) => node.id === "b");
  assert.equal(mystery?.x, 80);
  assert.equal(mystery?.y, 90);
  assert.equal(mystery?.raw?.type, "mystery");
  assert.equal(again.canvas.nodes[0]?.extra?.kept, true);
});

test("坏文件用中文说明，不抛出", () => {
  const cases: [string, string][] = [
    ["", "这份画布是空的"],
    ["{", "这份画布不是合法的 JSON"],
    ["[]", "这份画布的格式不对"],
    ["{}", "这份画布缺少节点列表"],
  ];
  for (const [text, detail] of cases) {
    const opened = parseCanvas(text);
    assert.equal(opened.ok, false);
    if (!opened.ok) assert.equal(opened.detail, detail);
  }
});

test("审阅模板一行四格，手机不提供拖拽", () => {
  const canvas = reviewCanvasTemplate();
  const labels = canvas.nodes.map((node) => node.text ?? node.file ?? node.label);
  assert.deepEqual(labels, ["第 1 行", "旁白：今天先看这一镜", "静帧.png", "评论：写在这里", "回复：待回复"]);
  assert.deepEqual(
    canvas.edges.map((edge) => edge.fromNode),
    ["row1-narration", "row1-still", "row1-comment"],
  );
  const file = buildReviewCanvasFile("Ab_1");
  assert.equal(file.relative, "视频审阅/审阅-ab1.canvas");
  assert.equal(parseCanvas(file.text).ok, true);
  assert.equal(canvasEditOffered("web"), true);
  assert.equal(canvasEditOffered("ios"), false);
  assert.equal(canvasEditOffered("android"), false);
  assert.equal(nextZoom(1, "reset"), 1);
  assert.ok(nextZoom(1, "in") > 1);
  assert.ok(nextZoom(0.4, "out") >= 0.4);
  const flow = edgesFromFlow([{ id: "e", source: "a", target: "b", sourceHandle: "right", targetHandle: "left" }]);
  assert.equal(flow[0]?.fromSide, "right");
});
