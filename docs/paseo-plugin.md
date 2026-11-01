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
├─ index.server.ts      服务端：主机设置、网关快照、批注工具、锁定还原、卡片读写、接单
├─ client/              页面、文件面板、模块开关、网关页、卡片墙、任务页
├─ server/              读本机 Magpie、写入 opc-datad，笔记、卡片、任务，以及接单状态机
├─ shared/              开关、批注、锁定、网关快照、卡片协议引用、视图查询、工作流模板、接单 RPC
└─ modules/             六个模块的说明，不是运行时代码
```

假设（在装上 Paseo 之前无法用官方编译器复核）：

1. 插件标识是 `opc-core`。侧栏使用 `addSidebarHeaderItem`。首页、设置、通知三个页面始终登记。六个模块默认打开，关掉后用登记时返回的清理函数卸掉页面和侧栏项。M1 打开时再登记文件面板 `opc-notes`（扩展名 `md`、`markdown`）。设置另有一条 `addSettingsScreen`，标识是 `modules`。
2. `requirements.paseo` 写成 `>=0.14.0`，开发依赖 `@getpaseo/plugin` 固定为 `0.14.0`。这和 `paseo plugin init` 用「当前 CLI 版本」写 `>=` 的做法一致。它不阻止未来的大版本；上限留到版本锁评审时再加。
3. 没有 daemon 侧工作时可以省略 `index.server.ts`。这里保留它，用来登记主机设置 `shell` 和 `gateway`，注册 RPC `gateway.snapshot` 和 `opc-core.intake.snapshot`，以及笔记的保存检查、批注工具和回合结束后的锁定还原。卡片墙在同一进程里注册列表、新建和动作 RPC，并在 `agent.turn_ended` 写卡。任务模块在同一钩子上先推进已认领的任务，并登记记证据、提问和报告失败三个工具。接单引擎在 `agent.session_open` 按 `opc-role` 追加读取、确认、汇报、交回、关注、无关或路由，并在 `agent.turn_ended` 对已绑定的工单回报等待。定时任务不调用守护进程，只给出未启用的命令。读 Magpie 的请求发生在 daemon 上，目标是 `127.0.0.1`。GitHub 轮询只在设置了 `OPC_GITHUB_TOKEN` 时调用 `gh`，主机是 `api.github.com`。卡片目录和任务目录不联网。不注册 `registerUsageSource`。
4. `tsconfig.json` 的 `lib` 只有 `ES2023`，没有 DOM。`types` 含 `node`，给服务端的 `node:fs` 用。界面使用 React Native 组件和主题色。编辑器在 `client/web.ts` 里按需 `require` CodeMirror 6，依赖写在 `package.json`，许可证是 MIT。
5. `modules/` 只有 Markdown。假定 Paseo 编译器不会把该目录当成代码入口。若真机编译拒绝未知目录，把说明移回 `docs/`，代码放进 `client/`、`server/`、`shared/`。
6. 开发依赖用于本地 `tsc --noEmit` 和单测。`package.json` 写了 `"type": "module"`，这样 Node 能直接跑 `shared/*.test.mts` 和 `server/*.test.mts`。接单测试要加载上游 core 里的参数属性，所以这条命令用 `--experimental-transform-types`，而不是只剥类型。Paseo 在运行时提供界面模块，安装插件的人不需要单独安装它们。本地类型检查通过，不等于插件已经能在 Paseo 里加载。

Paseo 从插件入口顺着依赖走。文件一旦位于 `shared/`，传递依赖就按 shared bundle 检查，禁止 `node:`，即使只有服务端入口引用它。接单状态机 `IntakeFlow` 因此放在 `server/intake-flow.ts`：它要调用 `@opc-os/intake-core`，而 `packages/intake-core/src/ids.ts` 用 `node:crypto`。客户端面板只走 RPC，不引用这台状态机。`@opc-os/intake-core` 留在普通 `dependencies` 里，因为 daemon 打包仍要解析它；依赖字段本身不会把它送进 shared bundle。me 用目录安装升到该修复合并后的 SHA，再执行 `paseo plugin reload opc-core`，应能 running。真机由 Infra 验。
