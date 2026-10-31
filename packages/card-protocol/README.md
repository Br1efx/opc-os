# @opc-os/card-protocol

统一卡片的类型和校验。`opc-core` 与探针插件都引用这个包。

导出 `Card` 以及字段 `id`、`type`、`status`、`title`、`oneLiner`、`owner`、`source`、`evidence`、`related`、`time`、`unread`。`CARD_PROTOCOL_REVISION` 是 `"d1"`。`CARD_TYPES` 是选题、任务、资产、问题、素材。`owner` 是 `{ kind: "person" | "agent", id }`。

`hasCardShape` 只判断字段在不在、类型是否对得上。`parseCard` 再要求标识、标题、状态、负责人 id 非空，证据和关联卡里的字符串非空，时间能被解析。状态机还没冻结。本包没有文件格式。
