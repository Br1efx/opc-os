import fs from "node:fs/promises";
import path from "node:path";
import { NOTES_ROOT, isLibraryRelative } from "../shared/collect";

const SKIP_DIRECTORIES = new Set(["node_modules", ".git", "dist", "build", "coverage", ".opc"]);
const MAX_FILES = 300;
const MAX_TEXT = 80_000;

export type LibraryFile = {
  relative: string;
  name: string;
  absolute: string;
  text: string;
};

export type Library = {
  list(): Promise<LibraryFile[]>;
  writeNew(relative: string, text: string): Promise<{ ok: boolean; detail: string }>;
};

export function resolveLibraryPath(root: string, relative: string): string | null {
  if (!isLibraryRelative(relative)) return null;
  const base = path.resolve(root);
  const absolute = path.resolve(base, ...relative.split("/"));
  const back = path.relative(base, absolute);
  if (back.startsWith("..") || path.isAbsolute(back)) return null;
  return absolute;
}

export function createLibrary(root = NOTES_ROOT): Library {
  return {
    async list() {
      const found: LibraryFile[] = [];
      async function walk(directory: string): Promise<void> {
        if (found.length >= MAX_FILES) return;
        let entries;
        try {
          entries = await fs.readdir(directory, { withFileTypes: true });
        } catch {
          return;
        }
        for (const entry of entries) {
          if (found.length >= MAX_FILES) return;
          if (entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
          const absolute = path.join(directory, entry.name);
          if (entry.isDirectory()) {
            if (SKIP_DIRECTORIES.has(entry.name)) continue;
            if (entry.name === "cards" && path.resolve(directory) === path.resolve(root)) continue;
            await walk(absolute);
            continue;
          }
          if (!entry.isFile()) continue;
          const relative = path.relative(root, absolute).split(path.sep).join("/");
          if (!isLibraryRelative(relative)) continue;
          try {
            const raw = await fs.readFile(absolute, "utf8");
            found.push({
              relative,
              name: entry.name,
              absolute,
              text: raw.length > MAX_TEXT ? raw.slice(0, MAX_TEXT) : raw,
            });
          } catch {
            // 读不到的文件不出现在挑选列表里。
          }
        }
      }
      await walk(path.resolve(root));
      found.sort((left, right) => left.relative.localeCompare(right.relative));
      return found;
    },
    async writeNew(relative, text) {
      const absolute = resolveLibraryPath(root, relative);
      if (!absolute) return { ok: false, detail: "这份路径不能写" };
      try {
        await fs.mkdir(path.dirname(absolute), { recursive: true });
        const handle = await fs.open(absolute, "wx");
        try {
          await handle.writeFile(text, "utf8");
        } finally {
          await handle.close();
        }
        return { ok: true, detail: "已写入" };
      } catch {
        return { ok: false, detail: "没写回画布" };
      }
    },
  };
}
