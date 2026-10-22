import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { compile, preprocess } from 'svelte/compiler';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';
import type { DisplayDetail, Message, NoteReference, State } from '../src/types';
import { defaultSettings } from '../src/settings';
import * as activity from '../src/ui/activity';
import * as markdown from '../src/ui/markdown';
import * as references from '../src/references';
import * as referenceDrop from '../src/ui/reference-drop';

const user = (id: string): Message => ({ id, role: 'user', text: '问题', time: 0 });
const step = (id: string, status: 'running' | 'completed' | 'error' = 'completed'): Message => ({
  id, role: 'assistant', text: '', reasoning: '推理快照', streaming: false, time: 0,
  tools: [{ id: `call-${id}`, name: `tool-${id}`, status, text: '工具结果' }],
});
const groupOf = (messages: Message[], busy: boolean) => activity.groupAssistantActivity(messages, busy).get(messages.at(-1)!.id)!;
let Activity: { render(props: { group: activity.AssistantActivity; message: Message; detail: DisplayDetail }): { html: string } };
let Chat: { render(props: { state: State; controller: object }): { html: string } };
const renderedReferences: { reference: NoteReference; messageId?: string; removable?: boolean }[] = [];

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const components: Record<string, any> = {};
  for (const name of ['Icon', 'Inline', 'Message', 'Activity', 'Settings', 'ReferencePreview', 'Chat']) {
    const filename = new URL(`../src/ui/${name}.svelte`, import.meta.url);
    const source = await preprocess(readFileSync(filename, 'utf8'), {
      script: ({ content }) => ({ code: transpileModule(content, {
        compilerOptions: { target: ScriptTarget.ES2020, module: ModuleKind.ESNext, verbatimModuleSyntax: true },
      }).outputText }),
    }, { filename: filename.pathname });
    const component = compile(source.code, { filename: filename.pathname, generate: 'ssr' });
    const code = transpileModule(component.js.code, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText;
    const module = { exports: {} as any };
    new Function('require', 'module', 'exports', code)((dependency: string) => dependency === './activity' ? activity
      : dependency === './markdown' ? markdown : dependency === '../references' ? references
        : dependency === './reference-drop' ? referenceDrop : components[dependency] || require(dependency), module, module.exports);
    components[`./${name}.svelte`] = module.exports;
    if (name === 'ReferencePreview') {
      const component = module.exports.default;
      const renderReference = component.$$render;
      component.$$render = (result: unknown, props: typeof renderedReferences[number], ...rest: unknown[]) => {
        renderedReferences.push(props);
        return renderReference(result, props, ...rest);
      };
    }
  }
  Activity = components['./Activity.svelte'].default;
  Chat = components['./Chat.svelte'].default;
});

function render(messages: Message[], busy: boolean, detail: DisplayDetail) {
  const group = groupOf(messages, busy);
  return { group, html: Activity.render({ group, message: group.messages[0], detail }).html };
}
const firstDetails = (html: string) => html.match(/<details\b[^>]*>/)?.[0] || '';
function stepDetails(html: string) {
  const stack: { index: number; opening: string }[] = [];
  const sections: { opening: string; html: string; summary: string }[] = [];
  for (const tag of html.matchAll(/<details\b[^>]*>|<\/details>/g)) {
    if (tag[0].startsWith('<details')) stack.push({ index: tag.index!, opening: tag[0] });
    else {
      const start = stack.pop()!;
      if (/class="step-details\b/.test(start.opening)) {
        const content = html.slice(start.index, tag.index! + tag[0].length);
        sections.push({ opening: start.opening, html: content, summary: content.match(/<summary\b[^>]*>[\s\S]*?<\/summary>/)?.[0] || '' });
      }
    }
  }
  return sections;
}

function renderChat(messages: Message[], busy: boolean, detail: DisplayDetail, pendingReferences: NoteReference[] = []) {
  renderedReferences.length = 0;
  const state: State = {
    settings: { ...defaultSettings(), displayDetail: detail },
    chats: [{ id: 'chat', title: '任务', sessionId: 'session', messages, references: pendingReferences, updatedAt: 0 }],
    activeChatId: 'chat', busy, connected: true, status: '执行中', error: '', logs: [],
    models: [], modelsLoading: false, modelsError: '',
  };
  return Chat.render({ state, controller: {} }).html;
}

describe('assistant turn activity', () => {
  it('groups several tool-only steps together without merging across a user or system boundary', () => {
    const first = step('one'), second = step('two'), third = step('three');
    const messages: Message[] = [user('u1'), first, second, { id: 's', role: 'system', text: '提示', time: 0 }, third, user('u2')];
    const groups = activity.groupAssistantActivity(messages, false);
    expect(groups.get(first.id)).toBe(groups.get(second.id));
    expect(groups.get(first.id)?.messages).toEqual([first, second]);
    expect(groups.get(third.id)).not.toBe(groups.get(first.id));
    expect(groups.has('u2')).toBe(false);
    expect(groups.get(first.id)?.toolCount).toBe(2);
  });

  it('does not treat an old turn as active when a new user prompt has no assistant step yet', () => {
    const old = step('old');
    const groups = activity.groupAssistantActivity([user('u1'), old, user('u2')], true);
    expect(groups.get(old.id)?.active).toBe(false);
    expect(activity.activityPresentation('balanced', groups.get(old.id)!).grouped).toBe(true);
  });

  it('keeps balanced activity visible after assistant streaming ends while its tool is running', () => {
    const message = step('current', 'running');
    const { group, html } = render([user('u'), message], true, 'balanced');
    expect(message.streaming).toBe(false);
    expect(group.active).toBe(true);
    expect(activity.activityPresentation('balanced', group).grouped).toBe(false);
    expect(html).not.toContain('process-summary');
    expect(html).toContain('执行中');
  });

  it('waits for the whole busy turn to finish even after all current tool results have arrived', () => {
    const message = step('current');
    const active = groupOf([user('u'), message], true);
    const finished = groupOf([user('u'), message], false);
    expect(activity.activityPresentation('balanced', active)).toMatchObject({ grouped: false, phase: 'running' });
    expect(activity.activityPresentation('balanced', finished)).toMatchObject({ grouped: true, phase: 'settled', defaultOpen: false });
  });

  it('collapses all completed balanced steps into one native disclosure', () => {
    const { html, group } = render([user('u'), step('one'), step('two')], false, 'balanced');
    expect(group.toolCount).toBe(2);
    expect(html.match(/class="process-summary/g)).toHaveLength(1);
    expect(firstDetails(html)).not.toMatch(/\bopen\b/);
    expect(html).toContain('2 次调用');
    expect(html).toContain('tool-one');
    expect(html).toContain('tool-two');
  });

  it('does not add an empty process step for the final answer body', () => {
    const answer: Message = { id: 'answer', role: 'assistant', text: '最终正文', time: 0 };
    const { html } = render([user('u'), step('one'), answer], false, 'balanced');
    expect(html.match(/class="process-step/g)).toHaveLength(1);
    expect(html).not.toContain('最终正文');
  });

  it.each(['error', 'interrupted'] as const)('opens balanced details for %s without claiming success', kind => {
    const message = step('problem', kind === 'error' ? 'error' : 'completed');
    if (kind === 'interrupted') message.interrupted = true;
    const { html, group } = render([user('u'), message], false, 'balanced');
    expect(group.hasIssue).toBe(true);
    expect(firstDetails(html)).toMatch(/\bopen\b/);
    expect(group.summary).not.toContain('已完成');
  });

  it('keeps unresolved historical tools explicit without an execution animation', () => {
    const { html, group } = render([user('u'), step('unknown', 'running')], false, 'balanced');
    expect(group.active).toBe(false);
    expect(group.unsettled).toBe(true);
    expect(html).toContain('未确认完成');
    expect(firstDetails(html)).toMatch(/\bopen\b/);
    expect(html).not.toMatch(/class="[^"]*\brunning\b/);
    expect(html).not.toMatch(/class="[^"]*\bworking\b/);
  });

  it('keeps compact progress collapsed while exposing the running status and tool count', () => {
    const { html } = render([user('u'), step('one'), step('two', 'running')], true, 'compact');
    expect(firstDetails(html)).not.toMatch(/\bopen\b/);
    expect(html).toContain('执行中 · tool-two');
    expect(html).toContain('2 次调用');
  });

  it('leaves full mode as individual steps with leaf details available to open', () => {
    const { html } = render([user('u'), step('one'), step('two')], false, 'full');
    expect(html).not.toContain('process-summary');
    expect(html).toContain('tool-one');
    expect(html).not.toContain('tool-two');
    expect(firstDetails(html)).not.toMatch(/\bopen\b/);
  });

  it('does not change disclosure phase for ordinary stream/tool updates in a live turn', () => {
    const message = step('current', 'running');
    const before = activity.activityPresentation('balanced', groupOf([user('u'), message], true));
    message.streaming = true; message.reasoning += '新增内容';
    message.tools![0].status = 'completed';
    const after = activity.activityPresentation('balanced', groupOf([user('u'), message], true));
    expect(after).toEqual(before);
  });
});

describe('progress updates and final answers', () => {
  const progress = (id: string, text: string): Message => ({ id, role: 'assistant', text, time: 0, phase: 'progress' });
  const answer: Message = { id: 'final', role: 'assistant', text: '最终交付内容', time: 0, phase: 'final' };

  it.each(['balanced', 'full'] as const)('keeps several live updates inside the process without final-answer actions in %s mode', detail => {
    const messages = [user('u'), progress('one', '先备份现有文档'), step('tool', 'running'), progress('two', '现在开始调整目录')];
    const html = renderChat(messages, true, detail);
    for (const text of ['先备份现有文档', '现在开始调整目录']) expect(html.split(text)).toHaveLength(2);
    expect(html.match(/aria-label="进度更新"/g)).toHaveLength(2);
    expect(html).not.toContain('class="assistant-body');
    expect(html).not.toContain('最终答复');
    expect(html).not.toContain('aria-label="写入笔记"');
  });

  it.each(['compact', 'balanced', 'full'] as const)('renders one authoritative final answer outside the process in %s mode', detail => {
    const messages = [user('u'), progress('one', '准备工作已完成'), step('tool'), answer];
    const html = renderChat(messages, false, detail);
    expect(html.match(/class="assistant-body/g)).toHaveLength(1);
    expect(html.match(/class="answer-label/g)).toHaveLength(1);
    expect(html.match(/aria-label="写入笔记"/g)).toHaveLength(1);
    expect(html.split(answer.text)).toHaveLength(2);
    const { group } = render(messages, false, detail);
    expect(group.progressIds.has(answer.id)).toBe(false);
    expect(Activity.render({ group, message: messages[1], detail }).html).not.toContain(answer.text);
  });

  it.each(['compact', 'balanced'] as const)('retains every intermediate update within one closed disclosure after completion in %s mode', detail => {
    const messages = [user('u'), progress('one', '已备份快照'), progress('two', '已完成结构调整'), answer];
    const { html } = render(messages, false, detail);
    expect(firstDetails(html)).not.toMatch(/\bopen\b/);
    expect(html.match(/class="process-summary/g)).toHaveLength(1);
    expect(html).toContain('已备份快照');
    expect(html).toContain('已完成结构调整');
    expect(html).not.toContain(answer.text);
  });

  it('keeps compact live progress in the disclosure without dropping its body', () => {
    const messages = [user('u'), progress('one', '已完成第一步，继续处理')];
    const { html, group } = render(messages, true, 'compact');
    expect(group.hasProcess).toBe(true);
    expect(firstDetails(html)).not.toMatch(/\bopen\b/);
    expect(html).toContain(messages[1].text);
    expect(html).toContain('生成中');
  });

  it('does not show an empty-thinking placeholder alongside an already streaming progress body', () => {
    const message = { ...progress('stream', '正在输出阶段说明'), streaming: true };
    const html = renderChat([user('u'), message], true, 'full');
    expect(html).toContain(message.text);
    expect(html).not.toContain('思考中');
  });

  it('recognizes earlier legacy steps as progress without inventing a final marker for its last reply', () => {
    const first: Message = { id: 'old-one', role: 'assistant', text: '旧版中间说明', time: 0 };
    const last: Message = { id: 'old-last', role: 'assistant', text: '旧版末条回复', time: 0 };
    const messages = [user('u'), first, last];
    const group = groupOf(messages, false);
    expect(group.progressIds.has(first.id)).toBe(true);
    expect(group.progressIds.has(last.id)).toBe(false);
    const html = renderChat(messages, false, 'balanced');
    expect(html).toContain(first.text);
    expect(html).toContain(last.text);
    expect(html).not.toContain('最终答复');
    expect(messages.every(message => message.phase === undefined)).toBe(true);
  });

  it.each(['error', 'stopped'] as const)('retains %s partial output as process instead of a final answer', kind => {
    const partial = progress('partial', '目前只处理了部分文档');
    if (kind === 'stopped') partial.interrupted = true;
    else partial.tools = [{ id: 'failed', name: '写入文档', status: 'error' }];
    const messages = [user('u'), partial];
    const { html, group } = render(messages, false, 'balanced');
    expect(group.hasIssue).toBe(true);
    expect(firstDetails(html)).toMatch(/\bopen\b/);
    expect(html).toContain(partial.text);
    const chat = renderChat(messages, false, 'balanced');
    expect(chat).not.toContain('class="assistant-body');
    expect(chat).not.toContain('最终答复');
    expect(chat).not.toContain('aria-label="写入笔记"');
  });

  it('shows a single stop marker for a partial text update in full mode', () => {
    const partial = { ...progress('partial', '停止前保留的内容'), interrupted: true };
    const html = renderChat([user('u'), partial], false, 'full');
    expect(html.match(/>已停止</g)).toHaveLength(1);
    expect(html).toContain(partial.text);
  });

  it('keeps raw HTML and unsafe links inert inside progress updates', () => {
    const messages = [user('u'), progress('unsafe', '<img src=x onerror=alert(1)>\n\n[链接](javascript:alert(1))')];
    const html = renderChat(messages, true, 'full');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('&lt;img');
  });

  it.each(['compact', 'balanced'] as const)('collects consecutive thoughts and calls between updates into one closed section in %s mode', detail => {
    const first = { ...progress('one', '开始备份快照'), tools: [{ id: 'attached', name: '初始化备份', status: 'completed' as const, text: '已创建备份目录' }] };
    const thought: Message = { id: 'thought', role: 'assistant', phase: 'progress', text: '', reasoning: '需要检查文档之间的引用', time: 0 };
    const messages = [user('u'), first, step('read'), thought, step('check'), progress('two', '开始调整目录'), step('move'), answer];
    const { html } = render(messages, false, detail);
    const sections = stepDetails(html);
    expect(sections).toHaveLength(2);
    for (const section of sections) {
      expect(section.opening).not.toMatch(/\bopen\b/);
      expect(section.summary).toContain('思考与调用');
      expect(section.html).not.toContain('aria-label="进度更新"');
      expect(section.html).not.toContain(first.text);
      expect(section.html).not.toContain(messages[5].text);
      expect(section.html).not.toContain(answer.text);
    }
    expect(sections[0].summary).toContain('3 次调用');
    expect(sections[0].html).toContain('初始化备份');
    expect(sections[0].html).toContain('已创建备份目录');
    expect(sections[0].html).toContain('tool-read');
    expect(sections[0].html).toContain(thought.reasoning);
    expect(sections[0].html).toContain('tool-check');
    expect(sections[1].summary).toContain('1 次调用');
    expect(sections[1].html).toContain('tool-move');
    expect(html.indexOf(first.text)).toBeLessThan(html.indexOf(sections[0].opening));
    expect(html.indexOf(messages[5].text)).toBeGreaterThan(html.indexOf(sections[0].html) + sections[0].html.length);
    expect(html.split(first.text)).toHaveLength(2);
    expect(html.split(messages[5].text)).toHaveLength(2);
    expect(html).not.toContain(answer.text);
  });

  it.each(['running', 'stopped', 'error', 'unresolved'] as const)('keeps %s visible in the closed thoughts-and-calls summary', status => {
    const update = progress('update', '这部分尚未确认完成');
    const work = step('work', status === 'error' ? 'error' : status === 'stopped' ? 'completed' : 'running');
    if (status === 'stopped') work.interrupted = true;
    const { html } = render([user('u'), update, work], status === 'running', 'compact');
    const sections = stepDetails(html);
    expect(sections).toHaveLength(1);
    expect(sections[0].opening).not.toMatch(/\bopen\b/);
    expect(sections[0].summary).toContain('1 次调用');
    expect(sections[0].summary).toContain(status === 'running' ? '执行中' : '有未完成项');
    expect(sections[0].summary).not.toContain('已完成');
    expect(sections[0].html).toContain('工具结果');
    if (status === 'stopped') expect(html).toContain('已停止');
    if (status === 'unresolved') expect(sections[0].html).toContain('未确认完成');
    if (status !== 'running') expect(sections[0].summary).not.toMatch(/class="[^"]*\bworking\b/);
  });

  it('also keeps full-mode thoughts and tools closed behind their step summary', () => {
    const update = { ...progress('update', '当前进度说明'), reasoning: '当前思考内容', tools: [{ id: 'work', name: '执行操作', status: 'completed' as const }] };
    const { html } = render([user('u'), update], false, 'full');
    const sections = stepDetails(html);
    expect(sections).toHaveLength(1);
    expect(sections[0].opening).not.toMatch(/\bopen\b/);
    expect(sections[0].html).toContain(update.reasoning);
    expect(sections[0].html).toContain('执行操作');
    expect(sections[0].html).not.toContain(update.text);
    expect(html.indexOf(update.text)).toBeLessThan(html.indexOf(sections[0].html));
  });
});

describe('message attachments', () => {
  const id = '20261020000000-demo003';

  it('renders sent attachments under their user message without removal controls or composer reuse', () => {
    const attachment: NoteReference = { id, title: '本次引用文档', kind: 'document', text: '发送时的正文快照' };
    const sent: Message = { ...user('sent'), text: '请整理这份资料', references: [attachment] };
    const html = renderChat([sent], false, 'full');
    expect(html.match(/aria-label="本条消息的附件"/g)).toHaveLength(1);
    expect(html).toContain('打开：本次引用文档');
    expect(html).not.toContain('aria-label="待发送附件"');
    expect(html).not.toContain('class="reference-remove');
    expect(renderedReferences).toEqual([expect.objectContaining({ reference: attachment, messageId: sent.id, removable: false })]);
  });

  it('keeps same-ID attachment snapshots tied to their individual message IDs', () => {
    const first: Message = { ...user('first'), references: [{ id, title: '第一次发送时的标题', kind: 'document', text: '第一份快照' }] };
    const second: Message = { ...user('second'), references: [{ id, title: '第二次发送时的标题', kind: 'document', text: '第二份快照' }] };
    const html = renderChat([first, second], false, 'balanced');
    expect(html.match(/aria-label="本条消息的附件"/g)).toHaveLength(2);
    expect(html).toContain('打开：第一次发送时的标题');
    expect(html).toContain('打开：第二次发送时的标题');
    expect(renderedReferences.map(props => [props.messageId, props.reference.text, props.removable]))
      .toEqual([['first', '第一份快照', false], ['second', '第二份快照', false]]);
    expect(html).not.toContain('class="reference-remove');
  });

  it('only offers removal for the composer attachments queued for the next send', () => {
    const historical: NoteReference = { id, title: '已经发送的引用', kind: 'document' };
    const queued: NoteReference = { id, title: '待发送的引用', kind: 'document' };
    const html = renderChat([{ ...user('sent'), references: [historical] }], false, 'full', [queued]);
    expect(html).toContain('aria-label="本条消息的附件"');
    expect(html).toContain('aria-label="待发送附件"');
    expect(html.match(/class="reference-remove/g)).toHaveLength(1);
    expect(html).toContain('aria-label="移除引用：待发送的引用"');
    expect(html).not.toContain('aria-label="移除引用：已经发送的引用"');
    expect(renderedReferences[0]).toMatchObject({ messageId: 'sent', removable: false, reference: historical });
    expect(renderedReferences[1].messageId).toBeUndefined();
    expect(renderedReferences[1].reference).toBe(queued);
  });

  it('preserves notebook and document attachments with the same ID in one message', () => {
    const notebook: NoteReference = { id, title: '同名范围', kind: 'notebook' };
    const document: NoteReference = { id, title: '同名文档', kind: 'document' };
    const html = renderChat([{ ...user('sent'), references: [notebook, document] }], false, 'full');
    expect(html).toContain('预览：笔记本 · 同名范围');
    expect(html).toContain('打开：同名文档');
    expect(renderedReferences.map(props => references.referenceKey(props.reference))).toEqual([`notebook:${id}`, id]);
    expect(renderedReferences.every(props => props.messageId === 'sent' && props.removable === false)).toBe(true);
  });

  it('omits empty attachment rows for old messages without per-message references', () => {
    const html = renderChat([user('legacy'), { ...user('empty'), references: [] }], false, 'full');
    expect(html).not.toContain('aria-label="本条消息的附件"');
    expect(html).not.toContain('aria-label="待发送附件"');
    expect(renderedReferences).toHaveLength(0);
  });

  it('escapes untrusted attachment titles in history and composer labels', () => {
    const title = '"><img src=x onerror=alert(1)>';
    const attachment: NoteReference = { id, title, kind: 'document' };
    const html = renderChat([{ ...user('sent'), references: [attachment] }], false, 'full', [attachment]);
    expect(html).not.toContain('<img');
    expect(html).not.toMatch(/<[^>]*\sonerror=/);
    expect(html).toContain('&lt;img');
    expect(html).toContain('&quot;');
  });
});
