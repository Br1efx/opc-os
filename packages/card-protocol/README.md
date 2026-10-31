# @opc-os/card-protocol

统一卡片的类型桩，给以后的 S1（两个插件共用本包）留出包名和导出。

导出 `Card` 以及字段 `id`、`type`、`status`、`title`、`oneLiner`、`owner`、`source`、`evidence`、`related`、`time`、`unread`。`CARD_PROTOCOL_REVISION` 固定为 `"stub"`，表示协议还没有冻结。`CARD_FIELDS` 列出这些字段名。`hasCardShape` 只判断这些字段在不在、类型是否为字符串、字符串数组或布尔值，不判断状态机，也不要求非空。

本包没有文件格式，也没有被 `opc-core` 引用。引用方式和安装结果留到 S1 再写。
