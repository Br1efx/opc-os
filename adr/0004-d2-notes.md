# 0004 · D2 的文件面板笔记、批注和锁定

- 状态：已接受
- 日期：2026-11-01
- 相关：[0002](0002-d1-shell-and-cards.md)、[0003](0003-d4-gateway-monitor.md)、[docs/paseo-plugin.md](../docs/paseo-plugin.md)

编号是 0004。0003 已经是 D4 的网关决定，合入时没有改那个编号。

## 背景

架构页把笔记放在文件面板上，用 CodeMirror 6 存 Markdown 原文，并要求批注和三层锁定。S2 只在浏览器里量过包体，没有把编辑器接进插件。Paseo 0.14.0 的官方 `markdown-panel` 示例把编辑器关在 `client/web.ts` 里，用 `Platform.OS !== "web"` 挡住后再 `require`，手机走 `useFileText`。SDK 里没有名为 `agent.open.before` 或 `agent.turn.after` 的钩子；工具挂在 `agent.session_open`，回合结束是 `agent.turn_ended`，且该事件的时间线字段已废弃。

## 决定

1. 笔记留在 `opc-core`，不拆插件。文件面板 `opc-notes` 只在 M1 打开时注册。
2. 编辑器只在 `client/web.ts` 里加载 CodeMirror 6。电脑可改，手机只读。原文直接存成 Markdown。
3. 批注用 CriticMarkup `{==摘录==}{>>批注<<}`，线程写在文件末尾 `%% comments %%` 之后。Agent 工具名为 `list_comments`、`reply_comment`、`resolve_comment`。格式自己定，不复制 Review Comments。
4. 锁定标记为 `<!-- lock:start id -->` … `<!-- lock:end -->`。编辑器用 `changeFilter` 挡住人工按键，整篇替换必须显式关掉过滤器。保存前用 RPC 再查一次。Agent 工具拒绝写入会改锁定区的文本。回合结束时按锁定区内文的 SHA-256 比对，被改过就还原，并在时间线和通知页留下一条。
5. 外壳和 M1 的权限清单声明 `**/*.md` 与 `**/*.markdown`。服务端读写走 `node:fs`，因为插件上下文没有通用的读文件方法。
6. 依赖版本与 `opc-spike-peer` 的探测范围相同，许可证保持 MIT。

## 后果

- 回合开始时的快照只留在内存里。进程重启后，这一回合无法再还原。
- 通知列表也在内存里，重启后页面为空，时间线上的那条还在。
- 未闭合的 `lock:start` 不当成锁定。Git 提交前的钩子不在插件生命周期里，这次不做。
- 看板（D3）和画布（D6）不做。
- registry 里的提交指针仍停在 D1，合入 main 之前不改。
