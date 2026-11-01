import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useMemo } from "react";
import { typeMetrics } from "../shared/ui";

export function useScreenStyles(theme: PluginScreenProps["theme"], compact: boolean, elder = false) {
  return useMemo(() => {
    if (!elder) {
      return {
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
      };
    }
    const metrics = typeMetrics(true, compact);
    return {
      screen: {
        flex: 1,
        padding: metrics.pad,
        backgroundColor: theme.colors.surface0,
      },
      title: {
        color: theme.colors.foreground,
        fontSize: metrics.title,
        lineHeight: metrics.lineHeight,
      },
      detail: {
        color: theme.colors.foregroundMuted,
        marginTop: metrics.gap,
        fontSize: metrics.body,
        lineHeight: metrics.lineHeight,
      },
      row: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
        marginTop: metrics.gap,
        gap: metrics.gap,
        minHeight: metrics.hitMin,
      },
      rowText: {
        flex: 1,
      },
      name: {
        color: theme.colors.foreground,
        fontSize: metrics.body,
        lineHeight: metrics.lineHeight,
      },
      action: {
        color: theme.colors.accent,
        marginTop: metrics.gap,
        fontSize: metrics.body,
        lineHeight: metrics.lineHeight,
        minHeight: metrics.hitMin,
      },
    };
  }, [theme, compact, elder]);
}
