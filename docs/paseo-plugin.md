# opc-core 与 Paseo 插件目录

`plugins/opc-core` 按 Paseo 0.14 公开文档里的运行时入口来搭，并对齐当前 CLI 源码里 `paseo plugin init` 写出的文件（`packages/cli/src/commands/plugin/scaffold.ts`，仓库 `getpaseo/paseo` 的 `main`）。搭空壳时没有执行 `paseo plugin init`。之后的安装试验写在 [spikes/S1.md](spikes/S1.md)，那次用的是临时 daemon，不是这里的目录说明。

采用的结构：

```text
plugins/opc-core/
├─ paseo-plugin.json
├─ package.json
├─ tsconfig.json
├─ OVERVIEW.md
├─ OVERVIEW.zh-CN.md
├─ index.client.tsx     界面端：首页、设置、通知，以及打开的模块
├─ index.server.ts      服务端：登记主机设置，并注册网关快照 RPC
├─ client/              页面、模块开关、网关页
├─ server/              读本机 Magpie，并写入 opc-datad
├─ shared/              开关状态、卡片引用、网关快照
└─ modules/             六个模块的说明，不是运行时代码
```

假设（在装上 Paseo 之前无法用官方编译器复核）：

1. 插件标识是 `opc-core`。侧栏使用 `addSidebarHeaderItem`。首页、设置、通知三个页面始终登记。六个模块默认打开，关掉后用登记时返回的清理函数卸掉页面和侧栏项。设置另有一条 `addSettingsScreen`，标识是 `modules`。
2. `requirements.paseo` 写成 `>=0.14.0`，开发依赖 `@getpaseo/plugin` 固定为 `0.14.0`。这和 `paseo plugin init` 用「当前 CLI 版本」写 `>=` 的做法一致。它不阻止未来的大版本；上限留到版本锁评审时再加。
3. 没有 daemon 侧工作时可以省略 `index.server.ts`。这里保留它，用来登记主机设置 `shell` 和 `gateway`，并注册 RPC `gateway.snapshot`。读 Magpie 的请求发生在 daemon 上，目标是 `127.0.0.1`。不注册 `registerUsageSource`。
4. `tsconfig.json` 与官方脚手架一致：`lib` 只有 `ES2023`，没有 DOM。界面使用 React Native 组件和主题色。
5. `modules/` 只有 Markdown。假定 Paseo 编译器不会把该目录当成代码入口。若真机编译拒绝未知目录，把说明移回 `docs/`，代码放进 `client/`、`server/`、`shared/`。
6. 开发依赖只用于本地 `tsc --noEmit` 和外壳单测。`package.json` 写了 `"type": "module"`，这样 Node 能直接跑 `shared/*.test.mts`。Paseo 在运行时提供界面模块，安装插件的人不需要单独安装它们。本地类型检查通过，不等于插件已经能在 Paseo 里加载。
