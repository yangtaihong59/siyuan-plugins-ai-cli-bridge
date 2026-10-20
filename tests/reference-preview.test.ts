import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { compile, preprocess } from 'svelte/compiler';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';
import * as markdown from '../src/ui/markdown';
import * as references from '../src/references';

const id = '20261020000000-demo003';
let ReferencePreview: { render(props: { reference: any; nativeHover: boolean; controller: any; busy?: boolean }): { html: string } };
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
    expect(html).toContain('预览：演示文档');
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
});
