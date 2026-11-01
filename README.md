# opc-os

> [!WARNING]
> **暂停维护**
>
> 本仓库与 v2.x / opc-core 已按一人公司 OS 方案 v3.0 冻结：不改代码、不加功能、不删仓库。
>
> 面板已卸载 opc-core。后续以官方插件 + agent-kit 四角色为准。
>
> 仓库保留公开，仅作历史与参考。

opc-os（一人公司操作系统）是一套装进 [Paseo](https://paseo.sh) 的开源插件。核心插件 `opc-core` 提供外壳：首页、模块开关、设置和通知。共享包 `card-protocol` 定义统一卡片的类型和校验，供各模块共用。

本仓库使用 MIT 许可。版权与许可全文见 [LICENSE](LICENSE)（Copyright (c) 2026 Br1efx）。分发时请保留该声明。

## 当前进度

这里完成了阶段 D0 的脚手架，D1 里仓库自身能做的外壳，D2 的笔记，D3 的卡片墙，D4 的网关监控起步，D5a 的任务与工作流，D5b 的接单，以及 D6 的画布、嵌入和一键收集：

- 中文说明、`docs/`、`adr/`、[术语表](docs/glossary.md)
- pnpm workspace，覆盖 `plugins/*` 与 `packages/*`
- `packages/card-protocol` 的卡片类型和校验，以及单元测试
- `plugins/opc-core`：首页列出 M1–M6 并可开关，另有设置和通知入口。M1 在文件面板里打开 Markdown 和画布：电脑可编辑，手机只读，含批注、锁定、嵌入和 `/收集`。见 [adr/0008](adr/0008-d6-canvas-embed-collect.md)
- M2 卡片墙：Markdown 卡片、十一个视图、筛选排序分组，以及同意、打回、指派。见 [adr/0005](adr/0005-d3-card-wall.md)
- M4 任务与工作流：三条模板、证据守卫、卡住阶梯，以及默认不启用的定时命令。见 [adr/0006](adr/0006-d5a-tasks-workflows.md)
- M3 外接本机 Magpie：今日花费、管理页、打标签、成本熔断，以及 `services/opc-datad`。见 [docs/gateway.md](docs/gateway.md)
- 类型检查、单元测试、目录边界、许可证扫描、权限清单对照，以及数据仓的 Go 测试。这些失败会拦住 `pnpm verify` 和 GitHub Actions。手机端打包和性能测量还没有工具链，不算通过，见 [docs/verify.md](docs/verify.md)

原型实验的记录在 [docs/spikes/](docs/spikes/README.md)。S1 在本机临时 daemon 上用 Git 快照装过两个插件。S2–S6 还没有满足架构页的通过标准，不能把那些项当成通过。

私有插件 registry 的静态 JSON 和 Pages 工作流在 [docs/registry.md](docs/registry.md)。站点还要在 GitHub 里把 Pages 来源设成 GitHub Actions 才会发布。me 面板上的安装不在本仓库里完成。

以下内容尚未开始，本仓库不能当作已经完成：

- 在桌面或手机上点开这些页面（类型检查通过对过，没有在 me 面板上目测）
- 在真机上点过起任务、派工、归档和定时命令。这些标了需真机验证
- M6 的功能。现在只有入口和开关。M5 的显示名分组、状态条和老人模式见 [adr/0009](adr/0009-d7-ui-polish.md)，父亲手机上的字号仍需真机验证。M1 的笔记在文件面板上，见 [adr/0004](adr/0004-d2-notes.md)。画布、嵌入和 `/收集` 见 [adr/0008](adr/0008-d6-canvas-embed-collect.md)。M2 的卡片墙见 [adr/0005](adr/0005-d3-card-wall.md)。M4 见 [adr/0006](adr/0006-d5a-tasks-workflows.md)。D5b 的接单见 [adr/0007](adr/0007-d5b-opc-intake.md)。Telegram、浏览器剪藏和 Grok 转交还没接通，见 [docs/collect-ports.md](docs/collect-ports.md)
- 完整的父亲视频采集，以及把 Magpie 源码放进仓库

架构里规划的外围插件（`opc-grok`、`opc-telegram`、`opc-collect-*`）和 `render-queue` 也不在本目录中。`opc-datad` 只有本机写入和读出，见 [docs/gateway.md](docs/gateway.md)。

## 目录

```text
opc-os/
├─ plugins/opc-core          核心插件外壳，含 M1 笔记与画布、M2 卡片墙、M3 网关页、M4 任务和 M5 界面
├─ packages/card-protocol    统一卡片类型和校验
├─ packages/page-fetch       收集时拉取公网页面
├─ services/opc-datad        本机数据仓（Go / SQLite）
├─ registry/                 GitHub Pages 上的插件 registry
├─ docs/                     说明与实验占位
├─ adr/                      架构决策记录
├─ README.md
└─ LICENSE
```

模块开关见 [docs/modules.md](docs/modules.md)。用语见 [docs/glossary.md](docs/glossary.md)。插件目录为何按 Paseo 0.14 的 client/server 拆分，见 [docs/paseo-plugin.md](docs/paseo-plugin.md)。

## 本地检查

需要 Node.js 22 或更新版本，以及 pnpm 10。数据仓测试还需要 Go 1.22 和 SQLite 头文件（Debian/Ubuntu 上是 `libsqlite3-dev`）。

```bash
pnpm install
pnpm verify
```

`pnpm verify` 跑目前能强制执行的检查。手机端打包要单独看 `pnpm verify:mobile`：没有 paseo 时退出码是 2，表示没有执行，不是通过。`pnpm typecheck` 仍然只做 TypeScript 检查。Paseo 安装插件时还会按自己的编译器再编一次；这一步还没有在真机上做过。
