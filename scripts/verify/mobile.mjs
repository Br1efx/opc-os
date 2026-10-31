import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { formatItem } from "./report.mjs";
import { repoRoot } from "./root.mjs";

export function classifyMobile(facts) {
  const missing = [];
  if (!facts.clientEntry) missing.push("缺少 plugins/opc-core/index.client.tsx");
  if (!facts.homeScreen) missing.push("缺少 plugins/opc-core/client/home.tsx");
  if (!facts.reactNativeDeclared) missing.push("plugins/opc-core/package.json 未声明 react-native");
  if (missing.length > 0) return { disposition: "fail", lines: missing };
  if (!facts.paseoOnPath) {
    return {
      disposition: "deferred",
      lines: [
        "未执行手机端打包。PATH 上没有 paseo，这里也没有 React Native 原生打包工具链。",
        "入口文件和 react-native 依赖声明已核对，这不代替打包。",
      ],
    };
  }
  return {
    disposition: "fail",
    lines: [
      "检测到 paseo，但仓库还没有接上真实打包命令。",
      "找到二进制不会被记成打包通过。",
    ],
  };
}

export function exitCodeForMobile(disposition) {
  if (disposition === "pass") return 0;
  if (disposition === "deferred") return 2;
  return 1;
}

export function collectMobileFacts(root, env = process.env) {
  const pluginDir = path.join(root, "plugins/opc-core");
  let reactNativeDeclared = false;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(pluginDir, "package.json"), "utf8"));
    reactNativeDeclared = Boolean(pkg.devDependencies?.["react-native"] || pkg.dependencies?.["react-native"]);
  } catch {
    reactNativeDeclared = false;
  }
  return {
    clientEntry: fs.existsSync(path.join(pluginDir, "index.client.tsx")),
    homeScreen: fs.existsSync(path.join(pluginDir, "client/home.tsx")),
    reactNativeDeclared,
    paseoOnPath: paseoOnPath(env),
  };
}

export function inspectMobile(root, env = process.env) {
  return classifyMobile(collectMobileFacts(root, env));
}

function paseoOnPath(env) {
  const parts = (env.PATH ?? "").split(path.delimiter).filter(Boolean);
  return parts.some((dir) => {
    return fs.existsSync(path.join(dir, "paseo")) || fs.existsSync(path.join(dir, "paseo.exe"));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = inspectMobile(repoRoot);
  console.log(
    formatItem({
      title: "手机端打包",
      disposition: result.disposition,
      detail: result.lines.join("\n"),
    }),
  );
  const code = exitCodeForMobile(result.disposition);
  if (code === 2) console.log("退出码 2：手机端打包没有执行，这不是通过。");
  process.exit(code);
}
