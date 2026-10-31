# opc-os

opc-os（一人公司操作系统）是一套装进 [Paseo](https://paseo.sh) 的开源插件。核心插件 `opc-core` 提供外壳：首页、模块开关、设置和通知。共享包 `card-protocol` 定义统一卡片的类型和校验，供各模块共用。

本仓库使用 MIT 许可。版权与许可全文见 [LICENSE](LICENSE)（Copyright (c) 2026 Br1efx）。分发时请保留该声明。

## 当前进度

这里完成了阶段 D0 的脚手架，以及 D1 里仓库自身能做的外壳：

- 中文说明、`docs/`、`adr/`、[术语表](docs/glossary.md)
- pnpm workspace，覆盖 `plugins/*` 与 `packages/*`
- `packages/card-protocol` 的卡片类型和校验，以及单元测试
- `plugins/opc-core`：首页列出 M1–M6 并可开关，另有设置和通知入口
- 类型检查、单元测试、目录边界、许可证扫描、权限清单对照。这五项失败会拦住 `pnpm verify` 和 GitHub Actions。手机端打包和性能测量还没有工具链，不算通过，见 [docs/verify.md](docs/verify.md)

原型实验的记录在 [docs/spikes/](docs/spikes/README.md)。S1 在本机临时 daemon 上用 Git 快照装过两个插件。S2–S6 还没有满足架构页的通过标准，不能把那些项当成通过。

私有插件 registry 的静态 JSON 和 Pages 工作流在 [docs/registry.md](docs/registry.md)。站点还要在 GitHub 里把 Pages 来源设成 GitHub Actions 才会发布。me 面板上的安装不在本仓库里完成。

以下内容尚未开始，本仓库不能当作已经完成：

- 在桌面或手机上点开这些页面（类型检查通过对过，没有在 me 面板上目测）
- M1–M6 的功能。现在只有入口和开关

架构里规划的外围插件（`opc-grok`、`opc-telegram`、`opc-collect-*`）和外置服务（`opc-datad`、`render-queue`）也不在本目录中。

## 目录

```text
opc-os/
├─ plugins/opc-core          核心插件外壳
├─ packages/card-protocol    统一卡片类型和校验
├─ registry/                 GitHub Pages 上的插件 registry
├─ docs/                     说明与实验占位
├─ adr/                      架构决策记录
├─ README.md
└─ LICENSE
```

模块开关见 [docs/modules.md](docs/modules.md)。用语见 [docs/glossary.md](docs/glossary.md)。插件目录为何按 Paseo 0.14 的 client/server 拆分，见 [docs/paseo-plugin.md](docs/paseo-plugin.md)。

## 本地检查

需要 Node.js 22 或更新版本，以及 pnpm 10。

```bash
pnpm install
pnpm verify
```

`pnpm verify` 跑目前能强制执行的检查。手机端打包要单独看 `pnpm verify:mobile`：没有 paseo 时退出码是 2，表示没有执行，不是通过。`pnpm typecheck` 仍然只做 TypeScript 检查。Paseo 安装插件时还会按自己的编译器再编一次；这一步还没有在真机上做过。
