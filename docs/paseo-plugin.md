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
├─ index.client.tsx     界面端：注册页面和侧边栏按钮
├─ index.server.ts      服务端：空的注册函数，不注册 RPC
├─ client/home.tsx      页面「一人公司 OS」
└─ modules/             六个模块的说明，不是运行时代码
```

假设（在装上 Paseo 之前无法用官方编译器复核）：

1. 插件标识是 `opc-core`。页面和侧边栏按钮的标识都是 `home`，标题都是「一人公司 OS」。侧边栏使用 `addSidebarHeaderItem`，按下后 `openScreen({ screenId: "home" })`。
2. `requirements.paseo` 写成 `>=0.14.0`，开发依赖 `@getpaseo/plugin` 固定为 `0.14.0`。这和 `paseo plugin init` 用「当前 CLI 版本」写 `>=` 的做法一致。它不阻止未来的大版本；上限留到版本锁评审时再加。
3. 没有 daemon 侧工作时可以省略 `index.server.ts`。这里仍保留它，用来占住服务端入口，函数体不注册处理器。
4. `tsconfig.json` 与官方脚手架一致：`lib` 只有 `ES2023`，没有 DOM。界面使用 React Native 组件和主题色。
5. `modules/` 只有 Markdown。假定 Paseo 编译器不会把该目录当成代码入口。若真机编译拒绝未知目录，把说明移回 `docs/`，代码放进 `client/`、`server/`、`shared/`。
6. 开发依赖只用于本地 `tsc --noEmit`。Paseo 在运行时提供这些模块，安装插件的人不需要单独安装它们。本地类型检查通过，不等于插件已经能在 Paseo 里加载。
