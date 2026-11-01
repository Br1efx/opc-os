import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { useEffect, useRef, useState } from "react";
import { shellSettings } from "../shared/shell";
import {
  UI_CONFIG_FILE,
  UI_REFRESH_MS,
  collapsedMap,
  defaultUiDocument,
  panelIdFromText,
  panelLabel,
  preferPanel,
  resolveElder,
  uiSettings,
  uiSnapshot,
  withCollapsed,
  type ElderChoice,
  type PanelId,
  type UiDocument,
  type UiSnapshot,
} from "../shared/ui";

export type UiChrome = {
  elder: boolean;
  panel: PanelId;
  panelText: string;
  choice: ElderChoice;
  document: UiDocument | null;
  configError: string;
  filePath: string;
  source: "file" | "builtin";
  refresh: () => void;
  setElder: (on: boolean) => Promise<void>;
  resetElder: () => Promise<void>;
  collapsed: Record<string, boolean>;
  setCollapsed: (id: string, on: boolean) => Promise<void>;
  ready: boolean;
  saving: boolean;
  saveError: string;
  problem: string;
  phase: "loading" | "error" | "invalid" | "ready";
  retry: () => Promise<void>;
  resetAll: () => Promise<void>;
};

export function useUiChrome(hostLabel: string): UiChrome {
  const settings = useSettings(uiSettings);
  const rpc = useRpc(uiSnapshot);
  const rpcRef = useRef(rpc);
  rpcRef.current = rpc;
  const [snap, setSnap] = useState<UiSnapshot | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    const pull = () => {
      void rpcRef
        .current({})
        .then((next) => {
          if (live) setSnap(next);
        })
        .catch(() => {
          // 读失败时留着上一份快照。还没有快照时页面继续用内置分组。
        });
    };
    pull();
    const timer = setInterval(pull, UI_REFRESH_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [tick]);

  const ready = settings.status === "ready";
  const choice: ElderChoice = ready ? settings.values.elder : "auto";
  const collapsedEntries = ready ? settings.values.collapsed : [];
  const panel = preferPanel(snap?.panel ?? "unknown", panelIdFromText(hostLabel));
  const elder = resolveElder(choice, panel);
  const configError = snap && !snap.ok ? snap.detail : "";
  const document = snap && !snap.ok ? null : (snap?.document ?? defaultUiDocument());
  const problem =
    settings.status === "loading"
      ? "正在读取界面设置。"
      : settings.status === "error"
        ? `读不到界面设置。${settings.error}`
        : settings.status === "invalid"
          ? `已保存的界面设置无法使用。${settings.error}`
          : "";

  async function setElder(on: boolean) {
    if (settings.status !== "ready" || settings.saving) return;
    await settings.save({ elder: on ? "on" : "off", collapsed: settings.values.collapsed }, settings.revision);
  }

  async function resetElder() {
    if (settings.status !== "ready" || settings.saving) return;
    await settings.save({ elder: "auto", collapsed: settings.values.collapsed }, settings.revision);
  }

  async function setCollapsed(id: string, on: boolean) {
    if (settings.status !== "ready" || settings.saving) return;
    await settings.save(
      { elder: settings.values.elder, collapsed: withCollapsed(settings.values.collapsed, id, on) },
      settings.revision,
    );
  }

  return {
    elder,
    panel,
    panelText: panelLabel(panel),
    choice,
    document,
    configError,
    filePath: snap?.path ?? UI_CONFIG_FILE,
    source: snap?.source ?? "builtin",
    refresh: () => setTick((value) => value + 1),
    setElder,
    resetElder,
    collapsed: collapsedMap(collapsedEntries),
    setCollapsed,
    ready,
    saving: settings.saving,
    saveError: settings.saveError ?? "",
    problem,
    phase: settings.status,
    retry: () => settings.reload(),
    resetAll: () => settings.reset().then(() => undefined),
  };
}

/** 界面优化关掉之后，状态条和老人模式一起卸下。设置还没读到时按默认开。 */
export function useShellElder(hostLabel: string): { chrome: UiChrome; enabled: boolean; elder: boolean } {
  const shell = useSettings(shellSettings);
  const chrome = useUiChrome(hostLabel);
  const enabled = shell.status !== "ready" ? true : shell.values.modules["m5-ui"];
  return { chrome, enabled, elder: enabled && chrome.elder };
}
