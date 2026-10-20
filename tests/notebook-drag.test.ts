import { describe, expect, it, vi } from 'vitest';
import { captureNotebookDrag } from '../src/notebook-drag';
import { NOTEBOOK_DRAG_TYPE } from '../src/references';

const first = '20261020000000-nbook01';
const second = '20261020000001-nbook02';
const workspace = '/preview-workspace';

interface SourceTree {
  selected: SourceItem[];
  querySelectorAll: ReturnType<typeof vi.fn>;
}
interface SourceItem {
  getAttribute(name: string): string | null;
  closest(selector: string): object | null;
}
function tree(): SourceTree {
  const value: SourceTree = { selected: [], querySelectorAll: vi.fn() };
  value.querySelectorAll.mockImplementation(() => value.selected);
  return value;
}
function item(owner: SourceTree, id: string | null, type = 'navigation-root'): SourceItem {
  const notebook = {
    getAttribute: (name: string) => name === 'data-url' ? id : null,
    closest: (selector: string) => selector === '.file-tree__items' ? owner : null,
  };
  const value: SourceItem = {
    getAttribute: (name: string) => name === 'data-type' ? type : null,
    closest(selector) {
      if (selector === 'li[data-type="navigation-root"]') return type === 'navigation-root' ? value : null;
      if (selector === '.file-tree__items') return owner;
      if (selector === 'ul[data-url]') return notebook;
      return null;
    },
  };
  return value;
}
function fixture(nativeValue = '/') {
  const owner = tree();
  const origin = item(owner, first);
  owner.selected = [origin];
  const data = new Map<string, string>([['application/siyuan-file', nativeValue], ['text/plain', 'native source']]);
  const transfer = { setData: vi.fn((type: string, value: string) => data.set(type, value)) };
  const event = {
    target: { closest: (selector: string) => origin.closest(selector) },
    dataTransfer: transfer, defaultPrevented: false,
    preventDefault: vi.fn(), stopPropagation: vi.fn(), stopImmediatePropagation: vi.fn(),
  };
  const invoke = () => captureNotebookDrag(event as unknown as DragEvent, workspace);
  return { owner, origin, data, transfer, event, invoke };
}

describe('notebook drag identity capture', () => {
  it.each(['/', first])('adds container identity while preserving native file payload %s', nativeValue => {
    const f = fixture(nativeValue);
    f.invoke();
    expect(JSON.parse(f.data.get(NOTEBOOK_DRAG_TYPE)!)).toEqual({ ids: [first], workspaceDir: workspace });
    expect(f.data.get('application/siyuan-file')).toBe(nativeValue);
    expect(f.data.get('text/plain')).toBe('native source');
    expect(f.transfer.setData).toHaveBeenCalledTimes(1);
    expect(f.event.preventDefault).not.toHaveBeenCalled();
    expect(f.event.stopPropagation).not.toHaveBeenCalled();
    expect(f.event.stopImmediatePropagation).not.toHaveBeenCalled();
  });

  it('captures multiple selected roots and deduplicates their notebook identities', () => {
    const f = fixture();
    f.owner.selected.push(item(f.owner, second), item(f.owner, first));
    f.invoke();
    expect(JSON.parse(f.data.get(NOTEBOOK_DRAG_TYPE)!)).toEqual({ ids: [first, second], workspaceDir: workspace });
  });

  it('does not read another tree selection or nested tree notebook identity', () => {
    const f = fixture();
    const other = tree();
    const foreign = item(other, second);
    const idRead = vi.spyOn(foreign, 'closest');
    other.selected.push(foreign);
    f.owner.selected.push(foreign);
    f.invoke();
    expect(JSON.parse(f.data.get(NOTEBOOK_DRAG_TYPE)!).ids).toEqual([first]);
    expect(idRead).toHaveBeenCalledWith('.file-tree__items');
    expect(idRead).not.toHaveBeenCalledWith('ul[data-url]');
    expect(other.querySelectorAll).not.toHaveBeenCalled();
  });

  it('ignores mixed document and notebook selections', () => {
    const f = fixture();
    f.owner.selected.push(item(f.owner, second, 'navigation-file'));
    f.invoke();
    expect(f.transfer.setData).not.toHaveBeenCalled();
  });

  it('ignores drags whose origin is no longer part of the native selection', () => {
    const f = fixture();
    f.owner.selected = [item(f.owner, second)];
    f.invoke();
    expect(f.transfer.setData).not.toHaveBeenCalled();
  });

  it.each([null, '/', 'invalid', '20261020000000-NBOOK01'])('does not guess an identity from invalid notebook metadata %s', id => {
    const f = fixture();
    f.owner.selected.push(item(f.owner, id));
    f.invoke();
    expect(f.transfer.setData).not.toHaveBeenCalled();
  });

  it('does not capture a document drag even when its parent notebook has the same valid ID', () => {
    const f = fixture();
    const document = item(f.owner, first, 'navigation-file');
    f.owner.selected = [document];
    f.event.target = { closest: (selector: string) => document.closest(selector) };
    f.invoke();
    expect(f.transfer.setData).not.toHaveBeenCalled();
  });

  it('ignores canceled drags before querying source selection', () => {
    const f = fixture();
    f.event.defaultPrevented = true;
    f.invoke();
    expect(f.owner.querySelectorAll).not.toHaveBeenCalled();
    expect(f.transfer.setData).not.toHaveBeenCalled();
  });

  it('requires a transfer and known current workspace', () => {
    const f = fixture();
    captureNotebookDrag({ ...f.event, dataTransfer: null } as unknown as DragEvent, workspace);
    captureNotebookDrag(f.event as unknown as DragEvent, '');
    expect(f.owner.querySelectorAll).not.toHaveBeenCalled();
    expect(f.transfer.setData).not.toHaveBeenCalled();
  });

  it('ignores non-element event targets and roots outside an actual file tree', () => {
    const f = fixture();
    captureNotebookDrag({ ...f.event, target: {} } as unknown as DragEvent, workspace);
    const root = { closest: () => null };
    captureNotebookDrag({ ...f.event, target: { closest: () => root } } as unknown as DragEvent, workspace);
    expect(f.transfer.setData).not.toHaveBeenCalled();
  });
});
