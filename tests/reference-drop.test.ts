import { describe, expect, it, vi } from 'vitest';
import { referenceDropZone } from '../src/ui/reference-drop';

class Zone extends EventTarget {
  ownerDocument = { defaultView: new EventTarget() };
  parent: Zone | null = null;
  captures: [string, boolean | AddEventListenerOptions | undefined][] = [];
  contains(value: Node) { for (let item: Zone | null = value as unknown as Zone; item; item = item.parent) if (item === this) return true; return false; }
  override addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
    this.captures.push([type, options]); super.addEventListener(type, callback, options);
  }
}
const internal = { 'application/siyuan-file': '20261020000000-demo001', 'text/plain': 'siyuan://blocks/20261020000000-demo001' };
const ignoredDrags: Record<string, string>[] = [{ 'text/plain': '普通文字' }, { 'text/html': '<p>普通文字</p>' }, { Files: '', ...internal }];
function drag(type: string, data: Record<string, string> = internal, relatedTarget: EventTarget | null = null, target?: Zone) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const transfer = { types: Object.keys(data), getData: (name: string) => data[name] || '', dropEffect: 'none' };
  Object.defineProperties(event, { dataTransfer: { value: transfer }, relatedTarget: { value: relatedTarget }, ...(target ? { target: { value: target } } : {}) });
  return { event, transfer };
}
function setup(enabled = true) {
  const node = new Zone(), active = vi.fn(), drop = vi.fn();
  const action = referenceDropZone(node as unknown as HTMLElement, { enabled, active, drop });
  return { node, active, drop, action };
}

describe('whole sidebar reference drop boundary', () => {
  it('claims recognized drags from any descendant in capture phase', () => {
    const { node, active, action } = setup();
    const header = new Zone(), messages = new Zone(); header.parent = node; messages.parent = node;
    expect(node.captures.filter(([name]) => name.startsWith('drag') || name === 'drop').every(([, capture]) => typeof capture === "object" && capture.capture === true)).toBe(true);
    for (const target of [header, messages]) {
      const { event, transfer } = drag('dragover', internal, null, target);
      node.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(transfer.dropEffect).toBe('copy');
    }
    expect(active.mock.calls).toEqual([[true]]);
    action.destroy();
  });

  it('does not flicker when moving between sidebar children, then clears at the outer boundary', () => {
    const { node, active, action } = setup();
    const first = new Zone(), second = new Zone(), outside = new Zone(); first.parent = node; second.parent = node;
    node.dispatchEvent(drag('dragenter', internal, null, first).event);
    node.dispatchEvent(drag('dragenter', internal, null, second).event);
    node.dispatchEvent(drag('dragleave', internal, second, first).event);
    expect(active.mock.calls).toEqual([[true]]);
    node.dispatchEvent(drag('dragleave', internal, outside, second).event);
    expect(active.mock.calls).toEqual([[true], [false]]);
    action.destroy();
  });

  it('stops a recognized drop synchronously and preserves every MIME field before asynchronous reading', () => {
    const { node, active, drop, action } = setup();
    const later = vi.fn(); node.addEventListener('drop', later);
    node.dispatchEvent(drag('dragenter').event);
    const { event } = drag('drop'); node.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(later).not.toHaveBeenCalled();
    expect(drop).toHaveBeenCalledOnce();
    expect(drop).toHaveBeenCalledWith(internal);
    expect(active.mock.calls).toEqual([[true], [false]]);
    action.destroy();
  });

  it.each(ignoredDrags)('does not intercept ordinary text or files: %j', data => {
    const { node, active, drop, action } = setup();
    for (const type of ['dragenter', 'dragover', 'drop']) {
      const { event } = drag(type, data); node.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(active).not.toHaveBeenCalled(); expect(drop).not.toHaveBeenCalled();
    action.destroy();
  });

  it('clears on drag end, outside drop and busy/pending transition', () => {
    const { node, active, drop, action } = setup();
    node.dispatchEvent(drag('dragenter').event);
    node.ownerDocument.defaultView.dispatchEvent(new Event('dragend'));
    node.dispatchEvent(drag('dragenter').event);
    node.ownerDocument.defaultView.dispatchEvent(new Event('drop'));
    node.dispatchEvent(drag('dragenter').event);
    action.update({ enabled: false, active, drop });
    expect(active.mock.calls).toEqual([[true], [false], [true], [false], [true], [false]]);
    const { event } = drag('drop'); node.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false); expect(drop).not.toHaveBeenCalled();
    action.destroy();
  });

  it('does not intercept when disabled and removes listeners on destroy', () => {
    const { node, active, drop, action } = setup(false);
    const before = drag('drop').event; node.dispatchEvent(before); expect(before.defaultPrevented).toBe(false);
    action.update({ enabled: true, active, drop }); action.destroy();
    const after = drag('drop').event; node.dispatchEvent(after); expect(after.defaultPrevented).toBe(false);
    expect(drop).not.toHaveBeenCalled();
  });
});
