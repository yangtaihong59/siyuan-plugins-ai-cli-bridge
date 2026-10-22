import Chat from './ui/Chat.svelte';
import type { Chat as Conversation, DisplayDetail, Message, NoteReference, State } from './types';
import { defaultSettings } from './settings';
import { parseSiYuanDrag, referenceKey } from './references';
import { captureNotebookDrag } from './notebook-drag';
import './preview.css';
import { mountWebPanel } from './web-panel';

type Scene = 'welcome' | 'answer' | 'streaming' | 'tools';
const params = new URLSearchParams(location.search);
const initialScene: Scene = ['welcome', 'streaming', 'tools'].includes(params.get('state') || '') ? params.get('state') as Scene : 'answer';
const initialDetail: DisplayDetail = ['compact', 'balanced'].includes(params.get('detail') || '') ? params.get('detail') as DisplayDetail : 'full';
const initialTheme = params.get('theme') === 'dark' ? 'dark' : 'light';
const catalogMode = params.get("models") || "ready";
const initialWidth = ['280', '360'].includes(params.get('width') || '') ? params.get('width')! : '400';

const demoNotebookId = '20261020000000-demo001';
const demoWorkspace = '/demo/SiYuan';

document.body.innerHTML = `
  <main class="preview-page">
    <header class="preview-toolbar">
      <div class="preview-caption"><strong>侧栏预览</strong><span class="demo-badge">演示数据</span></div>
      <div class="preview-controls">
        <label>状态<select id="preview-scene"><option value="welcome">欢迎</option><option value="answer">回答</option><option value="streaming">流式</option><option value="tools">工具执行中</option></select></label>
        <label>展示<select id="preview-detail"><option value="compact">简洁</option><option value="balanced">适中</option><option value="full">详细</option></select></label>
        <label>宽度<select id="preview-width"><option value="280">280 px</option><option value="360">360 px</option><option value="400">400 px</option></select></label>
        <label>主题<select id="preview-theme"><option value="light">浅色</option><option value="dark">深色</option></select></label>
        <button id="preview-replay" type="button">播放流式演示</button>
        <button id="preview-complete" type="button">完成本轮演示</button>
        <label>投放位置<select id="preview-drop-zone"><option value=".messages">消息区</option><option value=".app-header">标题栏</option><option value=".composer-box">输入框</option></select></label>
        <button id="preview-drop" type="button">演示拖入两条引用</button>
        <button id="preview-drop-hint" type="button">显示输入框接收提示</button>
        <label>笔记本原生值<select id="preview-notebook-format"><option value="slash">/</option><option value="id">ID</option></select></label>
        <button id="preview-notebook-drop" type="button">演示拖入笔记本</button>
        <div id="preview-notebook-fixture" class="file-tree__items"><ul data-url="${demoNotebookId}" style="list-style:none;margin:0;padding:0"><li data-type="navigation-root" data-path="/" data-node-id="" class="b3-list-item b3-list-item--focus"><span id="preview-notebook-source" class="demo-badge" draggable="true">笔记本：演示研究库（可拖）</span></li></ul></div>
      </div>
    </header>
    <p class="preview-disclaimer">与插件使用同一个聊天组件。此页仅演示界面、流式动画与引用交互，未连接模型或思源笔记。</p>
    <section id="preview-dock" aria-label="插件侧栏交互预览"></section>
  </main>`;

if (params.get('host') === 'siyuan') {
  const style = document.createElement('style');
  style.dataset.previewHost = 'siyuan';
  style.textContent = 'svg{fill:currentColor;display:inline-block}.dock svg{height:16px;width:17.5px}';
  document.head.append(style);
  document.querySelector('#preview-dock')!.classList.add('dock');
}

const sceneControl = document.querySelector<HTMLSelectElement>('#preview-scene')!;
const detailControl = document.querySelector<HTMLSelectElement>('#preview-detail')!;
const widthControl = document.querySelector<HTMLSelectElement>('#preview-width')!;
const themeControl = document.querySelector<HTMLSelectElement>('#preview-theme')!;
const dock = document.querySelector<HTMLElement>('#preview-dock')!;
sceneControl.value = initialScene;
detailControl.value = initialDetail;
widthControl.value = initialWidth;
themeControl.value = initialTheme;

let response = '可以先把问题收敛到三个可验证的方向：\n\n1. **核心假设成立吗？** 用已有数据做一次基线实验。\n2. **改进来自哪里？** 拆开各项变化，分别设置对照组。\n3. **结果能否重复？** 固定数据划分与随机种子，记录误差范围。';
if (params.get('links') === '1') response += '\n\n参考：[段落里的演示笔记](siyuan://blocks/20261020000000-demo001?focus=1)\n\n- [列表里的演示笔记](SIYUAN://BLOCKS/20261020000000-demo002#fragment)\n- [外部参考](https://example.com/)';
if (params.get('table') === '1') response += '\n\n| 资源 | 说明 | 状态 |\n| :--- | --- | :---: |\n| [测试笔记](siyuan://blocks/20261020000000-demo001) | **已完成**，正文中的可点击链接 | ready |\n| token stream | `text|delta` 保持一个单元格 | running |\n| 很长的名称用于验证狭窄侧栏表格自身横向滚动 | 多列最小宽度不会撑开外层消息和侧栏 | pending |';
const reasoning = '先区分笔记中的假设、证据和待验证结论，再将每个问题对应到一个最小实验。优先选择现有数据可以验证、结果可以量化的方向。';
let timer: ReturnType<typeof setInterval> | undefined;
let app: Chat;
let sequence = 0;
const state: State = {
  settings: { ...defaultSettings(), command: 'dsh', home: '~/.dsh', cwd: '~/Documents/Research', provider: 'deepseek-account', model: 'deepseek-flash', displayDetail: initialDetail },
  chats: [], activeChatId: '', busy: false, connected: true, status: '', error: '',
  logs: ['界面演示：未启动 Harness，未访问模型或笔记。'],
  models: [], modelsLoading: catalogMode === 'loading', modelsError: '',
};
const demoReferences: Record<string, NoteReference> = {
  [`notebook:${demoNotebookId}`]: { id: demoNotebookId, title: '演示研究库', kind: 'notebook', text: `笔记本：演示研究库\n\n引用范围：此笔记本。\n笔记本 ID：${demoNotebookId}\n\n文档正文按任务需要单独读取。这里只展示笔记本范围说明。\n\n演示数据，未读取真实思源笔记。` },
  'demo-note': { id: '20261020000000-demo004', title: '研究想法', kind: 'document', text: '# 研究想法\n\n先建立可复现的基线，再验证每个改进带来的收益。\n\n- 核心假设：误差主要来自模型偏差。\n- 对照实验：固定数据划分、参数与随机种子。\n- 评价指标：误差分布与重复实验的方差。\n\n这是演示内容，未读取真实笔记。' },
  '20261020000000-demo001': { id: '20261020000000-demo001', title: '实验设计 · 演示文档', kind: 'document', text: '# 实验设计\n\n比较基线与改进算法，在同一数据划分下记录误差和方差。\n\n这是模拟拖入的文档附件，未访问真实笔记。' },
  '20261020000000-demo002': { id: '20261020000000-demo002', title: '评价指标 · 演示块', kind: 'block', text: '评价指标应能够重复计算，包含平均误差、分位数和跨实验方差。\n\n这是模拟拖入的正文块，未访问真实笔记。' },
};
const demoModels = [
  { provider: 'deepseek-account', id: 'deepseek-flash', name: 'DeepSeek Flash', providerName: 'DeepSeek 账号', reasoning: ['off', 'low', 'high', 'max'] },
  { provider: 'deepseek-account', id: 'deepseek-pro', name: 'DeepSeek Pro', providerName: 'DeepSeek 账号', reasoning: ['off', 'low', 'high', 'max'] },
];
if (catalogMode === 'ready') state.models = demoModels;
if (catalogMode === 'error') state.modelsError = '演示：模型目录读取失败，请刷新重试。';
const activeChat = () => state.chats.find(chat => chat.id === state.activeChatId)!;
const update = () => { app?.$set({ state: { ...state, chats: [...state.chats] } }); detailControl.value = state.settings.displayDetail; document.querySelector<HTMLButtonElement>('#preview-complete')!.disabled = !state.busy; };
const stopTimer = () => { if (timer) clearInterval(timer); timer = undefined; };

function conversation(scene: Scene, id = 'preview'): Conversation {
  const references = params.get('notebook') === '1'
    ? [{ ...demoReferences[demoNotebookId] }, { ...demoReferences[`notebook:${demoNotebookId}`] }]
    : [{ ...demoReferences['demo-note'] }];
  const messages: Message[] = scene === 'welcome' ? [] : [
    { id: `${id}-u`, role: 'user', text: '帮我整理三个可以验证的研究问题。', references, time: Date.now() },
    { id: `${id}-a1`, role: 'assistant', phase: 'progress', reasoning, text: '先读取笔记，核对已有假设与证据。', time: Date.now(),
      tools: [{ id: `${id}-t1`, name: '思源 · 读取笔记', status: 'completed', text: '演示工具结果\n\n已读取《研究想法》：核心假设、对照实验与评价指标。\n此预览未调用真实笔记工具。' }] },
    { id: `${id}-a2`, role: 'assistant', phase: 'progress', text: '已完成初步检查，正在检索相关内容作对照。', time: Date.now(),
      tools: [{ id: `${id}-t2`, name: '思源 · 搜索相关笔记', status: scene === 'tools' ? 'running' : 'completed', text: scene === 'tools' ? '演示：等待工具返回，assistant 文本流已经结束。' : '演示工具结果：找到 3 条相关笔记。\n此预览未调用真实笔记工具。' }] },
    { id: `${id}-a`, role: 'assistant', phase: scene === 'streaming' ? 'progress' : 'final', text: scene === 'streaming' ? response.slice(0, 95) : response,
      streaming: scene === 'streaming', time: Date.now() },
  ];
  if (scene === 'tools') messages.pop();
  return { id, title: scene === 'welcome' ? '新对话' : '整理研究问题', sessionId: id, updatedAt: Date.now(),
    references: [], messages };
}

function setScene(scene: Scene) {
  stopTimer();
  const chat = conversation(scene);
  state.chats = [chat]; state.activeChatId = chat.id;
  state.busy = scene === 'streaming' || scene === 'tools'; state.connected = true;
  state.error = ''; state.status = scene === 'streaming' ? '演示流式内容' : scene === 'tools' ? '演示工具执行中' : '';
  sceneControl.value = scene;
  update();
}

function syncURL() {
  const query = new URLSearchParams(location.search);
  query.set('detail', state.settings.displayDetail); query.set('state', sceneControl.value); query.set('width', widthControl.value); query.set('theme', themeControl.value);
  history.replaceState(null, '', `?${query}`);
}
function applyAppearance() {
  document.documentElement.dataset.theme = themeControl.value;
  dock.style.width = `${widthControl.value}px`;
}

async function play(text?: string) {
  stopTimer();
  const chat = text ? activeChat() : conversation('welcome');
  if (!text) { state.chats = [chat]; state.activeChatId = chat.id; }
  const id = `demo-${++sequence}`;
  chat.title = '整理研究问题';
  const references = chat.references.map(ref => ({ ...ref }));
  chat.messages.push({ id: `${id}-u`, role: 'user', text: text || '帮我整理三个可以验证的研究问题。', references, time: Date.now() });
  chat.references = [];
  const assistant: Message = { id: `${id}-a`, role: 'assistant', phase: 'progress', text: '', reasoning: '', streaming: true, time: Date.now() };
  let answer: Message | undefined;
  chat.messages.push(assistant);
  state.busy = true; state.connected = true; state.error = ''; state.status = '演示流式内容';
  sceneControl.value = 'streaming'; syncURL(); update();
  let cursor = 0;
  timer = setInterval(() => {
    cursor += 5;
    if (cursor <= reasoning.length) assistant.reasoning = reasoning.slice(0, cursor);
    else {
      assistant.reasoning = reasoning;
      assistant.streaming = false;
      assistant.text = '已核对笔记中的核心假设，接下来整理可验证的问题。';
      assistant.tools = [{ id: `${id}-t`, name: '思源 · 读取笔记', status: 'completed', text: '演示工具结果：已读取《研究想法》。\n此页未调用真实工具。' }];
      if (!answer) {
        answer = { id: `${id}-answer`, role: 'assistant', phase: 'progress', text: '', streaming: true, time: Date.now() };
        chat.messages.push(answer);
      }
      answer.text = response.slice(0, cursor - reasoning.length);
    }
    if (cursor >= reasoning.length + response.length) {
      stopTimer();
      if (answer) { answer.streaming = false; answer.phase = 'final'; }
      state.busy = false; state.status = '';
      sceneControl.value = 'answer'; syncURL();
    }
    update();
  }, 75);
}

const controller = {
  setDisplayDetail: async (displayDetail: DisplayDetail) => { state.settings = { ...state.settings, displayDetail }; update(); syncURL(); },
  previewReference: async (key: string, messageId?: string) => { await new Promise(resolve => setTimeout(resolve, 200)); if (params.get('reference') === 'error') throw new Error('演示：模拟读取失败。'); const references = messageId ? activeChat().messages.find(message => message.id === messageId)?.references : activeChat().references; const ref = references?.find(item => referenceKey(item) === key); if (!ref) throw new Error('找不到这条引用。'); return { ...ref, text: ref.text || '这是引用的演示预览。未访问真实笔记。' }; },
  addDroppedReferences: async (data: Record<string, string>) => { const targets = parseSiYuanDrag(data, demoWorkspace); if (!targets.length) throw new Error('请拖入思源文档、正文内容块或笔记本。'); for (const target of targets) { const key = referenceKey(target); if (!activeChat().references.some(ref => referenceKey(ref) === key)) activeChat().references.push({ ...(demoReferences[key] || { id: target.id, title: target.kind === 'notebook' ? '演示笔记本' : '演示笔记', kind: target.kind, text: '这是演示范围说明，未读取真实笔记。' }) }); } update(); },
  refreshModels: async () => { state.modelsLoading = true; state.modelsError = ''; update(); await new Promise(resolve => setTimeout(resolve, 250)); state.models = catalogMode === 'empty' ? [] : demoModels; state.modelsLoading = false; update(); },
  selectModel: async (provider: string, id: string, reasoningEffort = '') => { state.settings = { ...state.settings, provider, model: id, reasoningEffort }; update(); },
  chooseWorkingDirectory: async () => '~/Documents/Research-demo',
  send: async (text: string) => {
    if (state.busy || !text.trim()) return false;
    if (params.get('send') === 'before-error') throw Object.assign(new Error('演示：发送前连接失败，草稿与附件保留。'), { dispatched: false });
    await play(text);
    if (params.get('send') === 'unknown') {
      stopTimer();
      const chat = activeChat();
      if (chat.messages.at(-1)?.streaming) chat.messages.pop();
      state.busy = false; state.status = '发送结果未知'; update();
      throw Object.assign(new Error('演示：已派发但连接中断，发送结果未知，不会自动重发。'), { dispatched: true });
    }
    return true;
  },
  stop: async () => { stopTimer(); for (const message of activeChat().messages) if (message.streaming || message.tools?.some(tool => tool.status === 'running')) { message.streaming = false; message.interrupted = true; } state.busy = false; state.status = ''; update(); },
  newChat: async () => { stopTimer(); const chat = conversation('welcome', `preview-${++sequence}`); state.chats.unshift(chat); state.activeChatId = chat.id; state.busy = false; state.error = ''; sceneControl.value = 'welcome'; syncURL(); update(); },
  selectChat: async (id: string) => { if (!state.busy && state.chats.some(chat => chat.id === id)) { state.activeChatId = id; update(); } },
  deleteChat: async (id: string) => { if (state.busy) return; state.chats = state.chats.filter(chat => chat.id !== id); if (!state.chats.length) state.chats = [conversation('welcome', `preview-${++sequence}`)]; state.activeChatId = state.chats[0].id; update(); },
  saveSettings: async (settings: State['settings']) => { state.settings = { ...settings }; update(); },
  connect: async () => { state.connected = true; state.logs.push('演示：连接检查完成，未启动真实进程。'); update(); },
  disconnect: async () => { state.connected = false; update(); },
  diagnose: async () => { state.logs.push('演示：组件显示正常，此页未执行真实环境诊断。'); update(); },
  copyMessage: async (text: string) => navigator.clipboard.writeText(text),
  writeToNote: async () => false,
  addCurrentNote: async () => { const refs = activeChat().references; if (!refs.some(ref => ref.id === demoReferences['demo-note'].id)) refs.push({ ...demoReferences['demo-note'] }); update(); },
  addSelection: async () => { const refs = activeChat().references; if (!refs.some(ref => ref.id === 'demo-selection')) refs.push({ id: 'demo-selection', sourceId: demoReferences['demo-note'].id, title: '选区 · 核心假设', kind: 'selection', text: '核心假设：误差主要来自模型偏差。\n\n这是选区的演示快照。' }); update(); },
  removeReference: async (key: string) => { activeChat().references = activeChat().references.filter(ref => referenceKey(ref) !== key); update(); },
};

setScene(initialScene);
applyAppearance();
let cleanupWeb: (() => void) | undefined;
const renderHarness = () => {
  cleanupWeb?.(); cleanupWeb = undefined; dock.replaceChildren();
  app = new Chat({ target: dock, props: { state, controller, webPanel: {
    url: `${location.origin}/web-demo.html`,
    onOpen: (url: string) => {
      app.$destroy(); dock.replaceChildren();
      const shell = document.createElement('div'); shell.style.cssText = 'height:100%;display:flex;flex-direction:column';
      const back = document.createElement('button'); back.textContent = '返回 Harness'; back.style.cssText = 'height:36px';
      back.onclick = renderHarness;
      const content = document.createElement('div'); content.style.cssText = 'position:relative;flex:1;min-height:0';
      shell.append(back, content); dock.append(shell);
      cleanupWeb = mountWebPanel(content, { url, i18n: {} });
    },
  } } });
};
renderHarness();
sceneControl.addEventListener('change', () => { setScene(sceneControl.value as Scene); syncURL(); });
widthControl.addEventListener('change', () => { applyAppearance(); syncURL(); });
detailControl.addEventListener('change', () => { void controller.setDisplayDetail(detailControl.value as DisplayDetail); });
themeControl.addEventListener('change', () => { applyAppearance(); syncURL(); });
document.querySelector('#preview-replay')!.addEventListener('click', () => { void play(); });
document.querySelector('#preview-complete')!.addEventListener('click', () => {
  if (!state.busy) return;
  stopTimer();
  const chat = activeChat();
  for (const message of chat.messages) {
    message.streaming = false;
    for (const tool of message.tools || []) if (tool.status === 'running') { tool.status = 'completed'; tool.text = '演示：工具已返回结果。'; }
  }
  const last = chat.messages.at(-1);
  if (last?.role === 'assistant' && last.text && !last.tools?.length) { last.text = response; last.phase = 'final'; }
  else chat.messages.push({ id: `demo-complete-${++sequence}`, role: 'assistant', phase: 'final', text: response, time: Date.now() });
  state.busy = false; state.status = ''; sceneControl.value = 'answer'; syncURL(); update();
});
function demoDrag() {
  const selector = document.querySelector<HTMLSelectElement>('#preview-drop-zone')!.value;
  const target = document.querySelector(selector) || document.querySelector('.dsh-app');
  const transfer = new DataTransfer();
  transfer.setData('application/siyuan-documents', JSON.stringify({ ids: ['20261020000000-demo001', '20261020000000-demo002'] }));
  return { target, transfer };
}
document.querySelector('#preview-drop')!.addEventListener('click', () => {
  const { target, transfer } = demoDrag();
  if (!target) return;
  target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
});
document.querySelector('#preview-drop-hint')!.addEventListener('click', () => {
  if (document.querySelector('.composer-box.drop-active')) { window.dispatchEvent(new Event('dragend')); return; }
  const { target, transfer } = demoDrag();
  if (!target) return;
  target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
});
const notebookSource = document.querySelector<HTMLElement>('#preview-notebook-source')!;
notebookSource.addEventListener('dragstart', event => {
  const transfer = (event as DragEvent).dataTransfer;
  if (!transfer) return;
  const format = document.querySelector<HTMLSelectElement>('#preview-notebook-format')!.value;
  transfer.setData('application/siyuan-file', format === 'slash' ? '/' : demoNotebookId);
  transfer.setData('text/plain', '演示研究库（笔记本）');
});
document.addEventListener('dragstart', event => {
  if ((event.target as Element | null)?.closest?.('#preview-notebook-fixture')) captureNotebookDrag(event, demoWorkspace);
});
document.querySelector('#preview-notebook-drop')!.addEventListener('click', () => {
  const transfer = new DataTransfer();
  notebookSource.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  const selector = document.querySelector<HTMLSelectElement>('#preview-drop-zone')!.value;
  const target = document.querySelector(selector) || document.querySelector('.dsh-app');
  if (!target) return;
  target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
});
window.addEventListener('pagehide', stopTimer);
if (params.get('animate') === '1') void play();
