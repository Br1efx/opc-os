# 收集的三个未接通入口

笔记里的 `/收集` 和附件来源「笔记库」已经会写收件箱。下面三个入口只保留同一套入参，这一阶段不连出去，也不听端口。

入参是 `IngestCollectInput`：`port`、可选 `url`、`html`、`title`、`tags`、`text`、`relativePath`、`now`、`nonce`。`port` 可以是 `telegram`、`clipper` 或 `grok`。

现在这两条都不会写卡：

- `ingestCollect` 看到这三个 `port` 时返回「这个入口还没接通」，不调用 `writeCard`，也不去拉页面。
- `respondCollectPort` 固定返回 HTTP 404 和同一句中文。插件没有为它绑定套接字。

以后若要接通，请求体沿用这套字段，令牌只放环境变量，不进仓库：

| 入口 | 以后的形状 | 现在 |
| --- | --- | --- |
| Telegram | `POST` JSON，`port` 为 `telegram`。令牌用 `OPC_TELEGRAM_TOKEN` | 未接通 |
| 浏览器剪藏 | `POST` JSON，`port` 为 `clipper`。令牌用 `OPC_CLIPPER_TOKEN` | 未接通 |
| Grok 转交 | `POST` JSON，`port` 为 `grok`。令牌用 `OPC_GROK_TOKEN` | 未接通 |

opc-intake 的收集来源仍然关闭。笔记斜杠写进收件箱，不等于接单把收集当成正式来源。
