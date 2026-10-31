/** 预期失败：脚手架 tsconfig 没有 DOM，组件文件里不能使用 document。 */
export function readDocumentTitle(): string {
  return document.title;
}
