import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { usePaseo, useRpc, useSettings } from "@getpaseo/plugin/client";
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import {
  GATEWAY_DEFAULTS,
  GATEWAY_TABS,
  MAGPIE_WEB_ORIGIN,
  costAlertCard,
  mockSnapshot,
  type GatewaySnapshot,
  type GatewayTabId,
} from "../shared/gateway";
import { gatewaySnapshot } from "../shared/gateway-rpc";
import { gatewaySettings } from "../shared/gateway-settings";

class PieceBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

export function GatewayScreen(props: PluginScreenProps) {
  const { theme, layout } = props;
  const settings = useSettings(gatewaySettings);
  const snapshotRpc = useRpc(gatewaySnapshot);
  const styles = useGatewayStyles(theme, layout.compact);
  const ready = settings.status === "ready" ? settings.values : null;
  const [snap, setSnap] = useState<GatewaySnapshot | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState<GatewayTabId>("usage");
  const [previewLimit, setPreviewLimit] = useState<number | null>(null);
  const rpcRef = useRef(snapshotRpc);
  rpcRef.current = snapshotRpc;
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const key = ready
    ? `${ready.probe}|${ready.spendLimitUsd}|${ready.person}|${ready.project}|${ready.role}|${ready.module}|${tick}`
    : "";

  useEffect(() => {
    const current = readyRef.current;
    if (!current) return;
    let cancelled = false;
    setError("");
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
        if (!cancelled) {
          setSnap(next);
          setPreviewLimit(null);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "读不到网关");
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const shown =
    snap ??
    mockSnapshot(
      {
        person: ready?.person ?? GATEWAY_DEFAULTS.person,
        project: ready?.project ?? GATEWAY_DEFAULTS.project,
        role: ready?.role ?? GATEWAY_DEFAULTS.role,
        module: ready?.module ?? GATEWAY_DEFAULTS.module,
      },
      ready?.spendLimitUsd ?? GATEWAY_DEFAULTS.spendLimitUsd,
      "2026-11-01T00:00:00.000Z",
    );
  const limit = previewLimit ?? shown.breaker.limitUsd;
  const alert = costAlertCard({
    spentUsd: shown.todayUsd,
    limitUsd: limit,
    now: shown.time,
    source: shown.source,
    tags: shown.tags,
  });

  async function save(patch: Partial<NonNullable<typeof ready>>) {
    if (settings.status !== "ready" || settings.saving) return;
    const next = { ...settings.values, ...patch };
    const saved = await settings.save(next, settings.revision);
    if (saved) setTick((value) => value + 1);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>{shown.source === "mock" ? "模拟" : shown.source === "live" ? "真机" : "探测失败"}</Text>
      <Text style={styles.spend}>{shown.spendLabel}</Text>
      <Text style={styles.detail}>{shown.note}</Text>
      {alert ? <Text style={styles.alert}>{alert.card.title}：{alert.card.oneLiner}</Text> : null}
      {error ? <Text style={styles.detail}>{error}</Text> : null}
      <View style={styles.row}>
        <Text style={styles.name}>真机探测</Text>
        <Switch
          accessibilityLabel="真机探测"
          disabled={!ready || settings.saving}
          onValueChange={(probe) => void save({ probe })}
          thumbColor={theme.colors.accentForeground}
          trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
          value={ready ? ready.probe : false}
        />
      </View>
      <Text style={styles.detail}>关掉时手机仍显示上面的模拟花费。打开后向这台电脑的 127.0.0.1:3425 读 hello、额度和用量。</Text>
      <PieceBoundary fallback={<Text style={styles.detail}>这台客户端嵌不进管理页。</Text>}>
        <AdminLink {...props} />
      </PieceBoundary>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
        {GATEWAY_TABS.map((item) => (
          <Pressable key={item.id} accessibilityRole="button" onPress={() => setTab(item.id)}>
            <Text style={tab === item.id ? styles.tabOn : styles.tab}>{item.title}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {tab === "usage" ? <UsageTab shown={shown} styles={styles} /> : null}
      {tab === "route" ? <LineBlock title={shown.route.title} detail={shown.route.detail} styles={styles} /> : null}
      {tab === "requests" ? <LineList lines={shown.requests} styles={styles} /> : null}
      {tab === "health" ? <LineList lines={shown.providers} styles={styles} /> : null}
      {tab === "guard" ? <LineBlock title={shown.guard.title} detail={shown.guard.detail} styles={styles} /> : null}
      {tab === "host" ? <LineBlock title={shown.host.title} detail={shown.host.detail} styles={styles} /> : null}
      {tab === "breaker" ? (
        <BreakerTab
          alert={alert}
          limit={limit}
          onLimit={(next) => {
            setPreviewLimit(next);
            void save({ spendLimitUsd: next });
          }}
          styles={styles}
        />
      ) : null}
      {settings.status === "error" ? <Text style={styles.detail}>读不到网关设置。{settings.error}</Text> : null}
      {settings.saveError ? <Text style={styles.detail}>没保存上。{settings.saveError}</Text> : null}
      <Text style={styles.detail}>{shown.datad.detail}</Text>
    </ScrollView>
  );
}

function AdminLink({ navigation, theme, layout }: PluginScreenProps) {
  const paseo = usePaseo();
  const styles = useGatewayStyles(theme, layout.compact);
  const [note, setNote] = useState("");
  const openBrowser = navigation?.openBrowser;
  if (!openBrowser) {
    return (
      <Text style={styles.detail}>
        管理页只绑在这台电脑的 {MAGPIE_WEB_ORIGIN}。手机和网页版没有工作区浏览器，不能嵌。今日花费仍显示在上面。
      </Text>
    );
  }
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void paseo.workspaces.list().then((listed) => {
            const workspaceId = listed.entries[0]?.id;
            if (!workspaceId) {
              setNote("这台电脑上还没有工作区，管理页嵌不进去。");
              return;
            }
            openBrowser({ url: MAGPIE_WEB_ORIGIN, workspaceId });
          }).catch((reason: unknown) => {
            setNote(reason instanceof Error ? reason.message : "没有打开管理页");
          });
        }}
      >
        <Text style={styles.action}>在这台电脑嵌进管理页</Text>
      </Pressable>
      {note ? <Text style={styles.detail}>{note}</Text> : null}
    </View>
  );
}

function UsageTab({ shown, styles }: { shown: GatewaySnapshot; styles: GatewayStyles }) {
  return (
    <View>
      <Text style={styles.detail}>{shown.ledgerNote}</Text>
      <Text style={styles.name}>
        {shown.tags.person} × {shown.tags.project} × {shown.tags.role} × {shown.tags.module}
      </Text>
      <Text style={styles.detail}>应用钥匙 {shown.appKey}</Text>
      <Text style={styles.detail}>{shown.hello.detail}</Text>
      {shown.calls != null ? <Text style={styles.detail}>今日调用 {shown.calls} 次</Text> : null}
      <LineList lines={shown.quotas} styles={styles} />
    </View>
  );
}

function BreakerTab({
  alert,
  limit,
  onLimit,
  styles,
}: {
  alert: { tripped: true; card: { title: string; oneLiner: string; status: string; id: string } } | null;
  limit: number;
  onLimit: (value: number) => void;
  styles: GatewayStyles;
}) {
  return (
    <View>
      <Text style={styles.detail}>当前限额 {limit} 美元。调低到花费以下就会出一张告警卡。</Text>
      <View style={styles.chips}>
        {[25, 1, 0.01].map((value) => (
          <Pressable key={value} accessibilityRole="button" onPress={() => onLimit(value)}>
            <Text style={styles.tab}>{value} 美元</Text>
          </Pressable>
        ))}
      </View>
      {alert ? (
        <View>
          <Text style={styles.alert}>{alert.card.title}</Text>
          <Text style={styles.detail}>{alert.card.oneLiner}</Text>
          <Text style={styles.detail}>状态 {alert.card.status} · {alert.card.id}</Text>
        </View>
      ) : (
        <Text style={styles.detail}>还没有超过限额。</Text>
      )}
    </View>
  );
}

function LineList({ lines, styles }: { lines: { title: string; detail: string }[]; styles: GatewayStyles }) {
  return (
    <View>
      {lines.map((line) => (
        <LineBlock key={`${line.title}-${line.detail}`} title={line.title} detail={line.detail} styles={styles} />
      ))}
    </View>
  );
}

function LineBlock({ title, detail, styles }: { title: string; detail: string; styles: GatewayStyles }) {
  return (
    <View style={styles.block}>
      <Text style={styles.name}>{title}</Text>
      <Text style={styles.detail}>{detail}</Text>
    </View>
  );
}

type GatewayStyles = ReturnType<typeof useGatewayStyles>;

function useGatewayStyles(theme: PluginScreenProps["theme"], compact: boolean) {
  return useMemo(
    () => ({
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      content: { padding: compact ? 16 : 24, paddingBottom: 48 },
      kicker: { color: theme.colors.accent, fontSize: 13 },
      spend: { color: theme.colors.foreground, fontSize: compact ? 32 : 40, marginTop: 4 },
      detail: { color: theme.colors.foregroundMuted, marginTop: 8 },
      alert: { color: theme.colors.statusDanger, marginTop: 12, fontSize: compact ? 16 : 18 },
      row: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
        marginTop: 16,
      },
      name: { color: theme.colors.foreground, fontSize: compact ? 16 : 18, marginTop: 8 },
      action: { color: theme.colors.accent, marginTop: 12 },
      tabs: { marginTop: 16 },
      tab: { color: theme.colors.foregroundMuted, marginRight: 16, paddingVertical: 8 },
      tabOn: { color: theme.colors.foreground, marginRight: 16, paddingVertical: 8 },
      block: {
        marginTop: 12,
        padding: 12,
        backgroundColor: theme.colors.surface1,
        borderColor: theme.colors.border,
        borderWidth: 1,
      },
      chips: { flexDirection: "row" as const, marginTop: 8 },
    }),
    [theme, compact],
  );
}
