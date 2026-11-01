import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { typeMetrics } from "../shared/ui";
import { ElderSwitch } from "./elder-switch";
import { RoleListBody } from "./role-list";
import { useScreenStyles } from "./screen-style";
import { useUiChrome } from "./ui-chrome";

export function UiScreen(props: PluginScreenProps) {
  const chrome = useUiChrome(props.host.label);
  const styles = useScreenStyles(props.theme, props.layout.compact, chrome.elder);
  const metrics = typeMetrics(chrome.elder, props.layout.compact);
  const [navNote, setNavNote] = useState("");
  const navigationRef = useRef(props.navigation);
  navigationRef.current = props.navigation;

  useEffect(() => {
    const agentId = props.params.agent;
    if (!agentId) return;
    const openAgent = navigationRef.current?.openAgent;
    if (!openAgent) {
      setNavNote("这台客户端暂时打不开会话。");
      return;
    }
    setNavNote("");
    openAgent({ agentId });
  }, [props.params.agent]);

  const pathText =
    chrome.source === "file"
      ? `正在读 ${chrome.filePath}。改完点刷新。`
      : `还没有分组文件，正在用内置分组。可以写到 ${chrome.filePath}。`;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: props.theme.colors.surface0 }} contentContainerStyle={{ padding: metrics.pad, paddingBottom: 48 }}>
      <Text style={styles.title}>界面优化</Text>
      {chrome.configError ? (
        <Text style={{ color: props.theme.colors.statusDanger, marginTop: metrics.gap, fontSize: metrics.body, lineHeight: metrics.lineHeight }}>
          {chrome.configError}
        </Text>
      ) : (
        <Text style={styles.detail}>{pathText}</Text>
      )}
      <ElderSwitch chrome={chrome} styles={styles} theme={props.theme} />
      <Pressable accessibilityRole="button" onPress={chrome.refresh}>
        <Text style={styles.action}>刷新分组</Text>
      </Pressable>
      {navNote ? <Text style={styles.detail}>{navNote}</Text> : null}
      <View style={{ marginTop: metrics.gap }}>
        <RoleListBody
          chrome={chrome}
          compact={props.layout.compact}
          onOpen={(id) => {
            if (!props.navigation?.openAgent) {
              setNavNote("这台客户端暂时打不开会话。");
              return;
            }
            setNavNote("");
            props.navigation.openAgent({ agentId: id });
          }}
          theme={props.theme}
        />
      </View>
    </ScrollView>
  );
}
