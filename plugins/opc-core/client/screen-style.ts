import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useMemo } from "react";

export function useScreenStyles(theme: PluginScreenProps["theme"], compact: boolean) {
  return useMemo(
    () => ({
      screen: {
        flex: 1,
        padding: compact ? 16 : 24,
        backgroundColor: theme.colors.surface0,
      },
      title: {
        color: theme.colors.foreground,
        fontSize: compact ? 22 : 28,
      },
      detail: {
        color: theme.colors.foregroundMuted,
        marginTop: 8,
      },
      row: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
        marginTop: 16,
        gap: 12,
      },
      rowText: {
        flex: 1,
      },
      name: {
        color: theme.colors.foreground,
        fontSize: compact ? 16 : 18,
      },
      action: {
        color: theme.colors.accent,
        marginTop: 12,
      },
    }),
    [theme, compact],
  );
}
