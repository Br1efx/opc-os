# 术语表

opc-os 的界面默认用中文。下表给文档和界面用同一套说法。标了「界面保留」的词，界面上继续写英文，不译成中文。

| 词 | 中文 | 怎么用 |
| --- | --- | --- |
| Agent | 智能体 | 界面保留 Agent。负责人可以是某个人，也可以是某个 Agent。 |
| Workspace | 工作区 | 一次工作所在的目录和会话。 |
| Schedule | 定时任务 | Paseo 到点开一轮新的 Agent。 |
| Heartbeat | 心跳提醒 | 同一个 Agent 到点被提醒一次。 |
| Worktree | 工作副本 | Git 工作区旁边的一份检出。 |
| Plugin | 插件 | 装进 Paseo 的一套代码。opc-os 当前只有一个核心插件 `opc-core`。 |
| Shell | 外壳 | 核心插件里一直在的部分：首页、侧栏、模块开关、设置、通知。 |
| Module | 模块 | 外壳里面的一块功能。M1–M6 都在 `opc-core` 里，不是各自一个插件。关掉的模块不登记页面，也不出现在侧栏。 |
| Card | 卡片 | 一件事的一张记录。选题、任务、资产、问题、素材都是卡片。 |
| Kanban / board | 看板 | 按状态把卡片分成几列来看。卡片墙是贴满卡片的总览，看板是其中一种看法。 |
| Canary | 金丝雀 | 先在自己的面板（me）上用，确认没问题再推到另一个面板（dad）。 |
| Topic | 选题 | 卡片类型。还没决定要不要做的题目。 |
| Task | 任务 | 卡片类型。已经要做的一件事。 |
| Asset | 资产 | 卡片类型。可以复用的方法、规范、素材结论。 |
| Question | 问题 | 卡片类型。需要人拍板的疑问。 |
| Material | 素材 | 卡片类型。写稿或做片要用的原始材料。 |
| Owner | 负责人 | 这张卡归谁。要么是人，要么是 Agent。 |
| Status | 状态 | 这张卡走到哪一步。状态机还没冻结，协议里只要求非空字符串。 |
| One-liner | 一句话 | 标题下面那句摘要。 |
| Source | 来源 | 这张卡从哪来，例如某轮 Agent、某次收集、人手动新建。 |
| Evidence | 证据 | 支撑这张卡的链接。 |
| Related | 关联卡 | 其他卡片的 id。 |
| Unread | 未读 | 还没有人看过。通知和卡片墙以后都读这个字段。 |
| Notification | 通知 | 外壳上的统一入口。这一版只有页面，还没有真实通知。 |
| Settings | 设置 | 外壳上的统一入口。模块开关保存在这里。 |
| Sidebar | 侧边栏 | Paseo 边上的那一列按钮。 |
| Screen | 页面 | 插件登记的一块界面。未知的页面 id 打不开。 |
| Error boundary | 错误边界 | 某个模块界面崩了，只显示「这块坏了」，不拖垮整个 Paseo。 |
| Registry | 插件目录 | GitHub Pages 上的静态 JSON，用来安装插件。 |
| Verify | 门禁 | 合并前要过的检查。不过不许当通过。 |
| Paseo | Paseo | 界面保留这个名字。插件装进它的手机和电脑客户端。 |

卡片字段的机器可读名字在 `packages/card-protocol`：`id`、`type`、`status`、`title`、`oneLiner`、`owner`、`source`、`evidence`、`related`、`time`、`unread`。
