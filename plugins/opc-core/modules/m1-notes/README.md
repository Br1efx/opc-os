# M1 笔记

开关标识是 `m1-notes`，由外壳读取。本目录只有说明。

笔记挂在文件面板上：电脑用 CodeMirror 6 编辑 Markdown，手机只读。`.canvas` 是 JSON Canvas。电脑用拖拽编辑写回，手机只读，没有拖拽入口。笔记页可以生成一行审阅画布：旁白、静帧、评论、回复。

`opc-html` 围栏在电脑上放进只允许脚本的沙箱。手机显示静态图，失败时写「暂不可预览」，并提示到电脑查看动态。

`/收集` 把网址收进收件箱。附件来源「笔记库」走同一条写卡。Telegram、浏览器剪藏和 Grok 转交只留端口，说明在 `docs/collect-ports.md`。

批注、锁定、画布和收集的代码在 `client/`、`server/`、`shared/`。不要把 `.ts` / `.tsx` 留在本目录。说明见 `docs/modules.md` 和 [adr/0008](../../../adr/0008-d6-canvas-embed-collect.md)。
