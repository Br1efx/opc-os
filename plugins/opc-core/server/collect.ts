import type { PluginServerContext, PluginSettings } from "@getpaseo/plugin/server";
import { pathToFileURL } from "node:url";
import { fetchPage } from "@opc-os/page-fetch";
import type { createCardStore } from "../shared/cards";
import { buildReviewCanvasFile, createReviewCanvasRpc } from "../shared/canvas";
import {
  attachmentShouldWrite,
  buildCollectCard,
  collectUrlRpc,
  createWriteMemory,
  ingestCollect,
  matchLibraryQuery,
  searchNotesRpc,
  summarize,
  writeKey,
  type IngestDeps,
} from "../shared/collect";
import { embedPreviewRpc, previewEmbedHtml } from "../shared/embed";
import { shellSettings } from "../shared/shell";
import { shotEmbed } from "./embed-shot";
import { extractArticle } from "./extract";
import { createLibrary, type Library } from "./library-fs";

type CardSink = Pick<ReturnType<typeof createCardStore>, "writeCard">;

export type CollectRuntime = {
  library: Library;
  fetchPage: IngestDeps["fetchPage"];
  extract: IngestDeps["extract"];
  shot(html: string): Promise<{ ok: true; dataUri: string } | { ok: false; detail: string }>;
  clock(): string;
  nonce(): string;
  memory: { once(key: string): boolean; has(key: string): boolean };
};

const SHOWN = 20;

/**
 * 收集走卡片墙那一份 store.writeCard。
 * Telegram、浏览器剪藏和 Grok 转交不在这里听端口。
 */
export function registerCollect(
  server: PluginServerContext,
  settings: PluginSettings<(typeof shellSettings)["schema"]>,
  store: CardSink,
  runtime: CollectRuntime = defaultRuntime(),
): () => void {
  const notesOn = () => moduleOn(settings, "m1-notes");
  const cardsOn = () => moduleOn(settings, "m2-card-wall");

  server.handle(collectUrlRpc, async (input) => {
    if (!(await notesOn())) return { ok: false, detail: "笔记已关闭", id: "" };
    if (!(await cardsOn())) return { ok: false, detail: "卡片墙已关闭", id: "" };
    const result = await ingestCollect(
      {
        port: "slash",
        url: input.url,
        title: input.title,
        tags: input.tags,
        now: input.now,
        nonce: input.nonce,
      },
      deps(store, runtime),
    );
    return { ok: result.ok, detail: result.detail, id: result.id };
  });

  server.handle(searchNotesRpc, async (input) => {
    if (!(await notesOn())) return { items: [] };
    const files = await runtime.library.list();
    const relatives = files.map((file) => file.relative);
    const exact = attachmentShouldWrite(input.query, relatives);
    const now = runtime.clock();
    let wrote = "";
    if (exact && (await cardsOn())) {
      const file = files.find((item) => item.relative === exact);
      const key = writeKey(exact, now);
      if (file && file.text.trim() && !runtime.memory.has(key)) {
        const built = buildCollectCard({
          source: "attachment",
          evidence: file.relative,
          title: file.name,
          summary: summarize(file.text),
          text: file.text,
          tags: [],
          now,
          nonce: runtime.nonce(),
        });
        const written = await store.writeCard(built.card, built.props, built.body);
        if (written.ok) {
          runtime.memory.once(key);
          wrote = exact;
          await runtime.library.writeNew(`收集/${written.id}.md`, built.body);
        }
      } else if (runtime.memory.has(key)) {
        wrote = exact;
      }
    }
    const items = files
      .filter((file) => matchLibraryQuery(file.relative, input.query))
      .slice(0, SHOWN)
      .map((file) => {
        const built = buildCollectCard({
          source: "attachment",
          evidence: file.relative,
          title: file.name,
          summary: summarize(file.text),
          text: file.text,
          tags: [],
          now,
          nonce: "preview",
        });
        return {
          id: file.relative,
          identifier: file.relative,
          title: file.name,
          subtitle: file.relative === wrote ? "已收进收件箱" : "笔记库",
          url: pathToFileURL(file.absolute).href,
          text: built.body,
          resourceType: "笔记",
        };
      });
    return { items };
  });

  server.handle(embedPreviewRpc, async (input) => {
    if (!(await notesOn())) return previewEmbedHtml({ ok: false });
    const shot = await runtime.shot(input.html);
    return previewEmbedHtml(shot.ok ? { ok: true, dataUri: shot.dataUri } : { ok: false });
  });

  server.handle(createReviewCanvasRpc, async (input) => {
    if (!(await notesOn())) return { ok: false, detail: "笔记已关闭", path: "" };
    const file = buildReviewCanvasFile(input.nonce);
    const written = await runtime.library.writeNew(file.relative, file.text);
    if (!written.ok) return { ok: false, detail: "没写回画布", path: "" };
    return { ok: true, detail: "已生成审阅画布", path: file.relative };
  });

  return () => {};
}

function deps(store: CardSink, runtime: CollectRuntime): IngestDeps {
  return {
    fetchPage: (url) => runtime.fetchPage(url),
    extract: (html) => runtime.extract(html),
    writeCard: (card, props, body) => store.writeCard(card, props, body),
    writeNote: (relative, text) => runtime.library.writeNew(relative, text),
  };
}

function defaultRuntime(): CollectRuntime {
  return {
    library: createLibrary(),
    fetchPage,
    extract: extractArticle,
    shot: shotEmbed,
    clock: () => new Date().toISOString(),
    nonce: () => Math.random().toString(36).slice(2, 10),
    memory: createWriteMemory(),
  };
}

async function moduleOn(
  settings: PluginSettings<(typeof shellSettings)["schema"]>,
  id: "m1-notes" | "m2-card-wall",
): Promise<boolean> {
  const state = await settings.read();
  if (state.status !== "ready") return true;
  return state.values.modules[id] !== false;
}
