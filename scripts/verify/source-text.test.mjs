import assert from "node:assert/strict";
import test from "node:test";
import { extractSpecifiers } from "./source-text.mjs";

test("忽略注释里的 import，保留真实说明符", () => {
  const source = `
    // import "commented";
    import type { A } from "@getpaseo/plugin/client";
    import { readFile } from "node:fs";
    const url = "https://example.com/not-an-import";
    export { x } from "./local";
  `;
  assert.deepEqual(extractSpecifiers(source), [
    "@getpaseo/plugin/client",
    "node:fs",
    "./local",
  ]);
});
