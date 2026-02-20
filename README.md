# AI CLI Bridge for SiYuan

[English](README.md) | [中文](README_zh_CN.md)

Embed OpenCode, Claude Code, and other AI CLI tools as a sidebar panel in SiYuan, and use them with MCP to operate your notes automatically.

Recommended to use with the [syplugin-anMCPServer](https://github.com/OpaqueGlass/syplugin-anMCPServer "GitHub Repo") plugin, or [siyuan-plugins-mcp-sisyphus](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus).

## Features

- **Sidebar integration**: Add a dockable AI Agent panel in SiYuan
- **Custom URL**: Configure any web-based AI tool (OpenCode, local LLM UI, etc.)
- **Flexible layout**: Place the panel on the left, right, or bottom and resize it
- **Shortcuts**: Open the panel with `⌥⌘A` (Mac) or `Alt+Ctrl+A` (Windows/Linux)

## Installation

1. Install OpenCode and a SiYuan MCP tool (e.g. [syplugin-anMCPServer](https://github.com/OpaqueGlass/syplugin-anMCPServer "GitHub Repo")).
2. Start the web GUI with the `opencode web` command.
3. Download the latest release from GitHub.
4. Extract it into SiYuan’s `data/plugins` folder.
5. Enable “AI CLI Bridge” under Settings → Plugins.
6. To use Claude or other CLIs, use the terminal inside OpenCode web.

## Usage

### Basic operations

- **Open panel**: Click the AI icon in the sidebar or press `⌥⌘A`.
- **Close panel**: Click the AI icon again or use the panel’s close button.
- **Resize**: Drag the panel edge to change width or height.

### Configuration

Under Settings → Plugins → AI CLI Bridge:

| Option                       | Description                              | Default                |
| ---------------------------- | --------------------------------------- | ---------------------- |
| Enable AI Agent Dock        | Show the sidebar panel                   | On                     |
| OpenCode URL                 | URL of the embedded page                 | http://localhost:4096  |
| Dock Position               | Panel position (Left / Right / Bottom)   | Right                  |
| Drag & drop ID transfer     | How to pass ID when dragging blocks/docs | Use both               |
| Enable Logging              | Enable debug logging                     | On                     |

### Suggested setups

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
