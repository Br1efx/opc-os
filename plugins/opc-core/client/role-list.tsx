import type { PluginScreenProps, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { usePaseo } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  UI_REFRESH_MS,
  arrangeSidebar,
  faceFromAgent,
  sectionLabel,
  typeMetrics,
  type AgentFace,
  type SidebarSection,
  type TitleColor,
} from "../shared/ui";
import { useUiChrome, type UiChrome } from "./ui-chrome";

function titleColor(theme: PluginScreenProps["theme"], color: TitleColor): string {
  if (color === "accent") return theme.colors.accent;
  if (color === "muted") return theme.colors.foregroundMuted;
  return theme.colors.foreground;
}

export function useAgentFaces(): { faces: AgentFace[]; problem: string } {
  const paseo = usePaseo();
  const paseoRef = useRef(paseo);
  paseoRef.current = paseo;
  const [faces, setFaces] = useState<AgentFace[]>([]);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    let live = true;
    const pull = () => {
      void paseoRef.current.agents
        .list({
          sort: [{ key: "updated_at", direction: "desc" }],
          page: { limit: 100 },
          filter: { includeArchived: true, includeInternal: false },
        })
        .then((listed) => {
          if (!live) return;
          setFaces(listed.entries.map((entry) => faceFromAgent(entry.agent)));
          setProblem("");
        })
        .catch(() => {
          if (live) setProblem("会话列表暂时读不出来。");
        });
    };
    pull();
    const timer = setInterval(pull, UI_REFRESH_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  return { faces, problem };
}

export function RoleSections({
  sections,
  theme,
  elder,
  compact,
  onOpen,
  onToggle,
}: {
  sections: readonly SidebarSection[];
  theme: PluginScreenProps["theme"];
  elder: boolean;
  compact: boolean;
  onOpen: (id: string) => void;
  onToggle: (id: string, on: boolean) => void;
}) {
  const metrics = typeMetrics(elder, compact);
  return (
    <View>
      {sections.map((section) => (
        <View key={section.id}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={sectionLabel(section)}
            onPress={() => onToggle(section.id, !section.collapsed)}
            style={{ minHeight: metrics.hitMin, justifyContent: "center" }}
          >
            <Text
              style={{
                color: theme.colors.foreground,
                fontSize: metrics.body,
                lineHeight: metrics.lineHeight,
                fontWeight: "600",
              }}
            >
              {sectionLabel(section)}
            </Text>
          </Pressable>
          {section.collapsed
            ? null
            : section.rows.map((row) => (
                <Pressable
                  key={row.id}
                  accessibilityRole="button"
                  accessibilityLabel={row.label}
                  onPress={() => onOpen(row.id)}
                  style={{ minHeight: metrics.hitMin, justifyContent: "center", paddingLeft: 12 }}
                >
                  <Text
                    style={{
                      color: titleColor(theme, row.color),
                      fontSize: metrics.body,
                      lineHeight: metrics.lineHeight,
                      fontWeight: row.weight,
                    }}
                  >
                    {row.label}
                  </Text>
                </Pressable>
              ))}
        </View>
      ))}
    </View>
  );
}

export function RoleListBody({
  chrome,
  theme,
  compact,
  onOpen,
}: {
  chrome: UiChrome;
  theme: PluginScreenProps["theme"];
  compact: boolean;
  onOpen: (id: string) => void;
}) {
  const { faces, problem } = useAgentFaces();
  const metrics = typeMetrics(chrome.elder, compact);
  const sections = chrome.document ? arrangeSidebar(faces, chrome.document, chrome.collapsed) : [];
  return (
    <View>
      {chrome.configError ? (
        <Text style={{ color: theme.colors.statusDanger, fontSize: metrics.body, lineHeight: metrics.lineHeight }}>
          {chrome.configError}
        </Text>
      ) : null}
      {problem ? (
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: metrics.body, lineHeight: metrics.lineHeight }}>{problem}</Text>
      ) : null}
      <RoleSections
        compact={compact}
        elder={chrome.elder}
        onOpen={onOpen}
        onToggle={(id, on) => void chrome.setCollapsed(id, on)}
        sections={sections}
        theme={theme}
      />
    </View>
  );
}

export function RoleSidebar({ currentScreen, openScreen, theme, host, layout }: PluginSidebarItemProps) {
  const chrome = useUiChrome(host.label);
  return (
    <View>
      <SidebarRow
        icon="Palette"
        label="界面优化"
        active={currentScreen?.screenId === "m5-ui"}
        onPress={() => openScreen({ screenId: "m5-ui", params: {} })}
      />
      <RoleListBody
        chrome={chrome}
        compact={layout.compact}
        onOpen={(id) => openScreen({ screenId: "m5-ui", params: { agent: id } })}
        theme={theme}
      />
    </View>
  );
}
