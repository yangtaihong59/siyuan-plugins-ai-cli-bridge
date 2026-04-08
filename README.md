# AI CLI Bridge for SiYuan

[English](https://github.com/yangtaihong59/siyuan-plugins-ai-cli-bridge/blob/main/README.md) | [中文](https://github.com/yangtaihong59/siyuan-plugins-ai-cli-bridge/blob/main/README_zh_CN.md)

> Recommended pairing: use this plugin together with [SiYuan MCP Sisyphus](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus) if you want the embedded AI tool to operate SiYuan notes through MCP.

Load any AI Agent web page or other web tool into the SiYuan sidebar. This plugin only embeds the page you configure; OpenCode is optional, and MCP is only needed if you want the embedded tool to operate your notes.

## Features

- **Sidebar integration**: Add a dockable AI Agent panel in SiYuan
- **Custom URL**: Configure any web page URL (OpenCode, local LLM UI, ChatGPT, etc.)
- **Flexible layout**: Place the panel on the left, right, or bottom and resize it
- **Shortcuts**: Open the panel with `⌥⌘A` (Mac) or `Alt+Ctrl+A` (Windows/Linux)

## Installation

1. Download the latest release from GitHub.
2. Extract it into SiYuan’s `data/plugins` folder.
3. Enable “AI CLI Bridge” under Settings → Plugins.
4. Open the plugin settings and enter the web page URL you want to embed.
5. If that page depends on a local or remote service, start that service separately.
6. If you want the embedded AI tool to operate SiYuan through MCP, install an MCP plugin or service as an optional companion (for example [syplugin-anMCPServer](https://github.com/OpaqueGlass/syplugin-anMCPServer "GitHub Repo")).

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

The plugin does not provide an AI service or a built-in web UI. It only loads the URL you configure.

**Example: Local Openclaw**

```
Use the address provided by openclaw dashboard
```

**Example: Local OpenCode**

```
OpenCode URL: http://localhost:4096
```

**Example: Local Ollama Web UI**

```
OpenCode URL: http://localhost:3000
```

**Example: ChatGPT in browser** (if available)

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

## Version History

- **v0.1.8** (2025-04-08) - Fixed iframe null check in ResizeObserver, optimized resource cleanup on unload, updated documentation links
- **v0.1.7** (2025-04-07) - Synchronized README documentation
- **v0.1.6** (2025-04-07) - Removed MCP features, keeping core sidebar embedding only

## Support

- Issues: [GitHub Issues](https://github.com/yangtaihong59/siyuan-plugins-ai-cli-bridge/issues)
- Community: [SiYuan Community](https://ld246.com/tag/siyuan)
