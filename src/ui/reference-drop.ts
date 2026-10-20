import { canDropSiYuan } from '../references';

interface DropOptions {
  enabled: boolean;
  active(value: boolean): void;
  drop(data: Record<string, string>): void | Promise<unknown>;
}

/** Capture internal note drags across the whole sidebar before child editors or the host. */
export function referenceDropZone(node: HTMLElement, options: DropOptions) {
  let depth = 0;
  let active = false;
  const setActive = (value: boolean) => {
    if (active === value) return;
    active = value;
    options.active(value);
  };
  const reset = () => { depth = 0; setActive(false); };
  const accepts = (event: DragEvent) => {
    const types = Array.from(event.dataTransfer?.types || []);
    return options.enabled && !types.includes('Files') && canDropSiYuan(types);
  };
  const enter = (event: DragEvent) => {
    if (!accepts(event)) return;
    event.preventDefault(); event.stopPropagation();
    depth++;
    setActive(true);
  };
  const over = (event: DragEvent) => {
    if (!accepts(event)) return;
    event.preventDefault(); event.stopPropagation();
    event.dataTransfer!.dropEffect = 'copy';
    setActive(true);
  };
  const leave = (event: DragEvent) => {
    if (!active) return;
    event.stopPropagation();
    depth = Math.max(0, depth - 1);
    const next = event.relatedTarget as Node | null;
    if (next && node.contains(next)) return;
    if (!next && depth) return;
    reset();
  };
  const drop = (event: DragEvent) => {
    const accepted = accepts(event);
    reset();
    if (!accepted) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const transfer = event.dataTransfer!;
    const data: Record<string, string> = {};
    for (const type of Array.from(transfer.types)) {
      try { data[type] = transfer.getData(type); } catch { /* Ignore unavailable MIME data. */ }
    }
    void options.drop(data);
  };
  const listeners: [string, EventListener][] = [
    ['dragenter', enter as EventListener], ['dragover', over as EventListener],
    ['dragleave', leave as EventListener], ['drop', drop as EventListener],
  ];
  const capture = { capture: true };
  for (const [name, listener] of listeners) node.addEventListener(name, listener, capture);
  const window = node.ownerDocument.defaultView;
  window?.addEventListener('dragend', reset);
  window?.addEventListener('drop', reset);
  return {
    update(value: DropOptions) { options = value; if (!options.enabled) reset(); },
    destroy() {
      for (const [name, listener] of listeners) node.removeEventListener(name, listener, capture);
      window?.removeEventListener('dragend', reset);
      window?.removeEventListener('drop', reset);
      reset();
    },
  };
}
