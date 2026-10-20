import { isSiYuanId, NOTEBOOK_DRAG_TYPE } from './references';

/** Add notebook identity after SiYuan's file-tree dragstart has settled its selection. */
export function captureNotebookDrag(event: DragEvent, workspace: string): void {
  if (event.defaultPrevented || !event.dataTransfer || !workspace) return;
  const target = event.target as Element | null;
  if (!target || typeof target.closest !== 'function') return;
  const origin = target.closest('li[data-type="navigation-root"]');
  const tree = origin?.closest('.file-tree__items');
  if (!origin || !tree) return;
  const selected = Array.from(tree.querySelectorAll('.b3-list-item--focus'))
    .filter(item => item.closest('.file-tree__items') === tree);
  if (!selected.includes(origin) || selected.some(item => item.getAttribute('data-type') !== 'navigation-root')) return;
  const ids = new Set<string>();
  for (const item of selected) {
    const notebook = item.closest('ul[data-url]');
    const id = notebook?.getAttribute('data-url');
    if (notebook?.closest('.file-tree__items') !== tree || !isSiYuanId(id)) return;
    ids.add(id);
  }
  if (!ids.size) return;
  event.dataTransfer.setData(NOTEBOOK_DRAG_TYPE, JSON.stringify({ ids: [...ids], workspaceDir: workspace }));
}
