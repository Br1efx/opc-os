/** 去掉注释，保留字符串，避免把说明文字当成 import。 */
export function stripComments(source) {
  let out = "";
  let i = 0;
  let quote = null;
  while (i < source.length) {
    const current = source[i];
    const next = source[i + 1];
    if (quote) {
      out += current;
      if (current === "\\" && i + 1 < source.length) {
        out += source[i + 1];
        i += 2;
        continue;
      }
      if (current === quote) quote = null;
      i += 1;
      continue;
    }
    if (current === '"' || current === "'" || current === "`") {
      quote = current;
      out += current;
      i += 1;
      continue;
    }
    if (current === "/" && next === "/") {
      i += 2;
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }
    if (current === "/" && next === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += current;
    i += 1;
  }
  return out;
}

/** 取出 import / export from / require / import() 的模块说明符。 */
export function extractSpecifiers(source) {
  const text = stripComments(source);
  const specs = [];
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) specs.push(match[1]);
  }
  return specs;
}
