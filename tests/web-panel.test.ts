import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountWebPanel } from '../src/web-panel';

class FakeElement extends EventTarget {
  children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  style: Record<string, string> = {};
  attributes = new Map<string, string>();
  className = ''; textContent = ''; src = ''; title = '';
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  constructor(public tagName: string, public ownerDocument: FakeDocument) { super(); }
  append(...items: FakeElement[]) { for (const item of items) { item.parentElement = this; this.children.push(item); } }
  appendChild(item: FakeElement) { this.append(item); return item; }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(item => item !== this); this.parentElement = null; }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  getAttribute(key: string) { return this.attributes.get(key) || null; }
  closest(selector: string): FakeElement | null { return selector === '[data-node-id]' && this.attributes.has('data-node-id') ? this : this.parentElement?.closest(selector) || null; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 300, bottom: 500 }; }
}
class FakeDocument extends EventTarget {
  created: FakeElement[] = [];
  listeners = new Map<string, Set<EventListenerOrEventListenerObject | null>>();
  createElement(tag: string) { const element = new FakeElement(tag, this); this.created.push(element); return element; }
  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener); super.addEventListener(type, listener, options);
  }
  override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) {
    this.listeners.get(type)?.delete(listener); super.removeEventListener(type, listener, options);
  }
}
class FakeImage {
  static instances: FakeImage[] = [];
  src = '';
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  constructor() { FakeImage.instances.push(this); }
}
class FakeObserver {
  static instances: FakeObserver[] = [];
  disconnected = false;
  constructor(public callback: () => void) { FakeObserver.instances.push(this); }
  observe() {}
  disconnect() { this.disconnected = true; }
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
let cleanups: (() => void)[];
function mount() {
  const doc = new FakeDocument(), host = doc.createElement('host');
  const cleanup = mountWebPanel(host as unknown as HTMLElement, { url: 'http://localhost:4096/chat?demo=1', i18n: { iframeWaiting: '等待服务', iframeLoadError: '连接失败' } });
  cleanups.push(cleanup);
  return { doc, host, cleanup, panel: host.children[0], find: (tag: string) => doc.created.find(item => item.tagName === tag)!, status: (name: string) => doc.created.find(item => item.className === name)! };
}
function dragStart(doc: FakeDocument, target?: FakeElement) {
  const data: Record<string, string> = { 'text/plain': '20261020000000-demo001 原生引用', 'application/siyuan-file': '20261020000000-demo001' };
  const transfer = { getData: (type: string) => data[type] || '', setData: (type: string, value: string) => { data[type] = value; } };
  const event = new Event('dragstart');
  Object.defineProperties(event, { dataTransfer: { value: transfer }, ...(target ? { target: { value: target } } : {}) });
  doc.dispatchEvent(event); return data;
}

beforeEach(() => {
  cleanups = []; vi.useFakeTimers(); FakeImage.instances = []; FakeObserver.instances = [];
  vi.stubGlobal('Image', FakeImage); vi.stubGlobal('ResizeObserver', FakeObserver);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
});
afterEach(() => { for (const cleanup of cleanups) cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('independent Web panel', () => {
  it('keeps waiting and the configured URL visible, then displays the successfully loaded iframe', async () => {
    const view = mount();
    expect(view.status('ai-dock-waiting').style.display).toBe('flex');
    expect(view.doc.created.filter(item => item.className === 'ai-dock-url').map(item => item.textContent)).toEqual(['http://localhost:4096/chat?demo=1', 'http://localhost:4096/chat?demo=1']);
    FakeImage.instances[0].onload!(new Event('load')); await settle();
    const frame = view.find('iframe'); expect(frame.src).toBe('http://localhost:4096/chat?demo=1');
    expect(frame.attributes.get('allow')).toBe('clipboard-read; clipboard-write');
    frame.onload!(new Event('load'));
    expect(frame.style.display).toBe('block'); expect(view.status('ai-dock-waiting').style.display).toBe('none');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('falls back to a bounded no-CORS HEAD request when favicon loading fails', async () => {
    vi.mocked(fetch).mockResolvedValue({} as Response);
    const view = mount(); FakeImage.instances[0].onerror!(new Event('error')); await settle();
    expect(fetch).toHaveBeenCalledWith('http://localhost:4096/chat?demo=1', expect.objectContaining({ method: 'HEAD', mode: 'no-cors', cache: 'no-cache' }));
    expect(view.find('iframe')).toBeDefined();
  });

  it('shows errors, retries after three seconds and recovers without duplicate frames', async () => {
    const view = mount(); FakeImage.instances[0].onerror!(new Event('error')); await settle();
    expect(view.status('ai-dock-error').style.display).toBe('flex');
    await vi.advanceTimersByTimeAsync(3000);
    expect(FakeImage.instances).toHaveLength(2);
    FakeImage.instances[1].onload!(new Event('load')); await settle();
    view.find('iframe').onload!(new Event('load'));
    expect(view.panel.children.filter(item => item.tagName === 'iframe')).toHaveLength(1);
    expect(view.status('ai-dock-error').style.display).toBe('none'); expect(vi.getTimerCount()).toBe(0);
  });

  it('cannot resurrect a panel after cleanup during an image probe, and cleanup is idempotent', async () => {
    const view = mount(), lateLoad = FakeImage.instances[0].onload!;
    view.cleanup(); view.cleanup(); lateLoad(new Event('load'));
    await vi.advanceTimersByTimeAsync(12000);
    expect(view.host.children).toHaveLength(0); expect(view.find('iframe')).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0); expect(FakeImage.instances).toHaveLength(1);
    expect([...view.doc.listeners.values()].every(set => set.size === 0)).toBe(true);
    expect(FakeObserver.instances[0].disconnected).toBe(true);
  });

  it('aborts a pending HEAD probe on cleanup and ignores its late fulfillment', async () => {
    let resolve!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation(() => new Promise(done => { resolve = done; }));
    const view = mount(); FakeImage.instances[0].onerror!(new Event('error'));
    const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!;
    view.cleanup(); expect(signal.aborted).toBe(true); resolve({} as Response);
    await settle(); await vi.advanceTimersByTimeAsync(10000);
    expect(view.find('iframe')).toBeUndefined(); expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds unavailable probes and ignores old iframe load events after manual retry', async () => {
    const view = mount();
    await vi.advanceTimersByTimeAsync(2000); expect(view.status('ai-dock-error').style.display).toBe('flex');
    view.find('button').dispatchEvent(new Event('click'));
    FakeImage.instances[1].onload!(new Event('load')); await settle();
    const firstFrame = view.find('iframe'), lateLoad = firstFrame.onload!;
    view.find('button').dispatchEvent(new Event('click')); lateLoad(new Event('load'));
    expect(firstFrame.parentElement).toBeNull(); expect(view.status('ai-dock-waiting').style.display).toBe('flex');
    FakeImage.instances[2].onload!(new Event('load')); await settle();
    expect(view.panel.children.filter(item => item.tagName === 'iframe')).toHaveLength(1);
  });

  it('preserves native MIME fields while supplying block ID text and removes the global enhancer on cleanup', () => {
    const view = mount(), block = view.doc.createElement('div'); block.setAttribute('data-node-id', '20261020000000-demo002');
    const data = dragStart(view.doc, block);
    expect(data['text/plain']).toBe('20261020000000-demo002'); expect(data['text/siyuan-block-id']).toBe('20261020000000-demo002');
    expect(data['application/siyuan-file']).toBe('20261020000000-demo001');
    view.panel.dispatchEvent(new Event('dragenter')); expect(view.status('ai-dock-drop-hint').style.display).toBe('flex');
    view.doc.dispatchEvent(new Event('dragend')); expect(view.status('ai-dock-drop-hint').style.display).toBe('none');
    view.cleanup(); expect(dragStart(view.doc)['text/plain']).toBe('20261020000000-demo001 原生引用');
  });

  it('temporarily disables iframe pointer events while the panel is being resized', async () => {
    const view = mount(); FakeImage.instances[0].onload!(new Event('load')); await settle();
    const frame = view.find('iframe'); frame.onload!(new Event('load'));
    FakeObserver.instances[0].callback(); expect(frame.style.pointerEvents).toBe('none');
    await vi.advanceTimersByTimeAsync(150); expect(frame.style.pointerEvents).toBe('auto');
    view.cleanup(); FakeObserver.instances[0].callback(); expect(vi.getTimerCount()).toBe(0);
  });
});
