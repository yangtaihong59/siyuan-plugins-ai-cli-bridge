import { describe, expect, it } from 'vitest';
import { canDropSiYuan, isSiYuanId, parseSiYuanDrag, NOTEBOOK_DRAG_TYPE, referenceKey } from '../src/references';

const a = '20261001124824-pq6acxs';
const b = '20261001124825-abcdefg';
const workspace = '/Users/skycat/SiYuan';
const blockTargets = (...ids: string[]) => ids.map(id => ({ id, kind: 'block' }));
const notebookTargets = (...ids: string[]) => ids.map(id => ({ id, kind: 'notebook' }));
const notebookPayload = (...ids: string[]) => ({ [NOTEBOOK_DRAG_TYPE]: JSON.stringify({ ids, workspaceDir: workspace }) });
const gutter = (ids: string, path = workspace.toLowerCase(), type = 'nodeparagraph', subtype = '') =>
  `application/siyuan-gutter${type}\u200b${subtype}\u200b${ids}\u200b${path}`;

describe('verified SiYuan desktop reference drag protocol', () => {
  it('reads document-tree IDs in order and deduplicates its two simultaneous payloads', () => {
    expect(parseSiYuanDrag({
      'application/siyuan-documents': JSON.stringify({ ids: [a, b, a] }),
      'application/siyuan-file': `${a},${b}`,
    }, workspace)).toEqual(blockTargets(a, b));
  });

  it('reads the document tab rootId without accepting its unrelated tabId', () => {
    expect(parseSiYuanDrag({ 'application/siyuan-document-tab': JSON.stringify({ rootId: a, tabId: b, title: '文档' }) }, workspace)).toEqual(blockTargets(a));
  });

  it('reads multiple body blocks from the MIME name rather than the HTML value', () => {
    expect(parseSiYuanDrag({ [gutter(`${a},${b}`)]: '<div data-node-id="unrelated">正文</div>' }, workspace, 'darwin')).toEqual(blockTargets(a, b));
    expect(parseSiYuanDrag({ [gutter(a, '/home/user/notes')]: '' }, '/HOME/user/Notes', 'linux')).toEqual(blockTargets(a));
  });

  it('normalizes lexical workspace spelling without opening a path', () => {
    expect(parseSiYuanDrag({ [gutter(a, '/users/skycat/work/../siyuan/')]: '' }, workspace + '/.', 'darwin')).toEqual(blockTargets(a));
    expect(parseSiYuanDrag({ 'application/siyuan-block-ref': JSON.stringify({ ids: [a], workspaceDir: 'c:\\Users\\Skycat\\SiYuan\\.' }) }, 'C:/users/skycat/SiYuan/', 'win32')).toEqual(blockTargets(a));
  });

  it('keeps case-sensitive JSON workspace paths distinct on macOS and Linux', () => {
    const payload = { 'application/siyuan-block-ref': JSON.stringify({ ids: [a], workspaceDir: workspace.toLowerCase() }) };
    expect(() => parseSiYuanDrag(payload, workspace, 'darwin')).toThrow('另一个');
    expect(() => parseSiYuanDrag(payload, workspace, 'linux')).toThrow('另一个');
  });

  it('reads bookmarked block references while refusing another or unknown workspace', () => {
    expect(parseSiYuanDrag({ 'application/siyuan-block-ref': JSON.stringify({ ids: [a, 'bad', a], workspaceDir: workspace }) }, workspace)).toEqual(blockTargets(a));
    expect(() => parseSiYuanDrag({ 'application/siyuan-block-ref': JSON.stringify({ ids: [a], workspaceDir: '/other' }) }, workspace)).toThrow('另一个');
    expect(() => parseSiYuanDrag({ [gutter(a, '/other')]: '' }, workspace)).toThrow('另一个');
    expect(() => parseSiYuanDrag({ [gutter(a)]: '' }, '')).toThrow('无法确认当前');
    expect(() => parseSiYuanDrag({ 'application/siyuan-block-ref': JSON.stringify({ ids: [a], workspaceDir: workspace }) }, '')).toThrow('无法确认当前');
  });

  it.each([
    ['nodeattributeviewrowmenu', ''], ['nodeattributeviewrow', ''],
    ['nodeattributeview', 'viewtab'], ['nodeattributeview', 'col'], ['nodeattributeview', 'galleryitem'],
  ])('does not treat an AV subobject as a block: %s/%s', (type, subtype) => {
    expect(parseSiYuanDrag({ [gutter(a, workspace, type, subtype)]: '' }, workspace)).toEqual([]);
  });

  it('allows an actual database block and thematic-break block', () => {
    expect(parseSiYuanDrag({ [gutter(a, workspace, 'nodeattributeview')]: '', [gutter(b, workspace, 'nodethematicbreak')]: '' }, workspace)).toEqual(blockTargets(a, b));
  });

  it('accepts only explicit official SiYuan URIs in standard drag types', () => {
    expect(parseSiYuanDrag({ 'text/plain': `[笔记](siyuan://blocks/${a})` }, workspace)).toEqual(blockTargets(a));
    expect(parseSiYuanDrag({ 'text/html': `<a href="siyuan://blocks/${a}?focus=1">笔记</a>` }, workspace)).toEqual(blockTargets(a));
    expect(parseSiYuanDrag({ 'text/uri-list': `# ignored siyuan://blocks/${b}\nsiyuan://blocks/${a}\r\nsiyuan://blocks/${b}#fragment` }, workspace)).toEqual(blockTargets(a, b));
    expect(parseSiYuanDrag({ 'text/plain': `${a}\nhttps://example.com/${b}\nsiyuan://blocks/${a}extra`, 'text/html': `<div data-node-id="${b}" data-type="NodeParagraph">a web snippet</div>` }, workspace)).toEqual([]);
  });

  it('ignores malformed, foreign and marker-only payloads without guessing IDs', () => {
    expect(parseSiYuanDrag({ 'application/siyuan-documents': '{bad', 'application/siyuan-file': 'notebook/path',
      'application/siyuan-block': a, 'application/json': JSON.stringify({ id: b }), 'text/plain': 'plain text' }, workspace)).toEqual([]);
    expect(parseSiYuanDrag({ 'application/siyuan-documents': JSON.stringify({ ids: [null, true, {}, '20261001124824-ABCDEFG', a] }) }, workspace)).toEqual(blockTargets(a));
    expect(isSiYuanId(a)).toBe(true);
    expect(isSiYuanId('seven77')).toBe(false);
  });

  it('refuses oversized multi-selection after deduplication instead of silently dropping references', () => {
    const six = Array.from({ length: 6 }, (_, index) => `2026100112482${index}-abcdefg`);
    expect(parseSiYuanDrag({ 'application/siyuan-documents': JSON.stringify({ ids: [...six, six[0]] }) }, workspace)).toEqual(blockTargets(...six));
    expect(() => parseSiYuanDrag({ 'application/siyuan-documents': JSON.stringify({ ids: [...six, a] }) }, workspace)).toThrow('最多引用 6');
  });

  it('advertises candidates without claiming an arbitrary plain-text payload is a reference', () => {
    expect(canDropSiYuan(['application/siyuan-documents'])).toBe(true);
    expect(canDropSiYuan([gutter(a)])).toBe(true);
    expect(canDropSiYuan(['text/plain'])).toBe(false);
    expect(canDropSiYuan(['text/html'])).toBe(false);
    expect(canDropSiYuan(['text/uri-list'])).toBe(false);
    expect(canDropSiYuan(['Files', 'application/octet-stream'])).toBe(false);
    expect(parseSiYuanDrag({ 'text/plain': a }, workspace)).toEqual([]);
  });
});


describe('explicit notebook-scope drag identity', () => {
  it('keeps notebook order and removes only native-file and standard-URI aliases', () => {
    expect(parseSiYuanDrag({ ...notebookPayload(b, a, b), 'application/siyuan-file': `${b},${a}`,
      'text/plain': `[alias](siyuan://blocks/${a})`, 'text/uri-list': `siyuan://blocks/${b}`,
      'text/html': `<a href="siyuan://blocks/${a}">alias</a>` }, workspace)).toEqual(notebookTargets(b, a));
    expect(canDropSiYuan([NOTEBOOK_DRAG_TYPE])).toBe(true);
  });

  it.each([
    { 'application/siyuan-documents': JSON.stringify({ ids: [a] }) },
    { 'application/siyuan-block-ref': JSON.stringify({ ids: [a], workspaceDir: workspace }) },
    { 'application/siyuan-document-tab': JSON.stringify({ rootId: a }) },
    { [gutter(a)]: '' },
  ] as Record<string, string>[])('retains an explicit same-ID document or block alongside its notebook scope', payload => {
    expect(parseSiYuanDrag({ ...notebookPayload(a), ...payload, 'application/siyuan-file': a }, workspace))
      .toEqual([...notebookTargets(a), ...blockTargets(a)]);
  });

  it('supports native path-only notebook drags only when the explicit marker supplies identity', () => {
    expect(parseSiYuanDrag({ ...notebookPayload(a), 'application/siyuan-file': '/' }, workspace)).toEqual(notebookTargets(a));
    expect(parseSiYuanDrag({ 'application/siyuan-file': '/,/' }, workspace)).toEqual([]);
  });

  it.each(['{broken', 'null', '[]', '{}', JSON.stringify({ ids: [] }), JSON.stringify({ ids: ['bad'], workspaceDir: workspace }),
    JSON.stringify({ ids: [a, 'bad'], workspaceDir: workspace }), JSON.stringify({ ids: a, workspaceDir: workspace })])
  ('rejects malformed notebook markers instead of falling back to a valid native alias: %s', payload => {
    expect(() => parseSiYuanDrag({ [NOTEBOOK_DRAG_TYPE]: payload, 'application/siyuan-file': a,
      'text/plain': `siyuan://blocks/${a}` }, workspace)).toThrow('笔记本拖拽数据无效');
  });

  it.each([undefined, '', null])('rejects missing notebook workspace provenance: %s', workspaceDir => {
    expect(() => parseSiYuanDrag({ [NOTEBOOK_DRAG_TYPE]: JSON.stringify({ ids: [a], workspaceDir }), 'application/siyuan-file': a }, workspace)).toThrow('来源工作区');
  });

  it('rejects notebook markers from another or unknown workspace without guessing native aliases', () => {
    expect(() => parseSiYuanDrag({ [NOTEBOOK_DRAG_TYPE]: JSON.stringify({ ids: [a], workspaceDir: '/other' }), 'application/siyuan-file': a }, workspace)).toThrow('另一个');
    expect(() => parseSiYuanDrag(notebookPayload(a), '')).toThrow('无法确认当前');
  });

  it('counts notebook and same-ID box documents separately toward the six-reference cap', () => {
    const values = Array.from({ length: 4 }, (_, i) => `2026100112482${i}-abcdefg`);
    const first = values.slice(0, 3);
    expect(parseSiYuanDrag({ ...notebookPayload(...first), 'application/siyuan-documents': JSON.stringify({ ids: first }) }, workspace))
      .toEqual([...notebookTargets(...first), ...blockTargets(...first)]);
    expect(() => parseSiYuanDrag({ ...notebookPayload(...first), 'application/siyuan-documents': JSON.stringify({ ids: values }) }, workspace)).toThrow('最多引用 6');
  });

  it('uses a separate canonical key for notebook scopes while preserving all existing attachment keys', () => {
    expect(referenceKey({ id: a, kind: 'notebook' })).toBe(`notebook:${a}`);
    for (const kind of [undefined, 'block', 'document', 'selection']) expect(referenceKey({ id: a, kind })).toBe(a);
  });
});
