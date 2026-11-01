# 0007 · D5b 的 opc-intake 接单引擎和调度员

- 状态：已接受
- 日期：2026-11-01
- 相关：[0006](0006-d5a-tasks-workflows.md)

## 背景

D5a 把任务卡、工作流和卡住阶梯放进了卡片墙，没有接单引擎。D5b 要把一句话或 Issue 里的 @ 送到「等你验收」，中间不加人，全程两条消息：确认和结果。

上游是 dsh-superagent 的 `src/core`，commit `6337fc823ce20251c8de8085948165c81aaa701e`，MIT。存储、Paseo 和 GitHub 不在 core 里。S3 已经说明架构页上的 `agent.open.before` / `agent.turn.after` 在 SDK 0.14.0 不存在。这台云端机器没有 Magpie 钥匙，也没有 `briefx-bot` 的令牌。

## 决定

1. `packages/intake-core` 原样复制 `src/core` 和它的 core 测试。版权在包内 `LICENSE` 和仓库根的 `THIRD_PARTY_NOTICES`。测试只改了 import 路径。core 的 `UserError` 英文模板保持不动，因为上游测试按原文比较。中文出现在 opc-core 适配层：确认、结果、阶段名、面板和拒绝原因。
2. 接单模式默认 `observe`，写在 `agent-kit/shared/policy.yaml`。`off` 不准入。`observe` 里，名单上的人被点名时只记「本来会接单」，不启动执行器，也不写工单卡。改成 `auto` 之后，这些记录会重新评估并接单。准入只看模式、是不是人、在不在名单、有没有被点名。评论正文不读，所以写「给我开权限」或改准入表文本都不能提权。授权范围变大时，原工单的范围不动，另开一张工单；提权字样会从范围里拿掉。
3. 状态先写入 `~/.opc/intake.sqlite` 的一张 JSON 快照，再做发送。发送失败从 2 秒起翻倍，到 1 分钟封顶。已经发送的评论和已经记下的 PR 编号会随快照恢复，重启后不重复发、不重复开。这里不自动开 PR，也不自动合并。同一工单若以后显式打开，编号只记一次。
4. 执行器按 `br1efx` 用户理解。每张工单用 `git worktree add -b` 建独立工作副本，参数里没有 merge。没设置 `OPC_REPO` 时只记「工作副本留待真机」，不假装已经建好。`/home/br1efx/.opc` 写不了时改到当前用户的 `~/.opc`，并写明需真机以 br1efx 运行。
5. GitHub 来源只在环境变量 `OPC_GITHUB_TOKEN` 有值时轮询。子进程只拿到从它映射的 `GH_TOKEN`，不用调用方环境里的其他令牌，令牌也不进参数。账号名是 `briefx-bot`。回复以「这是自动 Agent 写的」开头。卡片墙的手动任务和「转成任务」走同一套接单。Telegram、Grok、定时任务、收集只留端口，不实现。
6. 调度员在这一阶段是代码，不是一次模型调用。面板写明路由 DeepSeek T3、经 Magpie、不准再升 DeepSeek T2，待实测。仓库不放 Magpie、不放钥匙。备注超过 30 个词，或出现 sleep、长等待、带数字的等待，直接拒绝。路由工具只加给角色 `dispatcher`、`调度员`、`secretary`、`总秘书`。六个执行工具只加给 `executor`、`执行器`。宿主自带的工具这里卸不掉，需真机确认主机工具策略。
7. 注入用 `agent.session_open`，回报用 `agent.turn_ended`。`session_open` 的请求上有 `labels`；`turn_ended` 的 agent 对象没有 labels。工单号在打开会话时从 `opc-ticket` 记下，回合结束再按 agent id 找回。建执行器只在设置了 `OPC_EXECUTOR_PROVIDER` 且当时拿得到 Paseo 客户端时尝试，幂等键是 `intake-<工单>`，不传合并。没设供应商就记「留待真机」。
8. 「等你处理」对带 `intakeTicket` 的卡只认等人阶段：输入未送达、等你回答、等你验收、受阻、失败。第一条命中，和 `ticketStage` 一致。没有工单的卡仍用 D3 的收件箱规则。同一张卡只计一次。就绪汇报前会先绑上这张工单自己的工作副本话题，这样工单停在等你验收，而不是被就绪直接结束。
9. 面板页签是等你处理、来源、事件、评估、执行、设置。设置用文本展示策略，不提供输入框。改策略改文件。卡片墙和任务页都放这个面板。
10. 权限清单的外壳增加 `/home/br1efx/.opc/`、`/home/br1efx/.opc/worktrees/`，主机增加 `api.github.com`，并保留 `127.0.0.1`。`server/` 的文件在扫描器里算外壳，所以不把 GitHub 主机只写在 m4 上。m4 仍然不联网。m3、m5、m6 仍是 `enabled: false`。

## 后果

core 测试由 vitest 跑，因为 Node 只剥类型时不支持上游的参数属性。opc-core 的单测因此改用 `--experimental-transform-types`。

没有在 Paseo 真机上加载过这个插件，也没有用 `briefx-bot` 发过评论、建过 Agent 或杀过 daemon。这些标了需真机验证：插件进程里的 S7、从 @ 到等你验收的真 Agent、一分钟轮询、重启恢复、端到端两条消息。单测覆盖的是引擎、快照和假执行器。

不改 registry，不卸旧插件，不自动合并。
