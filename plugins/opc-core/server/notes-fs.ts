import fs from "node:fs/promises";
import path from "node:path";
import type { NoteFiles } from "../shared/notes";

const SKIP_DIRECTORIES = new Set(["node_modules", ".git", "dist", "build", "coverage", ".opc"]);
const MAX_FILES = 400;
const MAX_BYTES = 1_000_000;

export function shouldSkipDir(name: string): boolean {
  return SKIP_DIRECTORIES.has(name);
}

export function isBroadRoot(root: string): boolean {
  if (!root.trim()) return true;
  const resolved = path.resolve(root);
  return resolved === path.parse(resolved).root;
}

export function isMarkdownFile(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  return extension === ".md" || extension === ".markdown";
}

/** 只允许工作区里面的 Markdown。绝对路径如果跳出工作区，就拒绝。 */
export function resolveNotePath(cwd: string, input: string): string | null {
  if (!cwd.trim() || input.includes("\0")) return null;
  const base = path.resolve(cwd);
  const absolute = path.resolve(base, input);
  const relative = path.relative(base, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  if (!isMarkdownFile(absolute)) return null;
  return absolute;
}

export function createNodeNoteFiles(): NoteFiles {
  return {
    async read(filePath) {
      try {
        const stat = await fs.lstat(filePath);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) return null;
        return { text: await fs.readFile(filePath, "utf8") };
      } catch {
        return null;
      }
    },
    async write(filePath, text, expected) {
      if (!isMarkdownFile(filePath)) return "missing";
      if (expected === null) {
        try {
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          const handle = await fs.open(filePath, "wx");
          try {
            await handle.writeFile(text, "utf8");
          } finally {
            await handle.close();
          }
          return "ok";
        } catch {
          return "conflict";
        }
      }
      try {
        const current = await fs.readFile(filePath, "utf8");
        if (current !== expected) return "conflict";
        if (current !== text) await fs.writeFile(filePath, text, "utf8");
        return "ok";
      } catch {
        return "missing";
      }
    },
    async listMarkdown(root) {
      if (isBroadRoot(root)) return [];
      const found: string[] = [];
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
          if (entry.isSymbolicLink()) continue;
          const absolute = path.join(directory, entry.name);
          if (entry.isDirectory()) {
            if (shouldSkipDir(entry.name)) continue;
            await walk(absolute);
            continue;
          }
          if (entry.isFile() && isMarkdownFile(entry.name)) found.push(absolute);
        }
      }
      await walk(path.resolve(root));
      return found;
    },
  };
}
