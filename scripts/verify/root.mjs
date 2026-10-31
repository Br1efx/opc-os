import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** 仓库根目录。脚本位于 scripts/verify/。 */
export const repoRoot = path.resolve(here, "../..");
