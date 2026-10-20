import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChatController } from '../src/controller';
import { defaultSettings } from '../src/settings';
import type { Host } from '../src/types';

const runtime = vi.hoisted(() => ({ clients: [] as any[] }));
vi.mock('../src/harness', () => ({
  HarnessClient: class {
    supportsCancel = true;
    onLog = vi.fn((listener: any) => { this.log = listener; });
    onExit = vi.fn((listener: any) => { this.exit = listener; });
    onNotification = vi.fn((listener: any) => { this.notify = listener; });
    start = vi.fn(async () => {});
    resume = vi.fn(async (_sessionId: string) => ({}));
    prompt = vi.fn(async (_sessionId: string, _content: any) => ({ messageId: 'user-1' }));
    request = vi.fn(async (_method: string, _params?: any, _timeout?: number) => ({}));
    cancel = vi.fn(async (_sessionId: string) => {});
    close = vi.fn(async () => { this.onClose?.(); });
    log?: (line: string) => void;
    exit?: (info: unknown) => void;
    notify?: (method: string, params: unknown) => void;
    onClose?: () => void;
    constructor(readonly options: any) { runtime.clients.push(this); }
  },
}));

let directory: string;
let host: Host;
let controller: ChatController;
let running: Promise<unknown>[];

beforeEach(async () => {
  runtime.clients = [];
  running = [];
  directory = await mkdtemp(join(tmpdir(), 'siyuan-stream-controller-'));
  host = {
    loadData: vi.fn(async (_name: string): Promise<any> => undefined),
    saveData: vi.fn(async (_name: string, _data: unknown) => {}),
    getCurrentNote: vi.fn(async () => ({ id: 'note-1', title: '文档' })),
    getSelection: vi.fn(async () => ({ id: 'selection-1', title: '选区' })),
    appendToNote: vi.fn(async () => true), notify: vi.fn(),
  };
  controller = new ChatController(host);
  await controller.initialize();
  await controller.saveSettings({ ...defaultSettings(), cwd: directory, home: join(directory, 'home') });
});

afterEach(async () => {
  vi.useRealTimers();
  await controller.destroy();
  await Promise.allSettled(running);
  await rm(directory, { recursive: true, force: true });
});

async function holdTurn() {
  await controller.connect();
  const client = runtime.clients.at(-1)!;
  let entered!: () => void, settle!: () => void;
  const reachedWait = new Promise<void>(resolve => { entered = resolve; });
  client.request.mockImplementation((method: string) => {
    if (method !== 'session/wait') return Promise.resolve({});
    return new Promise<void>((resolve, reject) => {
      settle = resolve;
      client.onClose = () => reject(new Error('Harness 客户端已关闭'));
      entered();
    });
  });
  const sending = controller.send('测试流式回答');
  running.push(sending);
  await reachedWait;
  const sessionId = controller.activeChat.sessionId;
  const stream = (frame: unknown) => client.notify('session.stream', { sessionId, frame });
  const event = (type: string, seq: number, data: unknown) => client.notify('session.event', { sessionId, event: { type, seq, data } });
  return { client, sending, settle, sessionId, stream, event };
}

const start = (attemptId = 'session-1:1', revision = 1) => ({ type: 'start', attemptId, revision, turn: 2, step: 0 });
const chunk = (index: number, value: Record<string, unknown>, attemptId = 'session-1:1', revision = index + 2) =>
  ({ type: 'chunk', attemptId, revision, index, time: 100 + index, chunk: value });
const end = (index: number, eventType = 'assistant/message', seq = 12, attemptId = 'session-1:1', revision = index + 2) =>
  ({ type: 'end', attemptId, revision, index, outcome: { kind: 'committed', eventType, seq } });
const message = (text: string, extra: Record<string, unknown> = {}) => ({
  turn: 2, step: 0, message: { id: 'durable-answer-1', role: 'assistant', content: [{ type: 'text', text }] }, ...extra,
});

describe('ChatController native streaming', () => {
  it('publishes live reasoning and token bursts before completion without writing storage for every delta', async () => {
    const turn = await holdTurn();
    vi.useFakeTimers();
    vi.mocked(host.saveData).mockClear();
    const visible: string[] = [];
    const unsubscribe = controller.subscribe(state => { visible.push(state.chats[0].messages.filter(item => item.role === 'assistant').map(item => item.text).join('')); });
    visible.length = 0;
    turn.stream(start());
    turn.stream(chunk(0, { type: 'reasoning-delta', index: 0, text: '先核实来源' }));
    for (let n = 1; n <= 80; n++) turn.stream(chunk(n, { type: 'text-delta', index: 1, text: '字' }));
    expect(controller.activeChat.messages.at(-1)).toMatchObject({ reasoning: '先核实来源', text: '字'.repeat(80), streaming: true });
    expect(visible).toEqual([]);
    await vi.advanceTimersByTimeAsync(24);
    expect(visible).toEqual(['字'.repeat(80)]);
    expect(controller.state.busy).toBe(true);
    expect(host.saveData).not.toHaveBeenCalled();
    turn.event('assistant/message', 12, message('最终完整回答', { message: { id: 'durable-answer-1', role: 'assistant', content: [
      { type: 'reasoning', text: '已核实来源' }, { type: 'text', text: '最终完整回答' },
    ] } }));
    turn.stream(end(81));
    turn.settle();
    await turn.sending;
    expect(controller.activeChat.messages.at(-1)).toMatchObject({ text: '最终完整回答', reasoning: '已核实来源', seq: 12, streaming: false });
    expect(vi.mocked(host.saveData).mock.calls.length).toBeLessThanOrEqual(2);
    const saved = vi.mocked(host.saveData).mock.calls.at(-1)![1] as any;
    expect(saved.chats[0].messages.at(-1)).toMatchObject({ text: '最终完整回答', streaming: false });
    unsubscribe();
  });

  it('merges the durable event before stream.end and never overwrites canonical content with the transient prefix', async () => {
    const turn = await holdTurn();
    turn.stream(start());
    turn.stream(chunk(0, { type: 'text-delta', index: 0, text: '临时前缀' }));
    const stableId = controller.activeChat.messages.at(-1)!.id;
    turn.event('assistant/message', 12, message('完整且权威的回答'));
    expect(controller.activeChat.messages).toHaveLength(2);
    expect(controller.activeChat.messages.at(-1)).toMatchObject({ id: stableId, seq: 12, text: '完整且权威的回答', streaming: false });
    turn.stream(end(1));
    turn.event('assistant/message', 12, message('完整且权威的回答'));
    turn.stream(chunk(1, { type: 'text-delta', index: 0, text: '迟到的增量' }));
    expect(controller.activeChat.messages.filter(item => item.role === 'assistant')).toHaveLength(1);
    expect(controller.activeChat.messages.at(-1)?.text).toBe('完整且权威的回答');
    turn.settle(); await turn.sending;
  });

  it('also deduplicates a delayed durable event by the sequence supplied in stream.end', async () => {
    const turn = await holdTurn();
    turn.stream(start());
    turn.stream(chunk(0, { type: 'text-delta', index: 0, text: '流式回答' }));
    turn.stream(end(1));
    turn.event('assistant/message', 12, message('权威回答'));
    expect(controller.activeChat.messages.filter(item => item.role === 'assistant')).toHaveLength(1);
    expect(controller.activeChat.messages.at(-1)).toMatchObject({ seq: 12, text: '权威回答', streaming: false });
    turn.settle(); await turn.sending;
  });

  it('removes failed-attempt text and presents only the successful retry', async () => {
    const turn = await holdTurn();
    turn.stream(start());
    turn.stream(chunk(0, { type: 'text-delta', index: 0, text: '不应作为最终答案的失败尝试' }));
    expect(controller.activeChat.messages).toHaveLength(2);
    turn.stream(end(1, 'assistant/attempt', 10));
    expect(controller.activeChat.messages).toHaveLength(1);
    turn.stream(start('session-1:2', 4));
    turn.stream(chunk(0, { type: 'text-delta', index: 0, text: '重试成功' }, 'session-1:2', 5));
    turn.event('assistant/message', 12, message('重试成功'));
    turn.stream(end(1, 'assistant/message', 12, 'session-1:2', 6));
    turn.settle(); await turn.sending;
    expect(controller.activeChat.messages.map(item => item.text)).toEqual(['测试流式回答', '重试成功']);
  });

  it.each([false, true])('tracks a streamed tool from dispatch to its durable result, isError=%s', async isError => {
    const turn = await holdTurn();
    turn.stream(start());
    turn.stream(chunk(0, { type: 'tool-call-delta', index: 0, id: 'call-1', name: 'search', argumentsDelta: '{"q":"笔记"}' }));
    turn.event('assistant/message', 12, { turn: 2, step: 0, message: { id: 'assistant-tools', role: 'assistant', content: [
      { type: 'tool-call', id: 'call-1', name: 'search', arguments: { q: '笔记' } },
    ] } });
    turn.stream(end(1));
    turn.event('tool/call', 13, { turn: 2, step: 0, callId: 'call-1', name: 'search', arguments: { q: '笔记' } });
    expect(controller.activeChat.messages.at(-1)?.tools).toEqual([{ id: 'call-1', name: 'search', status: 'running', text: '{"q":"笔记"}' }]);
    turn.event('tool/result', 14, { turn: 2, step: 0, message: {
      id: 'tool-result-1', role: 'tool', toolCallId: 'call-1', source: { kind: 'tool', callId: 'call-1' }, isError,
      content: [{ type: 'text', text: isError ? '访问被拒绝' : '找到两条笔记' }],
    } });
    expect(controller.activeChat.messages).toHaveLength(2);
    expect(controller.activeChat.messages.at(-1)?.tools).toEqual([{ id: 'call-1', name: 'search', status: isError ? 'error' : 'completed', text: isError ? '访问被拒绝' : '找到两条笔记' }]);
    turn.settle(); await turn.sending;
    expect(controller.state.error).toBe('');
  });

  it('uses native cancellation and retains the same process, session and interrupted prefix for the next turn', async () => {
    const turn = await holdTurn();
    turn.stream(start());
    turn.stream(chunk(0, { type: 'text-delta', index: 0, text: '停止前已输出' }));
    await controller.stop();
    expect(turn.client.cancel).toHaveBeenCalledTimes(1);
    expect(turn.client.cancel).toHaveBeenCalledWith(turn.sessionId);
    expect(turn.client.close).not.toHaveBeenCalled();
    expect(controller.state).toMatchObject({ busy: true, connected: true, status: '正在停止…' });
    turn.event('assistant/message', 12, message('停止前已输出', { interrupted: true }));
    turn.stream(end(1));
    turn.event('turn/end', 13, { turn: 2, reason: { kind: 'aborted', reason: { kind: 'user' } } });
    turn.settle(); await turn.sending;
    expect(controller.state).toMatchObject({ busy: false, connected: true, status: '已停止', error: '' });
    expect(controller.activeChat.messages.at(-1)).toMatchObject({ text: '停止前已输出', interrupted: true, streaming: false });
    turn.client.request.mockResolvedValue({});
    await controller.send('继续');
    expect(runtime.clients).toHaveLength(1);
    expect(turn.client.prompt).toHaveBeenCalledTimes(2);
    expect(turn.client.resume).not.toHaveBeenCalled();
    expect(controller.activeChat.sessionId).toBe(turn.sessionId);
  });

  it('closes the owned process when native cancel fails instead of falsely claiming it stopped the agent', async () => {
    const turn = await holdTurn();
    turn.client.cancel.mockRejectedValueOnce(new Error('原生控制通道已关闭'));
    await controller.stop(); await turn.sending;
    expect(turn.client.cancel).toHaveBeenCalledTimes(1);
    expect(turn.client.cancel).toHaveBeenCalledWith(turn.sessionId);
    expect(turn.client.close).toHaveBeenCalledTimes(1);
    expect(controller.state).toMatchObject({ busy: false, connected: false, status: '已停止' });
    expect(controller.state.logs.some(line => line.includes('原生控制通道已关闭'))).toBe(true);
  });

  it('ignores streams for unowned sessions and settles an unfinished prefix explicitly after wait', async () => {
    const turn = await holdTurn();
    turn.client.notify('session.stream', { sessionId: 'another-session', frame: start() });
    turn.client.notify('session.stream', { sessionId: 'another-session', frame: chunk(0, { type: 'text-delta', index: 0, text: '其它会话' }) });
    expect(controller.activeChat.messages).toHaveLength(1);
    turn.stream(start());
    turn.stream(chunk(0, { type: 'text-delta', index: 0, text: '未落定的前缀' }));
    turn.settle(); await turn.sending;
    expect(controller.activeChat.messages.at(-1)).toMatchObject({ text: '未落定的前缀', streaming: false, interrupted: true });
  });
});
