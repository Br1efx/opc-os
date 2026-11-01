# 私有插件 registry

架构页「v2.0 · 插件体系总体架构与工程规范」§5 的发布方式，以及 §11 第 5 步里「搭 GitHub Pages」这一半。静态 JSON 放在 GitHub Pages 上，Paseo 用 `PASEO_PLUGIN_REGISTRY` 指向它，再按 `owner/slug` 安装钉死的 Git 提交。

**本文件只说明仓库里的站点和以后怎么装。** 没有在 me 面板（Linux 用户 `me`，daemon 端口 6767）上执行安装，也没有连 B 老师的 VPS。dad 面板（端口 6768）不在这一步。

## 发布路径

站点根目录是仓库里的 `registry/`。GitHub Actions 工作流 `.github/workflows/pages.yml` 在 `main` 被推送之后，把这个目录原样部署到 GitHub Pages。`workflow_dispatch` 可以在 Pages 开关打开后再跑一次。

部署之后，Paseo daemon 读取的地址是：

| 用途 | 地址 |
| --- | --- |
| registry 基址 | `https://br1efx.github.io/opc-os` |
| `opc-core` 安装文档 | `https://br1efx.github.io/opc-os/plugins/br1efx/opc-core.json` |
| 目录索引（daemon 不读） | `https://br1efx.github.io/opc-os/index.json` |

这是项目站点，基址带路径前缀 `/opc-os`。用户站点 `https://br1efx.github.io` 对不上这些文件。

源码对应关系：

```text
registry/                          ← Pages 站点根
├─ index.json                      ← <base>/index.json
└─ plugins/br1efx/opc-core.json    ← <base>/plugins/<owner>/<slug>.json
```

## 唯一还要手工做的 GitHub 设置

工作流已经在仓库里。合并到 `main` 之前，到 GitHub 仓库 **Settings → Pages → Build and deployment**，把 **Source** 设成 **GitHub Actions**。不要选「Deploy from a branch」，否则和这个工作流抢发布，也可能给 JSON 加上跳转。

Paseo 0.14 拉安装文档时禁止跳转。请求必须直接得到 JSON 正文，未知 id 才是 404。

Pages 对公开仓库是公开的。这里的「私有」是指：不上架 `plugins.paseo.sh`，只收录自己审过的提交。公开 Pages 不能检查 `Authorization`。不要把令牌写进 JSON、基址或安装命令。

## 当前条目

安装 id 是 `br1efx/opc-core`。

| 字段 | 值 |
| --- | --- |
| `artifact.kind` | `git` |
| `artifact.remote` | `https://github.com/Br1efx/opc-os.git` |
| `artifact.commit` | `f436b51dc9f1902da204de0d9a9013ed27ebe287` |
| `artifact.pluginPath` | `plugins/opc-core` |

这条提交是 opc-os#16 squash 进 `main` 的结果，也就是 D5b。在既有外壳、卡片协议、Magpie 网关与监控（opc-datad、成本熔断）、文件面板笔记 v1（编辑、问 Agent、批注、锁定）、卡片墙与 Bases 子集查询引擎、D5a 任务字段、工作流和卡住阶梯，以及 Paseo 安装路径修复之上，加上 opc-intake 接单引擎（默认观察模式）、工单阶段和 GitHub 端口。`packages/intake-core` 来自上游 `6337fc8`。不自动合并 PR。这份 registry 把安装提交钉到 `f436b51dc9f1902da204de0d9a9013ed27ebe287`。该提交里的 `plugins/opc-core/paseo-plugin.json` 带有准备命令 `pnpm -C ../.. install --frozen-lockfile`。换一次被允许安装的提交，就要改这个 JSON 再合并；合并本身就是对那次提交的批准。不要改成分支名。仓库仍不含 Magpie 源码。

## 字段从哪来

对照的是 Paseo **0.14.0** 源码，不是事后的猜测：

- `packages/protocol/src/plugin-registry.ts`：id 必须是小写 `owner/slug`；Git 的 `commit` 必须是 40 到 64 位小写 SHA；`pluginPath` 可选，但不能有反斜杠或冒号。
- `packages/server/src/server/plugins/managed-source/registry.ts`：安装只解析 `id` 和 `artifact`，URL 是 `<基址>/plugins/<owner>/<slug>.json`。其它字段被忽略。
- 同标签的 `docs/plugins.md` 指向 [getpaseo/plugins 的 PROTOCOL.md](https://github.com/getpaseo/plugins/blob/main/PROTOCOL.md)。目录用的 `index.json` 和详情里的名称、说明、时间，按那份协议和 0.14 的 `PublishedPluginSchema` 写上。daemon 安装不读它们。

S1 没有用 registry。它在临时 daemon 上用 Git 源装过，远程是 `https://github.com/Br1efx/opc-os.git`，路径是 `plugins/opc-core`。当时跑通的提交是分支上的 `d682fc9bbe0f2d792fffb3f187f59642db7c8b8d`，不是现在钉住的 `f436b51dc9f1902da204de0d9a9013ed27ebe287`。见 [spikes/S1.md](spikes/S1.md)。

由此写下的约定：

1. GitHub 用户名 `Br1efx` 放进 id 时写成 `br1efx`。协议不接受大写。作者字段 `author.github` 仍写 `Br1efx`。
2. 这是 monorepo，所以必须带 `pluginPath`。省略的话会去装仓库根目录。
3. `remote` 沿用 S1 成功时的 `https://github.com/Br1efx/opc-os.git`。
4. 默认 `name` / `description` 用插件清单里的中文。me 面板读的是这份目录，不是官方英文市场。
5. 时间戳是写下这份 pin 的时间（`2026-11-01T05:09:59.000Z`），不是 Pages 实际发布的时间。
6. 没有在 me 面板上用这条 registry 记录重装过。S1 的 `running` 不能当成这次安装已经成功。

`pnpm test` 会检查：JSON 能解析、id 和路径一致、`index.json` 与详情除 `readme` 外一致、commit 是完整小写 SHA、文件里没有像密钥的文本。

## 在 me 面板安装

下面是交给人在 VPS 上做的步骤。**不要从本仓库的 CI 或云端代理执行。**

环境只改 Linux 用户 `me` 的 daemon（端口 6767，它自己的 `PASEO_HOME`）。dad（端口 6768）不要设这个变量，也不要装。

`PASEO_PLUGIN_REGISTRY` 必须出现在 **daemon 进程** 的环境里。写在当前 shell 里不会影响已经在跑的 daemon。Paseo 0.14 读的是 daemon 启动时的环境。改完要重启 me 的 daemon。

1. 确认本 PR 已合并，Pages 来源是 GitHub Actions，并且 `Publish registry` 在 `main` 上成功。
2. 在 me 的 systemd 单元里加上（单元名以机器上现有的为准，不要新建第二套 daemon）：

   ```ini
   Environment=PASEO_PLUGIN_REGISTRY=https://br1efx.github.io/opc-os
   ```

   基址不要带末尾斜杠，不要带用户名、密码或令牌。
3. 重启 me 的 daemon，确认它仍监听 6767。
4. 用 Linux 用户 `me` 安装。不要加 `--ref`，也不要写成 `github:Br1efx/opc-os`。前者会被 registry 安装拒绝，后者会绕过这份钉死的提交。

   ```bash
   paseo plugin add br1efx/opc-core
   ```

   界面上可以在 **Settings → Plugins → Plugin source** 粘贴 `br1efx/opc-core`，再选 Install plugin。解析规则相同：daemon 没有上面的环境变量时，这个 id 会去官方 registry，而不是本站。
5. S1 在新家目录上看到默认 `pluginsEnabled` 不是 true。若 `paseo plugin ls` 里状态是 `disabled`，先执行 `paseo daemon config set pluginsEnabled true`，再 `paseo plugin reload`。me 面板如果本来就开着插件，跳过这两句。

Git 检出是公开仓库，不需要给 registry 配 `pluginRegistries` 凭证。准备命令在被钉提交的 `paseo-plugin.json` 里，会在那份 checkout 上执行 `pnpm -C ../.. install --frozen-lockfile`。

## 验证清单

人在 me 面板上做完安装之后再勾。本 PR 一项都没有在 VPS 上勾过。

- [ ] `curl -sI https://br1efx.github.io/opc-os/plugins/br1efx/opc-core.json` 是 200，响应里没有 `Location`。
- [ ] `curl -fsS` 同一地址，正文的 `id` 是 `br1efx/opc-core`，`artifact.commit` 是 `f436b51dc9f1902da204de0d9a9013ed27ebe287`，`artifact.pluginPath` 是 `plugins/opc-core`。
- [ ] 只在 me 的 daemon 进程里看到 `PASEO_PLUGIN_REGISTRY=https://br1efx.github.io/opc-os`。dad 的环境里没有这项。
- [ ] `paseo plugin ls` 里有 `opc-core`，状态是 `running`，来源是这份 registry，提交等于上面的 SHA。
- [ ] 连到 me（6767）的手机或电脑能打开页面「一人公司 OS」。这一条对应架构 §11 的验收，仍然不在本 PR。

Pages 的 `Cache-Control` 大约是 10 分钟。刚改完钉的提交，更新检查可能要等缓存过期。

装好之后先在 me 面板用。dad 面板要等金丝雀，不在这一步。
