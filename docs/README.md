# 文档

本目录记录 opc-os 的说明。架构正文在 Notion 页「v2.0 · 插件体系总体架构与工程规范」。这里不复制那一页，只放仓库里需要一起评审的短文。

| 文档 | 内容 |
| --- | --- |
| [modules.md](modules.md) | M1–M6 目录，以及外壳上的运行时开关。 |
| [gateway.md](gateway.md) | M3 怎么接本机 Magpie、嵌管理页、写 opc-datad，以及成本熔断。 |
| [glossary.md](glossary.md) | 中文术语表。界面默认中文，少数词保留英文。 |
| [paseo-plugin.md](paseo-plugin.md) | `opc-core` 如何对齐 Paseo 0.14 插件目录，以及本阶段的假设。 |
| [verify.md](verify.md) | verify 七项里哪些已经强制执行，哪些明确未执行。 |
| [registry.md](registry.md) | GitHub Pages 私有 registry 的路径、`PASEO_PLUGIN_REGISTRY`，以及 me 面板安装步骤。实机安装不在本仓库。 |
| [spikes/](spikes/) | S1–S6 的实验记录。每项结论以对应的 `Sx.md` 为准。 |

`adr/` 在仓库根目录，不在 `docs/` 里。写法见 [../adr/README.md](../adr/README.md)。
