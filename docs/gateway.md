# 网关与监控

M3 接在正在运行的 Magpie 上。本仓库不包含 Magpie 源码。取舍见 [adr/0003](../adr/0003-d4-gateway-monitor.md)。

## 本机进程

| 进程 | 地址 | 谁启动 |
| --- | --- | --- |
| Magpie 网关 | `127.0.0.1:3425` | 操作员。插件只读 |
| Magpie 网页 | `127.0.0.1:3430` | `magpie serve --web`，只听本机。需要 `MAGPIE_WEB_KEY` |
| opc-datad | `127.0.0.1:3475` | 本仓库的 Go 程序 |

网页口不要绑到局域网或公网。`MAGPIE_WEB_KEY` 留在 Magpie 进程里。插件不读这把钥匙，打开管理页时也不把它放进网址。

`MAGPIE_NO_STATS=1` 保持现网已经打开的状态。插件不改这个变量。

账号发现保持现网开启。现网为了 Cursor 订阅模型需要它。不要设置 `MAGPIE_NO_ACCOUNTS`，也不要执行会关掉发现的命令。

不要启用 Claude 订阅桥。插件没有这个开关，也不会去拉起那条本机路径。

## 插件怎么读

默认关闭「真机探测」。手机上的今日花费是 **1.25 美元**，页眉写着「模拟」。这是明确的模拟数据，不是网关上的数字。

打开探测后，Paseo daemon 用应用钥匙 `magpie-opc-<模块名>` 访问本机网关。默认模块是 `m3-gateway`，钥匙是 `magpie-opc-m3-gateway`。每个请求带上：

- `Authorization: Bearer magpie-opc-…` 和 `x-api-key`
- `x-opc-person`、`x-opc-project`、`x-opc-role`、`x-opc-module`
- `x-magpie-session`，形状是 `opc-<人>-<项目>-<角色>-<模块>`

读取顺序：

1. `GET /api/hello`
2. `GET /v1/models`
3. `GET /v1/magpie/quotas?kept=1`（不刷新供应商）
4. `GET /v1/magpie/usage?period=today`，404 再试 `/usage` 和 `/api/usage`
5. `GET /v1/magpie/usage/requests?period=today&limit=20`，404 再试短路径
6. `GET /v1/magpie/route?session=…`，404 再试短路径
7. `GET /v1`（只在本机回应里读进程号）

手机不直接访问 `127.0.0.1`。数字由 daemon 的 RPC `gateway.snapshot` 带回来。探测失败时花费留空，页眉是「探测失败」，不会拿模拟数冒充。

主机设置标识是 `gateway`，和外壳开关 `shell` 分开。默认人 `me`、项目 `opc`、角色 `owner`、模块 `m3-gateway`、限额 25 美元。

## 电脑上的管理页

有工作区浏览器的电脑客户端显示「在这台电脑嵌进管理页」。它打开 `http://127.0.0.1:3430`，工作区用当前列表里的第一个。手机和没有该能力的客户端只显示说明，今日花费仍在页面上方。

`DocumentFrame` 跑不了 Magpie 的网页脚本，所以不用内嵌框架。

## 页签

| 页签 | 内容 |
| --- | --- |
| 额度用量 | 人 × 项目 × 角色 × 模块，加上额度窗口和今日 `cost` |
| 路由 | 当前模型和回退 |
| 请求日志 | 今日最多 20 条 |
| 供应商健康 | 模型列表里的供应方 |
| 防封状态 | 只读说明。不改 Magpie 限流 |
| 主机资源 | 网关自报的进程号 |
| 成本熔断 | 限额和告警卡 |

仓库里没有单独的 Token Ledger。今日花费就是用量里的 `cost`。仓库里没有 Host monitor，这里不采集 CPU 或内存。关掉模块「网关与监控」就从侧栏卸掉这两块。不用 Paseo 的 `registerUsageSource`，那个接口会发现登录。

## 成本熔断

花费大于或等于限额时生成一张卡片：类型「问题」，状态 `alert`，标题「成本熔断」，负责人是 Agent `opc-gateway`。卡片能通过 `parseCard`。花费未知、限额不是有限非负数时不报警。

页上可以选 25、1、0.01 美元。模拟花费是 1.25，选 1 或 0.01 会出告警卡。选中的限额会写进主机设置。

## opc-datad

```bash
cd services/opc-datad
CGO_ENABLED=1 go test ./...
OPC_DATAD_ADDR=127.0.0.1:3475 OPC_DATAD_DB=opc-datad.sqlite go run .
```

需要 Go 1.22 和 SQLite 头文件（`libsqlite3-dev`）。数据库文件被 git 忽略。

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/health` | 存活 |
| POST | `/v1/traces` | OTLP JSON。span 属性里的 `opc.person` 等覆盖请求头 |
| POST | `/v1/metrics` | OTLP JSON |
| POST | `/v1/ingest` | 等价写入。正文含 `name`、`costUsd` |
| GET | `/v1/records?limit=` | 按写入顺序读出，最多 200 条 |

非本机来源返回 403。绑定地址不是 `127.0.0.1`、`localhost` 或 `::1` 时进程直接退出。

插件在读完快照后向 `http://127.0.0.1:3475/v1/ingest` 写一条。熔断时名字是 `opc.gateway.cost-alert`，否则是 `opc.gateway.snapshot`。数据仓没开时页面写明写不进去，网关数字仍然返回。

若要让 Magpie 自己把 OTLP 送到数据仓，端点指到 `http://127.0.0.1:3475`。这是操作员的 Magpie 配置，不在本仓库里改。

## 权限

`permissions.manifest.json` 里外壳 `network.enabled` 为 true，`hosts` 只有 `127.0.0.1`。六个模块的 `enabled` 仍是 false。界面上的模块开关不改这份清单。
