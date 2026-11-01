# verify 门禁

架构页「v2.0 · 插件体系总体架构与工程规范」§5 要求合并前通过 7 项。本仓库现在能强制执行其中 5 项，并额外强制跑数据仓的 Go 测试。另外 2 项没有 Paseo 或手机打包工具链，脚本会标成 `DEFERRED`。`DEFERRED` 不是通过。数据仓测试不是那 7 项里的一项。

| # | 项 | 现在 | 命令 |
| --- | --- | --- | --- |
| 1 | 类型检查 | 强制。失败则 `pnpm verify` 退出 1 | `pnpm typecheck` |
| 2 | 单元测试 | 强制。`card-protocol` 的字段形状，`opc-core` 的外壳、网关和接单测试，`intake-core` 的上游 core 测试，以及 `scripts/verify` 里的策略测试。其中 shared bundle 检查从插件入口走依赖，确认 `shared/` 到不了 Node 内置模块 | `pnpm test` |
| 3 | 目录边界 | 强制 | `pnpm verify:boundary` |
| 4 | 许可证扫描 | 强制 | `pnpm verify:license` |
| 5 | 权限清单对照 | 强制 | `pnpm verify:manifest` |
| 6 | 手机端打包 | 未执行 | `pnpm verify:mobile` |
| 7 | 性能预算 | 只检查阈值文件；不测量 | `pnpm verify:perf` |

`pnpm verify` 会跑 1–5，第 7 项的阈值文件，以及 `services/opc-datad` 的 `CGO_ENABLED=1 go test ./...`。这些失败时退出码是 1。手机端打包和性能测量记为 `DEFERRED`，不让 `pnpm verify` 失败，也**不表示这两项通过**。GitHub Actions 工作流 `verify` 的 job 名叫 `enforced gates`。它变绿说明这些强制项过了，包含数据仓测试，不包含手机端打包和性能测量。CI 会安装 Go 1.22 和 `libsqlite3-dev`。

单独跑手机端命令时，没有执行打包的退出码是 2，不是 0。

## 目录边界

规则在 `config/directory-boundary.json`。

- `plugins/opc-core` 顶层只能是清单里声明的文件和目录。`server/` 和 `shared/` 已经在用：网关逻辑在 `shared/`，读本机 Magpie 的代码在 `server/`。
- `modules/` 下只能是 M1–M6 六个目录，里面只允许 Markdown。TypeScript 要放进 `client/`、`server/` 或 `shared/`。
- `packages/` 不能 import `plugins/`。插件可以 import `@opc-os/card-protocol` 和 `@opc-os/intake-core`。
- 一个插件不能 import 另一个插件。
- 界面端（`index.client.tsx`、`client/`）不能 import 服务端 SDK 或 `server/`。服务端和 `shared/` 不能 import `react-native`、界面端 SDK 或 `client/`。

这是源码级别的检查，不是 Paseo 编译器。编译器要等装上 Paseo 再跑。shared bundle 那一项按同样的目录规则走入口依赖：`shared/` 的传递依赖里出现 `node:` 就失败，`server/` 里的 `node:` 不算。它抓的是 `opc-intake` 这种「状态机放进 shared，Node 内置跟着进 shared bundle」的情况，不代替真机 `paseo plugin reload`。

## 许可证

总允许列表在 `config/license-policy.json` 的 `allow`：

| 标识 | 为什么在列表里 |
| --- | --- |
| MIT、Apache-2.0、BSD-2-Clause、BSD-3-Clause、BSD-3-Clause-Clear、0BSD | 规范表里的 MIT / Apache-2.0 / BSD |
| ISC、MIT-0 | npm 上常见的宽松许可，条款接近 BSD。规范表没有单列，这里写明后放行 |
| CC0-1.0、Unlicense | 公有领域奉献，比 MIT 更宽，不是专有许可 |
| MPL-2.0 | 规范表允许使用。扫描器只认标识，**不会**检查「改过的那个文件有没有开源」 |

`OR` 里只要有一个允许的标识就通过，因为可以选择那个标识。`AND` 必须每一边都允许。`WITH` 只接受 `allowedExceptions` 里的例外（目前是 `LLVM-exception`）。

下面这些会失败：

- AGPL、GPL、LGPL（含 `-only` / `-or-later`）
- `UNLICENSED`、BUSL、SSPL
- 没有许可字段，或写着 `SEE LICENSE IN …` 这类解析不了的文本
- 不在允许列表、也没有钉死例外的标识，例如一般的 CC-BY

例外必须同时写上包名、版本和当时的声明。版本或声明对不上就失败，不能靠总允许列表蒙混。当前例外：

| 包 | 声明 | 处理 |
| --- | --- | --- |
| `@getpaseo/plugin`、`client`、`protocol`、`relay` 的 `0.14.0` | npm 包没有 `license` 字段，也没有附 LICENSE | 按上游 `getpaseo/paseo` 标签 `v0.14.0` 的 LICENSE 记为 Apache-2.0。换版本要重新打开那个标签核对 |
| `caniuse-lite@1.0.30001820` | CC-BY-4.0 | React Native 工具链带进来的浏览器数据。CC-BY **不**进入总允许列表，只放行这一个版本。不把这份数据抄进仓库 |

本仓库自己的 `package.json` 必须是 MIT，和根目录 `LICENSE` 一致。

## 权限清单

`plugins/opc-core/permissions.manifest.json` 里，外壳和已启用的 `m1-notes` 声明 `**/*.md`、`**/*.markdown` 与 `**/*.canvas` 的读写，以及 `/home/br1efx/notes/`、`收集/`、`视频审阅/` 和 `cards/`。外壳另外声明 `/home/br1efx/.opc/` 和 `/home/br1efx/.opc/worktrees/` 的读写，给接单状态库和工作副本。外壳联网打开，主机是 `127.0.0.1` 和 `api.github.com`。`127.0.0.1` 给 daemon 读本机 Magpie（3425）和数据仓（3475），以及电脑端打开的管理页（3430）。`api.github.com` 给 opc-intake 经 `gh` 访问 opc-os，不在进程里写死令牌。`m1-notes` 不联网。收集的网址是用户临时给的，扫描器对不上字面量主机，所以拉页放在 `@opc-os/page-fetch`，插件源码里不写 `fetch`。`m2-card-wall` 已启用，读写只声明 `/home/br1efx/notes/cards/` 和 `/home/br1efx/notes/cards/_views/`，不联网。`m4-tasks` 已启用，读写声明 `/home/br1efx/notes/cards/` 以及 `_workflows/`、`_sessions/`、`_schedules/`，不联网。`m5-ui` 已启用，只读 `/home/br1efx/notes/cards/_ui/`，不写、不联网。`m3-gateway`、`m6-i18n` 仍是 `enabled: false`，未启用时也不能预先写上路径或主机。界面上的模块开关是另一份主机设置，默认打开；它不改这份清单。

对照方式：

- 清单本身要能解析，`pluginId` 要等于 `paseo-plugin.json` 的 `id`，模块集合要和目录边界里的六个目录一致。
- 扫 `opc-core` 的 `.ts` / `.tsx` / `.mts`。出现 `node:fs` 而 read/write 都是空的，失败。出现 `fetch`、`WebSocket` 或 `node:http` 而 `network.enabled` 不是 true，失败。
- 联网打开之后，源码里的 `http(s)://` 主机必须出现在 `hosts`。没有字面量网址时失败，避免动态地址绕过清单。

还做不到的部分：清单里写了路径模式之后，扫描器**不能**证明源码只访问了这些模式。它只检查「用了文件系统或网络 API，但清单是空的或没开联网」。笔记和卡片的服务端用 `node:fs` 读写，这些文件在 `server/`，扫描时算在外壳上，所以外壳的 read/write 不能是空的。卡片路径的越界检查在代码里，不在扫描器里。扫描器只在文件真正调用了网络 API 时才核对网址；纯字符串里的地址不会单独触发这项检查。

## 数据仓

`pnpm verify` 在 `services/opc-datad` 里执行 `CGO_ENABLED=1 go test ./...`。失败退出 1。这不是上面 7 项里的一项。需要 Go 1.22 和 SQLite 头文件。驱动 `github.com/mattn/go-sqlite3` v1.14.24 的许可是 MIT。npm 许可证扫描看不到 Go 模块，这项许可写在 [adr/0003](../adr/0003-d4-gateway-monitor.md)。

## 手机端打包

未执行，不是通过。

`pnpm verify:mobile` 只核对三件静态前提：`index.client.tsx`、`client/home.tsx`、`react-native` 写在开发依赖里。然后看 PATH 上有没有 `paseo`。

- 没有 `paseo`：退出码 2，状态 `DEFERRED`。CI 镜像里没有 Paseo，也没有 Android/iOS 打包工具链，不会去跑 `react-native bundle` 假装打包。
- 有 `paseo`，但仓库还没有接上真实打包命令：退出码 1。找到二进制不算打包成功。
- 入口文件缺失：退出码 1。

TODO：Paseo 工具链进 CI 之后，把官方打包命令接到 `scripts/verify/mobile.mjs`，只有那个命令退出 0 才能返回 `pass`。

## 性能预算

`config/perf-budget.json` 锁定规范里的三个数字：

- 插件启动 `max` 300，单位 ms
- 手机端单页首屏 `max` 1500，单位 ms
- 后台常驻内存 `max` 150，单位 MB

CI 检查文件存在、JSON 可解析、这三个数字和单位没有被改掉。`measurement.enforced` 必须是 `false`。把它改成 `true` 会失败，因为仓库里没有测量结果。

`pnpm verify:perf` 退出 0 只表示阈值文件有效。输出里的性能测量仍是 `DEFERRED`。

TODO：有 Paseo 和真机计时之后，把测量结果写进单独的结果文件，再允许 `measurement.enforced` 变为 true，并按上面的阈值判定。规范里还有「索引任务走低优先级」，没有单独的数字，现在不检查。
