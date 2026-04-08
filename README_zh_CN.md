# AI Cli Bridge for SiYuan

[English](https://github.com/yangtaihong59/siyuan-plugins-ai-cli-bridge/blob/main/README.md) | [中文](https://github.com/yangtaihong59/siyuan-plugins-ai-cli-bridge/blob/main/README_zh_CN.md)

> 推荐搭配：[SiYuan MCP Sisyphus](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus)。如需让侧边栏里的 AI 工具通过 MCP 操作思源笔记，可以额外安装它。

将任意 AI Agent Web 页面或其他网页工具加载到思源侧边栏中使用。插件本身只负责嵌入网页，不要求必须安装 OpenCode；如需通过 MCP 操作笔记，可按需搭配相关插件或服务。

## 功能特性

- **侧边栏集成**: 在思源笔记中添加可固定的 AI Agent 面板
- **自定义 URL**: 支持配置任意网页地址（OpenCode、本地 LLM UI、ChatGPT 等）
- **灵活布局**: 可将面板放置在左侧/右侧/底部，并自由调整大小
- **快捷键支持**: 使用 `⌥⌘A` (Mac) 或 `Alt+Ctrl+A` (Windows/Linux) 快速打开面板

## 安装方法

商城直接下载或者
1. 从 GitHub 下载最新版本。
2. 解压到思源的 `data/plugins` 目录。
3. 在 设置 → 插件 中启用 "AI CLI Bridge"。
4. 打开插件设置，填入你想嵌入侧边栏的网页地址。
5. 如果该网页服务需要单独启动，请先在本地或远程启动对应服务。

## 使用说明

### 基础操作

- **打开面板**: 点击侧边栏 AI 图标或按快捷键 `⌥⌘A`
- **关闭面板**: 再次点击 AI 图标或使用面板关闭按钮
- **调整大小**: 拖拽面板边缘调整宽度/高度

### 配置选项

在 设置 → 插件 → AI CLI Bridge 中配置：

| 选项 | 说明           | 默认值                |
| ---- | -------------- | --------------------- |
| URL  | 嵌入的网页地址 | http://localhost:4096 |

### 推荐配置

插件本身不提供 AI 服务，也不自带网页界面；它只会加载你配置的 URL。

**示例：本地 Openclaw**

```
 openclaw dashboard 提供的地址
```

**示例：本地 OpenCode**

```
OpenCode URL: http://localhost:4096
```

**示例：本地 Ollama Web UI**

```
OpenCode URL: http://localhost:3000
```

**示例：ChatGPT 网页版**（如可访问）

```
OpenCode URL: https://chat.openai.com
```

## 开发指南

```bash
# 安装依赖
pnpm install

pnpm run make-link

# 开发模式（热重载）
pnpm dev
```

## 开源协议

MIT License

## 版本历史

- **v0.1.8** (2025-04-08) - 修复 iframe 空值检查，优化卸载时资源清理，更新文档链接
- **v0.1.7** (2025-04-07) - 同步 README 文档
- **v0.1.6** (2025-04-07) - 移除 MCP 功能，仅保留侧边栏嵌入核心功能

## 技术支持

- 问题反馈: [GitHub Issues](https://github.com/yangtaihong59/siyuan-plugins-ai-cli-bridge/issues)
- 社区讨论: [思源笔记社区](https://ld246.com/tag/siyuan)
