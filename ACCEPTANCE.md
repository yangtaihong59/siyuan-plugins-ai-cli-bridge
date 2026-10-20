# 0.2.0 集成版验收

日期：2026-10-20，Asia/Singapore。

## 已执行

- Harness 原回归完整迁入，安装测试随实际插件 ID/脚本更新；新增 Web 模块8项、Shell配置9项和Web设置/无Node加载7项，19文件共268项通过。
- `pnpm check` 通过。SiYuan SDK与已验证的Harness版本一致为1.1.7，生产输出保持CommonJS。
- `scripts/verify-bundle.mjs` 直接加载刚构建CJS，验证插件类、浏览器无process/Node模块环境的Web分支、原配置/单dock/名称/位置、生成中拒绝切换、空闲离开Harness关闭运行、保存与配置读取中卸载不复活。
- Web模块保留iframe等待/失败/重试、块ID拖放和resize；测试验证取消Image/HEAD探测、幂等cleanup、移除监听和旧iframe迟到事件隔离。
- `icon.svg`为原创笔记/鲸尾源，icon.png为160×160 PNG；dock使用同概念currentColor符号。商店preview.png为1024×768功能示意，图中与底部均注明示意，不是运行截图。
- 模式切换/卸载边界经两次独立代码审查，修复busy检查后的交互窗口、await后disposed检查和失败初始化清理。

- 最终CJS真实内核只读验收通过：重新核实主工作区端口50691后，列出13本，笔记本身份/标题、范围文案、非法/不存在ID拒绝均通过。3次lsNotebooks读取，正文读取/模型连接/笔记写入均为0；当前没有关闭/锁定本，这两项跳过。先前旧端口64068已失效，首次请求失败后通过进程端口核实重跑成功。报告在.live-results/notebook-read-report.json，不打包。

## 边界

补齐开发预览HTML入口后，后台浏览器已点通360px同一Chat/Settings组件：设置中的网页URL与打开按钮、实际mountWebPanel加载本地演示iframe、输入测试ID，以及返回后原对话/引用保留。截图docs/images/harness-web-settings.png与web-panel.png仅含演示数据，不连接外部服务或模型。早先两次本地入口访问失败已复验解决；原生Electron交互仍未实测。

本轮未调用真实模型、未发送用户笔记、未执行笔记写入。Harness核心源自独立试用版，原版的历史真实模型流式/停止/恢复证据不自动视为整合版新验收。Web目标网站的跨域嵌入/登录由目标网站决定。Windows/Linux/mobile设备未实测，Web无Node分支只在刚构建CJS的隔离宿主验证。

`pnpm test:notebooks`可对显式指定的DSH_REF_KERNEL_URL执行刚构建插件的笔记本元数据只读验收，报告仅布尔检查/计数，不含笔记标题、ID、正文且不入安装包。
