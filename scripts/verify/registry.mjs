import fs from "node:fs";
import path from "node:path";

const ID_SEGMENT = "[a-z0-9]+(?:-[a-z0-9]+)*";
const REGISTRY_ID = new RegExp(`^${ID_SEGMENT}/${ID_SEGMENT}$`);
const FULL_SHA = /^[0-9a-f]{40,64}$/;
const SECRET_TEXT = /bearer\s+\S+|ghp_[A-Za-z0-9]+|github_pat_\S+|sk-[A-Za-z0-9]|api[_-]?key|password\s*[:=]/i;

const DETAIL_ONLY = new Set(["readme", "overviewTranslations"]);

/**
 * Paseo 0.14 安装文档只强制 id 与 artifact。
 * 见 packages/server/.../managed-source/registry.ts 的 RegistryInstallDocumentSchema。
 */
export function installDocumentErrors(doc) {
  const errors = [];
  if (typeof doc?.id !== "string" || !REGISTRY_ID.test(doc.id)) {
    errors.push("id 必须是小写的 owner/slug");
  }
  const artifact = doc?.artifact;
  if (!artifact || artifact.kind !== "git") {
    errors.push("artifact.kind 必须是 git");
    return errors;
  }
  if (typeof artifact.remote !== "string" || artifact.remote.trim() === "") {
    errors.push("artifact.remote 不能为空");
  }
  if (typeof artifact.commit !== "string" || !FULL_SHA.test(artifact.commit)) {
    errors.push("artifact.commit 必须是 40 到 64 位小写 SHA");
  }
  if (artifact.pluginPath != null) {
    if (typeof artifact.pluginPath !== "string" || artifact.pluginPath === "" || /[\\:]/.test(artifact.pluginPath)) {
      errors.push("artifact.pluginPath 不能包含反斜杠或冒号");
    }
  }
  return errors;
}

export function scanRegistry(root) {
  const errors = [];
  const registryDir = path.join(root, "registry");
  const indexPath = path.join(registryDir, "index.json");
  const index = readJson(indexPath, errors, "registry/index.json");
  if (!index) return { ok: false, detail: errors.join("\n") };

  if (index.schemaVersion !== 1) errors.push("index.json 的 schemaVersion 必须是 1");
  const base = index.registry?.url;
  if (typeof base !== "string" || !base.startsWith("https://") || base.includes("@")) {
    errors.push("index.json 的 registry.url 必须是不含账号的 https 地址");
  }
  if (!Array.isArray(index.plugins) || index.plugins.length === 0) {
    errors.push("index.json 至少要有一条插件");
  }

  const pluginsDir = path.join(registryDir, "plugins");
  const details = listDetailFiles(pluginsDir);
  if (details.length === 0) errors.push("registry/plugins 下没有 <owner>/<slug>.json");

  for (const file of details) {
    const rel = path.relative(root, file.path).split(path.sep).join("/");
    const text = fs.readFileSync(file.path, "utf8");
    if (SECRET_TEXT.test(text)) errors.push(`${rel} 里有像密钥的文本`);
    const doc = readJson(file.path, errors, rel);
    if (!doc) continue;
    for (const message of installDocumentErrors(doc)) errors.push(`${rel}：${message}`);
    const [owner, slug] = String(doc.id ?? "").split("/");
    if (file.owner !== owner || file.slug !== slug) {
      errors.push(`${rel} 的路径必须是 plugins/${doc.id}.json`);
    }
    if (doc.artifact?.pluginPath !== "plugins/opc-core" && doc.id === "br1efx/opc-core") {
      errors.push(`${rel} 的 pluginPath 必须是 plugins/opc-core`);
    }
    const listed = (index.plugins ?? []).find((item) => item.id === doc.id);
    if (!listed) {
      errors.push(`${rel} 没有出现在 index.json`);
      continue;
    }
    const fromDetail = { ...doc };
    for (const key of DETAIL_ONLY) delete fromDetail[key];
    if (JSON.stringify(listed) !== JSON.stringify(fromDetail)) {
      errors.push(`${rel} 与 index.json 里的同名条目不一致`);
    }
  }

  const indexText = fs.readFileSync(indexPath, "utf8");
  if (SECRET_TEXT.test(indexText)) errors.push("registry/index.json 里有像密钥的文本");

  return {
    ok: errors.length === 0,
    detail: errors.length === 0 ? "registry JSON 符合 Paseo 0.14 安装所需字段。" : errors.join("\n"),
  };
}

function listDetailFiles(pluginsDir) {
  if (!fs.existsSync(pluginsDir)) return [];
  const found = [];
  for (const ownerEntry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!ownerEntry.isDirectory()) continue;
    const ownerDir = path.join(pluginsDir, ownerEntry.name);
    for (const fileEntry of fs.readdirSync(ownerDir, { withFileTypes: true })) {
      if (!fileEntry.isFile() || !fileEntry.name.endsWith(".json")) continue;
      found.push({
        path: path.join(ownerDir, fileEntry.name),
        owner: ownerEntry.name,
        slug: fileEntry.name.slice(0, -".json".length),
      });
    }
  }
  return found;
}

function readJson(file, errors, label) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`${label} 不是合法 JSON：${message}`);
    return null;
  }
}
