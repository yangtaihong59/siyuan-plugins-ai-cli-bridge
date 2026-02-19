# AI Cli Bridge for SiYuan

[English](README.md) | [中文](README_zh_CN.md)

将 Opencode Claude code 等 AI Cli 作为侧边栏面板使用，配合 MCP 帮你自动操作笔记。

建议配合 [syplugin-anMCPServer](https://github.com/OpaqueGlass/syplugin-anMCPServer "GitHub Repo") 插件使用。

## 功能特性

- **侧边栏集成**: 在思源笔记中添加可固定的 AI Agent 面板
- **自定义 URL**: 支持配置任意基于 Web 的 AI 工具（OpenCode、本地 LLM UI 等）
- **灵活布局**: 可将面板放置在左侧/右侧/底部，并自由调整大小
- **快捷键支持**: 使用 `⌥⌘A` (Mac) 或 `Alt+Ctrl+A` (Windows/Linux) 快速打开面板

## 安装方法

1. 你需要安装有Opencode，以及 SiYuan 的 MCP 工具（推荐 [syplugin-anMCPServer](https://github.com/OpaqueGlass/syplugin-anMCPServer "GitHub Repo") ）
2. 使用 opencode web 命名启动其web GUI
3. 从 GitHub 下载最新版本
4. 解压到思源的 `data/plugins` 目录
5. 在 设置 → 插件 中启用 "AI CLI Bridge"
6. 如果你需要打开 claude 等其他 cli，可以使用 Opencode web 自带的终端

## 使用说明

### 基础操作

- **打开面板**: 点击侧边栏 AI 图标或按快捷键 `⌥⌘A`
- **关闭面板**: 再次点击 AI 图标或使用面板关闭按钮
- **调整大小**: 拖拽面板边缘调整宽度/高度

### 配置选项

在 设置 → 插件 → AI CLI Bridge 中配置：

| 选项                 | 说明                   | 默认值                |
| -------------------- | ---------------------- | --------------------- |
| Enable AI Agent Dock | 是否显示侧边栏面板     | 开启                  |
| OpenCode URL         | 嵌入的网页地址         | http://localhost:4096 |
| Dock Position        | 面板位置（左/右/底部） | Right                 |
| 拖拽 ID 传递方式     | 拖拽块/文档时的传递方式 | 同时使用              |
| Enable Logging       | 启用调试日志           | 开启                  |

### 推荐配置

**本地 OpenCode**

```
OpenCode URL: http://localhost:4096
```

**本地 Ollama Web UI**

```
OpenCode URL: http://localhost:3000
```

**ChatGPT 网页版**（如可访问）

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

## 技术支持

- 问题反馈: [GitHub Issues](https://github.com/yangtaihong59/siyuan-plugins-ai-cli-bridge/issues)
- 社区讨论: [思源笔记社区](https://ld246.com/tag/siyuan)
