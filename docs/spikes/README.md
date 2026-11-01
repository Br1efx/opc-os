# 原型实验

每项结论在对应文件里，不能用本页的题目代替结论。

## D0 · S1–S6

D0 第 4 步的记录。

| 编号 | 要验证的问题 | 结论 | 记录 |
| --- | --- | --- | --- |
| S1 | monorepo 能否用 Git 源安装、编译，并让两个插件共用 `card-protocol` | PASS | [S1.md](S1.md) |
| S2 | `web.ts` 里能否挂上 CodeMirror 6 和小弹窗；电脑端可编辑，手机端只读且不报错 | PARTIAL | [S2.md](S2.md) |
| S3 | `agent.open.before` 能否注入工具，`agent.turn.after` 能否写入时间线 | BLOCKED | [S3.md](S3.md) |
| S4 | 插件后台能否调用 `paseo schedule` 来创建和删除定时任务 | PARTIAL | [S4.md](S4.md) |
| S5 | 手机经 Relay 打开大图或大文件的速度 | BLOCKED | [S5.md](S5.md) |
| S6 | 能否从一个插件打开另一个插件的页面 | BLOCKED | [S6.md](S6.md) |

S2、S4 的编译或命令有实结果，但架构页的通过标准还没有完全满足，所以不记 PASS。S3、S5、S6 缺手机、桌面界面或可用的 Agent provider，对应标准的判定是 UNKNOWN，不是失败，也不是通过。

S6 还没有运行时的「能」或「不能」。在桌面端试过跨插件打开页面之前，产品页面继续留在 `opc-core`。

## D5b · S7–S9

接单引擎动手前先做的三项目。S7、S8 没有记成「不能」，所以引擎写在同一分支。云端没跑到的步骤标了需真机验证。

| 编号 | 要验证的问题 | 结论 | 记录 |
| --- | --- | --- | --- |
| S7 | superagent core 在 Node ≥22.19 + node:sqlite 上，core 测试能否通过 | 能。daemon 内加载需真机验证 | [S7.md](S7.md) |
| S8 | 注入 6 个工具并让一张工单自动走到等你验收 | 部分能。真 Agent 需真机验证 | [S8.md](S8.md) |
| S9 | briefx-bot 轮询，1 分钟内出工单 | 这台机器不能。延迟需真机验证 | [S9.md](S9.md) |
