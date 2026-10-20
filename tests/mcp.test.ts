import { mcpPatch } from '../src/mcp';
describe('MCP profile insertion', () => {
  it('inserts a new row instead of silently updating an absent row', () => {
    expect(mcpPatch('http://127.0.0.1:36806/mcp', false)).toMatch(/^- insert:\n    - id: siyuan-mcp\n/);
    expect(mcpPatch('http://127.0.0.1:36806/mcp', false)).toContain('failOnStartupError: true');
  });
  it('quotes URLs and keeps credentials in the child environment', () => {
    const url = 'http://localhost/mcp?test=a\n#no-yaml-injection';
    const patch = mcpPatch(url, true);
    expect(patch).toContain(JSON.stringify(url));
    expect(patch).toContain('process.env.SIYUAN_DSH_MCP_TOKEN');
    expect(mcpPatch(url, false)).not.toContain('Authorization');
  });
});
