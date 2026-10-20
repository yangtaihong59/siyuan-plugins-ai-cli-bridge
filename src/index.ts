import { Plugin, Dialog, showMessage, confirm, getAllEditor, getFrontend } from 'siyuan';
import Chat from './ui/Chat.svelte';
import { ChatController } from './controller';
import type { NoteReference } from './types';
import { isSiYuanId } from './references';
import { captureNotebookDrag } from './notebook-drag';
import { ICON_ID, ICON_SYMBOL } from './brand';
import { normalizeShellConfig, validateWebUrl, type PanelView } from './shell-config';
import { mountWebPanel } from './web-panel';
import './index.scss';

const STORAGE_NAME = 'ai-agent-bridge-config';
const DOCK_TYPE = 'ai-dock';
const DOCK_HOTKEY = '⌥⌘A';
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]!));
export default class DeepSeekHarnessPlugin extends Plugin {
  private controller: ChatController | null = null;
  private controllerSetup: Promise<void> | null = null;
  private components = new Set<Chat>();
  private panels = new Map<HTMLElement, { component?: Chat; cleanup?: () => void }>();
  private config = normalizeShellConfig(null);
  private canHarness = false;
  private switching = false;
  private disposed = false;
  private settingsRequested = false;
  private activeNoteId = '';
  private selection: NoteReference | null = null;
  private unsubscribe: (() => void) | null = null;

  async onload() {
    this.disposed = false;
    const saved = await this.loadData(STORAGE_NAME);
    if (this.disposed) return;
    this.config = normalizeShellConfig(saved);
    this.canHarness = ['desktop', 'desktop-window'].includes(getFrontend()) && typeof require === 'function';
    this.addIcons(ICON_SYMBOL);
    if (this.canHarness && this.config.view === 'harness') await this.ensureController();
    if (this.disposed) return;
    const plugin = this;
    this.addDock({
      config: { position: this.config.dockPosition, size: { width: this.config.dockWidth, height: this.config.dockHeight },
        icon: ICON_ID, title: 'SiYuan DeepSeek Harness', hotkey: DOCK_HOTKEY, show: this.config.enableDock },
      type: DOCK_TYPE, data: {},
      init() { if (plugin.disposed) return; plugin.panels.set(this.element as HTMLElement, {}); plugin.renderPanel(this.element as HTMLElement); },
      destroy() { plugin.clearPanel(this.element as HTMLElement); plugin.panels.delete(this.element as HTMLElement); },
    });
    this.addCommand({ langKey: 'openAIAgentDock', hotkey: DOCK_HOTKEY, callback: () => this.openDock() });
    if (this.canHarness) {
      this.eventBus.on('switch-protyle', this.trackEditor);
      this.eventBus.on('loaded-protyle-dynamic', this.trackEditor);
      this.eventBus.on('loaded-protyle-static', this.trackEditor);
      document.addEventListener('selectionchange', this.trackSelection);
      document.addEventListener('dragstart', this.trackNotebookDrag);
    }
  }

  private async ensureController() {
    if (this.controllerSetup) return this.controllerSetup;
    this.controllerSetup = (async () => {
      const controller = new ChatController({
        loadData: name => this.loadData(name === 'state.json' ? 'harness-state.json' : name),
        saveData: (name, value) => this.saveData(name === 'state.json' ? 'harness-state.json' : name, value),
        getCurrentNote: () => this.getCurrentNote(), getSelection: async () => {
          if (!this.selection) throw new Error('请先在笔记正文中选中一段文字，再点“选区”。');
          return { ...this.selection };
        },
        appendToNote: text => this.appendToNote(text), notify: message => showMessage(message),
        getWorkspaceDirectory: () => (window as any).siyuan?.config?.system?.workspaceDir || '',
        getReference: id => this.getReference(id),
        getNotebookReference: id => this.getNotebookReference(id),
        chooseWorkingDirectory: async () => {
          const os = require('node:os') as typeof import('node:os');
          const current = this.controller?.state.settings.cwd || os.homedir();
          const result = await require('electron').ipcRenderer.invoke('siyuan-get', {
            cmd: 'showOpenDialog', title: '选择 Agent 工作目录',
            defaultPath: current.replace(/^~(?=$|[/\\])/, os.homedir()), properties: ['openDirectory'],
          });
          return !result.canceled && typeof result.filePaths?.[0] === 'string' ? result.filePaths[0] : undefined;
        },
      });
      this.controller = controller;
      this.unsubscribe = controller.subscribe(state => { for (const component of this.components) component.$set({ state }); });
      try {
        await controller.initialize();
        if (this.disposed) { await controller.destroy(); return; }
        await this.discoverMcp();
      } catch (error) {
        this.unsubscribe?.(); this.unsubscribe = null;
        if (this.controller === controller) this.controller = null;
        await controller.destroy().catch(() => {});
        throw error;
      }
    })().catch(error => { this.controllerSetup = null; throw error; });
    return this.controllerSetup;
  }

  private clearPanel(element: HTMLElement) {
    const panel = this.panels.get(element);
    panel?.cleanup?.();
    if (panel?.component) { panel.component.$destroy(); this.components.delete(panel.component); }
    element.replaceChildren();
    this.panels.set(element, {});
  }

  private renderPanel(element: HTMLElement) {
    if (this.disposed) return;
    this.clearPanel(element);
    element.classList.add('dsh-dock');
    const view = this.canHarness ? this.config.view : 'web';
    if (view === 'harness' && this.controller) {
      const component = new Chat({ target: element, props: { controller: this.controller, state: this.controller.state,
        webPanel: { url: this.config.openCodeUrl, onOpen: (url: string) => this.setView('web', url) } } });
      this.components.add(component); this.panels.set(element, { component });
      if (this.settingsRequested) { component.openSettings(); this.settingsRequested = false; }
      return;
    }
    const shell = document.createElement('div'); shell.className = 'dsh-web-shell';
    const bar = document.createElement('div'); bar.className = 'dsh-web-bar';
    const title = document.createElement('span'); title.textContent = '网页面板'; bar.append(title);
    if (this.canHarness) {
      const back = document.createElement('button'); back.textContent = 'Harness'; back.title = '返回 Harness 对话';
      back.onclick = () => { void this.setView('harness').catch(error => showMessage(error.message, 6000, 'error')); };
      bar.append(back);
    }
    const settings = document.createElement('button'); settings.textContent = '设置'; settings.onclick = () => this.openSetting(); bar.append(settings);
    const content = document.createElement('div'); content.className = 'dsh-web-content';
    shell.append(bar, content); element.append(shell);
    this.panels.set(element, { cleanup: mountWebPanel(content, { url: this.config.openCodeUrl, i18n: this.i18n || {} }) });
  }

  private async setView(view: PanelView, url = this.config.openCodeUrl) {
    if (this.switching) throw new Error('正在切换面板，请稍后。');
    if (this.controller?.state.busy) throw new Error('请先停止当前生成，再切换面板。');
    if (view === 'harness' && !this.canHarness) throw new Error('Harness 需要思源桌面端与本机运行环境；当前可使用网页面板。');
    const next = { ...this.config, view, openCodeUrl: validateWebUrl(url) };
    this.switching = true;
    for (const element of this.panels.keys()) element.inert = true;
    try {
      if (view === 'harness') await this.ensureController();
      else await this.controller?.disconnect();
      if (this.disposed) return;
      if (this.controller?.state.busy) throw new Error('请先停止当前生成，再切换面板。');
      await this.saveData(STORAGE_NAME, next);
      if (this.disposed) return;
      if (this.controller?.state.busy) throw new Error('生成已开始，请停止后重试切换。');
      this.config = next;
      for (const element of this.panels.keys()) this.renderPanel(element);
      this.openDock();
    } finally { for (const element of this.panels.keys()) element.inert = false; this.switching = false; }
  }

  private openDock() {
    if (this.disposed) return false;
    const type = this.name + DOCK_TYPE;
    const layout = (window as any).siyuan?.layout;
    const button = document.querySelector(`.dock__item[data-type="${type}"]`);
    if (!button) return false;
    // Follow the registered icon when the user moves it to another dock.
    const dock = [layout?.leftDock, layout?.rightDock, layout?.bottomDock]
      .find(item => item?.elements?.some((group: HTMLElement) => group.contains(button)));
    if (!dock?.toggleModel) return false;
    dock.toggleModel(type, true, false, false, true);
    return true;
  }
  private trackEditor = (event: CustomEvent<any>) => {
    const protyle = event.detail?.protyle;
    const id = protyle?.block?.rootID || protyle?.block?.id;
    if (typeof id === 'string') this.activeNoteId = id;
  };
  private trackNotebookDrag = (event: DragEvent) => {
    if (this.config.view !== 'harness') return;
    captureNotebookDrag(event, (window as any).siyuan?.config?.system?.workspaceDir || '');
  };
  private trackSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) return;
    const element = selection.anchorNode?.nodeType === Node.ELEMENT_NODE ? selection.anchorNode as Element : selection.anchorNode?.parentElement;
    const editor = element?.closest('.protyle');
    if (!editor || element?.closest('.dsh-dock')) return;
    const block = element?.closest('[data-node-id]') as HTMLElement | null;
    const text = selection.toString();
    this.selection = { id: `selection-${Date.now()}`, title: `选区 · ${block?.dataset.nodeId || '正文'}`, kind: 'selection', text: text.slice(0, 12000), truncated: text.length > 12000 };
  };
  private async api(endpoint: string, data: unknown) {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!response.ok) throw new Error(`思源 API HTTP ${response.status}`);
    const value = await response.json();
    if (value.code !== 0) throw new Error(value.msg || `思源 API 错误 ${value.code}`);
    return value.data;
  }
  private currentId() {
    if (this.activeNoteId) return this.activeNoteId;
    const editors = getAllEditor();
    const editor = editors.find(item => item.protyle?.element && !item.protyle.element.closest('.fn__none')) || editors[0];
    const id = editor?.protyle?.block?.rootID || editor?.protyle?.block?.id;
    if (!id) throw new Error('请先打开一篇思源文档。');
    return id;
  }
  private async getCurrentNote(): Promise<NoteReference> { return this.getReference(this.currentId()); }
  private async getReference(id: string): Promise<NoteReference> {
    if (!isSiYuanId(id)) throw new Error('无效的思源文档或内容块 ID。');
    const [rows, content] = await Promise.all([
      this.api('/api/query/sql', { stmt: `SELECT id, type, content FROM blocks WHERE id = '${id}' LIMIT 1` }),
      this.api('/api/block/getBlockKramdown', { id }),
    ]);
    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (!row || row.id !== id) throw new Error('文档或内容块已不存在，或当前工作区无法访问。');
    const text = String(content?.kramdown || '');
    return { id, title: String(row.content || id).replace(/\s+/g, ' ').slice(0, 80),
      kind: row.type === 'd' ? 'document' : 'block', text: text.slice(0, 12000), truncated: text.length > 12000 };
  }
  private async getNotebookReference(id: string): Promise<NoteReference> {
    if (!isSiYuanId(id)) throw new Error('无效的思源笔记本 ID。');
    const result = await this.api('/api/notebook/lsNotebooks', {});
    const notebook = Array.isArray(result?.notebooks) ? result.notebooks.find((item: any) => item.id === id) : undefined;
    if (!notebook) throw new Error('笔记本不存在，或当前工作区无法访问。');
    if (notebook.closed) throw new Error('请先在思源中打开这个笔记本，再拖入引用。');
    if (notebook.encrypted && notebook.unlocked === false) throw new Error('请先在思源中解锁这个笔记本，再拖入引用。');
    return { id, kind: 'notebook', title: String(notebook.name || id).replace(/\s+/g, ' ').slice(0, 80),
      text: '这是笔记本范围引用，尚未读取其中的文档正文。请按本轮任务，通过可用的思源工具检索此笔记本中的文档。' };
  }
  private async appendToNote(text: string) {
    const id = this.currentId();
    const attrs = await this.api('/api/attr/getBlockAttrs', { id });
    const accepted = await new Promise<boolean>(resolve => confirm('追加到当前笔记',
      `将这条回答追加到《${escapeHtml(attrs?.title || id)}》末尾，共 ${text.length} 字符。`, () => resolve(true), () => resolve(false)));
    if (!accepted) return false;
    await this.api('/api/block/appendBlock', { parentID: id, dataType: 'markdown', data: text });
    try { await this.api('/api/ui/reloadProtyle', { id }); }
    catch { showMessage('内容已写入，界面刷新失败，请重新打开文档。', 6000); return true; }
    showMessage('已追加到笔记');
    return true;
  }
  private async discoverMcp() {
    if (!this.controller) return;
    // Only refresh a previously enabled connection; recommendations never auto-enable tools.
    if (!this.controller.state.settings.mcpEnabled) return;
    try {
      const response = await fetch('/api/file/getFile', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/data/storage/petal/siyuan-plugins-mcp-sisyphus/mcpHttpSettings' }) });
      if (!response.ok) return;
      const settings = await response.json();
      if (!settings.enabled || settings.tlsEnabled || !Number.isInteger(settings.port)) return;
      const current = this.controller.state.settings;
      const url = `http://127.0.0.1:${settings.port}/mcp`;
      if (current.mcpEnabled && current.mcpUrl !== url) return;
      // The token remains in memory; neither the generated patch nor saved chat stores it.
      await this.controller.saveSettings({ ...current, mcpEnabled: true,
        mcpUrl: url, mcpToken: settings.authEnabled ? settings.token || '' : '' });
    } catch (error) { console.info('[DeepSeek Harness] MCP auto-detection unavailable:', error instanceof Error ? error.message : 'unknown'); }
  }
  openSetting() {
    const dialog = new Dialog({ title: 'SiYuan DeepSeek Harness', width: '480px',
      content: '<div class="dsh-shell-settings" style="display:flex;flex-direction:column;gap:16px;padding:20px"></div>' });
    const panel = dialog.element.querySelector('.dsh-shell-settings')!;
    const row = (label: string, control: HTMLElement) => {
      const item = document.createElement('label'); item.style.cssText = 'display:flex;flex-direction:column;gap:8px';
      const title = document.createElement('span'); title.textContent = label; item.append(title, control); panel.append(item);
    };
    const mode = document.createElement('select'); mode.className = 'b3-select'; mode.setAttribute('aria-label', '默认面板');
    for (const [value, text] of [['harness', 'DeepSeek Harness'], ['web', '网页面板']]) {
      const option = document.createElement('option'); option.value = value; option.textContent = text;
      option.disabled = value === 'harness' && !this.canHarness; mode.append(option);
    }
    mode.value = this.canHarness ? this.config.view : 'web'; row('默认面板', mode);
    const url = document.createElement('input'); url.className = 'b3-text-field'; url.type = 'url'; url.value = this.config.openCodeUrl;
    url.setAttribute('aria-label', '网页地址'); url.placeholder = 'https://example.com'; row('网页地址', url);
    const actions = document.createElement('div'); actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap'; panel.append(actions);
    const apply = document.createElement('button'); apply.className = 'b3-button'; apply.textContent = '保存并打开'; actions.append(apply);
    apply.disabled = this.controller?.state.busy || this.switching;
    apply.onclick = async () => {
      apply.disabled = true;
      try { await this.setView(mode.value as PanelView, url.value); dialog.destroy(); }
      catch (error) { showMessage(error instanceof Error ? error.message : String(error), 6000, 'error'); }
      finally { apply.disabled = false; }
    };
    if (this.canHarness) {
      const connection = document.createElement('button'); connection.className = 'b3-button b3-button--outline'; connection.textContent = '连接与模型设置';
      connection.disabled = this.controller?.state.busy || this.switching; actions.append(connection);
      connection.onclick = async () => {
        connection.disabled = true;
        try { this.settingsRequested = true; await this.setView('harness', url.value); dialog.destroy(); }
        catch (error) { this.settingsRequested = false; showMessage(error instanceof Error ? error.message : String(error), 6000, 'error'); }
        finally { connection.disabled = false; }
      };
    }
  }
  onunload() {
    this.disposed = true;
    this.unsubscribe?.(); this.unsubscribe = null;
    this.eventBus.off('switch-protyle', this.trackEditor);
    this.eventBus.off('loaded-protyle-dynamic', this.trackEditor);
    this.eventBus.off('loaded-protyle-static', this.trackEditor);
    document.removeEventListener('selectionchange', this.trackSelection);
    document.removeEventListener('dragstart', this.trackNotebookDrag);
    for (const element of this.panels.keys()) this.clearPanel(element);
    this.panels.clear(); this.components.clear();
    void this.controller?.destroy().catch(error => console.error('[DeepSeek Harness] shutdown:', error));
  }
}
