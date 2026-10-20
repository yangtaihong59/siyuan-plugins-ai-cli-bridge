export type PanelView = 'harness' | 'web';
export interface ShellConfig {
  view: PanelView;
  openCodeUrl: string;
  dockPosition: 'LeftTop' | 'LeftBottom' | 'RightTop' | 'RightBottom' | 'BottomLeft' | 'BottomRight';
  dockWidth: number;
  dockHeight: number;
  enableDock: boolean;
}

export function normalizeShellConfig(raw: unknown): ShellConfig {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const positions = ['LeftTop', 'LeftBottom', 'RightTop', 'RightBottom', 'BottomLeft', 'BottomRight'];
  return {
    view: data.view === 'harness' || data.view === 'web' ? data.view : typeof data.openCodeUrl === 'string' ? 'web' : 'harness',
    openCodeUrl: typeof data.openCodeUrl === 'string' ? data.openCodeUrl : 'http://localhost:4096',
    dockPosition: positions.includes(String(data.dockPosition)) ? data.dockPosition as ShellConfig['dockPosition'] : 'RightTop',
    dockWidth: typeof data.dockWidth === 'number' && Number.isFinite(data.dockWidth) ? Math.max(240, Math.min(1200, data.dockWidth)) : 380,
    dockHeight: typeof data.dockHeight === 'number' && Number.isFinite(data.dockHeight) ? Math.max(0, Math.min(1200, data.dockHeight)) : 0,
    enableDock: typeof data.enableDock === 'boolean' ? data.enableDock : true,
  };
}

export function validateWebUrl(value: string): string {
  const text = value.trim();
  let url: URL;
  try { url = new URL(text); } catch { throw new Error('请输入完整的 HTTP/HTTPS 网页地址。'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('网页地址须为 HTTP/HTTPS，且不能内嵌账号密码。');
  return text;
}
