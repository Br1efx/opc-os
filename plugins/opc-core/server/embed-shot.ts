type ShotPage = {
  setContent(html: string): Promise<void>;
  screenshot(options: { type: "png" }): Promise<Buffer>;
};

type ShotBrowser = {
  newPage(): Promise<ShotPage>;
  close(): Promise<void>;
};

type ShotLibrary = {
  chromium?: {
    launch(options: { headless: boolean }): Promise<ShotBrowser>;
  };
};

/** 截图库可选。没装或失败时调用方改成中文降级，不挡住笔记。 */
export async function shotEmbed(html: string): Promise<{ ok: true; dataUri: string } | { ok: false; detail: string }> {
  if (!html.trim()) return { ok: false, detail: "截图没有完成" };
  const loaded = await loadShotLibrary();
  if (!loaded?.chromium) return { ok: false, detail: "截图没有完成" };
  let browser: ShotBrowser | null = null;
  try {
    browser = await loaded.chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(html);
    const png = await page.screenshot({ type: "png" });
    return { ok: true, dataUri: `data:image/png;base64,${png.toString("base64")}` };
  } catch {
    return { ok: false, detail: "截图没有完成" };
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}

async function loadShotLibrary(): Promise<ShotLibrary | null> {
  try {
    const specifier = ["play", "wright"].join("");
    const load = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<ShotLibrary>;
    return await load(specifier);
  } catch {
    return null;
  }
}
