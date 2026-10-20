import { describe, expect, it } from 'vitest';
import { defaultSettings, normalizeSettings, parseArgs, validateSettings } from '../src/settings';

describe('Harness settings', () => {
  it('defaults to the existing full transcript and normalizes saved display preferences', () => {
    const defaults = defaultSettings();
    expect(defaults.displayDetail).toBe('full');
    for (const displayDetail of ['compact', 'balanced', 'full'] as const) {
      expect(normalizeSettings({ displayDetail }, defaults).displayDetail).toBe(displayDetail);
      expect(() => validateSettings({ ...defaults, displayDetail })).not.toThrow();
    }
    for (const displayDetail of ['invented', '', null, 1]) {
      expect(normalizeSettings({ displayDetail }, defaults).displayDetail).toBe('full');
      expect(() => validateSettings({ ...defaults, displayDetail } as any)).toThrow('信息展示');
    }
  });

  it('accepts only JSON string arrays and preserves literal argument boundaries', () => {
    expect(parseArgs('["--patch","a path.yml","$(touch unexpected)","中文"]'))
      .toEqual(['--patch', 'a path.yml', '$(touch unexpected)', '中文']);
    expect(parseArgs('')).toEqual([]);
    for (const input of ['--verbose', '{}', 'null', '[1]', '[true]', '["ok",{}]']) {
      expect(() => parseArgs(input), input).toThrow(/JSON 字符串数组/);
    }
  });

  it('never restores a saved MCP credential and rejects wrong setting types', () => {
    const defaults = defaultSettings();
    const restored = normalizeSettings({ command: '/custom/dsh', mcpToken: 'saved-secret', mcpEnabled: 'true', model: 123 }, defaults);
    expect(restored.command).toBe('/custom/dsh');
    expect(restored.mcpToken).toBe('');
    expect(restored.mcpEnabled).toBe(defaults.mcpEnabled);
    expect(restored.model).toBe(defaults.model);
    expect(normalizeSettings(null, defaults)).toEqual(defaults);
  });

  it.each(['command', 'home', 'cwd', 'profile', 'provider', 'model'] as const)('requires %s', key => {
    expect(() => validateSettings({ ...defaultSettings(), [key]: '   ' })).toThrow();
  });

  it('validates argument JSON before trying to launch a runtime', () => {
    expect(() => validateSettings({ ...defaultSettings(), argsText: '["a",2]' })).toThrow(/JSON 字符串数组/);
  });

  it.each(['file:///private/tmp/mcp', 'ftp://localhost/mcp', 'javascript:alert(1)', 'http://name:secret@localhost/mcp', 'not a URL'])
    ('rejects unsafe MCP address %s', mcpUrl => {
      expect(() => validateSettings({ ...defaultSettings(), mcpEnabled: true, mcpUrl })).toThrow();
    });

  it.each(['http://127.0.0.1:36806/mcp', 'https://notes.example/mcp'])('accepts HTTP MCP address %s', mcpUrl => {
    expect(() => validateSettings({ ...defaultSettings(), mcpEnabled: true, mcpUrl })).not.toThrow();
  });

  it('allows an unconfigured MCP URL while the integration is disabled', () => {
    expect(() => validateSettings({ ...defaultSettings(), mcpEnabled: false, mcpUrl: '' })).not.toThrow();
  });
});
