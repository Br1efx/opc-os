# 0002 · D1 的外壳开关、设置通知和卡片协议

状态：已接受

## 背景

D0 的 `opc-core` 只有页面「一人公司 OS」和一个侧边栏按钮。M1–M6 是说明目录，开关没有接上。`card-protocol` 的修订号是 `stub`，负责人是一段不区分人和 Agent 的字符串。

用户已经定过：仍然是一个核心插件，不拆成多个插件。D1 要补上模块开关、统一设置、统一通知、可校验的卡片字段，以及中文术语表。权限清单里的 `enabled: false` 表示这个模块还不能声明文件或网络权限。界面上的开关是另一件事。

`@getpaseo/plugin` 0.14.0 的类型里有 `addScreen`、`addSidebarHeaderItem`（都返回清理函数）、`addSettingsScreen`、`defineSettings`、`useSettings`、`server.registerSettings`。没有插件用的通知收件箱。发布包里的 `client/ui` 运行时代码是空的，`useSettings` 也没有出现在 `dist/client/index.js`；`SidebarRow` 同样只在类型里。这些界面模块由 Paseo 宿主在加载插件时提供，和 D0 已经在用的 `SidebarRow` 是同一种接法。

## 决定

模块开关写在主机设置 `shell` 的 `modules` 里，六个模块默认打开。设置还没读到时不登记模块页面。读到之后，只给打开的模块调用 `addScreen` 和 `addSidebarHeaderItem`；关掉时调用这两次登记返回的清理函数。首页和设置页都渲染同一份开关。

「设置」有两条入口：侧栏页面 `settings`，以及 Paseo 设置里的页面 `modules`。内容是同一份开关。「通知」是侧栏页面 `notifications`，这一版只说明还没有新通知。

权限清单里六个模块的 `enabled` 保持 `false`。占位页面不读文件、不联网。运行时开关不改这份清单。

卡片协议修订改为 `d1`。类型只收选题、任务、资产、问题、素材。负责人是 `{ kind: "person" | "agent", id }`。`parseCard` 检查非空标识、已知类型、负责人和可解析的时间。状态机仍不冻结。

M1–M6 的实现代码放在 `client/` 和 `shared/`。`modules/` 目录继续只放 Markdown。

## 后果

关掉的模块不会留在侧栏里，对应页面也会卸掉。重新打开插件时，主机上的设置还在。

探针插件 `opc-spike-peer` 里的示例卡改成了新形状，否则类型检查过不了。S1 的历史记录不改；可再跑的探针脚本用的是新示例。

这次没有在 me 面板上点过这些页面。若正在跑的 Paseo 没有 `registerSettings` 或 `useSettings`，插件会在运行时失败。类型依据是仓库锁定的 `@getpaseo/plugin@0.14.0`。

D2 改了 M1 和外壳的文件权限，通知页也会列出锁定还原。见 [0004](0004-d2-notes.md)。本记录的外壳决定仍然有效。D3 把协议修订加到 `d2`，状态改成生命周期，并增加决策类型。见 [0005](0005-d3-card-wall.md)。
