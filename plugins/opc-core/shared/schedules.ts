/** 定时任务和心跳的命令。这里只生成命令，不调用守护进程，因此默认不启用。 */

export type ScheduleKind = "schedule" | "heartbeat";

export type SchedulePreset = {
  id: string;
  title: string;
  kind: ScheduleKind;
  cron: string;
  prompt: string;
  expiresIn: string;
};

export type ScheduleCommand = {
  id: string;
  title: string;
  kind: ScheduleKind;
  enabled: false;
  command: string;
  detail: string;
};

export const SCHEDULE_PRESETS: readonly SchedulePreset[] = [
  {
    id: "topic-radar",
    title: "选题雷达",
    kind: "schedule",
    cron: "30 7 * * *",
    expiresIn: "30d",
    prompt: "推 3 到 5 条选题，每条附热度证据，并按四维打分。",
  },
  {
    id: "morning-brief",
    title: "早间简报",
    kind: "heartbeat",
    cron: "0 9 * * *",
    expiresIn: "30d",
    prompt: "汇总昨夜到今早要处理的卡片，只报需要人看的事。",
  },
  {
    id: "metrics-noon",
    title: "午间数据回收",
    kind: "schedule",
    cron: "0 12 * * *",
    expiresIn: "30d",
    prompt: "回收上午的发布数据，分开写数据事实、原因假设和验证规则。",
  },
  {
    id: "metrics-evening",
    title: "晚间数据回收",
    kind: "schedule",
    cron: "0 20 * * *",
    expiresIn: "30d",
    prompt: "回收傍晚的发布数据，分开写数据事实、原因假设和验证规则。",
  },
  {
    id: "night-review",
    title: "夜审",
    kind: "schedule",
    cron: "30 23 * * *",
    expiresIn: "30d",
    prompt: "检查今天没做完的任务和缺证据的卡，列成一份夜审。",
  },
  {
    id: "asset-weekly",
    title: "资产周报",
    kind: "schedule",
    cron: "0 9 * * 0",
    expiresIn: "30d",
    prompt: "汇总本周新增的资产，以及哪些从探索中变成了已验证。",
  },
  {
    id: "bip-weekly",
    title: "周日周更",
    kind: "schedule",
    cron: "30 9 * * 0",
    expiresIn: "30d",
    prompt: "按内容流检查本周公开构建的母本是否已经发布，并回收数据。",
  },
];

export function scheduleCommand(preset: SchedulePreset): ScheduleCommand {
  const name = `opc-${preset.id}`;
  if (preset.kind === "heartbeat") {
    return {
      id: preset.id,
      title: preset.title,
      kind: preset.kind,
      enabled: false,
      command: `paseo heartbeat create --cron "${preset.cron}" --name ${name} "${preset.prompt}"`,
      detail: "未启用。心跳要在已有 Agent 会话里执行，插件建不了，所以只给出命令。命令不会自动执行，也不含立即运行。30 天后请自行删掉。需真机验证。",
    };
  }
  return {
    id: preset.id,
    title: preset.title,
    kind: preset.kind,
    enabled: false,
    command: `paseo schedule create --cron "${preset.cron}" --timezone Asia/Shanghai --name ${name} --expires-in ${preset.expiresIn} --cwd /home/br1efx/notes --provider codex "${preset.prompt}"`,
    detail: "未启用。这条命令不会自动执行，也不含立即运行。若手动创建，请再用返回的标识执行暂停，避免一开始就跑。供应商要换成这台机器上已登录的。需真机验证。",
  };
}

export function scheduleCommands(): ScheduleCommand[] {
  return SCHEDULE_PRESETS.map((preset) => scheduleCommand(preset));
}

export function renderScheduleRecord(command: ScheduleCommand, now: string): string {
  return [
    "---",
    `id: ${command.id}`,
    `title: ${command.title}`,
    "enabled: false",
    `kind: ${command.kind}`,
    `created: ${now}`,
    "---",
    "未启用。",
    "",
    command.detail,
    "",
    "命令：",
    command.command,
    "",
  ].join("\n");
}
