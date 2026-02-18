#!/bin/bash

# SiYuan AI Agent Bridge MCP Setup Script
# This script helps configure MCP for Claude Desktop or Cursor

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_BRIDGE="$SCRIPT_DIR/mcp-bridge.js"

echo "=== SiYuan MCP Setup ==="
echo ""

# Check if mcp-bridge.js exists
if [ ! -f "$MCP_BRIDGE" ]; then
    echo "Error: mcp-bridge.js not found at $MCP_BRIDGE"
    exit 1
fi

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
    CURSOR_CONFIG="$HOME/Library/Application Support/Cursor/mcp.json"
    CLAUDE_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
    CURSOR_CONFIG="$HOME/.config/Cursor/mcp.json"
    CLAUDE_CONFIG="$HOME/.config/Claude/claude_desktop_config.json"
else
    OS="windows"
    CURSOR_CONFIG="$APPDATA/Cursor/mcp.json"
    CLAUDE_CONFIG="$APPDATA/Claude/claude_desktop_config.json"
fi

# Prompt for configuration
echo "Which AI tool do you want to configure?"
echo "1) Cursor"
echo "2) Claude Desktop"
echo "3) Both"
read -p "Select (1/2/3): " choice

# Prompt for token
echo ""
echo "Please enter your SiYuan API Token:"
echo "(Find it in: SiYuan → Settings → Plugins → AI Agent Bridge → API Token)"
read -s SIYUAN_TOKEN
echo ""

if [ -z "$SIYUAN_TOKEN" ]; then
    echo "Error: Token cannot be empty"
    exit 1
fi

# Generate MCP config
generate_config() {
    cat <<EOF
{
  "mcpServers": {
    "siyuan": {
      "command": "node",
      "args": ["$MCP_BRIDGE"],
      "env": {
        "SIYUAN_TOKEN": "$SIYUAN_TOKEN",
        "SIYUAN_URL": "http://localhost:18080"
      }
    }
  }
}
EOF
}

# Create or update config
create_config() {
    local config_file="$1"
    local tool_name="$2"
    
    if [ -f "$config_file" ]; then
        echo ""
        echo "Found existing $tool_name config at:"
        echo "  $config_file"
        echo ""
        echo "Backing up to: ${config_file}.backup.$(date +%Y%m%d%H%M%S)"
        cp "$config_file" "${config_file}.backup.$(date +%Y%m%d%H%M%S)"
        
        echo ""
        echo "⚠️  Please manually merge the following configuration:"
        echo ""
        generate_config
        echo ""
        echo "Into your existing config file."
    else
        mkdir -p "$(dirname "$config_file")"
        generate_config > "$config_file"
        echo ""
        echo "✅ $tool_name config created at:"
        echo "  $config_file"
    fi
}

# Configure based on choice
case $choice in
    1)
        create_config "$CURSOR_CONFIG" "Cursor"
        ;;
    2)
        create_config "$CLAUDE_CONFIG" "Claude Desktop"
        ;;
    3)
        create_config "$CURSOR_CONFIG" "Cursor"
        create_config "$CLAUDE_CONFIG" "Claude Desktop"
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Make sure SiYuan is running with AI Agent Bridge plugin enabled"
echo "2. Restart your AI tool (Cursor/Claude Desktop)"
echo "3. Test by asking: 'List my SiYuan notebooks'"
echo ""
echo "For troubleshooting, see: MCP-README.md"
echo ""
