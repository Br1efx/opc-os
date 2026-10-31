import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { formatItem } from "./report.mjs";
import { repoRoot } from "./root.mjs";
import { extractSpecifiers } from "./source-text.mjs";

const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

export function listSourceFiles(root) {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      const rel = path.relative(root, abs).split(path.sep).join("/");
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile()) files.push({ path: rel });
    }
  }
  walk(root);
  return files;
}

export function checkBoundary(files, config) {
  const errors = [];
  const prefix = `${config.pluginRoot}/`;
  const topLevel = new Set();
  const moduleSeen = new Set();
  for (const file of files) {
    if (!file.path.startsWith(prefix)) continue;
    const rest = file.path.slice(prefix.length);
    const [head, ...tail] = rest.split("/");
    topLevel.add(head);
    if (head !== "modules") continue;
    if (tail.length === 0) {
      errors.push(`${file.path} 不应直接放在 modules/ 下`);
      continue;
    }
    const moduleId = tail[0];
    moduleSeen.add(moduleId);
    if (!config.modules.includes(moduleId)) {
      errors.push(`${file.path} 不在已声明的模块目录里`);
      continue;
    }
    const ext = path.posix.extname(tail[tail.length - 1]);
    if (!config.moduleAllowedExtensions.includes(ext)) {
      errors.push(`${file.path} 的扩展名是 ${ext || "无"}。模块目录只允许 ${config.moduleAllowedExtensions.join(", ")}`);
    }
  }

  for (const name of config.requiredTopLevel) {
    if (!topLevel.has(name)) errors.push(`缺少 ${config.pluginRoot}/${name}`);
  }
  for (const name of topLevel) {
    if (!isAllowedTopLevel(name, config)) errors.push(`未声明的插件顶层条目：${config.pluginRoot}/${name}`);
  }
  for (const moduleId of config.modules) {
    if (!moduleSeen.has(moduleId)) errors.push(`缺少模块目录 ${config.pluginRoot}/modules/${moduleId}`);
  }

  for (const file of files) {
    if (typeof file.source !== "string") continue;
    if (!CODE_EXT.has(path.posix.extname(file.path))) continue;
    for (const spec of extractSpecifiers(file.source)) {
      const violation = importViolation(file.path, spec, config.pluginRoot);
      if (violation) errors.push(`${file.path}：${violation}（${spec}）`);
    }
  }
  return errors;
}

export function scanBoundary(root) {
  const config = JSON.parse(
    fs.readFileSync(path.join(root, "config/directory-boundary.json"), "utf8"),
  );
  const files = listSourceFiles(root).map((file) => {
    const ext = path.posix.extname(file.path);
    const inScope = file.path.startsWith("packages/") || file.path.startsWith("plugins/");
    if (!inScope || !CODE_EXT.has(ext)) return file;
    return { ...file, source: fs.readFileSync(path.join(root, file.path), "utf8") };
  });
  const errors = checkBoundary(files, config);
  return {
    ok: errors.length === 0,
    detail: errors.length === 0 ? "插件顶层、模块目录和 import 方向都在声明范围内。" : errors.join("\n"),
  };
}

function isAllowedTopLevel(name, config) {
  if (config.requiredTopLevel.includes(name)) return true;
  if (config.optionalTopLevel.includes(name)) return true;
  return config.optionalPatterns.some((pattern) => new RegExp(pattern).test(name));
}

export function importViolation(fromFile, spec, pluginRoot) {
  const resolved = spec.startsWith(".") ? resolveRelative(fromFile, spec) : null;
  const fromPlugin = pluginOf(fromFile);
  const toPlugin = resolved ? pluginOf(resolved) : null;
  if (fromPlugin && toPlugin && fromPlugin !== toPlugin) return "插件不能引用另一个插件";

  if (fromFile.startsWith("packages/")) {
    if (
      spec === "opc-core" ||
      spec.startsWith("opc-core/") ||
      spec === "@opc-os/opc-core" ||
      spec.startsWith("@opc-os/opc-core/") ||
      spec.startsWith("plugins/") ||
      spec.includes("/plugins/") ||
      resolved?.startsWith("plugins/")
    ) {
      return "packages 不能引用 plugins";
    }
  }

  const area = areaOf(pluginRoot, fromFile);
  const target = resolved ? areaOf(pluginRoot, resolved) : null;
  if (area === "client") {
    if (spec.startsWith("@getpaseo/plugin/server")) return "界面端不能引用服务端 SDK";
    if (target === "server") return "界面端不能引用服务端文件";
  }
  if (area === "server" || area === "shared") {
    if (spec === "react-native" || spec.startsWith("react-native/")) return "服务端或 shared 不能引用 react-native";
    if (spec.startsWith("@getpaseo/plugin/client")) return "服务端或 shared 不能引用界面端 SDK";
    if (target === "client") return "服务端或 shared 不能引用界面端文件";
  }
  if (area === "shared") {
    if (spec.startsWith("@getpaseo/plugin/server")) return "shared 不能引用服务端 SDK";
    if (target === "server") return "shared 不能引用服务端文件";
  }
  return null;
}

function resolveRelative(fromFile, spec) {
  return path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
}

function pluginOf(filePath) {
  const parts = filePath.split("/");
  if (parts[0] !== "plugins" || !parts[1]) return null;
  return parts[1];
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = scanBoundary(repoRoot);
  console.log(formatItem({ title: "目录边界", disposition: result.ok ? "pass" : "fail", detail: result.detail }));
  process.exit(result.ok ? 0 : 1);
}
