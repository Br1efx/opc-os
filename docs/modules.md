# 核心插件模块

`plugins/opc-core/modules/` 里六个目录对应架构中的 M1–M6。每个目录仍然只有 README。页面和开关在 `client/`、`shared/`，不在这些目录里。

首页「一人公司 OS」和「设置」列出这六个模块，并带开关。开关保存在主机设置 `shell` 里，默认全部打开。关掉的模块不会登记页面，也不会出现在侧栏。模块界面崩了只显示「这块坏了」。

`plugins/opc-core/permissions.manifest.json` 里这六个模块的 `enabled` 仍是 false，也没有文件或网络权限。那是权限声明，不是界面上的开关。外壳自己可以联网，主机只有 `127.0.0.1`，给 M3 的 daemon 读本机 Magpie 和数据仓。清单和源码的对照见 [verify.md](verify.md)。外壳取舍见 [adr/0002](../adr/0002-d1-shell-and-cards.md)，网关取舍见 [adr/0003](../adr/0003-d4-gateway-monitor.md)。

| 模块 | 目录 | 开关标识 | 现在 |
| --- | --- | --- | --- |
| M1 笔记 | `plugins/opc-core/modules/m1-notes` | `m1-notes` | 只有入口 |
| M2 卡片墙 / 动态看板 | `plugins/opc-core/modules/m2-card-wall` | `m2-card-wall` | 只有入口 |
| M3 网关与监控 | `plugins/opc-core/modules/m3-gateway` | `m3-gateway` | 今日花费、路由、请求日志、供应商健康、防封只读、主机进程、成本熔断。默认是标明的模拟花费。见 [gateway.md](gateway.md) |
| M4 任务与工作流 | `plugins/opc-core/modules/m4-tasks` | `m4-tasks` | 只有入口 |
| M5 界面优化 | `plugins/opc-core/modules/m5-ui` | `m5-ui` | 只有入口 |
| M6 汉化 | `plugins/opc-core/modules/m6-i18n` | `m6-i18n` | 只有入口。术语表见 [glossary.md](glossary.md) |

这些目录不是 Paseo 的 `client/`、`server/`、`shared/`。里面不要放 `.ts` / `.tsx`，否则可能被插件的 TypeScript 配置扫到，也可能和 Paseo 的目录边界冲突。真正的模块代码放进那三个运行时目录。
