import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { gatewaySnapshot } from "../shared/gateway-rpc";
import { gatewaySettings } from "../shared/gateway-settings";
import {
  UI_REFRESH_MS,
  signalsFromGateway,
  statusStrip,
  typeMetrics,
  type StatusItem,
  type StatusTone,
} from "../shared/ui";
import { openShellScreen } from "./shell-nav";

function toneColor(theme: PluginScreenProps["theme"], tone: StatusTone): string {
  if (tone === "ok") return theme.colors.statusSuccess;
  if (tone === "bad") return theme.colors.statusDanger;
  return theme.colors.foreground;
}

export function StatusBar({
  theme,
  compact,
  elder,
}: {
  theme: PluginScreenProps["theme"];
  compact: boolean;
  elder: boolean;
}) {
  const settings = useSettings(gatewaySettings);
  const rpc = useRpc(gatewaySnapshot);
  const rpcRef = useRef(rpc);
  rpcRef.current = rpc;
  const metrics = typeMetrics(elder, compact);
  const [items, setItems] = useState<StatusItem[]>(() => statusStrip(null));
  const ready = settings.status === "ready" ? settings.values : null;
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const key = ready
    ? `${ready.probe}|${ready.spendLimitUsd}|${ready.person}|${ready.project}|${ready.role}|${ready.module}`
    : "";

  useEffect(() => {
    const current = readyRef.current;
    if (!current) {
      setItems(statusStrip(null));
      return;
    }
    let live = true;
    const pull = () => {
      void rpcRef
        .current({
          probe: current.probe,
          spendLimitUsd: current.spendLimitUsd,
          person: current.person,
          project: current.project,
          role: current.role,
          module: current.module,
          now: new Date().toISOString(),
        })
        .then((next) => {
          if (live) setItems(statusStrip(signalsFromGateway(next)));
        })
        .catch(() => {
          if (live) setItems(statusStrip(null));
        });
    };
    pull();
    const timer = setInterval(pull, UI_REFRESH_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [key]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="打开网关与监控"
      onPress={() => openShellScreen("m3-gateway")}
      style={{
        flexDirection: elder || metrics.stacked ? "column" : "row",
        alignItems: elder || metrics.stacked ? "stretch" : "center",
        gap: metrics.gap,
        paddingHorizontal: metrics.pad,
        paddingVertical: 8,
        backgroundColor: theme.colors.surface1,
        borderBottomColor: theme.colors.border,
        borderBottomWidth: 1,
      }}
    >
      {items.map((item) => (
        <View key={item.id} style={{ minHeight: metrics.hitMin, justifyContent: "center" }}>
          <Text
            style={{
              color: toneColor(theme, item.tone),
              fontSize: metrics.body,
              lineHeight: metrics.lineHeight,
            }}
          >
            {item.text}
          </Text>
        </View>
      ))}
    </Pressable>
  );
}
