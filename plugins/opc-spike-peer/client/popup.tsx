import type { PluginPopoverProps } from "@getpaseo/plugin/client";
import { Text, View } from "react-native";

/** 侧边栏 openPopover 用的小弹窗。宽屏锚在按钮上，紧凑布局是底部抽屉。这里没有在真机打开过。 */
export function SpikePopup({ theme }: PluginPopoverProps) {
  return (
    <View style={{ padding: 12, backgroundColor: theme.colors.surface0 }}>
      <Text style={{ color: theme.colors.foreground }}>S2 弹窗探针</Text>
      <Text style={{ color: theme.colors.foregroundMuted, marginTop: 4 }}>
        只有类型检查。没有在电脑或手机上打开。
      </Text>
    </View>
  );
}
