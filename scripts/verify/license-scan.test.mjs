import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { decideDependency, scanLicenses } from "./license-scan.mjs";
import { repoRoot } from "./root.mjs";

const policy = JSON.parse(fs.readFileSync(new URL("../../config/license-policy.json", import.meta.url), "utf8"));

test("GPL、缺失许可和未列出的 CC-BY 失败", () => {
  assert.equal(decideDependency({ name: "x", version: "1.0.0", license: "AGPL-3.0-only" }, policy).ok, false);
  assert.equal(decideDependency({ name: "x", version: "1.0.0", license: "GPL-2.0-only" }, policy).ok, false);
  assert.equal(decideDependency({ name: "x", version: "1.0.0" }, policy).ok, false);
  assert.equal(decideDependency({ name: "data", version: "1.0.0", license: "CC-BY-4.0" }, policy).ok, false);
  assert.equal(
    decideDependency({ name: "x", version: "1.0.0", license: "(MIT OR GPL-3.0-only)" }, policy).ok,
    true,
  );
});

test("钉死版本的例外只接受记录中的声明", () => {
  const paseo = decideDependency({ name: "@getpaseo/plugin", version: "0.14.0" }, policy);
  assert.equal(paseo.ok, true);
  assert.equal(paseo.via, "exception");
  assert.equal(decideDependency({ name: "@getpaseo/plugin", version: "0.15.0" }, policy).ok, false);
  assert.equal(
    decideDependency({ name: "@getpaseo/plugin", version: "0.14.0", license: "GPL-3.0-only" }, policy).ok,
    false,
  );

  const caniuse = decideDependency(
    { name: "caniuse-lite", version: "1.0.30001820", license: "CC-BY-4.0" },
    policy,
  );
  assert.equal(caniuse.ok, true);
  assert.equal(caniuse.via, "exception");
  assert.equal(
    decideDependency({ name: "caniuse-lite", version: "9.9.9", license: "CC-BY-4.0" }, policy).ok,
    false,
  );
});

test("本仓库已安装的依赖满足许可策略", () => {
  const result = scanLicenses(repoRoot);
  assert.equal(result.ok, true, result.detail);
});
