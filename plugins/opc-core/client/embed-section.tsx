import { useRpc, type PluginFilePanelProps } from "@getpaseo/plugin/client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Image, Text, View } from "react-native";
import { listEmbeds, previewEmbedHtml, embedPreviewRpc } from "../shared/embed";
import { mountEmbedFrames } from "./embed-frame";

type Preview = ReturnType<typeof previewEmbedHtml>;

export function EmbedSection({
  text,
  platform,
  theme,
}: {
  text: string;
  platform: string;
  theme: PluginFilePanelProps["theme"];
}) {
  const embeds = listEmbeds(text);
  const signature = embeds.map((item) => item.html).join("\u0000");
  const host = useRef<View>(null);
  const preview = useRpc(embedPreviewRpc);
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const [rows, setRows] = useState<Preview[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (platform === "web" || embeds.length === 0) return;
    let cancelled = false;
    setRows(null);
    void Promise.all(
      embeds.map(async (item) => {
        try {
          return await previewRef.current({ html: item.html });
        } catch {
          return previewEmbedHtml({ ok: false });
        }
      }),
    ).then((next) => {
      if (!cancelled) setRows(next);
    });
    return () => {
      cancelled = true;
    };
  }, [embeds.length, platform, signature]);

  useLayoutEffect(() => {
    if (platform !== "web" || embeds.length === 0) return;
    const cleanup = mountEmbedFrames(host.current, embeds.map((item) => item.html));
    setFailed(cleanup === null);
    return () => cleanup?.();
  }, [embeds.length, platform, signature]);

  if (embeds.length === 0) return null;
  const color = { color: theme.colors.foreground, paddingHorizontal: 16, paddingVertical: 8 };
  const muted = { color: theme.colors.foregroundMuted, paddingHorizontal: 16, paddingBottom: 8 };
  if (platform === "web") {
    return (
      <View>
        {failed ? <Text style={color}>这段 HTML 没能嵌进去</Text> : null}
        <View ref={host} style={{ minHeight: failed ? 0 : embeds.length * 180 }} />
      </View>
    );
  }
  if (!rows) return <Text style={color}>正在准备预览</Text>;
  return (
    <View>
      {rows.map((row, index) =>
        row.kind === "image" && row.src ? (
          <View key={`${index}-${row.src.slice(0, 24)}`}>
            <Image accessibilityLabel="嵌入的 HTML" source={{ uri: row.src }} style={{ width: "100%", height: 180 }} />
            <Text style={muted}>{row.hint}</Text>
          </View>
        ) : (
          <View key={`fallback-${index}`}>
            <Text style={color}>{row.detail || "暂不可预览"}</Text>
            <Text style={muted}>{row.hint}</Text>
          </View>
        ),
      )}
    </View>
  );
}
