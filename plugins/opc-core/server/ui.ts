import fs from "node:fs/promises";
import path from "node:path";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { UI_CONFIG_DIR, UI_CONFIG_FILE, UI_FILE_NAMES, loadUiConfig, panelIdFromEnv, uiSettings, uiSnapshot } from "../shared/ui";

const MAX_BYTES = 256 * 1024;

export type UiFileRead = { ok: true; files: { name: string; text: string }[] } | { ok: false; detail: string };

/** 只读约定目录里的分组文件。符号链接不跟随，避免读到目录外面。 */
export async function readUiConfigFiles(dir: string): Promise<UiFileRead> {
  for (const name of UI_FILE_NAMES) {
    const absolute = path.join(dir, name);
    let stat;
    try {
      stat = await fs.lstat(absolute);
    } catch {
      continue;
    }
    if (stat.isSymbolicLink()) return { ok: false, detail: "分组配置不能是链接" };
    if (!stat.isFile()) continue;
    if (stat.size > MAX_BYTES) return { ok: false, detail: "分组配置太大" };
    try {
      return { ok: true, files: [{ name, text: await fs.readFile(absolute, "utf8") }] };
    } catch {
      return { ok: false, detail: "分组配置读不了" };
    }
  }
  return { ok: true, files: [] };
}

/** 登记界面设置，并让手机经 daemon 读分组文件。不访问网关。 */
export function registerUi(server: PluginServerContext): () => void {
  server.registerSettings(uiSettings);
  server.handle(uiSnapshot, async () => {
    const panel = panelIdFromEnv(process.env);
    const read = await readUiConfigFiles(UI_CONFIG_DIR);
    if (!read.ok) {
      return {
        panel,
        ok: false,
        detail: read.detail,
        source: "builtin" as const,
        fileName: "",
        path: UI_CONFIG_FILE,
        document: loadUiConfig([]).document,
      };
    }
    const loaded = loadUiConfig(read.files);
    return {
      panel,
      ok: loaded.ok,
      detail: loaded.detail,
      source: loaded.source,
      fileName: loaded.fileName,
      path: loaded.fileName ? path.join(UI_CONFIG_DIR, loaded.fileName) : UI_CONFIG_FILE,
      document: loaded.document,
    };
  });
  return () => {};
}
