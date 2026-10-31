# 核心插件模块（占位）

`plugins/opc-core/modules/` 里六个目录对应架构中的 M1–M6。每个目录目前只有 README，没有实现，也没有运行时开关。

计划中的开关只是预留的标识，便于以后按模块打开或关闭。D0 不读取这些标识，页面「一人公司 OS」也不加载任何模块。某个模块出错时只显示「这块坏了」的错误边界，同样留到实现阶段。

| 模块 | 目录 | 计划中的开关标识 | 现在 |
| --- | --- | --- | --- |
| M1 笔记 | `plugins/opc-core/modules/m1-notes` | `m1-notes` | 未接入 |
| M2 卡片墙 / 动态看板 | `plugins/opc-core/modules/m2-card-wall` | `m2-card-wall` | 未接入 |
| M3 网关与监控 | `plugins/opc-core/modules/m3-gateway` | `m3-gateway` | 未接入 |
| M4 任务与工作流 | `plugins/opc-core/modules/m4-tasks` | `m4-tasks` | 未接入 |
| M5 界面优化 | `plugins/opc-core/modules/m5-ui` | `m5-ui` | 未接入 |
| M6 汉化 | `plugins/opc-core/modules/m6-i18n` | `m6-i18n` | 未接入 |

这些目录不是 Paseo 的 `client/`、`server/`、`shared/`。里面不要放 `.ts` / `.tsx`，否则可能被插件的 TypeScript 配置扫到，也可能和 Paseo 的目录边界冲突。真正的模块代码以后放进那三个运行时目录。
