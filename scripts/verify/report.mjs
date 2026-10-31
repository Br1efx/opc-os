export function formatItem(item) {
  const tag =
    item.disposition === "pass" ? "PASS" : item.disposition === "fail" ? "FAIL" : "DEFERRED";
  const lines = [`${tag}  ${item.title}`];
  if (item.detail) {
    for (const line of item.detail.split("\n")) lines.push(`      ${line}`);
  }
  return lines.join("\n");
}

export function formatSummary(items) {
  const failed = items.filter((item) => item.disposition === "fail").map((item) => item.title);
  const deferred = items
    .filter((item) => item.disposition === "deferred")
    .map((item) => item.title);
  const tail = [];
  tail.push(failed.length === 0 ? "强制项通过。" : `强制项失败：${failed.join("、")}。`);
  if (deferred.length > 0) tail.push(`未执行，不是通过：${deferred.join("、")}。`);
  return `${items.map(formatItem).join("\n")}\n\n${tail.join("\n")}`;
}

/** 只有 FAIL 让总命令失败。DEFERRED 保持非通过，但不改退出码。 */
export function enforcedExitCode(items) {
  return items.some((item) => item.disposition === "fail") ? 1 : 0;
}

export function toMarkdown(items) {
  const rows = items.map((item) => {
    const detail = (item.detail ?? "").replaceAll("\n", " ").replaceAll("|", "/");
    return `| ${item.title} | ${item.disposition} | ${detail} |`;
  });
  return [
    "### verify",
    "",
    "强制项里出现 fail 时，本检查失败。deferred 表示没有执行，不是通过。绿色结果不含手机端打包和性能测量。",
    "",
    "| 项 | 状态 | 说明 |",
    "| --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}
