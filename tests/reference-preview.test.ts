import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { compile, preprocess } from 'svelte/compiler';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';
import * as markdown from '../src/ui/markdown';
import * as references from '../src/references';

const id = '20261020000000-demo003';
let ReferencePreview: { render(props: { reference: any; nativeHover: boolean; controller: any; busy?: boolean; messageId?: string; removable?: boolean }): { html: string } };
beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const components: Record<string, any> = {};
  for (const name of ['Icon', 'Inline', 'Message', 'ReferencePreview']) {
    const filename = new URL(`../src/ui/${name}.svelte`, import.meta.url);
    const source = await preprocess(readFileSync(filename, 'utf8'), {
      script: ({ content }) => ({ code: transpileModule(content, {
        compilerOptions: { target: ScriptTarget.ES2020, module: ModuleKind.ESNext, verbatimModuleSyntax: true },
      }).outputText }),
    }, { filename: filename.pathname });
    const component = compile(source.code, { filename: filename.pathname, generate: 'ssr' });
    const code = transpileModule(component.js.code, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText;
    const module = { exports: {} as any };
    new Function('require', 'module', 'exports', code)((dependency: string) => dependency === './markdown' ? markdown
      : dependency === '../references' ? references : components[dependency] || require(dependency), module, module.exports);
    components[`./${name}.svelte`] = module.exports;
  }
  ReferencePreview = components['./ReferencePreview.svelte'].default;
});

describe('typed reference preview', () => {
  it('keeps a notebook with a block-shaped ID out of the native block preview path', () => {
    const previewReference = vi.fn(async (key: string) => {
      if (key !== `notebook:${id}`) throw new Error('Notebook previews require their canonical key');
      return { id, title: '演示研究库', kind: 'notebook', text: '笔记本范围说明' };
    });
    const html = ReferencePreview.render({ reference: { id, title: '演示研究库', kind: 'notebook', text: '笔记本范围说明' }, nativeHover: true, controller: { previewReference } }).html;
    expect(html).toContain('笔记本 · 演示研究库');
    expect(html).toContain('aria-label="预览：笔记本 · 演示研究库"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('data-type="block-ref"');
    expect(html).not.toContain(`data-id="${id}"`);
    expect(html).not.toContain(`siyuan://blocks/${id}`);
    expect(previewReference).not.toHaveBeenCalled();
  });

  it('keeps same-ID notebook and document labels and hover semantics distinct', () => {
    const book = { id, title: '演示研究库', kind: 'notebook' };
    const document = { id, title: '演示文档', kind: 'document' };
    const render = (reference: typeof book) => ReferencePreview.render({ reference, nativeHover: true, controller: {} }).html;
    const html = render(book) + render(document);
    expect(references.referenceKey(book)).toBe(`notebook:${id}`);
    expect(references.referenceKey(document)).toBe(id);
    expect(html).toContain('预览：笔记本 · 演示研究库');
    expect(html).toContain('打开：演示文档');
    expect(html.match(/data-type="block-ref"/g)).toHaveLength(1);
  });

  it.each(['document', 'block', undefined])('preserves native hover for %s references', kind => {
    const html = ReferencePreview.render({ reference: { id, title: '演示笔记', kind }, nativeHover: true, controller: {} }).html;
    expect(html).toContain('data-type="block-ref"');
    expect(html).toContain(`data-id="${id}"`);
    expect(html).not.toContain('aria-expanded');
  });

  it('keeps a selection snapshot on the custom preview path even if its ID looks valid', () => {
    const html = ReferencePreview.render({ reference: { id, title: '演示选区', kind: 'selection', text: '选区快照' }, nativeHover: true, controller: {} }).html;
    expect(html).not.toContain('data-type="block-ref"');
    expect(html).toContain('aria-expanded="false"');
  });

  it('retains custom browser previews and removal controls while no native hover is available', () => {
    const html = ReferencePreview.render({ reference: { id, title: '演示研究库', kind: 'notebook' }, nativeHover: false, busy: true, controller: {} }).html;
    expect(html).not.toContain('data-type="block-ref"');
    expect(html).toContain('aria-label="移除引用：笔记本 · 演示研究库"');
    expect(html).toMatch(/<button[^>]*class="reference-remove[^>]*disabled/);
  });

  it.each(['document', 'notebook', 'selection'] as const)('keeps sent %s references previewable without removal controls', kind => {
    const previewReference = vi.fn();
    const html = ReferencePreview.render({ reference: { id, title: '发送时标题', kind, text: '发送时快照' }, nativeHover: false,
      controller: { previewReference }, messageId: 'message-one', removable: false }).html;
    expect(html).toContain(`aria-label="${kind === 'document' ? '打开' : '预览'}：${kind === 'notebook' ? '笔记本 · ' : ''}发送时标题"`);
    if (kind === 'document') expect(html).toContain(`href="siyuan://blocks/${id}"`);
    else expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('class="reference-remove');
    expect(html).not.toContain('移除引用');
    expect(previewReference).not.toHaveBeenCalled();
  });

  it('retains native block previews exclusively for sent documents when a notebook shares the ID', () => {
    const document = ReferencePreview.render({ reference: { id, title: '历史文档', kind: 'document' }, nativeHover: true,
      controller: {}, messageId: 'sent', removable: false }).html;
    const notebook = ReferencePreview.render({ reference: { id, title: '历史范围', kind: 'notebook' }, nativeHover: true,
      controller: {}, messageId: 'sent', removable: false }).html;
    expect(document).toContain('data-type="block-ref"');
    expect(document).toContain(`data-id="${id}"`);
    expect(document).not.toContain('aria-expanded');
    expect(notebook).not.toContain('data-type="block-ref"');
    expect(notebook).not.toContain(`data-id="${id}"`);
    expect(notebook).toContain('aria-expanded="false"');
    expect(document + notebook).not.toContain('移除引用');
  });

  it('escapes markup and attribute delimiters in sent reference titles', () => {
    const html = ReferencePreview.render({ reference: { id, title: '"><script>alert(1)</script>', kind: 'notebook' },
      nativeHover: false, controller: {}, messageId: 'sent', removable: false }).html;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script>');
    expect(html).toContain('&quot;');
    expect(html).not.toContain('移除引用');
  });

  it.each(['document', 'block', undefined])('renders %s attachment labels as native navigation links', kind => {
    const html = ReferencePreview.render({ reference: { id, title: '定位来源', kind }, nativeHover: true, controller: {}, busy: true }).html;
    expect(html).toMatch(new RegExp(`<a[^>]*href="siyuan://blocks/${id}"`));
    expect(html).toContain('aria-label="打开：定位来源"');
    expect(html).toContain('data-type="block-ref"');
    expect(html).not.toMatch(/<a[^>]*(?:disabled|target=)/);
  });

  it('links a selection to its source block while keeping snapshot hover separate', () => {
    const html = ReferencePreview.render({ reference: { id: 'selection-snapshot', sourceId: id, title: '选区来源', kind: 'selection' },
      nativeHover: true, controller: {}, messageId: 'sent', removable: false }).html;
    expect(html).toContain(`href="siyuan://blocks/${id}"`);
    expect(html).toContain('aria-label="打开：选区来源"');
    expect(html).not.toContain('data-type="block-ref"');
    expect(html).not.toContain('reference-remove');
  });

  it.each([
    { id: 'javascript:alert(1)', kind: 'document' },
    { id, sourceId: 'javascript:alert(1)', kind: 'selection' },
    { id, sourceId: id, kind: 'notebook' },
    { id: 'selection-old', kind: 'selection' },
  ])('does not invent a navigation target for %j', reference => {
    const html = ReferencePreview.render({ reference: { ...reference, title: '引用' }, nativeHover: false, controller: {} }).html;
    expect(html).not.toContain('href=');
    expect(html).toContain('aria-label="预览：');
  });
});
