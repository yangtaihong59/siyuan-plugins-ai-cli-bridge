# AI CLI Bridge for SiYuan

[English](https://github.com/yangtaihong59/siyuan-plugins-ai-cli-bridge/blob/main/README.md) | [中文](https://github.com/yangtaihong59/siyuan-plugins-ai-cli-bridge/blob/main/README_zh_CN.md)

Embed Openclaw, OpenCode, Claude Code and other AI CLI tools as a sidebar panel in SiYuan.

## Features

- **Sidebar integration**: Add a dockable AI Agent panel in SiYuan
- **Custom URL**: Configure any web-based AI tool (OpenCode, local LLM UI, etc.)
- **Flexible layout**: Place the panel on the left, right, or bottom and resize it
- **Shortcuts**: Open the panel with `⌥⌘A` (Mac) or `Alt+Ctrl+A` (Windows/Linux)

## Installation

1. Install OpenCode or another AI web UI and start it (e.g. `opencode web`).
2. Download the latest release from GitHub and extract it into SiYuan's `data/plugins` folder.
3. Enable "AI CLI Bridge" under Settings → Plugins.

## Usage

### Basic operations

- **Open panel**: Click the AI icon in the sidebar or press `⌥⌘A`.
- **Close panel**: Click the AI icon again or use the panel’s close button.
- **Resize**: Drag the panel edge to change width or height.

### Configuration

Under Settings → Plugins → AI CLI Bridge:

| Option | Description              | Default                |
| ------ | ------------------------ | ---------------------- |
| URL    | URL of the embedded page | http://localhost:4096  |

### Suggested setups

**Local Openclaw**

```
Use the address provided by openclaw dashboard
```

**Local OpenCode**

```
OpenCode URL: http://localhost:4096
```

**Local Ollama Web UI**

```
OpenCode URL: http://localhost:3000
```

**ChatGPT in browser** (if available)

```
OpenCode URL: https://chat.openai.com
```

## Development

```bash
# Install dependencies
pnpm install

pnpm run make-link

# Development mode (hot reload)
pnpm dev
```

## License

MIT License

## Support

- Issues: [GitHub Issues](https://github.com/yangtaihong59/siyuan-plugins-ai-cli-bridge/issues)
- Community: [SiYuan Community](https://ld246.com/tag/siyuan)
