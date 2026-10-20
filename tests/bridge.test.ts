import { createRequire } from 'node:module';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { bridgePatch, bridgeSource } from '../src/bridge';

const bridge = createRequire(import.meta.url)('../src/runtime/stream-bridge.cjs');

function setup() {
    const input = new PassThrough();
    const output = new PassThrough();
    const frames: any[] = [];
    output.on('data', chunk => frames.push(...chunk.toString().trim().split('\n').map(JSON.parse)));
    const listeners = new Map<string, Function>();
    const effects: Function[] = [];
    const agent = { session: { id: 'session-1' }, cancel: vi.fn() };
    const llm = {
        listProviders: vi.fn(() => [{ id: 'account', name: 'Existing account' }, { id: 'no-key', name: 'Missing API key' }]),
        listModels: vi.fn(async (provider: string) => provider === 'account' ? [{ id: 'flash', name: 'Flash' }] : []),
        resolveModelInfo: vi.fn(async () => ({ reasoning: { efforts: [{ id: 'off' }, { id: 'high' }], defaultEffort: 'high' } })),
    };
    const agents = new Map([['session-1', agent]]);
    const systemPrompt = { section: vi.fn() };
    bridge.apply({
        agents, llm, systemPrompt,
        on(name: string, listener: Function) { listeners.set(name, listener); },
        effect(start: Function) { effects.push(start()); },
    }, { input, output });
    return { input, output, frames, agent, listeners, effects, llm, systemPrompt };
}

describe('per-launch native DSH bridge', () => {
    it('registers sidebar facts through the official prompt service before announcing readiness', () => {
        const s = setup();
        expect(bridge.inject).toContain('systemPrompt');
        expect(s.systemPrompt.section).toHaveBeenCalledTimes(1);
        const section = s.systemPrompt.section.mock.calls[0][0];
        expect(section).toMatchObject({ name: 'siyuan:sidebar-host', order: 10100, interpolate: false });
        expect(section.text).toContain('SiYuan 侧边栏宿主环境');
        expect(section.text).toContain('\n本会话运行在思源笔记');
        expect(section.text).toContain('[标题](siyuan://blocks/真实ID)');
        expect(section.text).toContain('具体预览行为取决于用户的思源配置');
        expect(section.text).toContain('你看不到用户当前打开的笔记或选区');
        expect(section.text).toContain('不要编造链接 ID');
        expect(section.text).toContain('只有用户需要时才补充复制 Markdown');
        expect(section.text).toContain('不要默认放进代码块');
        expect(s.frames[0].method).toBe('session.stream.ready');
        s.effects.forEach(dispose => dispose());
    });

    it('embeds a local plugin without importing application packages and safely quotes patch paths', () => {
        expect(bridgeSource).toContain("ctx.on('agent/assistant-stream'");
        expect(bridgePatch('/a path/中文: "bridge".cjs')).toBe('- insert:\n    - id: siyuan-stream-bridge\n      name: "/a path/中文: \\"bridge\\".cjs"\n');
    });

    it('forwards native frames in order, preserving attempt and durable identities', () => {
        const s = setup();
        expect(s.frames.shift()).toMatchObject({ method: 'session.stream.ready', params: { version: 1, capabilities: { assistantStream: true, cancel: true } } });
        const stream = [
            { type: 'start', attemptId: 'session-1:1', revision: 1, turn: 2, step: 0 },
            { type: 'chunk', attemptId: 'session-1:1', revision: 2, index: 0, time: 100, chunk: { type: 'text-delta', index: 0, text: '你好' } },
            { type: 'end', attemptId: 'session-1:1', revision: 3, index: 1, outcome: { kind: 'committed', eventType: 'assistant/message', seq: 12 } },
        ];
        stream.forEach(frame => s.listeners.get('agent/assistant-stream')!({ agent: s.agent, frame }));
        expect(s.frames.map(item => item.params)).toEqual(stream.map(frame => ({ sessionId: 'session-1', frame })));
        s.effects.forEach(dispose => dispose());
    });

    it('cancels only the explicit live session and rejects unknown methods and targets', () => {
        const s = setup();
        const send = (id: string, method: string, params: any) => s.input.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
        send('missing', 'session/cancel', { sessionId: 'other-session' });
        send('unsafe', 'approve', { sessionId: 'session-1' });
        send('invalid', 'session/cancel', {});
        send('cancel-1', 'session/cancel', { sessionId: 'session-1' });
        expect(s.agent.cancel).toHaveBeenCalledTimes(1);
        expect(s.agent.cancel).toHaveBeenCalledWith({ kind: 'user' }, { keepInbox: true });
        expect(s.frames.slice(1)).toEqual([
            { jsonrpc: '2.0', id: 'missing', error: { code: -32004, message: 'Session is not active' } },
            { jsonrpc: '2.0', id: 'unsafe', error: { code: -32601, message: 'Unsupported bridge control method' } },
            { jsonrpc: '2.0', id: 'invalid', error: { code: -32602, message: 'session/cancel requires sessionId' } },
            { jsonrpc: '2.0', id: 'cancel-1', result: {} },
        ]);
        s.effects.forEach(dispose => dispose());
    });

    it('handles split UTF-8 controls and removes its stream listeners on disposal', () => {
        const s = setup();
        const wire = Buffer.from(`${JSON.stringify({ jsonrpc: '2.0', id: '中文', method: 'session/cancel', params: { sessionId: 'session-1' } })}\n`);
        const split = wire.indexOf(Buffer.from('中文')) + 1;
        s.input.write(wire.subarray(0, split));
        s.input.write(wire.subarray(split));
        expect(s.frames.at(-1)).toEqual({ jsonrpc: '2.0', id: '中文', result: {} });
        s.effects.forEach(dispose => dispose());
        const count = s.frames.length;
        s.listeners.get('agent/assistant-stream')!({ agent: s.agent, frame: { type: 'start' } });
        expect(s.frames).toHaveLength(count);
        expect(s.input.listenerCount('data')).toBe(0);
        expect(s.input.destroyed).toBe(true);
    });


    it('reads the native available catalog and reasoning metadata without credentials or inference', async () => {
        const s = setup();
        s.input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 'catalog', method: 'models/list' })}\n`);
        await vi.waitFor(() => expect(s.frames.at(-1).id).toBe('catalog'));
        expect(s.frames.at(-1).result).toEqual({ models: [
            { provider: 'account', providerName: 'Existing account', id: 'flash', name: 'Flash', reasoning: ['off', 'high'], defaultReasoning: 'high' },
        ], errors: [] });
        expect(s.llm.resolveModelInfo).toHaveBeenCalledWith('account', 'flash');
        s.effects.forEach(dispose => dispose());
    });

    it('retains healthy providers when another catalog fails and never forwards its credential-bearing exception', async () => {
        const s = setup();
        s.llm.listModels.mockImplementation(async (provider: string) => {
            if (provider === 'no-key') throw new Error('Authorization: Bearer secret-not-for-ui');
            return [{ id: 'flash', name: 'Flash' }];
        });
        s.input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 'catalog', method: 'models/list' })}\n`);
        await vi.waitFor(() => expect(s.frames.at(-1).id).toBe('catalog'));
        expect(s.frames.at(-1).result.models).toHaveLength(1);
        expect(s.frames.at(-1).result.errors).toEqual(['Missing API key：模型目录读取失败']);
        expect(JSON.stringify(s.frames)).not.toContain('secret-not-for-ui');
        s.effects.forEach(dispose => dispose());
    });

    it('drops malformed and oversized control frames without canceling work', () => {
        const s = setup();
        s.input.write('not json\n');
        s.input.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId: 'session-1' } })}\n`);
        s.input.write('x'.repeat(64 * 1024 + 1));
        expect(s.agent.cancel).not.toHaveBeenCalled();
        expect(s.frames.at(-1)).toMatchObject({ error: { code: -32600 } });
        s.effects.forEach(dispose => dispose());
    });
});
