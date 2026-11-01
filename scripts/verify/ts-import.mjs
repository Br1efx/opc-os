/**
 * 单测用：运行时文件按 Paseo 的写法不带 .ts 后缀，Node 仍要能加载它们。
 */
export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith(".") || /\.(?:mjs|cjs|js|json|node|ts|tsx|mts)$/.test(specifier)) {
    return nextResolve(specifier, context);
  }
  for (const ext of [".ts", ".tsx", ".mts"]) {
    try {
      return await nextResolve(`${specifier}${ext}`, context);
    } catch {
      // 下一个后缀
    }
  }
  return nextResolve(specifier, context);
}
