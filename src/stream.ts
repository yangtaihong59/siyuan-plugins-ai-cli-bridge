import type { ToolActivity } from './types';

interface Block { type: string; text: string; id?: string; name?: string; arguments?: string; closed?: boolean }
export interface LiveAssistant {
  sessionId: string; attemptId: string; messageId: string; turn: number; step: number;
  text: string; reasoning: string; tools: ToolActivity[]; streaming: boolean;
  seq?: number; discarded?: boolean;
}
interface Attempt extends LiveAssistant { revision: number; nextIndex: number; blocks: Map<number, Block> }
const record = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Fold real DSH assistant-stream frames. Durable session events remain authoritative. */
export class AssistantStreams {
  private attempts = new Map<string, Attempt>();
  constructor(private createId: () => string) {}
  clear() { this.attempts.clear(); }
  current(sessionId: string, turn?: number, step?: number): LiveAssistant | undefined {
    return [...this.attempts.values()].reverse().find(item => item.sessionId === sessionId && item.turn === turn && item.step === step);
  }
  accept(sessionId: string, frame: unknown): LiveAssistant | null {
    if (!record(frame) || typeof frame.attemptId !== 'string' || !Number.isSafeInteger(frame.revision)) return null;
    const key = `${sessionId}\0${frame.attemptId}`;
    if (frame.type === 'start') {
      if (this.attempts.has(key) || !Number.isSafeInteger(frame.turn) || !Number.isSafeInteger(frame.step)) return null;
      const item: Attempt = { sessionId, attemptId: frame.attemptId, messageId: this.createId(),
        turn: frame.turn, step: frame.step, text: '', reasoning: '', tools: [], streaming: true,
        revision: frame.revision, nextIndex: 0, blocks: new Map() };
      this.attempts.set(key, item); return this.snapshot(item);
    }
    const item = this.attempts.get(key);
    if (!item || frame.revision <= item.revision || frame.index !== item.nextIndex) return null;
    if (frame.type === 'end') {
      item.revision = frame.revision; item.streaming = false;
      if (record(frame.outcome) && frame.outcome.kind === 'committed' && frame.outcome.eventType === 'assistant/message'
        && Number.isSafeInteger(frame.outcome.seq)) item.seq = frame.outcome.seq;
      else item.discarded = true;
      this.attempts.delete(key); return this.snapshot(item);
    }
    if (frame.type !== 'chunk' || !record(frame.chunk)) return null;
    const chunk = frame.chunk;
    item.revision = frame.revision; item.nextIndex++;
    if (!Number.isSafeInteger(chunk.index) || chunk.index < 0) return this.snapshot(item);
    let block = item.blocks.get(chunk.index);
    const inferred = chunk.type === 'reasoning-delta' ? 'reasoning' : chunk.type === 'tool-call-delta' ? 'tool-call' : 'text';
    if (!block) {
      block = { type: chunk.type === 'block-start' ? chunk.blockType : inferred, text: '' };
      item.blocks.set(chunk.index, block);
    }
    if (block.closed) return this.snapshot(item);
    if ((chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') && typeof chunk.text === 'string') block.text += chunk.text;
    else if (chunk.type === 'tool-call-delta') {
      if (typeof chunk.id === 'string') block.id = chunk.id;
      if (typeof chunk.name === 'string') block.name = chunk.name;
      if (typeof chunk.argumentsDelta === 'string') block.arguments = (block.arguments || '') + chunk.argumentsDelta;
    } else if (chunk.type === 'block-end' && record(chunk.block)) {
      const value = chunk.block;
      block.type = value.type; block.closed = true;
      if (typeof value.text === 'string') block.text = value.text;
      if (typeof value.id === 'string') block.id = value.id;
      if (typeof value.name === 'string') block.name = value.name;
      if (value.arguments !== undefined) block.arguments = typeof value.arguments === 'string' ? value.arguments : JSON.stringify(value.arguments);
    }
    const blocks = [...item.blocks.values()];
    item.text = blocks.filter(value => value.type === 'text').map(value => value.text).join('\n');
    item.reasoning = blocks.filter(value => value.type === 'reasoning').map(value => value.text).join('\n');
    item.tools = blocks.filter(value => value.type === 'tool-call' && value.id && value.name)
      .map(value => ({ id: value.id!, name: value.name!, status: 'running', text: value.arguments }));
    return this.snapshot(item);
  }
  private snapshot(item: Attempt): LiveAssistant {
    const { blocks: _blocks, nextIndex: _index, revision: _revision, ...view } = item;
    return { ...view, tools: view.tools.map(tool => ({ ...tool })) };
  }
}
