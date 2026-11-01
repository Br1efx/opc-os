# 0003 · D4 外接 Magpie，本仓库只做监控和数据仓起步

状态：已接受

## 背景

D1 的 M3「网关与监控」只有入口。用量、路由、请求日志、供应商健康、防封、主机资源和成本告警都还没有页面。

Magpie 已经在本机跑着：网关 `127.0.0.1:3425`，网页口 `magpie serve --web` 在 `3430`，需要 `MAGPIE_WEB_KEY`。`MAGPIE_NO_STATS=1` 已经打开。账号发现因为 Cursor 订阅模型需要，保持现网开启。Claude 订阅桥是另一条本机路径，不能接上。

仓库里没有 Token Ledger，也没有 Host monitor。Paseo 的 `registerUsageSource` 会去发现登录，不能拿来当用量来源。

## 决定

L1 外接正在运行的 Magpie，L2 在 `opc-core` 和 `services/opc-datad` 里共建。不把 Magpie 源码放进仓库，也不 fork。

插件 daemon 只向字面量 `http://127.0.0.1:3425` 读 `hello`、额度、今日用量、请求、路由和 `/v1`。额度带 `kept=1`，不主动刷新供应商。正式路径 404 时再试短路径。应用钥匙是 `magpie-opc-<模块名>`，请求带上人、项目、角色、模块。

默认关闭真机探测。手机通过 daemon 的 RPC `gateway.snapshot` 看到标明「模拟」的今日花费 `1.25` 美元。打开探测后才读本机网关。探测失败时花费留空，不当成超支。

电脑端用工作区的 `openBrowser` 打开 `http://127.0.0.1:3430`。插件不读取 `MAGPIE_WEB_KEY`，也不把它写进网址。手机和没有该 API 的客户端只说明管理页在这台电脑上。

`opc-datad` 用 Go 1.22 和 SQLite，只绑 `127.0.0.1:3475`。它收 OTLP JSON（`/v1/traces`、`/v1/metrics`）和等价写入 `/v1/ingest`，再用 `GET /v1/records` 读出。SQLite 驱动是 `github.com/mattn/go-sqlite3` v1.14.24，许可 MIT。

花费达到或超过限额时，按卡片协议修订 `d1` 生成一张问题卡：标题「成本熔断」，负责人 `{ kind: "agent", id: "opc-gateway" }`。界面上可以把限额调到 `1` 或 `0.01`。

今日花费用 Magpie 用量里的 `cost` 代替 Token Ledger。主机页只显示网关自报的进程号，不采集 CPU 或内存，以此代替 Host monitor。关掉模块 `m3-gateway` 就从侧栏卸掉这两块。不用 `registerUsageSource`。

权限清单里外壳联网打开，主机只有 `127.0.0.1`。六个模块的 `enabled` 仍是 `false`。

## 后果

没有在这台检查机上连用户的 Magpie，也没有在 Paseo 手机或电脑客户端里点过页面。验收靠模拟数据和本机回环上的假网关。

`pnpm verify` 多跑一项 `services/opc-datad` 的 Go 测试。它不是架构页那 7 项里的一项，失败一样拦住。CI 需要 Go 1.22 和 `libsqlite3-dev`。

操作员不要设置 `MAGPIE_NO_ACCOUNTS`，不要关掉账号发现，不要启用 Claude 订阅桥，不要把网页口绑到非本机地址。`MAGPIE_NO_STATS=1` 保持现网已开的状态，本插件不改它。
