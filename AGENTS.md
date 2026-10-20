# SiYuan DeepSeek Harness / AI CLI Bridge

与用户用中文交流。插件商店身份与仓库保持 `siyuan-plugins-ai-cli-bridge`，展示名为 SiYuan DeepSeek Harness。

- `src/index.ts` 管理同一 `ai-dock` 的 Harness/Web 模式、原生设置、思源 HTTP API 与生命周期；`shell-config.ts` 保留旧 `ai-agent-bridge-config` 和 `openCodeUrl`。旧 Web 配置缺少 view 时保持 Web；新安装默认 Harness。Harness 数据映射为 `harness-state.json`，不覆盖 Web 或独立试用插件数据。
- `src/web-panel.ts` 保留原 Web iframe、重试、resize 与块 ID 拖拽；只在 Web 挂载期间注册其全局监听，cleanup 必须幂等且阻止延迟回调复活。
- `src/harness.ts` 的 Node 实际依赖只能在启动/关闭方法内 require，禁止顶层 Node 导入。Web/browser/mobile 分支不得构造控制器或访问 Node；保留 manifest all 前端支持。
- Harness 只驱动本插件子进程与临时 Cordis bridge；不改全局 profile。SDK 持久事件与桥接增量分开描述，结束事件为权威结果，未知发送结果不得自动重放。
- 思源笔记读写全部走 HTTP API；文件系统只用于本机 Harness、构建与安装。Token 不进保存状态、日志、安装包。
- 切模式先拒绝 busy，并在异步切换期间将已有面板 inert；await 后复查 disposed。卸载清订阅、Svelte、Web 监听、探测/定时器与子进程。
- 整栏接收笔记本/文档/块拖放，仅 composer 蓝色提示。笔记本使用带来源工作区的专属 MIME、notebook:<id> key；与同 ID 首页区分，仅范围元数据，不提前读取整本。文档/块复用 native block-ref 悬停。
- compact/balanced/full 只控制展示，不进入 runtimeKey 或模型 prompt，默认 full；balanced 按整轮完成折叠并保留手动展开。Markdown 安全 token 渲染，不执行 HTML，表格局部横滚。
- 图标源为 icon.svg，icon.png 为160px渲染，dock symbol 在src/brand.ts。

开发用 `pnpm dev` watch 到 dev；`pnpm make-link` 保留工作区选择并不覆盖旧安装。提交/发布前运行 `pnpm check`、`pnpm test`、`pnpm build`。发布包不能含真实会话、凭据、node_modules、.live-results 或 sourcemap。不要将假服务/SSR/CJS宿主检查写成真实模型或原生UI验收。
