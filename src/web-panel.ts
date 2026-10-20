interface WebPanelOptions { url: string; i18n: Record<string, string> }
const BLOCK_ID = /\b\d{14}-[0-9a-z]{7}\b/i;
const BLOCK_ID_TEXT_TYPE = 'text/siyuan-block-id';

/** Mount the original web dock independently of the Harness UI and its listeners. */
export function mountWebPanel(element: HTMLElement, { url, i18n }: WebPanelOptions): () => void {
  const doc = element.ownerDocument;
  const panel = doc.createElement('div');
  panel.className = 'ai-web-panel';
  panel.style.cssText = 'position:relative;width:100%;height:100%;min-width:200px;min-height:180px;overflow:hidden;box-sizing:border-box;background:var(--b3-theme-background)';
  const makeStatus = (className: string, title: string, description: string) => {
    const status = doc.createElement('div');
    status.className = className;
    status.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:20px;text-align:center;box-sizing:border-box;color:var(--b3-theme-on-surface);background:var(--b3-theme-background);z-index:1';
    const heading = doc.createElement('strong'); heading.textContent = title;
    const detail = doc.createElement('div'); detail.textContent = description;
    detail.style.cssText = 'font-size:13px;opacity:.7';
    const address = doc.createElement('div'); address.className = 'ai-dock-url'; address.textContent = url;
    address.style.cssText = 'font-size:12px;opacity:.5;font-family:monospace;overflow-wrap:anywhere';
    status.append(heading, detail, address);
    return status;
  };
  const waiting = makeStatus('ai-dock-waiting', i18n.iframeWaiting || '请打开 AI Agent Web', i18n.iframeWaitingDesc || '正在等待 AI Agent Web 启动…');
  const error = makeStatus('ai-dock-error', i18n.iframeLoadError || '无法加载页面', i18n.iframeLoadErrorDesc || '请检查网页地址或确认服务已经启动。');
  const retry = doc.createElement('button'); retry.className = 'b3-button b3-button--outline';
  retry.textContent = i18n.retry || '重试'; error.appendChild(retry);
  const dropHint = doc.createElement('div'); dropHint.className = 'ai-dock-drop-hint';
  dropHint.textContent = i18n.dragDropHint || '把块拖到网页里的文本输入框上，以写入块 ID';
  dropHint.style.cssText = 'display:none;position:absolute;inset:0;pointer-events:none;z-index:2;border:2px dashed var(--b3-theme-primary);background:color-mix(in srgb,var(--b3-theme-primary) 10%,transparent);color:var(--b3-theme-primary);align-items:center;justify-content:center;text-align:center;padding:16px;box-sizing:border-box';
  panel.append(waiting, error, dropHint); element.appendChild(panel);

  let disposed = false;
  let generation = 0;
  let iframe: HTMLIFrameElement | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let loadTimer: ReturnType<typeof setTimeout> | undefined;
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  let cancelProbe: (() => void) | undefined;
  let activeDragBlockId: string | null = null;
  let dragDepth = 0;
  let resizing = false;

  const clearRetry = () => { clearTimeout(retryTimer); retryTimer = undefined; };
  const show = (state: 'waiting' | 'error' | 'frame') => {
    if (disposed) return;
    waiting.style.display = state === 'waiting' ? 'flex' : 'none';
    error.style.display = state === 'error' ? 'flex' : 'none';
    if (iframe) iframe.style.display = state === 'frame' ? 'block' : 'none';
  };
  const hideDropHint = () => { dragDepth = 0; dropHint.style.display = 'none'; };
  const endDrag = () => { activeDragBlockId = null; hideDropHint(); };
  const enterDrag = () => {
    if (!activeDragBlockId || disposed) return;
    dragDepth++; dropHint.style.display = 'flex';
  };
  const leaveDrag = () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) hideDropHint();
  };
  const startDrag = (event: DragEvent) => {
    const transfer = event.dataTransfer;
    if (!transfer || disposed) return;
    const target = event.target as Element | null;
    const nativeId = typeof target?.closest === 'function' ? target.closest('[data-node-id]')?.getAttribute('data-node-id') : null;
    let id = nativeId?.match(BLOCK_ID)?.[0];
    for (const type of [BLOCK_ID_TEXT_TYPE, 'application/x-siyuan-node-id', 'application/x-siyuan-block-id', 'text/plain', 'text/uri-list', 'text/html']) {
      if (id) break;
      try { id = transfer.getData(type).match(BLOCK_ID)?.[0]; } catch { /* Other applications may protect individual types. */ }
    }
    activeDragBlockId = id || null;
    if (!id) return;
    try { transfer.setData('text/plain', id); transfer.setData(BLOCK_ID_TEXT_TYPE, id); } catch { /* Keep the native drag usable. */ }
  };
  const removeFrame = () => {
    clearTimeout(loadTimer); loadTimer = undefined;
    if (!iframe) return;
    iframe.onload = null; iframe.onerror = null;
    iframe.removeEventListener('dragenter', enterDrag);
    iframe.removeEventListener('dragleave', leaveDrag);
    iframe.removeEventListener('drop', endDrag);
    iframe.src = 'about:blank'; iframe.remove(); iframe = null;
  };

  // The bounded probe retains the Web dock's no-CORS fallback. Cleanup settles it
  // immediately so a late image/fetch result cannot resurrect an unmounted panel.
  const probe = (): Promise<boolean> => new Promise(resolve => {
    const image = new Image();
    const abort = new AbortController();
    let settled = false;
    const finish = (available: boolean) => {
      if (settled) return;
      settled = true; clearTimeout(timeout); image.onload = null; image.onerror = null;
      abort.abort();
      if (cancelProbe === cancel) cancelProbe = undefined;
      resolve(available);
    };
    const cancel = () => finish(false);
    const timeout = setTimeout(cancel, 2000);
    cancelProbe = cancel;
    image.onload = () => finish(true);
    image.onerror = () => {
      if (settled || disposed) return finish(false);
      fetch(url, { method: 'HEAD', mode: 'no-cors', cache: 'no-cache', signal: abort.signal }).then(() => finish(true), () => finish(false));
    };
    try { const icon = new URL('/favicon.ico', url); icon.searchParams.set('_t', String(Date.now())); image.src = icon.href; }
    catch { finish(false); }
  });
  const scheduleRetry = () => {
    if (disposed || retryTimer !== undefined) return;
    retryTimer = setTimeout(() => { retryTimer = undefined; void connect(); }, 3000);
  };
  async function connect() {
    if (disposed) return;
    const current = ++generation;
    clearRetry(); cancelProbe?.(); removeFrame(); show('waiting');
    const available = await probe();
    if (disposed || current !== generation) return;
    if (!available) { show('error'); scheduleRetry(); return; }
    const frame = doc.createElement('iframe');
    iframe = frame;
    frame.src = url; frame.title = i18n.dockTitle || 'AI Agent Web';
    frame.style.cssText = 'width:100%;height:100%;border:0;display:none;pointer-events:auto';
    frame.setAttribute('allow', 'clipboard-read; clipboard-write');
    frame.addEventListener('dragenter', enterDrag);
    frame.addEventListener('dragleave', leaveDrag);
    frame.addEventListener('drop', endDrag);
    frame.onload = () => {
      if (disposed || current !== generation) return;
      clearTimeout(loadTimer); loadTimer = undefined; clearRetry(); show('frame');
    };
    frame.onerror = () => {
      if (disposed || current !== generation) return;
      clearTimeout(loadTimer); loadTimer = undefined; show('error'); scheduleRetry();
    };
    panel.appendChild(frame);
    loadTimer = setTimeout(() => {
      loadTimer = undefined;
      if (!disposed && current === generation) { show('error'); scheduleRetry(); }
    }, 5000);
  }

  const beginResize = () => {
    if (disposed || !iframe) return;
    resizing = true; iframe.style.pointerEvents = 'none';
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { resizing = false; if (!disposed && iframe) iframe.style.pointerEvents = 'auto'; }, 150);
  };
  const mouseDown = (event: MouseEvent) => {
    const rect = panel.getBoundingClientRect();
    if (event.clientX <= rect.left + 5 || event.clientX >= rect.right - 5 || event.clientY <= rect.top + 5 || event.clientY >= rect.bottom - 5) beginResize();
  };
  const mouseUp = () => { if (resizing) beginResize(); };
  const observer = new ResizeObserver(beginResize);
  observer.observe(panel);
  const retryClick = () => { void connect(); };
  retry.addEventListener('click', retryClick);
  panel.addEventListener('mousedown', mouseDown);
  panel.addEventListener('dragenter', enterDrag);
  panel.addEventListener('dragleave', leaveDrag);
  panel.addEventListener('drop', endDrag);
  doc.addEventListener('dragstart', startDrag, true);
  doc.addEventListener('dragend', endDrag, true);
  doc.addEventListener('mouseup', mouseUp);
  void connect();

  return () => {
    if (disposed) return;
    disposed = true; generation++;
    cancelProbe?.(); clearRetry(); clearTimeout(resizeTimer);
    removeFrame(); observer.disconnect();
    retry.removeEventListener('click', retryClick);
    panel.removeEventListener('mousedown', mouseDown);
    panel.removeEventListener('dragenter', enterDrag);
    panel.removeEventListener('dragleave', leaveDrag);
    panel.removeEventListener('drop', endDrag);
    doc.removeEventListener('dragstart', startDrag, true);
    doc.removeEventListener('dragend', endDrag, true);
    doc.removeEventListener('mouseup', mouseUp);
    endDrag(); panel.remove();
  };
}
