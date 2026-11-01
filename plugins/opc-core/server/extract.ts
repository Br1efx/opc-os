import { Defuddle } from "defuddle/node";
import { parseHTML } from "linkedom";
import { externalPlainText } from "../shared/collect";

/** 抽出正文。失败时去掉标记，仍把剩下的文字当数据。 */
export async function extractArticle(html: string): Promise<{ title: string; text: string }> {
  const fallback = externalPlainText(html);
  try {
    const parsed = parseHTML(html);
    const result = await Defuddle(parsed.document as never, undefined, { markdown: true });
    const text = externalPlainText(typeof result.content === "string" ? result.content : "");
    const title = typeof result.title === "string" ? result.title.trim() : "";
    if (text) return { title, text };
  } catch {
    // 抽不出就用去掉标记后的正文。
  }
  return { title: "", text: fallback };
}
