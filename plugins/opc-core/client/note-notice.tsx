import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { Text, View } from "react-native";
import type { z } from "zod";
import { noteNoticeDataSchema } from "../shared/notes";

type NoticeData = z.infer<typeof noteNoticeDataSchema>;

/** 回合结束后写进对话的锁定还原说明。 */
export function NoteNoticeItem({ item, theme }: PluginTimelineItemProps<NoticeData>) {
  return (
    <View
      style={{
        padding: 12,
        borderRadius: 8,
        backgroundColor: theme.colors.surface1,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <Text style={{ color: theme.colors.foreground }}>{item.data.title}</Text>
      <Text style={{ color: theme.colors.foregroundMuted, marginTop: 4 }}>{item.data.body}</Text>
    </View>
  );
}
