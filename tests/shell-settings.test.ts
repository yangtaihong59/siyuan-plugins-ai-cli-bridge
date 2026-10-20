import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { compile, preprocess } from 'svelte/compiler';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';

let Settings: { render(props: Record<string, unknown>): { html: string } };
beforeAll(async () => {
  const filename = new URL('../src/ui/Settings.svelte', import.meta.url);
  const source = await preprocess(readFileSync(filename, 'utf8'), {
    script: ({ content }) => ({ code: transpileModule(content, {
      compilerOptions: { target: ScriptTarget.ES2020, module: ModuleKind.ESNext, verbatimModuleSyntax: true },
    }).outputText }),
  }, { filename: filename.pathname });
  const component = compile(source.code, { filename: filename.pathname, generate: 'ssr' });
  const code = transpileModule(component.js.code, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', code)(createRequire(import.meta.url), module, module.exports);
  Settings = module.exports.default;
});
const state = { settings: { displayDetail: 'full' }, connected: false };
const render = (props: Record<string, unknown> = {}) => Settings.render({ state, ...props }).html;

describe('combined shell settings', () => {
  it('retains the standalone settings when a web panel is not provided', () => {
    const html = render();
    expect(html).toContain('连接 Harness');
    expect(html).toContain('工作目录');
    expect(html).not.toContain('dsh-web-url');
    expect(html).not.toContain('打开网页面板');
  });

  it('exposes the preserved web URL in its own panel without opening it during render', () => {
    const onOpen = vi.fn();
    const html = render({ webPanel: { url: 'http://localhost:4096/?q=a&b=c', onOpen } });
    expect(html).toContain('网页面板');
    expect(html).toContain('打开网页面板');
    expect(html).toContain('http://localhost:4096/?q=a&amp;b=c');
    expect(html).toContain('连接 Harness');
    expect(html).toContain('高级设置');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it.each([{ busy: true }, { pending: 'save' }])('disables switching and URL edits while work is pending: %o', props => {
    const html = render({ ...props, webPanel: { url: 'http://localhost:4096', onOpen: vi.fn() } });
    expect(html).toMatch(/<input[^>]*id="dsh-web-url"[^>]*disabled/);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>打开网页面板<\/button>/);
  });

  it('does not allow an empty or whitespace URL', () => {
    const html = render({ webPanel: { url: '   ', onOpen: vi.fn() } });
    expect(html).toMatch(/<button[^>]*disabled[^>]*>打开网页面板<\/button>/);
  });

  it('labels an in-flight web switch', () => {
    const html = render({ pending: 'web', webPanel: { url: 'http://localhost:4096', onOpen: vi.fn() } });
    expect(html).toMatch(/<button[^>]*disabled[^>]*>打开中…<\/button>/);
  });
});


describe('web-only module loading', () => {
  it('loads the Harness module without reading Node builtins or process globals', () => {
    const source = readFileSync(new URL('../src/harness.ts', import.meta.url), 'utf8');
    const code = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2020 } }).outputText;
    const module = { exports: {} as any };
    const requireNode = vi.fn(() => { throw new Error('Node unavailable in web mode'); });
    expect(() => new Function('module', 'exports', 'require', 'process', code)(module, module.exports, requireNode, undefined)).not.toThrow();
    expect(typeof module.exports.HarnessClient).toBe('function');
    expect(requireNode).not.toHaveBeenCalled();
  });
});
