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
| Card | 卡片 | 一件事的一张记录。选题、任务、资产、问题、素材、决策都是卡片。 |
| Kanban / board | 看板 | 按状态把卡片分成几列来看。卡片墙是贴满卡片的总览，看板是其中一种看法。 |
| Canary | 金丝雀 | 先在自己的面板（me）上用，确认没问题再推到另一个面板（dad）。 |
| Topic | 选题 | 卡片类型。还没决定要不要做的题目。 |
| Task | 任务 | 卡片类型。已经要做的一件事。 |
| Asset | 资产 | 卡片类型。可以复用的方法、规范、素材结论。 |
| Question | 问题 | 卡片类型。需要人拍板的疑问。 |
| Material | 素材 | 卡片类型。写稿或做片要用的原始材料。 |
| Owner | 负责人 | 这张卡归谁。要么是人，要么是 Agent。 |
| Status | 状态 | 这张卡的生命周期。取值是收件箱、孵化中、推进中、已沉淀、搁置、归档。机器名是 `inbox`、`incubating`、`active`、`settled`、`shelved`、`archived`。它和工作流步骤不是一回事。 |
| One-liner | 一句话 | 标题下面那句摘要。 |
| Source | 来源 | 这张卡从哪来，例如某轮 Agent、某次收集、人手动新建。 |
| Evidence | 证据 | 支撑这张卡的链接。 |
| Related | 关联卡 | 其他卡片的 id。 |
| Unread | 未读 | 还没有人看过。卡片墙上会标出来。侧栏的数量看的是「等你处理」，不是未读条数。 |
| Notification | 通知 | 外壳上的统一入口。锁定区被改后自动还原时，会在这里留一条。 |
| Settings | 设置 | 外壳上的统一入口。模块开关保存在这里。 |
| Sidebar | 侧边栏 | Paseo 边上的那一列按钮。 |
| Screen | 页面 | 插件登记的一块界面。未知的页面 id 打不开。 |
| Error boundary | 错误边界 | 某个模块界面崩了，只显示「这块坏了」，不拖垮整个 Paseo。 |
| Registry | 插件目录 | GitHub Pages 上的静态 JSON，用来安装插件。 |
| Verify | 门禁 | 合并前要过的检查。不过不许当通过。 |
| Paseo | Paseo | 界面保留这个名字。插件装进它的手机和电脑客户端。 |
| File panel | 文件面板 | 打开工作区里某个文件的那一块。笔记挂在 Markdown 上，不是单独一套笔记软件。 |
| Comment | 批注 | 正文里的 `{==摘录==}{>>批注<<}`，线程写在文件末尾 `%% comments %%`。 |
| Quote | 摘录 | 批注对着的那段原文。 |
| Lock | 锁定 | `<!-- lock:start 标识 -->` 到 `<!-- lock:end -->` 之间的原文。编辑器里只读，Agent 也不能改。 |
| Magpie | Magpie | 界面保留这个名字。本机上的模型网关，opc-os 只外接，不把源码放进仓库。 |
| Quota | 额度 | 供应商账户还剩多少。M3 只读，不刷新供应商。 |
| Probe | 真机探测 | 打开后 daemon 才读本机 Magpie。关掉时手机看到标明的模拟花费。 |
| Circuit breaker | 成本熔断 | 今日花费达到限额时出一张告警卡。 |
| opc-datad | 数据仓 | 本机 Go 服务，把 OTLP 或等价写入收进 SQLite，再按 HTTP 读出。 |
| Token Ledger | Token Ledger | 界面保留英文。本仓库没有单独账本，今日花费用 Magpie 用量里的 cost。 |
| Host monitor | Host monitor | 界面保留英文。本仓库不采集 CPU 或内存，只显示网关自报的进程。 |
| Decision | 决策 | 卡片类型。复盘映射到这里。 |
| Bases | 视图查询 | 按属性筛选、排序、分组。这一阶段是子集，不是 Obsidian 的全部语法。界面说「视图」，不把 Bases 写在按钮上。 |
| Inbox | 收件箱 | 生命周期的第一步，也是预置视图。新到的卡先放这里。 |
| Incubating | 孵化中 | 打回之后回到这里，让 Agent 继续改。 |
| Active | 推进中 | 已经同意继续做，或已经指派。 |
| Settled | 已沉淀 | 问题或决策被同意之后停在这里。 |
| Shelved | 搁置 | 先放着，不归档。 |
| Archived | 归档 | 从墙上的待处理队列拿掉。状态看板里单独一列。 |
| 等你处理 | 等你处理 | 默认视图，也是侧栏文字。预置筛选是收件箱。数量处理后下降。 |
| Project | 项目 | 卡片上的业务线。预置三列：父亲 AI 芝麻馆、Build in Public、插件开发。 |
| Build in Public | Build in Public | 界面保留。这是一条业务线的名字，不是通用英文。 |
| 想法 | 选题 | §1.2 的笔记种类。写入卡片前换成 `topic`。 |
| 随笔 | 素材 | §1.2 的笔记种类。写入前换成 `material`。 |
| 资料 | 资产 | §1.2 的笔记种类。写入前换成 `asset`。 |
| 链接 | 素材 | §1.2 的笔记种类。写入前换成 `material`。 |
| 视频 | 素材 | §1.2 的笔记种类。写入前换成 `material`。 |
| 提醒 | 任务 | §1.2 的笔记种类。写入前换成 `task`。近期提醒视图因此用任务类型。 |
| 复盘 | 决策 | §1.2 的笔记种类。写入前换成 `decision`。 |
| Stage | 步骤 | 任务在工作流里的位置，例如实现、待你验收。机器名是 `stage`。缺省时界面写「未命名步骤」。 |
| 缺证据 | 缺证据 | 还没有证据，不能进入待验收或完成。 |
| 卡住了 | 卡住了 | 失败累计到阶梯之后的视图。级别大于等于 1 才算。 |

卡片的公共字段在 `packages/card-protocol`：`id`、`type`、`status`、`title`、`oneLiner`、`owner`、`source`、`evidence`、`related`、`time`、`unread`。协议修订是 `d3`。任务还可以带 `goal`、`acceptance`、`due`、`dependsOn`、`workflow`、`stage`、`failCount`、`ladderLevel`。这些可以不出现，旧卡仍可读。业务线写在前言的 `project`，不属于公共字段。对照表在 [adr/0005](../adr/0005-d3-card-wall.md) 和 [adr/0006](../adr/0006-d5a-tasks-workflows.md)。
