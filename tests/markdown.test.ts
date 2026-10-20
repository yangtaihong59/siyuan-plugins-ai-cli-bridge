import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { compile, preprocess } from 'svelte/compiler';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';
import * as markdown from '../src/ui/markdown';

const id = '20261020000000-demo001';
const href = `siyuan://blocks/${id}`;
let Message: { render(props: { text: string; streaming?: boolean }): { html: string; css: { code: string } } };

beforeAll(async () => {
  // Compile and render the real components, including shared inline rendering.
  const require = createRequire(import.meta.url);
  const components: Record<string, any> = {};
  for (const name of ['Inline', 'Message']) {
    const filename = new URL(`../src/ui/${name}.svelte`, import.meta.url);
    const source = await preprocess(readFileSync(filename, 'utf8'), {
      script: ({ content }) => ({ code: transpileModule(content, {
        compilerOptions: { target: ScriptTarget.ES2020, module: ModuleKind.ESNext, verbatimModuleSyntax: true },
      }).outputText }),
    }, { filename: filename.pathname });
    const component = compile(source.code, { filename: filename.pathname, generate: 'ssr' });
    const code = transpileModule(component.js.code, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText;
    const module = { exports: {} as any };
    new Function('require', 'module', 'exports', code)((dependency: string) => dependency === './markdown'
      ? markdown : components[dependency] || require(dependency), module, module.exports);
    components[`./${name}.svelte`] = module.exports;
  }
  Message = components['./Message.svelte'].default;
});

describe('SiYuan reply links', () => {
  it.each([href, `${href}?focus=1`, `${href}#fragment`, `SIYUAN://BLOCKS/${id}?focus=1#fragment`])('preserves %s while adding native preview identity', value => {
    expect(markdown.siyuanBlockId(value)).toBe(id);
    expect(markdown.linkAttributes(value)).toMatchObject({ href: value, 'data-type': 'block-ref', 'data-id': id, 'data-subtype': 'd' });
    expect(markdown.linkAttributes(value).target).toBeUndefined();
  });

  it.each([
    'siyuan://blocks/not-a-block', `${href}/child`, `siyuan://blocks/${id.toUpperCase()}`,
    `https://example.com/${id}`, `siyuan://blocks.example/${id}`, `siyuan://user@blocks/${id}`,
    `siyuan://blocks/%32${id.slice(1)}`, `${href}\n`,
  ])('does not grant native block identity to %s', value => {
    expect(markdown.siyuanBlockId(value)).toBeUndefined();
    expect(markdown.linkAttributes(value)['data-type']).toBeUndefined();
    expect(markdown.linkAttributes(value)['data-id']).toBeUndefined();
  });

  it('renders preview attributes in both paragraph and list links without click interception', () => {
    const html = Message.render({ text: `[段落](${href}?focus=1)\n\n- [列表](${href}#fragment)` }).html;
    const anchors = [...html.matchAll(/<a\b[^>]*>/g)].map(match => match[0]);
    expect(anchors).toHaveLength(2);
    for (const anchor of anchors) {
      expect(anchor).toContain('data-type="block-ref"');
      expect(anchor).toContain(`data-id="${id}"`);
      expect(anchor).not.toContain('target="_blank"');
      expect(anchor).not.toMatch(/onclick|prevent/);
    }
    expect(anchors[0]).toContain(`href="${href}?focus=1"`);
    expect(anchors[1]).toContain(`href="${href}#fragment"`);
  });

  it('leaves external and invalid internal links unmarked', () => {
    const html = Message.render({ text: `[外链](https://example.com/${id})\n\n- [无效](siyuan://blocks/bad-id)` }).html;
    expect(html.match(/<a\b/g)).toHaveLength(2);
    expect(html).not.toContain('data-type="block-ref"');
    expect(html).toContain('target="_blank"');
  });

  it('keeps URLs inside inline code and fences as text', () => {
    const html = Message.render({ text: `\`[行内](${href})\`\n\n\`\`\`md\n[围栏](${href})\n\`\`\`` }).html;
    expect(html).not.toMatch(/<a\b/);
    expect(html).not.toContain('data-type="block-ref"');
    expect(html).toContain(href);
  });
});

const cellText = (tokens: markdown.Inline[]) => tokens.map(token => token.text).join('');
function table(text: string, streaming = false) {
  const block = markdown.parseMarkdown(text, streaming)[0];
  expect(block?.kind).toBe('table');
  if (block?.kind !== 'table') throw new Error('Expected table fixture');
  return block;
}

describe('safe pipe tables', () => {
  it('parses headers, alignments and cells without requiring edge pipes', () => {
    const result = table('| 左 | 中 | 右 | 默认 |\n:--- | :-: | ---: | ---\na | b | c | d');
    expect(result.header.map(cellText)).toEqual(['左', '中', '右', '默认']);
    expect(result.alignments).toEqual(['left', 'center', 'right', null]);
    expect(result.rows.map(row => row.map(cellText))).toEqual([['a', 'b', 'c', 'd']]);
  });

  it('fills missing and empty cells and ignores surplus body cells', () => {
    const result = table('| A | B | C |\n| - | - | - |\n| | | |\nonly\n| a | b | c | ignored |');
    expect(result.rows.map(row => row.map(cellText))).toEqual([['', '', ''], ['only', '', ''], ['a', 'b', 'c']]);
  });

  it('preserves escaped pipes inside plain, strong and code cells', () => {
    const result = table("| f\\|oo | **b\\|ar** | `x\\|y` |\n| --- | --- | --- |\n| a\\|b | **c\\|d** | `e\\|f` |");
    expect(result.header.map(cellText)).toEqual(['f|oo', 'b|ar', 'x|y']);
    expect(result.rows[0].map(cellText)).toEqual(['a|b', 'c|d', 'e|f']);
    expect(result.header[1][0].kind).toBe('strong');
    expect(result.header[2][0].kind).toBe('code');
  });

  it('keeps unescaped pipes inside a closed code span in their original cell', () => {
    const result = table('`a|b` | C\n--- | ---\n``x`|y`` | D');
    expect(result.header[0]).toEqual([{ kind: 'code', text: 'a|b' }]);
    expect(result.rows[0][0]).toEqual([{ kind: 'code', text: 'x`|y' }]);
    expect(result.rows[0].map(cellText)).toEqual(['x`|y', 'D']);
  });

  it('treats unmatched code delimiters as text instead of hiding structural pipes', () => {
    const result = table('A | B\n--- | ---\n`unfinished | second');
    expect(result.rows[0].map(cellText)).toEqual(['`unfinished', 'second']);
  });

  it('keeps an even number of backslashes from escaping a structural pipe', () => {
    const result = table(String.raw`A | B
--- | ---
a\\|b`);
    expect(result.rows[0].map(cellText)).toEqual(['a\\', 'b']);
  });

  it.each([
    '| A | B |\n| --- |\n| x |',
    '| A | B |\n| --- | not-a-separator |',
    '| A | B |\n| --- | ::--- |',
    '| A | B |',
    'an ordinary | sentence',
    'setext-shaped text\n---',
  ])('does not recognize incomplete or mismatched tables: %s', value => {
    expect(markdown.parseMarkdown(value).some(block => block.kind === 'table')).toBe(false);
  });

  it('waits for the separator line to finish during streaming and accepts a final header-only table', () => {
    const pending = '| A | B |\n| --- | ---';
    expect(markdown.parseMarkdown(pending, true).some(block => block.kind === 'table')).toBe(false);
    expect(table(pending + '\n', true).rows).toEqual([]);
    expect(table(pending).rows).toEqual([]);
    expect(markdown.parseMarkdown('| A | B |\n| --- | :', true).some(block => block.kind === 'table')).toBe(false);
    expect(Message.render({ text: pending, streaming: true }).html).not.toContain('<table');
    expect(Message.render({ text: pending, streaming: false }).html).toContain('<table');
  });

  it('starts a table after prose and stops at blank lines or another block', () => {
    const blocks = markdown.parseMarkdown('前言\nA | B\n--- | ---\nx | y\n> 引用\n\n结尾');
    expect(blocks.map(block => block.kind)).toEqual(['paragraph', 'table', 'quote', 'paragraph']);
  });

  it('does not recognize a pipe table inside complete or still-open fences', () => {
    for (const text of ['```md\nA | B\n--- | ---\nx | y\n```', '~~~\nA | B\n--- | ---\nx | y']) {
      expect(markdown.parseMarkdown(text).map(block => block.kind)).toEqual(['code']);
      expect(Message.render({ text, streaming: true }).html).not.toContain('<table');
    }
  });

  it('renders semantic header/body cells, column alignment and empty padding through the real Message component', () => {
    const { html, css } = Message.render({ text: '| A | B | C |\n| :--- | :---: | ---: |\n| **粗体** | `x|y` | 9 |\n| 少列 |' });
    expect(html.match(/<table\b/g)).toHaveLength(1);
    expect(html.match(/<th\b/g)).toHaveLength(3);
    expect(html.match(/<td\b/g)).toHaveLength(6);
    expect(html).toContain('<thead');
    expect(html).toContain('<tbody');
    expect(html).toMatch(/<strong[^>]*>粗体<\/strong>/);
    expect(html).toMatch(/<code[^>]*>x\|y<\/code>/);
    expect(html).toContain('text-align: left');
    expect(html).toContain('text-align: center');
    expect(html).toContain('text-align: right');
    expect(html).toContain('aria-label="表格，可横向滚动"');
    expect(css.code).toContain('overflow-x:auto');
    expect(css.code).toContain('min-width:0');
    expect(css.code).toContain('table-layout:auto');
    expect(css.code).toContain('max-width:100%');
  });

  it('renders an empty header and no tbody for a header-only table', () => {
    const { html } = Message.render({ text: '| | B |\n| --- | --- |' });
    expect(html.match(/<th\b/g)).toHaveLength(2);
    expect(html).not.toContain('<tbody');
  });

  it('preserves native SiYuan link attributes in both header and body cells', () => {
    const html = Message.render({ text: `[标题](${href}?focus=1) | 外链\n--- | ---\n[正文](${href}#fragment) | [站点](https://example.com)` }).html;
    const anchors = [...html.matchAll(/<a\b[^>]*>/g)].map(match => match[0]);
    expect(anchors).toHaveLength(3);
    for (const anchor of anchors.slice(0, 2)) {
      expect(anchor).toContain('data-type="block-ref"');
      expect(anchor).toContain(`data-id="${id}"`);
      expect(anchor).not.toContain('target="_blank"');
      expect(anchor).not.toMatch(/onclick|prevent/);
    }
    expect(anchors[0]).toContain(`href="${href}?focus=1"`);
    expect(anchors[1]).toContain(`href="${href}#fragment"`);
    expect(anchors[2]).toContain('target="_blank"');
  });

  it('escapes HTML and refuses executable links in table cells', () => {
    const html = Message.render({ text: '| 安全 | 内容 |\n| --- | --- |\n| <img src=x onerror=alert(1)> | [执行](javascript:alert(1)) |' }).html;
    expect(html).toContain('&lt;img');
    expect(html).not.toMatch(/<img\b|<script\b|<a\b|onclick=/);
    expect(html).toContain('javascript:alert(1)');
  });
});
