# opc-os

opc-os（一人公司操作系统）是一套装进 [Paseo](https://paseo.sh) 的开源插件。核心插件 `opc-core` 提供外壳：一个页面和进入该页的侧边栏按钮。共享包 `card-protocol` 预留统一卡片的类型，供以后的模块共用。

本仓库使用 MIT 许可。版权与许可全文见 [LICENSE](LICENSE)（Copyright (c) 2026 Br1efx）。分发时请保留该声明。

## 当前进度

这里只完成阶段 D0 的脚手架，对应执行步骤里的第 1 步余下部分和第 2 步：

- 中文说明、`docs/`、`adr/`
- pnpm workspace，覆盖 `plugins/*` 与 `packages/*`
- `packages/card-protocol` 的类型桩
- `plugins/opc-core` 的空壳：页面「一人公司 OS」，以及打开该页的侧边栏按钮

以下内容尚未开始，本仓库不能当作已经完成：

- CI 上的 7 项 verify
- 原型实验 S1–S6 及其结论
- GitHub Pages 插件 registry
- 在已安装的 Paseo 里实际加载本插件
- M1–M6 的功能

架构里规划的外围插件（`opc-grok`、`opc-telegram`、`opc-collect-*`）和外置服务（`opc-datad`、`render-queue`）也不在本目录中。

## 目录

```text
opc-os/
├─ plugins/opc-core          核心插件空壳
├─ packages/card-protocol    统一卡片类型桩
├─ docs/                     说明与实验占位
├─ adr/                      架构决策记录
├─ README.md
└─ LICENSE
```

模块开关的计划见 [docs/modules.md](docs/modules.md)。插件目录为何按 Paseo 0.14 的 client/server 拆分，见 [docs/paseo-plugin.md](docs/paseo-plugin.md)。

## 本地检查

需要 Node.js 22 或更新版本，以及 pnpm 10。

```bash
pnpm install
pnpm typecheck
```

`pnpm typecheck` 只跑本仓库的 TypeScript 检查。Paseo 安装插件时还会按自己的编译器再编一次；这一步还没有在真机上做过。
