# MCP (Model Context Protocol) Support

This plugin now supports MCP, allowing AI assistants like Claude and Cursor to directly interact with your SiYuan notes.

## What is MCP?

[Model Context Protocol (MCP)](https://modelcontextprotocol.io) is an open protocol that standardizes how applications provide context to LLMs. With MCP support, AI assistants can:

- List and manage notebooks
- Create, read, update, and delete documents
- Search and query blocks
- Execute SQL queries on the database

## Setup

### 1. Enable MCP in Plugin Settings

1. Open SiYuan → Settings → Plugins → AI Agent Bridge
2. Enable "Enable MCP Server"
3. Choose MCP Mode:
   - **stdio**: For Claude Desktop, Cursor (recommended)
   - **http**: For web-based clients
4. Set HTTP port (default: 18081) if using HTTP mode
5. Save settings and restart plugin

### 2. Configure Your AI Tool

#### Claude Desktop / Cursor (stdio mode)

Edit the MCP configuration file:

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "siyuan": {
      "command": "node",
      "args": ["/path/to/mcp-bridge.js"],
      "env": {
        "SIYUAN_TOKEN": "sk-siyuan-your-token",
        "SIYUAN_URL": "http://localhost:18080"
      }
    }
  }
}
```

**Cursor** (`~/.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "siyuan": {
      "command": "node",
      "args": ["/path/to/mcp-bridge.js"],
      "env": {
        "SIYUAN_TOKEN": "sk-siyuan-your-token",
        "SIYUAN_URL": "http://localhost:18080"
      }
    }
  }
}
```

Replace:
- `/path/to/mcp-bridge.js`: Full path to the mcp-bridge.js file in this plugin
- `sk-siyuan-your-token`: Your API token from plugin settings

### 3. Restart Your AI Tool

After configuration, restart Claude Desktop or Cursor.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_notebooks` | List all notebooks |
| `create_notebook` | Create a new notebook |
| `rename_notebook` | Rename a notebook |
| `remove_notebook` | Remove a notebook |
| `list_docs` | List documents in a notebook |
| `get_doc` | Get document content |
| `create_doc` | Create a new document |
| `rename_doc` | Rename a document |
| `delete_doc` | Delete a document |
| `get_block` | Get block information |
| `insert_block` | Insert a new block |
| `update_block` | Update a block |
| `delete_block` | Delete a block |
| `search_blocks` | Search for blocks |
| `query_sql` | Execute SQL query |
| `get_system_info` | Get system information |

## Usage Examples

Once configured, you can ask your AI assistant:

```
"List all my notebooks in SiYuan"
"Create a new document in my Diary notebook with today's meeting notes"
"Search for all blocks containing 'project plan'"
"Execute SQL: SELECT * FROM blocks WHERE content LIKE '%TODO%'"
"Get the content of document 20240101120000-abc123"
```

## HTTP Mode

If you choose HTTP mode, the MCP server will listen on the configured port (default: 18081). You can then connect to it via HTTP POST requests:

```bash
curl -X POST http://localhost:18081 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "list_notebooks",
      "arguments": {}
    }
  }'
```

## Troubleshooting

### "SIYUAN_TOKEN is required"
- Make sure you've set the `SIYUAN_TOKEN` environment variable
- Get your token from: SiYuan → Settings → Plugins → AI Agent Bridge → API Token

### "Connection refused"
- Ensure SiYuan is running
- Check that the AI Agent Bridge plugin is enabled
- Verify the port in `SIYUAN_URL` matches your plugin settings

### MCP not working
- Check plugin settings: MCP Server must be enabled
- Restart SiYuan after enabling MCP
- Check the console logs for error messages

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌──────────────────┐
│   AI Assistant  │◄───►│ MCP Protocol │◄───►│  AI Agent Bridge │
│ (Claude/Cursor) │     │  (stdio/http)│     │     Plugin       │
└─────────────────┘     └──────────────┘     └──────────────────┘
                                                        │
                                                        ▼
                                              ┌──────────────────┐
                                              │   SiYuan Notes   │
                                              └──────────────────┘
```

## Security

- Keep your API token secure
- The MCP bridge only connects to localhost by default
- Token authentication is required for all API calls
