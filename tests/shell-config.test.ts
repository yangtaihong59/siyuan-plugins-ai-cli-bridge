import { describe, it, expect } from 'vitest';
import { normalizeShellConfig, validateWebUrl } from '../src/shell-config';

describe('Bridge shell configuration', () => {
  it('starts fresh installs in Harness and preserves the Web URL default', () => {
    expect(normalizeShellConfig(null)).toMatchObject({ view: 'harness', openCodeUrl: 'http://localhost:4096', enableDock: true });
  });
  it('keeps an existing Web installation in Web mode with its original URL', () => {
    expect(normalizeShellConfig({ openCodeUrl: 'https://my-agent.example/app', dockPosition: 'LeftBottom', dockWidth: 420, enableDock: false }))
      .toMatchObject({ view: 'web', openCodeUrl: 'https://my-agent.example/app', dockPosition: 'LeftBottom', dockWidth: 420, enableDock: false });
  });
  it('persists an explicit Harness choice without losing the original Web URL', () => {
    expect(normalizeShellConfig({ view: 'harness', openCodeUrl: 'http://localhost:5000' })).toMatchObject({ view: 'harness', openCodeUrl: 'http://localhost:5000' });
  });
  it('bounds malformed legacy dock geometry', () => {
    expect(normalizeShellConfig({ dockPosition: 'Right', dockWidth: NaN, dockHeight: -40 })).toMatchObject({ dockPosition: 'RightTop', dockWidth: 380, dockHeight: 0 });
  });
  it.each(['file:///tmp/index.html', 'javascript:alert(1)', 'https://user:password@example.com', 'missing-scheme'])('rejects an invalid Web destination %s', value => {
    expect(() => validateWebUrl(value)).toThrow();
  });
  it('accepts both HTTP and HTTPS and trims the draft', () => {
    expect(validateWebUrl('  http://localhost:4096/?view=chat  ')).toBe('http://localhost:4096/?view=chat');
    expect(validateWebUrl('https://example.com/')).toBe('https://example.com/');
  });
});
