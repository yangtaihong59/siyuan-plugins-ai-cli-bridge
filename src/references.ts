/** SiYuan 3.8 desktop DataTransfer payloads. This module never reads note data. */
const ID = /^\d{14}-[a-z0-9]{7}$/;
export const NOTEBOOK_DRAG_TYPE = 'application/siyuan-dsh-notebooks';
export interface ReferenceTarget { id: string; kind: 'block' | 'notebook' }

/** Notebook scopes and their same-ID box documents are different attachments. */
export function referenceKey(ref: { id: string; kind?: string }): string {
  return ref.kind === 'notebook' ? `notebook:${ref.id}` : ref.id;
}

const GUTTER = 'application/siyuan-gutter';
const INTERNAL_TYPES = new Set([
  NOTEBOOK_DRAG_TYPE,
  'application/siyuan-file', 'application/siyuan-documents',
  'application/siyuan-block-ref', 'application/siyuan-document-tab',
]);

export function isSiYuanId(value: unknown): value is string { return typeof value === 'string' && ID.test(value); }

/** Only native internal drags may claim the drop zone before payloads become readable. */
export function canDropSiYuan(types: readonly string[]): boolean {
  return types.some(type => INTERNAL_TYPES.has(type) || type.startsWith(GUTTER));
}

/**
 * Keep DataTransfer types as keys: native gutter payloads encode their IDs and
 * source workspace in the MIME name itself, whose ASCII letters become lowercase.
 */
export function parseSiYuanDrag(data: Readonly<Record<string, string>>, workspace: string,
  platform: string = typeof process === 'object' ? process.platform : 'linux'): ReferenceTarget[] {
  const targets = new Map<string, ReferenceTarget>();
  const notebookIds = new Set<string>();
  const add = (value: unknown, kind: ReferenceTarget['kind'] = 'block') => {
    if (!isSiYuanId(value)) return;
    const target = { id: value, kind };
    targets.set(referenceKey(target), target);
    if (targets.size > 6) throw new Error('每次最多引用 6 条笔记本、笔记或内容块。');
  };
  const addAlias = (value: string) => { if (!notebookIds.has(value)) add(value); };
  const read = (type: string): any => {
    try { return JSON.parse(data[type] || 'null'); } catch { return null; }
  };
  const normalizePath = (value: string, mime: boolean) => {
    const windows = platform === 'win32';
    let path = value.normalize('NFC');
    if (windows) path = path.replace(/\\/g, '/');
    if (windows || mime) path = path.toLowerCase();
    const prefix = windows && /^[a-z]:\//.test(path) ? path.slice(0, 3)
      : windows && path.startsWith('//') ? '//' : path.startsWith('/') ? '/' : '';
    const parts: string[] = [];
    for (const part of (prefix.length === 3 ? path.slice(3) : path).split('/')) {
      if (!part || part === '.') continue;
      if (part === '..' && parts.length && parts.at(-1) !== '..') parts.pop();
      else if (part === '..' && prefix) continue;
      else parts.push(part);
    }
    return prefix + parts.join('/');
  };
  const checkWorkspace = (source: unknown, mime = false) => {
    if (typeof source !== 'string' || !source) throw new Error('拖拽数据缺少来源工作区。');
    if (!workspace) throw new Error('无法确认当前思源工作区，请重新打开插件后再拖入。');
    if (normalizePath(source, mime) !== normalizePath(workspace, mime)) throw new Error('不能引用另一个思源工作区的块。');
  };

  // This marker is supplied by this plugin's source dragstart handler. If it
  // is present but invalid, never reinterpret its native aliases as documents.
  if (Object.prototype.hasOwnProperty.call(data, NOTEBOOK_DRAG_TYPE)) {
    const notebooks = read(NOTEBOOK_DRAG_TYPE);
    if (!notebooks || typeof notebooks !== 'object' || Array.isArray(notebooks)
      || !Array.isArray(notebooks.ids) || !notebooks.ids.length || !notebooks.ids.every(isSiYuanId)) {
      throw new Error('笔记本拖拽数据无效，请重新拖入。');
    }
    checkWorkspace(notebooks.workspaceDir);
    for (const id of notebooks.ids) { notebookIds.add(id); add(id, 'notebook'); }
  }

  const refs = read('application/siyuan-block-ref');
  if (refs && typeof refs === 'object' && !Array.isArray(refs)) {
    if (refs.workspaceDir !== undefined) checkWorkspace(refs.workspaceDir);
    if (Array.isArray(refs.ids)) refs.ids.forEach((id: unknown) => add(id));
  }
  const documents = read('application/siyuan-documents');
  if (Array.isArray(documents?.ids)) documents.ids.forEach((id: unknown) => add(id));
  for (const id of (data['application/siyuan-file'] || '').split(',')) addAlias(id.trim());
  add(read('application/siyuan-document-tab')?.rootId);

  for (const type of Object.keys(data)) {
    if (!type.startsWith(GUTTER)) continue;
    const [nodeType, subtype, values, source] = type.slice(GUTTER.length).split('\u200b');
    // Attribute-view rows, columns, tabs and gallery cards use unrelated IDs.
    if (!/^node[a-z]+$/.test(nodeType) || ['nodeattributeviewrowmenu', 'nodeattributeviewrow'].includes(nodeType)
      || nodeType === 'nodeattributeview' && ['viewtab', 'col', 'galleryitem'].includes(subtype)) continue;
    checkWorkspace(source, true);
    for (const id of (values || '').split(',')) add(id);
  }

  // Only the explicit official URI grants identity to a plain-text/HTML drop.
  // A bare block-looking ID or data-node-id snippet from a web page is not enough.
  for (const type of ['text/uri-list', 'text/plain', 'text/html']) {
    let text = data[type] || '';
    if (type === 'text/uri-list') text = text.split(/\r?\n/).filter(line => !line.trimStart().startsWith('#')).join('\n');
    for (const match of text.matchAll(/siyuan:\/\/blocks\/(\d{14}-[a-z0-9]{7})(?=$|[?#\s"'<>()[\]{}])/gi)) addAlias(match[1]);
  }
  return [...targets.values()];
}
