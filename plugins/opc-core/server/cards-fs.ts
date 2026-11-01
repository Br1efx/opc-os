import fs from "node:fs/promises";
import path from "node:path";
import { CARDS_ROOT, VIEWS_DIR, type CardFiles } from "../shared/cards";

const MAX_BYTES = 1_000_000;

export function createNodeCardFiles(root = CARDS_ROOT): CardFiles {
  return {
    async listCards() {
      return readDir(root, (name) => name.endsWith(".md") && !name.startsWith("."));
    },
    async writeCard(name, text) {
      return writeInside(root, name, text, (fileName) => fileName.endsWith(".md"));
    },
    async listViews() {
      return readDir(path.join(root, VIEWS_DIR), (name) => /\.(?:yaml|yml|json)$/.test(name));
    },
    async writeView(name, text) {
      return writeInside(path.join(root, VIEWS_DIR), name, text, (fileName) => /\.(?:yaml|yml|json)$/.test(fileName));
    },
  };
}

export function resolveInside(root: string, name: string): string | null {
  if (!name || name !== path.basename(name) || name.startsWith(".") || name.includes("\0")) return null;
  const base = path.resolve(root);
  const absolute = path.resolve(base, name);
  const relative = path.relative(base, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return absolute;
}

async function readDir(directory: string, accept: (name: string) => boolean): Promise<{ name: string; text: string }[]> {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: { name: string; text: string }[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink() || !entry.isFile() || !accept(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    try {
      const stat = await fs.lstat(absolute);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) continue;
      found.push({ name: entry.name, text: await fs.readFile(absolute, "utf8") });
    } catch {
      // 单张读不到就跳过，别让整面墙空白。
    }
  }
  return found;
}

async function writeInside(
  directory: string,
  name: string,
  text: string,
  accept: (fileName: string) => boolean,
): Promise<"ok" | "error"> {
  if (text.length > MAX_BYTES || !accept(name)) return "error";
  const absolute = resolveInside(directory, name);
  if (!absolute) return "error";
  try {
    await fs.mkdir(directory, { recursive: true });
    try {
      const stat = await fs.lstat(absolute);
      if (stat.isSymbolicLink()) return "error";
    } catch {
      // 还没有这个文件。
    }
    await fs.writeFile(absolute, text, "utf8");
    return "ok";
  } catch {
    return "error";
  }
}
