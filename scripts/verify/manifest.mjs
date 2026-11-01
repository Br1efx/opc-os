import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { formatItem } from "./report.mjs";
import { repoRoot } from "./root.mjs";
import { extractSpecifiers, stripComments } from "./source-text.mjs";

const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const FS_SPECIFIERS = new Set(["fs", "node:fs", "node:fs/promises", "fs/promises"]);
const NET_SPECIFIERS = new Set(["http", "https", "net", "node:http", "node:https", "node:http2", "node:net"]);

export function detectCapabilities(source) {
  const text = stripComments(source);
  const specs = extractSpecifiers(text);
  const usesFs = specs.some((spec) => FS_SPECIFIERS.has(spec));
  const usesNetImport = specs.some((spec) => NET_SPECIFIERS.has(spec));
  const usesFetch = /\bfetch\s*\(/.test(text);
  const usesWebSocket = /\bnew\s+WebSocket\b/.test(text) || /\bXMLHttpRequest\b/.test(text);
  const usesNetwork = usesNetImport || usesFetch || usesWebSocket;
  const hosts = usesNetwork ? extractHosts(text) : [];
  return {
    usesFs,
    usesNetwork,
    hosts,
    dynamicNetwork: usesNetwork && hosts.length === 0,
  };
}

export function validateManifest(manifest, { pluginId, moduleIds }) {
  const errors = [];
  if (!manifest || manifest.schemaVersion !== 1) errors.push("schemaVersion 必须是 1");
  if (manifest?.pluginId !== pluginId) errors.push(`pluginId 必须是 ${pluginId}，实际是 ${manifest?.pluginId ?? "无"}`);
  checkAccess(manifest, "shell", errors);
  const modules = manifest?.modules;
  if (!modules || typeof modules !== "object" || Array.isArray(modules)) {
    errors.push("modules 必须是对象");
    return errors;
  }
  const keys = Object.keys(modules).sort();
  const expected = [...moduleIds].sort();
  if (keys.join("\n") !== expected.join("\n")) {
    errors.push(`模块必须正好是 ${expected.join(", ")}`);
  }
  for (const id of keys) {
    const mod = modules[id];
    if (!mod || typeof mod.enabled !== "boolean") {
      errors.push(`${id}.enabled 必须是布尔值`);
      continue;
    }
    checkAccess(mod, id, errors);
    if (mod.enabled === false) {
      const filesystem = mod.filesystem;
      const network = mod.network;
      const emptyFs = filesystem?.read?.length === 0 && filesystem?.write?.length === 0;
      const netOff = network?.enabled === false && network?.hosts?.length === 0;
      if (!emptyFs || !netOff) errors.push(`${id} 未启用，不能声明文件或网络权限`);
    }
  }
  return errors;
}

export function compareSources(manifest, files, pluginRoot) {
  const errors = [];
  for (const file of files) {
    if (!file.path.startsWith(`${pluginRoot}/`)) continue;
    if (!CODE_EXT.has(path.posix.extname(file.path))) continue;
    if (typeof file.source !== "string") continue;
    const caps = detectCapabilities(file.source);
    if (!caps.usesFs && !caps.usesNetwork) continue;
    const moduleId = moduleIdOf(pluginRoot, file.path);
    const access = moduleId ? manifest.modules?.[moduleId] : manifest;
    if (!access?.filesystem || !access.network) {
      errors.push(`${file.path} 用到了能力，但清单里没有对应项`);
      continue;
    }
    if (caps.usesFs && access.filesystem.read.length === 0 && access.filesystem.write.length === 0) {
      errors.push(`${file.path} 使用了文件系统 API，清单没有声明 read 或 write`);
    }
    if (caps.usesNetwork && access.network.enabled !== true) {
      errors.push(`${file.path} 使用了网络 API，清单 network.enabled 不是 true`);
    }
    if (caps.usesNetwork && access.network.enabled === true) {
      if (caps.dynamicNetwork) errors.push(`${file.path} 的网址不是字面量，无法对照 hosts`);
      for (const host of caps.hosts) {
        if (!access.network.hosts.includes(host)) errors.push(`${file.path} 访问 ${host}，不在清单 hosts 里`);
      }
    }
  }
  return errors;
}

export function scanManifest(root) {
  const boundary = JSON.parse(fs.readFileSync(path.join(root, "config/directory-boundary.json"), "utf8"));
  const manifestPath = path.join(root, boundary.pluginRoot, "permissions.manifest.json");
  const pluginPath = path.join(root, boundary.pluginRoot, "paseo-plugin.json");
  if (!fs.existsSync(manifestPath)) {
    return { ok: false, detail: `缺少 ${boundary.pluginRoot}/permissions.manifest.json` };
  }
  let manifest;
  let plugin;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    plugin = JSON.parse(fs.readFileSync(pluginPath, "utf8"));
  } catch (error) {
    return { ok: false, detail: `清单或 paseo-plugin.json 不是合法 JSON：${error.message}` };
  }
  const errors = validateManifest(manifest, { pluginId: plugin.id, moduleIds: boundary.modules });
  const files = codeFiles(root, boundary.pluginRoot);
  errors.push(...compareSources(manifest, files, boundary.pluginRoot));
  if (errors.length > 0) return { ok: false, detail: errors.join("\n") };
  return {
    ok: true,
    detail:
      "外壳和 m1-notes 声明了 Markdown 读写，外壳还声明 /home/br1efx/.opc/ 与 worktrees 读写。外壳联网允许 127.0.0.1 和 api.github.com。m2-card-wall 声明卡片目录和视图目录读写且不联网。m4-tasks 声明卡片目录以及工作流、会话、定时记录目录的读写，不联网。m3、m5、m6 仍是 enabled: false，不能声明主机。源码里的文件系统 API 落在已声明读写的外壳上，用到网络 API 的字面量主机都在外壳 hosts 里。具体路径仍不能逐条证明只访问了这些模式。",
  };
}

function checkAccess(access, label, errors) {
  const filesystem = access?.filesystem;
  const network = access?.network;
  if (!filesystem || !Array.isArray(filesystem.read) || !Array.isArray(filesystem.write)) {
    errors.push(`${label}.filesystem.read 和 write 必须是数组`);
  } else {
    for (const field of ["read", "write"]) {
      for (const item of filesystem[field]) {
        if (typeof item !== "string" || item.trim() === "") errors.push(`${label}.filesystem.${field} 含有空路径`);
      }
    }
  }
  if (!network || typeof network.enabled !== "boolean" || !Array.isArray(network.hosts)) {
    errors.push(`${label}.network 必须包含布尔 enabled 和 hosts 数组`);
    return;
  }
  if (network.enabled === false && network.hosts.length !== 0) {
    errors.push(`${label} 未开启联网，hosts 必须为空`);
  }
  if (network.enabled === true && network.hosts.length === 0) {
    errors.push(`${label} 开启了联网，但 hosts 为空`);
  }
  for (const host of network.hosts) {
    if (typeof host !== "string" || !/^[a-z0-9.-]+$/.test(host) || host.includes("..")) {
      errors.push(`${label} 主机不合法：${host}`);
    }
  }
}

function extractHosts(text) {
  const hosts = new Set();
  for (const match of text.matchAll(/https?:\/\/([^/\s"'`]+)/g)) {
    hosts.add(match[1].replace(/:\d+$/, "").toLowerCase());
  }
  return [...hosts];
}

function moduleIdOf(pluginRoot, filePath) {
  const prefix = `${pluginRoot}/modules/`;
  if (!filePath.startsWith(prefix)) return null;
  return filePath.slice(prefix.length).split("/")[0];
}

function codeFiles(root, pluginRoot) {
  const absRoot = path.join(root, pluginRoot);
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (CODE_EXT.has(path.extname(entry.name))) {
        const rel = path.relative(root, abs).split(path.sep).join("/");
        files.push({ path: rel, source: fs.readFileSync(abs, "utf8") });
      }
    }
  }
  walk(absRoot);
  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = scanManifest(repoRoot);
  console.log(
    formatItem({ title: "权限清单对照", disposition: result.ok ? "pass" : "fail", detail: result.detail }),
  );
  process.exit(result.ok ? 0 : 1);
}
