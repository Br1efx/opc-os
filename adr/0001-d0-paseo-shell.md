# 0001 · D0 的 opc-core 按 Paseo 0.14 运行时入口搭空壳

状态：已接受

## 背景

D0 第 2 步要有一个能对上 Paseo 插件包结构的空壳：一个标题为「一人公司 OS」的页面，和一个打开该页的侧边栏按钮。当时的公开文档（Paseo 0.14）要求界面端 `index.client.tsx` 与可选的服务端 `index.server.ts`，业务代码放在 `client/`、`server/`、`shared/`。仓库里还没有可用的 Paseo 安装，不能运行 `paseo plugin init`。

## 决定

`plugins/opc-core` 手写与 `paseo plugin init` 相同的清单、TypeScript 配置和开发依赖版本（`@getpaseo/plugin@0.14.0`，`requirements.paseo` 为 `>=0.14.0`）。界面端注册页面 `home` 和侧边栏按钮。服务端入口保留，但不注册 RPC。M1–M6 只用 `modules/` 下的说明占位，开关不接入。

细节和未在真机上复核的假设见 `docs/paseo-plugin.md`。

## 后果

本地可以用 `tsc --noEmit` 检查这份空壳。它还不是「已装上 Paseo」的证据。若 0.14 之后的编译器拒绝 `modules/` 或改变入口约定，再写一条新的 ADR 替换本决定，而不是改写本文件的决定本身。
