import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChatController, runtimeKey } from '../src/controller';
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
  let entered!: () => void, settle!: () => void, fail!: (error: Error) => void;
  const reachedWait = new Promise<void>(resolve => { entered = resolve; });
  client.request.mockImplementation((method: string) => {
    if (method !== 'session/wait') return Promise.resolve({});
    return new Promise<void>((resolve, reject) => {
      settle = resolve;
      fail = reject;
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
  return { client, sending, settle, fail, sessionId, stream, event };
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
    expect(controller.activeChat.messages.at(-1)).toMatchObject({ reasoning: '先核实来源', text: '字'.repeat(80), streaming: true, phase: 'progress' });
    expect(visible).toEqual([]);
    await vi.advanceTimersByTimeAsync(24);
    expect(visible).toEqual(['字'.repeat(80)]);
    expect(controller.state.busy).toBe(true);
    expect(host.saveData).not.toHaveBeenCalled();
    turn.event('assistant/message', 12, message('最终完整回答', { message: { id: 'durable-answer-1', role: 'assistant', content: [
      { type: 'reasoning', text: '已核实来源' }, { type: 'text', text: '最终完整回答' },
    ] } }));
    turn.stream(end(81));
    expect(controller.activeChat.messages.at(-1)?.phase).toBe('progress');
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

  it('distinguishes progress from the final answer after both completed turn and session wait, and persists that distinction', async () => {
    const turn = await holdTurn();
    turn.event('assistant/message', 10, message('收到，先备份。', { message: { id: 'progress-1', content: [
      { type: 'text', text: '收到，先备份。' }, { type: 'tool-call', id: 'backup', name: 'bash', arguments: {} },
    ] } }));
    turn.event('tool/result', 11, { turn: 2, step: 0, message: { toolCallId: 'backup', content: [{ type: 'text', text: '已备份' }] } });
    turn.event('assistant/message', 12, message('检查完成，开始整理。', { step: 1, message: { id: 'progress-2', content: [
      { type: 'text', text: '检查完成，开始整理。' }, { type: 'tool-call', id: 'organize', name: 'bash', arguments: {} },
    ] } }));
    turn.event('tool/result', 13, { turn: 2, step: 1, message: { toolCallId: 'organize', content: [{ type: 'text', text: '已整理' }] } });
    turn.event('assistant/message', 20, message('已经全部完成。', { step: 2 }));
    expect(controller.activeChat.messages.slice(1).map(item => item.phase)).toEqual(['progress', 'progress', 'progress']);
    expect(controller.state.busy).toBe(true);
    turn.event('turn/end', 21, { turn: 2, reason: { kind: 'completed' } });
    expect(controller.activeChat.messages.slice(1).map(item => item.phase)).toEqual(['progress', 'progress', 'progress']);
    turn.settle(); await turn.sending;
    expect(controller.activeChat.messages.slice(1).map(item => item.phase)).toEqual(['progress', 'progress', 'final']);
    expect(controller.activeChat.messages.slice(1).map(item => item.text)).toEqual(['收到，先备份。', '检查完成，开始整理。', '已经全部完成。']);
    const saved = structuredClone(vi.mocked(host.saveData).mock.calls.at(-1)![1]) as any;
    expect(saved.chats[0].messages.slice(1).map((item: any) => item.phase)).toEqual(['progress', 'progress', 'final']);
    vi.mocked(host.loadData).mockResolvedValueOnce(saved);
    await controller.initialize();
    expect(controller.activeChat.messages.slice(1).map(item => item.phase)).toEqual(['progress', 'progress', 'final']);
  });

  it('waits through child-agent work and subsequent completed turns before promoting only the final reply', async () => {
    const turn = await holdTurn();
    turn.event('assistant/message', 12, message('子任务已启动，正在等待结果。'));
    turn.event('turn/end', 13, { turn: 2, reason: { kind: 'completed' } });
    expect(controller.state.busy).toBe(true);
    expect(controller.activeChat.messages.at(-1)?.phase).toBe('progress');
    turn.event('tool/call', 14, { turn: 3, step: 0, callId: 'verify', name: 'bash' });
    turn.event('tool/result', 15, { turn: 3, step: 0, message: { toolCallId: 'verify', content: [{ type: 'text', text: '子任务结果校验通过' }] } });
    turn.event('assistant/message', 20, message('所有子任务已完成，这是汇总结果。', { turn: 3, step: 1 }));
    turn.event('turn/end', 21, { turn: 3, reason: { kind: 'completed' } });
    expect(controller.state.busy).toBe(true);
    expect(controller.activeChat.messages.slice(1).map(item => item.phase)).toEqual(['progress', 'progress', 'progress']);
    turn.settle(); await turn.sending;
    expect(controller.activeChat.messages.slice(1).map(item => item.phase)).toEqual(['progress', 'progress', 'final']);
  });

  it.each(['assistant', 'tool'] as const)('does not retain a final candidate when later %s work has no completed turn', async kind => {
    const turn = await holdTurn();
    turn.event('assistant/message', 12, message('暂时完成，继续等待子任务。'));
    turn.event('turn/end', 13, { turn: 2, reason: { kind: 'completed' } });
    if (kind === 'assistant') turn.event('assistant/message', 20, message('收到子任务结果，仍在处理。', { turn: 3 }));
    else turn.event('tool/call', 20, { turn: 3, step: 0, callId: 'later', name: 'bash' });
    turn.settle(); await turn.sending;
    expect(controller.activeChat.messages.slice(1).every(item => item.phase === 'progress')).toBe(true);
  });

  it('does not promote a completed-turn candidate when waiting for the whole task fails', async () => {
    const turn = await holdTurn();
    turn.event('assistant/message', 12, message('主任务完成，子任务尚未确认。'));
    turn.event('turn/end', 13, { turn: 2, reason: { kind: 'completed' } });
    const failed = expect(turn.sending).rejects.toThrow('等待子任务失败');
    turn.fail(new Error('等待子任务失败'));
    await failed;
    expect(controller.activeChat.messages.at(-1)?.phase).toBe('progress');
    const saved = vi.mocked(host.saveData).mock.calls.at(-1)![1] as any;
    expect(saved.chats[0].messages.at(-1).phase).toBe('progress');
  });

  it('does not promote an earlier completed-turn candidate after the user stops the remaining task', async () => {
    const turn = await holdTurn();
    turn.event('assistant/message', 12, message('主任务完成，等待子任务。'));
    turn.event('turn/end', 13, { turn: 2, reason: { kind: 'completed' } });
    await controller.stop();
    turn.settle(); await turn.sending;
    expect(controller.activeChat.messages.at(-1)?.phase).toBe('progress');
  });

  it.each(['error', 'aborted', 'unknown', undefined])('keeps committed text as progress after an unconfirmed or failed turn, reason=%s', async reason => {
    const turn = await holdTurn();
    turn.event('assistant/message', 12, message('接下来继续处理。'));
    if (reason) turn.event('turn/end', 13, { turn: 2, reason: { kind: reason } });
    turn.settle(); await turn.sending;
    expect(controller.activeChat.messages.at(-1)).toMatchObject({ text: '接下来继续处理。', streaming: false, phase: 'progress' });
  });

  it('does not promote earlier text when the last step still contains tool calls', async () => {
    const turn = await holdTurn();
    turn.event('assistant/message', 10, message('接下来调用工具。'));
    turn.event('assistant/message', 12, { turn: 2, step: 1, message: { id: 'tool-step', content: [
      { type: 'text', text: '正在写入。' }, { type: 'tool-call', id: 'write', name: 'bash', arguments: {} },
    ] } });
    turn.event('tool/result', 13, { turn: 2, step: 1, message: { toolCallId: 'write', content: [{ type: 'text', text: '已写入' }] } });
    turn.event('turn/end', 14, { turn: 2, reason: { kind: 'completed' } });
    turn.settle(); await turn.sending;
    expect(controller.activeChat.messages.slice(1).every(item => item.phase === 'progress')).toBe(true);
  });

  it('does not let replayed completions or assistant messages reclassify old or current turns', async () => {
    const first = await holdTurn();
    first.event('assistant/message', 12, message('上一轮的最终回答。'));
    first.event('turn/end', 13, { turn: 2, reason: { kind: 'completed' } });
    first.settle(); await first.sending;
    const old = controller.activeChat.messages.at(-1)!;
    expect(old.phase).toBe('final');
    const next = await holdTurn();
    next.event('assistant/message', 20, message('本轮仍在处理。', { turn: 3 }));
    next.event('assistant/message', 12, message('上一轮的最终回答。'));
    next.event('turn/end', 13, { turn: 2, reason: { kind: 'completed' } });
    next.event('turn/end', 13, { reason: { kind: 'completed' } });
    expect(old.phase).toBe('final');
    expect(controller.activeChat.messages.at(-1)?.phase).toBe('progress');
    next.event('turn/end', 21, { turn: 3, reason: { kind: 'completed' } });
    next.settle(); await next.sending;
    expect(controller.activeChat.messages.at(-1)?.phase).toBe('final');
  });

  it('preserves legacy history and ignores completed events replayed while restoring a session', async () => {
    const old = { id: 'old-answer', role: 'assistant', text: '历史回答', time: 0, seq: 5, turn: 1 };
    controller.activeChat.messages.push({ id: 'old-user', role: 'user', text: '历史问题', time: 0 }, old as any);
    controller.activeChat.started = true;
    controller.activeChat.runtimeKey = runtimeKey(controller.state.settings);
    await controller.connect();
    const client = runtime.clients.at(-1)!;
    client.resume.mockImplementation(async () => {
      client.notify('session.event', { sessionId: controller.activeChat.sessionId, event: {
        type: 'turn/end', seq: 6, data: { turn: 1, reason: { kind: 'completed' } },
      } });
      return {};
    });
    await controller.send('新的问题');
    expect(old).not.toHaveProperty('phase');
    expect(controller.activeChat.messages.filter(item => item.role === 'assistant')).toEqual([old]);
  });

  it('accepts a canonical assistant message without a sequence but never promotes a live prefix', async () => {
    const turn = await holdTurn();
    turn.stream(start());
    turn.stream(chunk(0, { type: 'text-delta', index: 0, text: '尚未提交的前缀' }));
    turn.event('turn/end', 10, { turn: 2, reason: { kind: 'completed' } });
    expect(controller.activeChat.messages.at(-1)?.phase).toBe('progress');
    turn.client.notify('session.event', { sessionId: turn.sessionId, event: { type: 'assistant/message', data: message('规范事件确认的完整回答') } });
    turn.event('turn/end', 11, { turn: 2, reason: { kind: 'completed' } });
    expect(controller.activeChat.messages.at(-1)?.phase).toBe('progress');
    turn.settle(); await turn.sending;
    expect(controller.activeChat.messages.at(-1)?.phase).toBe('final');
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
    expect(controller.activeChat.messages.at(-1)).toMatchObject({ text: '停止前已输出', interrupted: true, streaming: false, phase: 'progress' });
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
