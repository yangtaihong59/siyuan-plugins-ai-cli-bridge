# SiYuan DeepSeek Harness

在思源侧栏与本机 DeepSeek Harness 对话，边生成边显示回答、思考和工具活动，并将笔记本、文档或块拖入对话。

这是原 **AI CLI Bridge** 的升级版，沿用 `siyuan-plugins-ai-cli-bridge` 的插件 ID 和仓库。原来的 Web 网页面板、网页地址和块 ID 拖放继续保留。

![预览](preview.png)

## 使用

从思源集市安装或更新本插件。使用 Harness 前，请先独立安装 DeepSeek Harness 并完成账号登录或 API 配置；插件复用已有的本机运行环境与凭据。Harness 需要思源桌面端，浏览器和移动端使用 Web 面板。

新安装默认打开 Harness。原 Web 用户升级后保留原来的 Web 模式和地址；点击 Web 面板上方的 **Harness** 即可切回对话。插件设置可以选择默认面板、编辑网页地址；Harness 内的设置也保留 **网页面板 → 打开网页面板**。

- 在输入框下方选择当前 Harness 实际提供的模型与思考强度。
- 流式显示正文、思考和工具活动；可停止生成，并继续原会话。
- 信息展示有简洁、适中、详细三档；适中在运行时显示过程，整轮完成后折叠。
- 整个侧栏接收笔记本、文档、块的拖放，只有输入框变蓝提示；一次最多 6 条引用。
- 文档和块使用有界正文快照，悬停显示思源原生预览；回复中的有效思源链接也能预览和跳转。
- 笔记本是检索范围引用，不提前读取整本正文，DSH 通过可用的思源 MCP 按需读取。
- 支持历史会话、安全 Markdown 与表格；宽表在内部横向滚动。

笔记工具推荐 [SiYuan Sisyphus](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus)。在需要工具却未连接 MCP 时，Agent 会简短提示安装与接入方法。插件不会修改 Harness 全局 profile，也不会自动为新用户启用 MCP。

## 原 Web 功能

在设置中填写完整的 HTTP/HTTPS 网页地址并打开。保留 iframe、加载等待、错误提示、自动重试与调整侧栏尺寸时的交互处理；将思源块拖到网页输入框可写入块 ID。页面能否嵌入取决于目标网站的 CSP/X-Frame-Options，登录与模型权限仍由该网站管理。

## 数据与边界

原 Web 配置继续使用 `ai-agent-bridge-config`；Harness 会话单独保存在本插件的 `harness-state.json`。独立试用插件的数据仍保留在原插件中，不会被删除或自动合并。切换面板会保存选择，离开 Harness 时关闭本插件拥有的空闲运行进程；生成中需先停止再切换。

对话与引用可能随思源工作区同步。发送的内容会交给 Harness 配置的模型服务；文件、shell、网络能力由其 profile 与权限控制。MCP Token 不写入保存的状态或临时 patch。回答不执行 HTML。完整审批、排队插话、本地文件/PDF 附件和 @ 搜索暂未实现。

## 开发

```sh
pnpm install
pnpm dev
pnpm make-link
pnpm check
pnpm test
pnpm build
```

`pnpm make-link` 交互选择工作区，也可显式使用 `pnpm make-link --workspace /absolute/workspace`，指向 `dev/`。现有安装不会被覆盖，需先在思源停用并备份旧目录。生产产物为 `dist/` 和 `package.zip`，插件目录名仍为 `siyuan-plugins-ai-cli-bridge`。

`pnpm preview:ui` 使用与插件相同的界面组件和演示数据，不连接真实模型或笔记。构建额外验证 CJS 入口、无 Node 环境的 Web 分支、模式切换和卸载保护；覆盖情况见 [ACCEPTANCE.md](ACCEPTANCE.md)。
