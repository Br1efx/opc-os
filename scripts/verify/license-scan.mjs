import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { formatItem } from "./report.mjs";
import { repoRoot } from "./root.mjs";
import { evaluateSpdx } from "./spdx.mjs";

const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);

export function declaredLicense(pkg) {
  if (typeof pkg.license === "string" && pkg.license.trim() !== "") return pkg.license.trim();
  if (pkg.license && typeof pkg.license === "object" && typeof pkg.license.type === "string") {
    const type = pkg.license.type.trim();
    if (type !== "") return type;
  }
  if (Array.isArray(pkg.licenses) && pkg.licenses.length > 0) {
    const parts = pkg.licenses
      .map((item) => (typeof item === "string" ? item : item?.type))
      .filter((item) => typeof item === "string" && item.trim() !== "");
    if (parts.length > 0) return parts.join(" OR ");
  }
  return null;
}

/**
 * 声明本身已在允许列表里则通过。
 * 否则只接受 config 里钉死 name + version + declared 的例外。
 */
export function decideDependency(pkg, policy) {
  const declared = declaredLicense(pkg);
  const evaluated = declared
    ? evaluateSpdx(declared, policy.allow, policy.allowedExceptions ?? [])
    : null;
  if (evaluated?.ok) return { ok: true, via: "allow", declared };

  const exception = (policy.exceptions ?? []).find(
    (item) => item.name === pkg.name && item.version === pkg.version,
  );
  if (!exception) {
    return {
      ok: false,
      via: "reject",
      declared,
      reason: evaluated?.reason ?? "无许可字段",
    };
  }
  const expected = exception.declared ?? null;
  if (expected !== declared) {
    return {
      ok: false,
      via: "exception-mismatch",
      declared,
      reason: `例外 ${pkg.name}@${pkg.version} 记录的声明是 ${formatDeclared(expected)}，实际是 ${formatDeclared(declared)}`,
    };
  }
  if (exception.accept === true) {
    return { ok: true, via: "exception", declared, reason: exception.reason };
  }
  const treated = evaluateSpdx(
    exception.treatAs,
    policy.allow,
    policy.allowedExceptions ?? [],
  );
  if (!treated.ok) return { ok: false, via: "exception", declared, reason: treated.reason };
  return { ok: true, via: "exception", declared, reason: exception.reason };
}

export function checkFirstParty(pkg) {
  if (pkg.license !== "MIT") {
    return { ok: false, reason: `${pkg.name} 必须是 MIT，实际是 ${pkg.license ?? "无"}` };
  }
  return { ok: true };
}

export function listInstalledPackages(nodeModulesDir) {
  const store = path.join(nodeModulesDir, ".pnpm");
  if (!fs.existsSync(store)) return [];
  const found = new Map();
  for (const entry of fs.readdirSync(store, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const modules = path.join(store, entry.name, "node_modules");
    if (!fs.existsSync(modules)) continue;
    for (const name of fs.readdirSync(modules)) {
      if (name.startsWith(".")) continue;
      const base = path.join(modules, name);
      const dirs = name.startsWith("@") ? scopedDirs(base) : [base];
      for (const dir of dirs) {
        const pkg = readPackageJson(path.join(dir, "package.json"));
        if (!pkg?.name || !pkg.version) continue;
        const key = `${pkg.name}@${pkg.version}`;
        if (!found.has(key)) found.set(key, pkg);
      }
    }
  }
  return [...found.values()];
}

export function workspacePackages(root) {
  const files = [
    path.join(root, "package.json"),
    ...packageJsonFiles(path.join(root, "packages")),
    ...packageJsonFiles(path.join(root, "plugins")),
  ];
  return files.map((file) => readPackageJson(file)).filter(Boolean);
}

export function scanLicenses(root) {
  const nodeModules = path.join(root, "node_modules");
  if (!fs.existsSync(nodeModules)) {
    return {
      ok: false,
      detail: "没有 node_modules。许可证扫描没有执行，不能算通过。请先 pnpm install。",
    };
  }
  const policy = JSON.parse(fs.readFileSync(path.join(root, "config/license-policy.json"), "utf8"));
  const installed = listInstalledPackages(nodeModules);
  if (installed.length === 0) {
    return { ok: false, detail: "node_modules/.pnpm 里没有包。许可证扫描没有执行，不能算通过。" };
  }
  const failures = [];
  const exceptions = [];
  for (const pkg of installed) {
    const decision = decideDependency(pkg, policy);
    if (!decision.ok) failures.push(`${pkg.name}@${pkg.version}: ${decision.reason}`);
    else if (decision.via === "exception") {
      exceptions.push(`${pkg.name}@${pkg.version}：${decision.reason}`);
    }
  }
  for (const pkg of workspacePackages(root)) {
    const decision = checkFirstParty(pkg);
    if (!decision.ok) failures.push(decision.reason);
  }
  const lines = [
    `${installed.length} 个已安装的包。`,
    exceptions.length > 0 ? `版本钉死的例外 ${exceptions.length} 个，理由写在 config/license-policy.json。` : "",
    ...exceptions,
    ...failures.slice(0, 40),
    failures.length > 40 ? `另有 ${failures.length - 40} 条。` : "",
  ].filter(Boolean);
  return { ok: failures.length === 0, detail: lines.join("\n") };
}

function formatDeclared(value) {
  return value ?? "无";
}

function scopedDirs(base) {
  if (!fs.existsSync(base)) return [];
  return fs
    .readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => path.join(base, entry.name));
}

function packageJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...packageJsonFiles(abs));
    else if (entry.name === "package.json") files.push(abs);
  }
  return files;
}

function readPackageJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = scanLicenses(repoRoot);
  console.log(formatItem({ title: "许可证扫描", disposition: result.ok ? "pass" : "fail", detail: result.detail }));
  process.exit(result.ok ? 0 : 1);
}
