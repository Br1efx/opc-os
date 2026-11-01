import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { listNoteNoticesRpc, type NoteNotice } from "../shared/notes";
import { useScreenStyles } from "./screen-style";
import { StatusBar } from "./status-bar";
import { useShellElder } from "./ui-chrome";

export function NotificationsScreen({ theme, layout, host }: PluginScreenProps) {
  const { enabled, elder } = useShellElder(host.label);
  const styles = useScreenStyles(theme, layout.compact, elder);
  const listNotices = useRpc(listNoteNoticesRpc);
  const [notices, setNotices] = useState<NoteNotice[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setStatus("loading");
    listNotices({})
      .then((result) => {
        if (!live) return;
        setNotices(result.notices);
        setStatus("ready");
      })
      .catch(() => {
        if (live) setStatus("error");
      });
    return () => {
      live = false;
    };
  }, [listNotices, tick]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
      {enabled ? <StatusBar compact={layout.compact} elder={elder} theme={theme} /> : null}
      <View style={styles.screen}>
      <Text style={styles.title}>通知</Text>
      {status === "loading" ? <Text style={styles.detail}>正在读取通知。</Text> : null}
      {status === "error" ? <Text style={styles.detail}>通知暂时读不出来。</Text> : null}
      {status === "ready" && notices.length === 0 ? (
        <Text style={styles.detail}>通知会集中出现在这里。现在还没有新通知。</Text>
      ) : null}
      {notices.map((notice) => (
        <View key={notice.id} style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.name}>{notice.title}</Text>
            <Text style={styles.detail}>{notice.body}</Text>
          </View>
        </View>
      ))}
      <Pressable accessibilityRole="button" onPress={() => setTick((value) => value + 1)}>
        <Text style={styles.action}>刷新</Text>
      </Pressable>
      </View>
    </View>
  );
}
