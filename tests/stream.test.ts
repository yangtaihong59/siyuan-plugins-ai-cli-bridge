import { beforeEach, describe, expect, it } from 'vitest';
import { AssistantStreams } from '../src/stream';

// Frame and chunk shapes match DSH 0.2.1-rc.2 AssistantStreamAttempt and StreamChunk.
const sessionId = 'session-1';
const start = (attemptId = 'session-1:1', revision = 1, turn = 2, step = 0) =>
  ({ type: 'start', attemptId, revision, turn, step });
const chunk = (index: number, value: Record<string, unknown>, attemptId = 'session-1:1', revision = index + 2) =>
  ({ type: 'chunk', attemptId, revision, index, time: 100 + index, chunk: value });
const end = (index: number, outcome: Record<string, unknown>, attemptId = 'session-1:1', revision = index + 2) =>
  ({ type: 'end', attemptId, revision, index, outcome });

let streams: AssistantStreams;
beforeEach(() => { let id = 0; streams = new AssistantStreams(() => `live-${++id}`); });

describe('native assistant stream assembly', () => {
  it('exposes reasoning and text progressively and settles with the durable sequence', () => {
    expect(streams.accept(sessionId, start())).toMatchObject({ messageId: 'live-1', turn: 2, step: 0, streaming: true, text: '', reasoning: '' });
    streams.accept(sessionId, chunk(0, { type: 'block-start', index: 0, blockType: 'reasoning' }));
    expect(streams.accept(sessionId, chunk(1, { type: 'reasoning-delta', index: 0, text: '先检查' }))).toMatchObject({ reasoning: '先检查', text: '', streaming: true });
    streams.accept(sessionId, chunk(2, { type: 'reasoning-delta', index: 0, text: '来源。' }));
    streams.accept(sessionId, chunk(3, { type: 'block-end', index: 0, block: { type: 'reasoning', text: '先检查来源。' } }));
    expect(streams.accept(sessionId, chunk(4, { type: 'text-delta', index: 1, text: '结论' }))).toMatchObject({ reasoning: '先检查来源。', text: '结论' });
    streams.accept(sessionId, chunk(5, { type: 'text-delta', index: 1, text: '可行。' }));
    expect(streams.accept(sessionId, end(6, { kind: 'committed', eventType: 'assistant/message', seq: 12 })))
      .toMatchObject({ messageId: 'live-1', text: '结论可行。', reasoning: '先检查来源。', streaming: false, seq: 12 });
    expect(streams.current(sessionId, 2, 0)).toBeUndefined();
  });

  it('uses authoritative block-end contents once and ignores closed-block stragglers', () => {
    streams.accept(sessionId, start());
    streams.accept(sessionId, chunk(0, { type: 'text-delta', index: 0, text: '草稿' }));
    expect(streams.accept(sessionId, chunk(1, { type: 'block-end', index: 0, block: { type: 'text', text: '完整答案' } })))
      .toMatchObject({ text: '完整答案' });
    streams.accept(sessionId, chunk(2, { type: 'text-delta', index: 0, text: '不该追加' }));
    streams.accept(sessionId, chunk(3, { type: 'block-end', index: 0, block: { type: 'text', text: '不该覆盖' } }));
    expect(streams.current(sessionId, 2, 0)?.text).toBe('完整答案');
  });

  it('assembles multiple blocks in first-seen stream order without mixing reasoning into the answer', () => {
    streams.accept(sessionId, start());
    streams.accept(sessionId, chunk(0, { type: 'text-delta', index: 5, text: '第一段' }));
    streams.accept(sessionId, chunk(1, { type: 'reasoning-delta', index: 3, text: '推理' }));
    expect(streams.accept(sessionId, chunk(2, { type: 'text-delta', index: 8, text: '第二段' })))
      .toMatchObject({ text: '第一段\n第二段', reasoning: '推理' });
  });

  it('rejects duplicate revisions and out-of-order frame indexes without advancing the cursor', () => {
    streams.accept(sessionId, start());
    streams.accept(sessionId, chunk(0, { type: 'text-delta', index: 0, text: 'A' }));
    expect(streams.accept(sessionId, chunk(0, { type: 'text-delta', index: 0, text: '重复A' }))).toBeNull();
    expect(streams.accept(sessionId, chunk(1, { type: 'text-delta', index: 0, text: '过期' }, undefined, 2))).toBeNull();
    expect(streams.accept(sessionId, chunk(2, { type: 'text-delta', index: 0, text: '乱序' }))).toBeNull();
    expect(streams.accept(sessionId, chunk(1, { type: 'text-delta', index: 0, text: 'B' })))
      .toMatchObject({ text: 'AB' });
    expect(streams.accept(sessionId, end(2, { kind: 'committed', eventType: 'assistant/message', seq: 9 })))
      .toMatchObject({ text: 'AB', seq: 9 });
    expect(streams.accept(sessionId, end(2, { kind: 'committed', eventType: 'assistant/message', seq: 9 }))).toBeNull();
  });

  it.each([
    { kind: 'committed', eventType: 'assistant/attempt', seq: 10 },
    { kind: 'abandoned' },
  ])('discards attempts that did not commit an assistant message: %j', outcome => {
    streams.accept(sessionId, start());
    streams.accept(sessionId, chunk(0, { type: 'text-delta', index: 0, text: '失败尝试的临时输出' }));
    expect(streams.accept(sessionId, end(1, outcome))).toMatchObject({ discarded: true, streaming: false });
    expect(streams.current(sessionId, 2, 0)).toBeUndefined();
    expect(streams.accept(sessionId, start('session-1:2', 4)))
      .toMatchObject({ messageId: 'live-2', text: '', reasoning: '', streaming: true });
  });

  it('assembles tool-call deltas and replaces argument fragments with the final block', () => {
    streams.accept(sessionId, start());
    streams.accept(sessionId, chunk(0, { type: 'block-start', index: 0, blockType: 'tool-call' }));
    streams.accept(sessionId, chunk(1, { type: 'tool-call-delta', index: 0, id: 'call-1', name: 'search', argumentsDelta: '{"q":' }));
    expect(streams.accept(sessionId, chunk(2, { type: 'tool-call-delta', index: 0, id: 'call-1', argumentsDelta: '"思源"}' })))
      .toMatchObject({ tools: [{ id: 'call-1', name: 'search', status: 'running', text: '{"q":"思源"}' }] });
    expect(streams.accept(sessionId, chunk(3, { type: 'block-end', index: 0, block: {
      type: 'tool-call', id: 'call-1', name: 'search', arguments: { q: '思源', limit: 5 },
    } }))).toMatchObject({ text: '', tools: [{ id: 'call-1', name: 'search', status: 'running', text: '{"q":"思源","limit":5}' }] });
  });

  it('accepts usage and finish chunks without inventing visible text', () => {
    streams.accept(sessionId, start());
    streams.accept(sessionId, chunk(0, { type: 'text-delta', index: 0, text: '回答' }));
    streams.accept(sessionId, chunk(1, { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }));
    streams.accept(sessionId, chunk(2, { type: 'finish', reason: { kind: 'stop' } }));
    expect(streams.accept(sessionId, end(3, { kind: 'committed', eventType: 'assistant/message', seq: 12 })))
      .toMatchObject({ text: '回答', reasoning: '', tools: [] });
  });

  it('keeps sessions and concurrent attempts isolated and returns detached snapshots', () => {
    streams.accept(sessionId, start());
    streams.accept('session-2', start());
    const first = streams.accept(sessionId, chunk(0, { type: 'tool-call-delta', index: 0, id: 'call-1', name: 'search', argumentsDelta: '{}' }))!;
    first.tools[0].name = 'mutated outside';
    streams.accept('session-2', chunk(0, { type: 'text-delta', index: 0, text: '其它会话' }));
    expect(streams.current(sessionId, 2, 0)?.tools[0].name).toBe('search');
    expect(streams.current('session-2', 2, 0)?.text).toBe('其它会话');
    streams.clear();
    expect(streams.current(sessionId, 2, 0)).toBeUndefined();
    expect(streams.accept('session-2', chunk(1, { type: 'text-delta', index: 0, text: '清理后' }))).toBeNull();
  });

  it('ignores a duplicate start and chunks without a matching valid attempt', () => {
    expect(streams.accept(sessionId, chunk(0, { type: 'text-delta', index: 0, text: '无起点' }))).toBeNull();
    expect(streams.accept(sessionId, { ...start(), revision: Number.NaN })).toBeNull();
    expect(streams.accept(sessionId, { ...start(), turn: undefined })).toBeNull();
    streams.accept(sessionId, start());
    expect(streams.accept(sessionId, start())).toBeNull();
    expect(streams.accept(sessionId, chunk(0, { type: 'text-delta', index: 0, text: '正常' })))
      .toMatchObject({ messageId: 'live-1', text: '正常' });
  });
});
