import type { PluginScreenProps, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { usePaseo, useRpc } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { CARD_TYPES, type CardType } from "@opc-os/card-protocol";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { queryCards, type QueryGroup, type ViewDefinition } from "../shared/bases";
import { actCardRpc, createCardRpc, listCardsRpc } from "../shared/cards-rpc";
import {
  BUSINESS_LINES,
  CARD_WALL_REFRESH_MS,
  formatCardTime,
  issueLine,
  ownerLabel,
  readLibrary,
  sidebarAwaitingLabel,
  statusLabel,
  typeLabel,
  type CardAction,
  type LibraryCard,
  type LibraryReading,
} from "../shared/cards";

const listeners = new Set<() => void>();

export function subscribeCardWallRefresh(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyCardWallRefresh(): void {
  for (const listener of listeners) listener();
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : "没完成";
}

export function CardWallNav({ currentScreen, openScreen, theme }: PluginSidebarItemProps) {
  const list = useRpc(listCardsRpc);
  const listRef = useRef(list);
  listRef.current = list;
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    const pull = () => {
      void listRef
        .current({ now: new Date().toISOString() })
        .then((library) => {
          if (live) setCount(readLibrary(library).awaiting);
        })
        .catch(() => {
          if (live) setCount(null);
        });
    };
    pull();
    const timer = setInterval(pull, CARD_WALL_REFRESH_MS);
    const stop = subscribeCardWallRefresh(pull);
    return () => {
      live = false;
      clearInterval(timer);
      stop();
    };
  }, []);

  const label = sidebarAwaitingLabel(count);
  return (
    <SidebarRow
      icon="LayoutGrid"
      label={label}
      active={currentScreen?.screenId === "m2-card-wall"}
      onPress={() => openScreen({ screenId: "m2-card-wall" })}
      trailing={
        count !== null && count > 0 ? (
          <View
            style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.statusDanger }}
          />
        ) : null
      }
    />
  );
}

export function CardWallScreen({ theme, layout }: PluginScreenProps) {
  const compact = layout.compact;
  const styles = useCardStyles(theme, compact);
  const list = useRpc(listCardsRpc);
  const create = useRpc(createCardRpc);
  const act = useRpc(actCardRpc);
  const paseo = usePaseo();
  const listRef = useRef(list);
  listRef.current = list;
  const [tick, setTick] = useState(0);
  const [reading, setReading] = useState<LibraryReading | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [viewId, setViewId] = useState("awaiting");
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [oneLiner, setOneLiner] = useState("");
  const [type, setType] = useState<CardType>("task");
  const [project, setProject] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    const pull = () => {
      void listRef
        .current({ now: new Date().toISOString() })
        .then((library) => {
          if (!live) return;
          setReading(readLibrary(library));
          setError("");
        })
        .catch((cause: unknown) => {
          if (live) setError(messageOf(cause));
        });
    };
    pull();
    const timer = setInterval(pull, CARD_WALL_REFRESH_MS);
    const stop = subscribeCardWallRefresh(pull);
    return () => {
      live = false;
      clearInterval(timer);
      stop();
    };
  }, [tick]);

  function refresh() {
    setTick((value) => value + 1);
    notifyCardWallRefresh();
  }

  const selected = reading?.views.find((item) => item.id === viewId) ?? reading?.views[0] ?? null;
  const queried = reading && selected ? queryCards(reading.valid.map((item) => item.bag), selected, { now: reading.now }) : null;
  const byId = new Map(reading?.valid.map((item) => [item.card.id, item]) ?? []);

  async function onCreate() {
    if (saving) return;
    setSaving(true);
    try {
      const result = await create({
        title,
        oneLiner,
        type,
        project,
        now: new Date().toISOString(),
        nonce: Math.random().toString(36).slice(2, 10),
      });
      setNotice(result.detail);
      if (result.ok) {
        setTitle("");
        setOneLiner("");
        setFormOpen(false);
        refresh();
      }
    } catch (cause) {
      setNotice(messageOf(cause));
    } finally {
      setSaving(false);
    }
  }

  async function onAct(id: string, action: CardAction) {
    const result = await act({
      id,
      action: action.action,
      reason: action.action === "reject" ? action.reason : "",
      agentId: action.action === "assign" ? action.agentId : "",
      now: new Date().toISOString(),
    });
    if (!result.ok || !result.delivery) {
      setNotice(result.detail);
      if (result.ok) refresh();
      return;
    }
    try {
      await paseo.agents.ref(result.delivery.agentId).send(result.delivery.text, { activeTurnBehavior: "steer" });
      setNotice(result.detail.replace("正在发给", "已发给"));
    } catch (cause) {
      setNotice(`卡片已更新，但没有送到 Agent。${messageOf(cause)}`);
    }
    refresh();
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>卡片墙</Text>
      <Text style={styles.kicker}>{sidebarAwaitingLabel(reading ? reading.awaiting : null)}</Text>
      <Text style={styles.detail}>改视图文件后刷新，卡片会按新的定义换栏。</Text>
      {selected?.layout === "timeline" ? <Text style={styles.detail}>时间线按协调世界时的今天。</Text> : null}
      {error ? <Text style={styles.alert}>{error}</Text> : null}
      {notice ? <Text style={styles.detail}>{notice}</Text> : null}
      {!reading ? <Text style={styles.detail}>正在读取卡片。</Text> : null}
      <View style={styles.tabs}>
        {reading?.views.map((item) => (
          <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.title} onPress={() => setViewId(item.id)}>
            <Text style={selected?.id === item.id ? styles.tabOn : styles.tab}>{item.title}</Text>
          </Pressable>
        ))}
      </View>
      {reading?.viewErrors.map((item) => (
        <Text key={item.name} style={styles.alert}>
          格式错误：{item.detail}
        </Text>
      ))}
      <Pressable accessibilityRole="button" onPress={() => setFormOpen((value) => !value)}>
        <Text style={styles.action}>{formOpen ? "收起新建" : "新建卡片"}</Text>
      </Pressable>
      {formOpen ? (
        <View style={styles.block}>
          <TextInput
            accessibilityLabel="标题"
            onChangeText={setTitle}
            placeholder="标题"
            placeholderTextColor={theme.colors.foregroundMuted}
            style={styles.input}
            value={title}
          />
          <TextInput
            accessibilityLabel="一句话"
            onChangeText={setOneLiner}
            placeholder="一句话"
            placeholderTextColor={theme.colors.foregroundMuted}
            style={styles.input}
            value={oneLiner}
          />
          <Text style={styles.name}>类型</Text>
          <View style={styles.tabs}>
            {CARD_TYPES.map((item) => (
              <Pressable key={item} accessibilityRole="button" accessibilityLabel={typeLabel(item)} onPress={() => setType(item)}>
                <Text style={type === item ? styles.tabOn : styles.tab}>{typeLabel(item)}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.name}>项目</Text>
          <View style={styles.tabs}>
            <Pressable accessibilityRole="button" onPress={() => setProject("")}>
              <Text style={project === "" ? styles.tabOn : styles.tab}>不指定</Text>
            </Pressable>
            {BUSINESS_LINES.map((item) => (
              <Pressable key={item} accessibilityRole="button" accessibilityLabel={item} onPress={() => setProject(item)}>
                <Text style={project === item ? styles.tabOn : styles.tab}>{item}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable accessibilityRole="button" disabled={saving} onPress={() => void onCreate()}>
            <Text style={styles.action}>保存</Text>
          </Pressable>
        </View>
      ) : null}
      <Pressable accessibilityRole="button" onPress={refresh}>
        <Text style={styles.action}>刷新</Text>
      </Pressable>
      {reading && selected && queried ? (
        <Wall
          byId={byId}
          compact={compact}
          invalid={reading.invalid}
          onAct={onAct}
          queriedGroups={queried.groups}
          styles={styles}
          theme={theme}
          view={selected}
        />
      ) : null}
    </ScrollView>
  );
}

function Wall({
  view,
  queriedGroups,
  byId,
  invalid,
  compact,
  styles,
  theme,
  onAct,
}: {
  view: ViewDefinition;
  queriedGroups: QueryGroup[];
  byId: Map<string, LibraryCard>;
  invalid: LibraryReading["invalid"];
  compact: boolean;
  styles: CardStyles;
  theme: PluginScreenProps["theme"];
  onAct: (id: string, action: CardAction) => Promise<void>;
}) {
  const grouped = Boolean(view.groupBy);
  const horizontal = !compact && (view.layout === "board" || view.layout === "columns");
  const wrap = !compact && view.layout === "cards";
  const body = (
    <View style={horizontal ? styles.columns : wrap ? styles.wrap : styles.stack}>
      {queriedGroups.map((group) => {
        const cards = group.cards.flatMap((bag) => {
          const id = typeof bag.id === "string" ? bag.id : "";
          const found = byId.get(id);
          return found ? [found] : [];
        });
        return (
          <View key={group.key || view.id} style={horizontal ? styles.column : styles.block}>
            {grouped ? (
              <Text style={styles.name}>
                {group.title || "未填写"} · {cards.length} 张
              </Text>
            ) : null}
            {cards.length === 0 && grouped ? <Text style={styles.detail}>这一列还没有。</Text> : null}
            {cards.map((item) => (
              <CardFace
                key={item.card.id}
                card={item}
                compact={compact}
                onAct={onAct}
                styles={styles}
                theme={theme}
                timeline={view.layout === "timeline"}
              />
            ))}
          </View>
        );
      })}
    </View>
  );
  return (
    <View>
      {invalid.map((item) => (
        <View key={item.name} style={styles.block}>
          <Text style={styles.alert}>格式错误</Text>
          {item.issues.map((issue) => (
            <Text key={`${item.name}-${issue.path}-${issue.code}`} style={styles.detail}>
              {issueLine(issue)}
            </Text>
          ))}
        </View>
      ))}
      {queriedGroups.every((group) => group.cards.length === 0) ? (
        <Text style={styles.detail}>这里还没有卡片。</Text>
      ) : null}
      {horizontal ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {body}
        </ScrollView>
      ) : (
        body
      )}
    </View>
  );
}

function CardFace({
  card,
  timeline,
  compact,
  styles,
  theme,
  onAct,
}: {
  card: LibraryCard;
  timeline: boolean;
  compact: boolean;
  styles: CardStyles;
  theme: PluginScreenProps["theme"];
  onAct: (id: string, action: CardAction) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [agentId, setAgentId] = useState("");
  const [busy, setBusy] = useState(false);
  const project = card.props.project ?? "";

  async function run(action: CardAction) {
    if (busy) return;
    setBusy(true);
    try {
      await onAct(card.card.id, action);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      {timeline ? <Text style={styles.kicker}>{formatCardTime(card.card.time)}</Text> : null}
      <Text style={styles.name}>{card.card.title}</Text>
      {card.card.unread ? <Text style={styles.alert}>未读</Text> : null}
      <Text style={styles.detail}>
        {typeLabel(card.card.type)} · {statusLabel(card.card.status)}
        {project ? ` · ${project}` : ""}
      </Text>
      {card.card.oneLiner ? <Text style={styles.detail}>{card.card.oneLiner}</Text> : null}
      <Text style={styles.detail}>
        {ownerLabel(card.card.owner)} · {formatCardTime(card.card.time)}
      </Text>
      <View style={compact ? styles.stack : styles.actions}>
        <Hit label="同意" disabled={busy} onPress={() => void run({ action: "approve" })} styles={styles} />
        <Hit label="打回" disabled={busy} onPress={() => void run({ action: "reject", reason })} styles={styles} />
        <Hit label="指派" disabled={busy} onPress={() => void run({ action: "assign", agentId })} styles={styles} />
        <Hit label="转成任务" disabled={busy} onPress={() => void run({ action: "to-task" })} styles={styles} />
        <Hit label="归档" disabled={busy} onPress={() => void run({ action: "archive" })} styles={styles} />
      </View>
      <TextInput
        accessibilityLabel="打回理由"
        onChangeText={setReason}
        placeholder="写下打回理由"
        placeholderTextColor={theme.colors.foregroundMuted}
        style={styles.input}
        value={reason}
      />
      <TextInput
        accessibilityLabel="Agent 标识"
        onChangeText={setAgentId}
        placeholder="Agent 标识"
        placeholderTextColor={theme.colors.foregroundMuted}
        style={styles.input}
        value={agentId}
      />
    </View>
  );
}

function Hit({
  label,
  disabled,
  onPress,
  styles,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  styles: CardStyles;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={styles.hit}>
      <Text style={styles.action}>{label}</Text>
    </Pressable>
  );
}

type CardStyles = ReturnType<typeof useCardStyles>;

function useCardStyles(theme: PluginScreenProps["theme"], compact: boolean) {
  return useMemo(
    () => ({
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      content: { padding: compact ? 16 : 24, paddingBottom: 48 },
      title: { color: theme.colors.foreground, fontSize: compact ? 22 : 28 },
      kicker: { color: theme.colors.accent, marginTop: 8 },
      detail: { color: theme.colors.foregroundMuted, marginTop: 8 },
      alert: { color: theme.colors.statusDanger, marginTop: 8 },
      name: { color: theme.colors.foreground, fontSize: compact ? 16 : 18, marginTop: 8 },
      action: { color: theme.colors.accent, marginTop: 8 },
      tabs: { flexDirection: "row" as const, flexWrap: "wrap" as const, marginTop: 8 },
      tab: { color: theme.colors.foregroundMuted, marginRight: 16, paddingVertical: 10, minHeight: 44 },
      tabOn: { color: theme.colors.foreground, marginRight: 16, paddingVertical: 10, minHeight: 44 },
      block: { marginTop: 12 },
      card: {
        marginTop: 12,
        padding: 12,
        backgroundColor: theme.colors.surface1,
        borderColor: theme.colors.border,
        borderWidth: 1,
      },
      stack: { marginTop: 8 },
      columns: { flexDirection: "row" as const, alignItems: "flex-start" as const },
      column: { width: 260, marginRight: 12 },
      wrap: { flexDirection: "row" as const, flexWrap: "wrap" as const },
      actions: { flexDirection: "row" as const, flexWrap: "wrap" as const },
      hit: { minHeight: 44, justifyContent: "center" as const, marginRight: 16 },
      input: {
        color: theme.colors.foreground,
        borderColor: theme.colors.border,
        borderWidth: 1,
        minHeight: 44,
        marginTop: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
      },
    }),
    [theme, compact],
  );
}
