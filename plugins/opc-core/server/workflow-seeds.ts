/**
 * 三条工作流模板的原文。
 * Paseo 0.14 把服务端打成内存里的 CommonJS，没有可用的本文件地址。
 * 用文件系统按本文件位置去读 YAML 时，路径参数会是 undefined，插件在启动阶段直接失败。
 * 启动时用这份正文补齐卡片库里缺的模板；库里已有的文件不覆盖。
 * 正文必须和 shared/workflows 里的 YAML 一致，单测会核对。
 */
export const WORKFLOW_SEEDS: { name: string; text: string }[] = [
  {
    name: "content.yaml",
    text: `# 内容流。素材收成周更母本，再改编、发布、回收数据。
id: content
title: 内容流
summary: 从素材卡到周更母本，再改编到各平台，发布后回收数据。
steps:
  - id: material
    title: 素材卡
    role: 素材
    kind: seed
    enter: start
    instruction: 素材已经写在任务目标和验收里，接着做周更母本。
  - id: weekly
    title: 周更母本
    role: 撰稿
    kind: agent
    enter: previous
    agentId: writer
    timeoutMinutes: 240
    instruction: 把素材收成一篇周更母本，先别拆成各平台版本。
  - id: adapt
    title: 多平台改编
    role: 改编
    kind: agent
    enter: previous
    agentId: adapter
    timeoutMinutes: 240
    instruction: 把母本改成各平台能发的版本，并注明每个版本的差异。
  - id: post
    title: 你发布
    role: 你
    kind: human
    enter: previous
    human: true
    instruction: 请你自己发布。发布之前不要把这一步标成完成。
  - id: recycle
    title: 数据回收
    role: 数据
    kind: agent
    enter: previous
    agentId: metrics
    live: 需真机验证
    instruction: 回收各平台的数据，分开写数据事实、原因假设和下一轮要验证的规则。平台后台需真机验证。
`,
  },
  {
    name: "dev.yaml",
    text: `# 开发流。改这份文件后，下一次起任务和推进会读新内容。
id: dev
title: 开发流
summary: 需求交给实现、审查和门禁，最后到待你验收。
steps:
  - id: demand
    title: 需求
    role: 需求
    kind: seed
    enter: start
    instruction: 目标已经写在任务上，这一步直接交给实现。
  - id: build
    title: 实现
    role: 实现
    kind: agent
    enter: previous
    agentId: builder
    timeoutMinutes: 240
    instruction: 按目标和验收标准实现。做完说明改了什么，并把测试名、链接或日志留给证据。
  - id: review
    title: 审查
    role: 审查
    kind: agent
    enter: previous
    agentId: reviewer
    timeoutMinutes: 240
    instruction: 用另一家的视角审查这次改动，只指出必须改的问题。
  - id: verify
    title: 门禁
    role: 门禁
    kind: gate
    enter: previous
    agentId: verifier
    timeoutMinutes: 120
    instruction: 跑验证。通过就把测试名或日志写成证据。失败就说明哪里没过。
  - id: accept
    title: 待你验收
    role: 人
    kind: accept
    enter: previous
    human: true
    requiresEvidence: true
    instruction: 请对照验收标准验收。没有证据不能进入这一步。
  - id: done
    title: 完成
    role: 人
    kind: done
    enter: previous
    human: true
    requiresEvidence: true
    instruction: 验收通过，这张任务完成。
`,
  },
  {
    name: "video.yaml",
    text: `# 视频流。按父亲工作台的完整做片闭环。标了需真机验证的步骤依赖外部账号或真机。
id: video
title: 视频流
summary: 选题、立项、做片、放行、发布、看数据和沉淀资产。
steps:
  - id: topic
    title: 选题
    role: 选题雷达
    kind: agent
    enter: start
    agentId: topic-radar
    live: 需真机验证
    instruction: 推 3 到 5 条选题。每条写下推荐理由、来源和热度证据，并按热度上升、定位契合、画面潜力、制作投入打分。外部热榜和平台趋势需真机验证。
  - id: pitch
    title: 立项
    role: 父亲
    kind: human
    enter: previous
    human: true
    instruction: 请父亲看选题和预计投入。点立项才算立项，入库不等于立项。
  - id: script
    title: 剧本
    role: 顾问
    kind: agent
    enter: previous
    agentId: advisor
    timeoutMinutes: 360
    instruction: 按已立项的选题写剧本初稿。
  - id: script-review
    title: 剧本挑错
    role: 审片员
    kind: agent
    enter: previous
    agentId: cutter
    timeoutMinutes: 240
    instruction: 挑剧本里的问题，一件事写一条。
  - id: script-lock
    title: 剧本冻结
    role: 父亲
    kind: human
    enter: previous
    human: true
    instruction: 父亲满意后锁定剧本。锁定之前不要往下做。
  - id: style
    title: 风格
    role: 动画师
    kind: agent
    enter: previous
    agentId: animator
    live: 需真机验证
    instruction: 准备试镜图、元素表和配乐方向。画布上的审阅需真机验证。
  - id: style-lock
    title: 风格冻结
    role: 父亲
    kind: human
    enter: previous
    human: true
    instruction: 父亲确认试镜图、元素表和配乐方向后锁定风格。
  - id: voice
    title: 配音
    role: 打杂
    kind: agent
    enter: previous
    agentId: hand
    live: 需真机验证
    instruction: 固定音色，核对商用授权，整理逐字时间戳。外部配音服务需真机验证。
  - id: stills
    title: 关键静帧
    role: 动画师
    kind: agent
    enter: previous
    agentId: animator
    live: 需真机验证
    instruction: 一句旁白配一张静帧。画布上的评论和修改需真机验证。
  - id: anim
    title: 动画初版
    role: 动画师
    kind: agent
    enter: previous
    agentId: animator
    timeoutMinutes: 1440
    live: 需真机验证
    instruction: 按章出动画初版。改哪一段就重做哪一段。渲染需真机验证。
  - id: audio
    title: 配乐音效
    role: 动画师
    kind: agent
    enter: previous
    agentId: animator
    live: 需真机验证
    instruction: 配上配乐和音效并试听。外部音乐服务需真机验证。
  - id: compliance
    title: 合规检查
    role: 打杂
    kind: gate
    enter: previous
    agentId: hand
    instruction: 发布前检查著作权、图库授权、肖像、字体、配音授权和人工智能生成内容标识。
  - id: release
    title: 成片放行
    role: 审片员
    kind: agent
    enter: previous
    agentId: cutter-2
    timeoutMinutes: 240
    instruction: 换一家模型挑成片的问题。一件事一条，改完再销账。
  - id: upload
    title: 上传
    role: 打杂
    kind: agent
    enter: previous
    agentId: hand
    live: 需真机验证
    instruction: 把成片准备到待发布。云端上传需真机验证。最终发布仍要等父亲本人。
  - id: publish
    title: 发布
    role: 父亲
    kind: human
    enter: previous
    human: true
    live: 需真机验证
    instruction: 最终点发布必须父亲本人来。这一步需真机验证。
  - id: metrics
    title: 数据监控
    role: 数据分析师
    kind: agent
    enter: previous
    agentId: analyst
    live: 需真机验证
    instruction: 记下播放、点赞和完播，并对照同平台、同题、体量接近的账号。综合或单项进入对标组前一成就算爆。分开写数据事实、原因假设和验证规则。平台数据需真机验证。
  - id: retro
    title: 复盘
    role: 制片人
    kind: agent
    enter: previous
    agentId: producer
    instruction: 复盘这部片子，并提出可以入库的资产候选。父亲没点头之前不要入库。
  - id: assets
    title: 资产沉淀
    role: 父亲
    kind: human
    enter: previous
    human: true
    instruction: 父亲点同意后，资产才入库。同意之前候选只是候选。
`,
  },
];
