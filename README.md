# AI CLI Bridge for SiYuan

[English](README.md) | [中文](README_zh_CN.md)

Embed Opencode Claude code and other AI CLI tools as a sidebar panel, working with MCP to help you automatically operate notes.

It is recommended to use it together with the [syplugin-anMCPServer](https://github.com/OpaqueGlass/syplugin-anMCPServer "GitHub Repo") plugin.

## Features

- **Sidebar Integration**: Add a dockable AI Agent panel in SiYuan Note
- **Custom URL**: Support configuring any web-based AI tools (OpenCode, local LLM UI, etc.)
- **Flexible Layout**: Position the panel on Left/Right/Bottom with resizable dimensions
- **Keyboard Shortcut**: Quick access with `⌥⌘A` (Mac) or `Alt+Ctrl+A` (Windows/Linux)

## Installation

1. You need to install Opencode first
2. Use the opencode web command to start its web GUI
3. Download the latest release from GitHub
4. Extract to SiYuan's `data/plugins` directory
5. Enable "AI CLI Bridge" in Settings → Plugins
6. If you need to open Claude or other CLIs, you can use the terminal built into Opencode web

## Usage

### Basic Operations

- **Open Panel**: Click the AI icon in the sidebar or press `⌥⌘A`
- **Close Panel**: Click the AI icon again or use the panel close button
- **Resize**: Drag the panel edge to adjust width/height

### Configuration Options

Configure in Settings → Plugins → AI CLI Bridge:

| Option                 | Description                    | Default                |
| ---------------------- | ------------------------------ | ---------------------- |
| Enable AI Agent Dock   | Whether to show sidebar panel  | Enabled                |
| OpenCode URL           | Web URL to embed               | http://localhost:4096  |
| Dock Position          | Panel position (Left/Right/Bottom) | Right              |
| Drag & Drop ID Transfer Method | How to transfer ID when dragging | Both                |
| Enable Logging         | Enable debug logging           | Enabled                |

### Recommended Setups

**Local OpenCode**

```
OpenCode URL: http://localhost:4096
```

**Local Ollama Web UI**

```
OpenCode URL: http://localhost:3000
```

**ChatGPT Web** (if accessible)

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

- Issue Reports: [GitHub Issues](https://github.com/opencode/siyuan-ai-agent-bridge/issues)
- Community Discussion: [SiYuan Community](https://ld246.com/tag/siyuan)
