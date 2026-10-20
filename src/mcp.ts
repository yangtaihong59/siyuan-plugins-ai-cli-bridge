/** --patch uses Cordis operations; plain rows only update existing IDs. */
export function mcpPatch(url: string, authenticated: boolean): string {
  return [
    '- insert:', '    - id: siyuan-mcp', "      name: '@deepseek-ai/dsh-mcp-client'", '      config:',
    '        serverName: siyuan', '        transport: streamable-http',
    `        url: ${JSON.stringify(url)}`, '        failOnStartupError: true',
    ...(authenticated ? ['        headers:', '          Authorization: !!js \'"Bearer " + process.env.SIYUAN_DSH_MCP_TOKEN\''] : []),
  ].join('\n') + '\n';
}
