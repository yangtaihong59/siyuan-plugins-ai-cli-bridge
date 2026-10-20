import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { compile, preprocess } from 'svelte/compiler';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';
import type { DisplayDetail, Message } from '../src/types';
import * as activity from '../src/ui/activity';
import * as markdown from '../src/ui/markdown';

const user = (id: string): Message => ({ id, role: 'user', text: '问题', time: 0 });
const step = (id: string, status: 'running' | 'completed' | 'error' = 'completed'): Message => ({
  id, role: 'assistant', text: '', reasoning: '推理快照', streaming: false, time: 0,
  tools: [{ id: `call-${id}`, name: `tool-${id}`, status, text: '工具结果' }],
});
const groupOf = (messages: Message[], busy: boolean) => activity.groupAssistantActivity(messages, busy).get(messages.at(-1)!.id)!;
let Activity: { render(props: { group: activity.AssistantActivity; message: Message; detail: DisplayDetail }): { html: string } };

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const components: Record<string, any> = {};
  for (const name of ['Icon', 'Inline', 'Message', 'Activity']) {
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
      : dependency === './markdown' ? markdown : components[dependency] || require(dependency), module, module.exports);
    components[`./${name}.svelte`] = module.exports;
  }
  Activity = components['./Activity.svelte'].default;
});

function render(messages: Message[], busy: boolean, detail: DisplayDetail) {
  const group = groupOf(messages, busy);
  return { group, html: Activity.render({ group, message: group.messages[0], detail }).html };
}
const firstDetails = (html: string) => html.match(/<details\b[^>]*>/)?.[0] || '';

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
