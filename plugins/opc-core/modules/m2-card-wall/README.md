# M2 卡片墙 / 动态看板

开关标识是 `m2-card-wall`，由外壳读取。本目录只有说明。

卡片落在 `/home/br1efx/notes/cards/`，视图定义在同目录的 `_views/`。四个主视图和五个预置视图都从这些文件渲染。查询、动作和页面的代码在 `client/`、`server/`、`shared/`。不要把 `.ts` / `.tsx` 留在本目录。「等你处理」对带 `intakeTicket` 的卡按工单阶段表计数，其他卡仍用收件箱。决定见 `adr/0005-d3-card-wall.md` 和 `adr/0007-d5b-opc-intake.md`。
