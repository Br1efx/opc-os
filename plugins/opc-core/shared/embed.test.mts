import assert from "node:assert/strict";
import test from "node:test";
import { applyEmbedAttributes, embedAttributeList, listEmbeds, previewEmbedHtml } from "./embed.ts";

const note = "前文\n```html\n<p>别运行</p>\n```\n```opc-html\n<p>甲</p>\n```\n";

test("只抽出 opc-html，沙箱只有脚本", () => {
  const embeds = listEmbeds(note);
  assert.equal(embeds.length, 1);
  assert.match(embeds[0]?.html ?? "", /甲/);
  const attrs = embedAttributeList("<p>甲</p>");
  const sandbox = attrs.find((attr) => attr.name === "sandbox");
  assert.equal(sandbox?.value, "allow-scripts");
  const joined = attrs.map((attr) => `${attr.name}=${attr.value}`).join(" ");
  assert.equal(joined.includes("allow-same-origin"), false);
  assert.equal(joined.includes("allow-top-navigation"), false);
  const calls: { name: string; value: string }[] = [];
  applyEmbedAttributes({ setAttribute: (name, value) => calls.push({ name, value }) }, "<p>甲</p>");
  assert.equal(calls.find((call) => call.name === "sandbox")?.value, "allow-scripts");
  assert.equal(calls.some((call) => call.value.includes("allow-same-origin")), false);
});

test("手机预览失败时给出中文降级，并提示到电脑看", () => {
  const fallback = previewEmbedHtml({ ok: false });
  assert.equal(fallback.kind, "fallback");
  assert.equal(fallback.detail, "暂不可预览");
  assert.equal(fallback.hint, "到电脑查看动态");
  const image = previewEmbedHtml({ ok: true, dataUri: "data:image/png;base64,YQ==" });
  assert.equal(image.kind, "image");
  assert.equal(image.hint, "到电脑查看动态");
});
