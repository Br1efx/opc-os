import fs from "node:fs";
import { isBuiltin } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { formatItem } from "./report.mjs";
import { repoRoot } from "./root.mjs";
import { extractSpecifiers } from "./source-text.mjs";

const CODE_EXT = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const ENTRY_NAMES = ["index.client.ts", "index.client.tsx", "index.server.ts", "index.server.tsx"];
const HOST_SPECIFIER =
  /^(?:@getpaseo\/plugin|@paseo\/plugin|zod|react|react-dom|react-native|@tanstack\/react-query)(?:\/|$)/;

/**
 * Paseo 0.14 的编译器会从插件入口顺着 import / export from 往下走。
 * 一旦走进 `shared/`，之后的传递依赖都按 shared bundle 检查，Node 内置模块直接失败。
 * 服务端文件里的 `node:` 允许保留。这和 compiler-build.ts 的 owner 规则一致：
 * 只有当前文件在 shared/ 时 owner 才变成 shared，插件目录外的包继承调用方的 owner。
 */
export function findSharedNodeImports({ pluginRoot, entries, read, resolve }) {
  const violations = [];
  const seen = new Set();
  const queue = [];
  for (const entry of entries) {
    const owner = entryOwner(pluginRoot, entry);
    if (owner) queue.push({ file: entry, owner, sharedFile: null });
  }
  while (queue.length > 0) {
    const current = queue.pop();
    const key = `${current.owner}:${current.file}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const source = read(current.file);
    if (typeof source !== "string") continue;
    const owner = areaOf(pluginRoot, current.file) === "shared" ? "shared" : current.owner;
    const sharedFile = owner === "shared" ? current.sharedFile ?? current.file : current.sharedFile;
    for (const specifier of extractSpecifiers(source)) {
      if (owner === "shared" && isNodeModuleSpecifier(specifier)) {
        violations.push({
          specifier,
          importer: current.file,
          sharedFile: sharedFile ?? current.file,
        });
        continue;
      }
      const resolved = resolve(specifier, current.file);
      if (!resolved || resolved === current.file) continue;
      queue.push({ file: resolved, owner, sharedFile });
    }
  }
  return violations;
}

export function scanSharedBundle(root) {
  const packages = loadWorkspacePackages(root);
  const violations = [];
  for (const pluginRoot of listPluginRoots(root)) {
    const entries = ENTRY_NAMES.map((name) => `${pluginRoot}/${name}`).filter((rel) =>
      fs.existsSync(path.join(root, rel)),
    );
    violations.push(
      ...findSharedNodeImports({
        pluginRoot,
        entries,
        read: (rel) => readIfCode(root, rel),
        resolve: (specifier, fromRel) => resolveSpecifier(root, packages, specifier, fromRel),
      }),
    );
  }
  const detail =
    violations.length === 0
      ? "从插件入口走到 shared/ 的依赖图里没有 Node 内置模块。服务端 bundle 仍可使用 node:。"
      : violations.map(formatViolation).join("\n");
  return { ok: violations.length === 0, violations, detail };
}

export function formatViolation(violation) {
  return `shared bundle 不能引用 Node 内置 ${violation.specifier}（${violation.importer}）。这条边从 ${violation.sharedFile} 走进 shared 图。`;
}

function entryOwner(pluginRoot, file) {
  const area = areaOf(pluginRoot, file);
  if (area === "client" || area === "server") return area;
  return null;
}

function areaOf(pluginRoot, filePath) {
  const prefix = `${pluginRoot}/`;
  if (!filePath.startsWith(prefix)) return null;
  const rest = filePath.slice(prefix.length);
  if (rest === "index.client.tsx" || rest === "index.client.ts" || rest.startsWith("client/")) return "client";
  if (rest === "index.server.ts" || rest === "index.server.tsx" || rest.startsWith("server/")) return "server";
  if (rest.startsWith("shared/")) return "shared";
  return null;
}

function isNodeModuleSpecifier(specifier) {
  return isBuiltin(specifier) || specifier === "@types/node";
}

function listPluginRoots(root) {
  const base = path.join(root, "plugins");
  if (!fs.existsSync(base)) return [];
  return fs
    .readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `plugins/${entry.name}`)
    .filter((rel) => ENTRY_NAMES.some((name) => fs.existsSync(path.join(root, rel, name))));
}

function loadWorkspacePackages(root) {
  const packages = new Map();
  for (const dir of ["packages", "plugins"]) {
    const base = path.join(root, dir);
    if (!fs.existsSync(base)) continue;
    for (const name of fs.readdirSync(base)) {
      const manifestPath = path.join(base, name, "package.json");
      if (!fs.existsSync(manifestPath)) continue;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (typeof manifest.name === "string") packages.set(manifest.name, path.join(base, name));
    }
  }
  return packages;
}

function readIfCode(root, rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
  if (!CODE_EXT.has(path.posix.extname(rel))) return null;
  return fs.readFileSync(abs, "utf8");
}

function resolveSpecifier(root, packages, specifier, fromRel) {
  if (specifier.startsWith(".")) return resolveRelative(root, fromRel, specifier);
  if (isNodeModuleSpecifier(specifier) || HOST_SPECIFIER.test(specifier)) return null;
  return resolveWorkspacePackage(root, packages, specifier);
}

function resolveRelative(root, fromRel, specifier) {
  const raw = posixNormalize(path.posix.join(path.posix.dirname(fromRel), specifier));
  return existingCode(root, raw);
}

function resolveWorkspacePackage(root, packages, specifier) {
  let match = null;
  for (const [name, dir] of packages) {
    if (specifier !== name && !specifier.startsWith(`${name}/`)) continue;
    if (!match || name.length > match.name.length) match = { name, dir };
  }
  if (!match) return null;
  const manifest = JSON.parse(fs.readFileSync(path.join(match.dir, "package.json"), "utf8"));
  const subpath = specifier === match.name ? "." : `.${specifier.slice(match.name.length)}`;
  const target = exportTarget(manifest.exports, subpath) ?? (subpath === "." ? manifest.main ?? null : subpath.slice(1));
  if (typeof target !== "string") return null;
  const rel = posixNormalize(path.posix.join(toPosix(root, match.dir), target));
  return existingCode(root, rel);
}

function exportTarget(exportsField, subpath) {
  if (typeof exportsField === "string") return subpath === "." ? exportsField : null;
  if (!exportsField || typeof exportsField !== "object" || Array.isArray(exportsField)) return null;
  if (!Object.hasOwn(exportsField, subpath)) return null;
  const value = exportsField[subpath];
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  return value.default || value.import || value.require || value.types || null;
}

function existingCode(root, rel) {
  const candidates = [rel];
  if (rel.endsWith(".js")) candidates.push(rel.slice(0, -3) + ".ts", rel.slice(0, -3) + ".tsx");
  if (!path.posix.extname(rel)) {
    for (const ext of [".ts", ".tsx", ".mts", ".js", ".mjs"]) candidates.push(rel + ext);
    for (const ext of [".ts", ".tsx", ".js"]) candidates.push(`${rel}/index${ext}`);
  }
  for (const candidate of candidates) {
    const abs = path.join(root, candidate);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile() && CODE_EXT.has(path.posix.extname(candidate))) {
      return candidate;
    }
  }
  return null;
}

function toPosix(root, abs) {
  return path.relative(root, abs).split(path.sep).join("/");
}

function posixNormalize(value) {
  const parts = [];
  for (const part of value.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = scanSharedBundle(repoRoot);
  console.log(
    formatItem({
      title: "shared bundle",
      disposition: result.ok ? "pass" : "fail",
      detail: result.detail,
    }),
  );
  process.exit(result.ok ? 0 : 1);
}
