# @opc-os/card-protocol

统一卡片的类型和校验。`opc-core` 与探针插件都引用这个包。

导出 `Card` 以及公共字段 `id`、`type`、`status`、`title`、`oneLiner`、`owner`、`source`、`evidence`、`related`、`time`、`unread`。任务还可以带 `goal`、`acceptance`、`due`、`dependsOn`、`workflow`、`stage`、`failCount`、`ladderLevel`，都可以省略。`CARD_PROTOCOL_REVISION` 是 `"d3"`。`CARD_TYPES` 是选题、任务、资产、问题、素材、决策。`CARD_STATUSES` 是收件箱、孵化中、推进中、已沉淀、搁置、归档。`owner` 是 `{ kind: "person" | "agent", id }`。`stage` 不是生命周期。

`hasCardShape` 只判断字段在不在、类型是否对得上。`parseCard` 再要求标识和标题非空，类型和状态都在枚举里，负责人 id 非空，证据和关联卡里的字符串非空，时间能被解析。本包没有文件格式。§1.2 笔记种类到协议类型的对照是 `SECTION12_CARD_TYPES`。
