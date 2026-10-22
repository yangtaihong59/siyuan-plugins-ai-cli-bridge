import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChatController, buildPrompt } from '../src/controller';
import { defaultSettings } from '../src/settings';
import { NOTEBOOK_DRAG_TYPE, referenceKey } from '../src/references';
import type { Host, NoteReference } from '../src/types';

const runtime = vi.hoisted(() => ({ clients: [] as any[] }));
vi.mock('../src/harness', () => ({
    HarnessClient: class {
        onLog = vi.fn();
        onExit = vi.fn();
        onNotification = vi.fn();
        start = vi.fn(async () => {});
        resume = vi.fn(async () => ({}));
        prompt = vi.fn(async () => ({ messageId: 'fixture-message' }));
        request = vi.fn(async () => ({}));
        close = vi.fn(async () => {});
        constructor(readonly options: any) { runtime.clients.push(this); }
    },
}));

const ids = Array.from({ length: 8 }, (_, i) => `202610201200${String(i).padStart(2, '0')}-abcdefg`);
const workspace = '/fixture/workspace';
const documents = (...values: string[]) => ({ 'application/siyuan-documents': JSON.stringify({ ids: values }) });
const gutter = (...values: string[]) => `application/siyuan-gutternodeparagraph\u200b\u200b${values.join(',')}\u200b${workspace}`;
const notebooks = (...values: string[]) => ({ [NOTEBOOK_DRAG_TYPE]: JSON.stringify({ ids: values, workspaceDir: workspace }) });
const notebookReference = (id: string): NoteReference => ({ id, title: `范围 ${id.slice(12, 14)}`, text: '仅笔记本范围元数据', kind: 'notebook' });
const reference = (id: string): NoteReference => ({ id, title: `引用 ${id.slice(12, 14)}`, text: `正文快照 ${id}`, kind: 'block' });
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return { promise, resolve };
}

let directory: string;
let host: Host;
let controller: ChatController;
beforeEach(async () => {
    runtime.clients = [];
    directory = await mkdtemp(join(tmpdir(), 'siyuan-reference-controller-'));
    host = {
        loadData: vi.fn(async (): Promise<any> => undefined), saveData: vi.fn(async () => {}),
        getCurrentNote: vi.fn(async () => reference(ids[0])),
        getSelection: vi.fn(async () => ({ id: 'selection-snapshot', title: '固定选区', text: '选中时的正文', kind: 'selection' as const })),
        getReference: vi.fn(async (id: string) => reference(id)),
        getNotebookReference: vi.fn(async (id: string) => notebookReference(id)),
        getWorkspaceDirectory: vi.fn(() => workspace), appendToNote: vi.fn(async () => true), notify: vi.fn(),
    };
    controller = new ChatController(host);
    await controller.initialize();
    await controller.saveSettings({ ...defaultSettings(), cwd: directory, home: join(directory, 'home'), mcpEnabled: false });
    vi.mocked(host.saveData).mockClear();
});
afterEach(async () => { await controller.destroy(); await rm(directory, { recursive: true, force: true }); });

describe('ChatController dropped references and preview', () => {
    it('keeps document/block order and deduplicates simultaneous native payloads even when reads finish out of order', async () => {
        const reads = ids.slice(0, 4).map(() => deferred<NoteReference>());
        vi.mocked(host.getReference!).mockImplementation(id => reads[ids.indexOf(id)].promise);
        const adding = controller.addDroppedReferences({
            ...documents(ids[0], ids[1], ids[0]), 'application/siyuan-file': `${ids[0]},${ids[1]}`,
            [gutter(ids[2], ids[3], ids[2])]: '<div>native block payload</div>',
        });
        expect(vi.mocked(host.getReference!).mock.calls.map(call => call[0])).toEqual(ids.slice(0, 4));
        reads[3].resolve(reference(ids[3])); reads[1].resolve(reference(ids[1]));
        reads[2].resolve(reference(ids[2])); reads[0].resolve(reference(ids[0]));
        expect(await adding).toBe(4);
        expect(controller.activeChat.references.map(ref => ref.id)).toEqual(ids.slice(0, 4));
        expect(host.saveData).toHaveBeenCalledTimes(1);
    });

    it('does not read or add existing references again and only fetches new IDs', async () => {
        controller.activeChat.references.push(reference(ids[0]));
        expect(await controller.addDroppedReferences(documents(ids[0], ids[1], ids[1]))).toBe(1);
        expect(host.getReference).toHaveBeenCalledTimes(1);
        expect(host.getReference).toHaveBeenCalledWith(ids[1]);
        vi.mocked(host.getReference!).mockClear(); vi.mocked(host.saveData).mockClear();
        expect(await controller.addDroppedReferences(documents(ids[1], ids[0]))).toBe(0);
        expect(host.getReference).not.toHaveBeenCalled();
        expect(host.saveData).not.toHaveBeenCalled();
        expect(controller.activeChat.references.map(ref => ref.id)).toEqual(ids.slice(0, 2));
    });

    it('preflights the six-reference total including selections before any note read', async () => {
        controller.activeChat.references.push(...ids.slice(0, 4).map(reference), { id: 'selection-old', title: '旧选区', text: 'snapshot', kind: 'selection' });
        await expect(controller.addDroppedReferences(documents(ids[4], ids[5]))).rejects.toThrow('最多引用 6');
        expect(host.getReference).not.toHaveBeenCalled();
        expect(controller.activeChat.references).toHaveLength(5);
        expect(host.saveData).not.toHaveBeenCalled();
    });

    it('rejects oversized drag selections before any note read', async () => {
        await expect(controller.addDroppedReferences(documents(...ids.slice(0, 7)))).rejects.toThrow('最多引用 6');
        expect(host.getReference).not.toHaveBeenCalled();
        expect(controller.activeChat.references).toHaveLength(0);
    });

    it.each([
        { 'application/siyuan-block-ref': JSON.stringify({ ids: [ids[0]], workspaceDir: '/other/workspace' }) },
        { [`application/siyuan-gutternodeparagraph\u200b\u200b${ids[0]}\u200b/other/workspace`]: '' },
    ])('rejects another workspace before reading referenced content', async payload => {
        await expect(controller.addDroppedReferences(payload)).rejects.toThrow('另一个思源工作区');
        expect(host.getReference).not.toHaveBeenCalled();
        expect(controller.activeChat.references).toEqual([]);
    });

    it('reads body snapshots without MCP and includes them in the actual outgoing prompt', async () => {
        expect(controller.state.settings.mcpEnabled).toBe(false);
        const snapshot: NoteReference = { id: ids[0], title: '算法段落', text: '这段正文已经通过思源 API 读取，不依赖 MCP。', kind: 'block', truncated: true };
        vi.mocked(host.getReference!).mockResolvedValue(snapshot);
        await controller.addDroppedReferences({ [gutter(ids[0])]: '' });
        expect(buildPrompt('解释这个段落', controller.activeChat.references)).toContain(snapshot.text);
        await controller.send('解释这个段落');
        const client = runtime.clients.at(-1)!;
        expect(client.prompt).toHaveBeenCalledTimes(1);
        const text = client.prompt.mock.calls[0][1][0].text;
        expect(text).toContain(`<note-reference id="${ids[0]}" title="算法段落">`);
        expect(text).toContain(snapshot.text);
        expect(host.getReference).toHaveBeenCalledTimes(1);
        expect(await controller.previewReference(ids[0], controller.activeChat.messages[0].id)).toEqual(snapshot);
        expect(host.getReference).toHaveBeenCalledTimes(1);
    });

    it('does not add a partial batch when one API read fails', async () => {
        const original = reference(ids[2]);
        controller.activeChat.references.push(original);
        vi.mocked(host.getReference!).mockImplementation(async id => {
            if (id === ids[1]) throw new Error('fixture read failed');
            return reference(id);
        });
        await expect(controller.addDroppedReferences(documents(ids[0], ids[1]))).rejects.toThrow('fixture read failed');
        expect(host.getReference).toHaveBeenCalledTimes(2);
        expect(controller.activeChat.references).toEqual([original]);
        expect(host.saveData).not.toHaveBeenCalled();
    });

    it('rejects an API response whose identity differs without adding any member', async () => {
        vi.mocked(host.getReference!).mockImplementation(async id => reference(id === ids[1] ? ids[7] : id));
        await expect(controller.addDroppedReferences(documents(ids[0], ids[1]))).rejects.toThrow('不一致');
        expect(controller.activeChat.references).toEqual([]);
        expect(host.saveData).not.toHaveBeenCalled();
    });

    it('does not put an asynchronous drop into either chat after the active chat changes', async () => {
        const original = controller.activeChat;
        const read = deferred<NoteReference>();
        vi.mocked(host.getReference!).mockReturnValue(read.promise);
        const adding = controller.addDroppedReferences(documents(ids[0]));
        const rejected = expect(adding).rejects.toThrow('对话已切换');
        await controller.newChat();
        const current = controller.activeChat;
        expect(current).not.toBe(original);
        read.resolve(reference(ids[0]));
        await rejected;
        expect(original.references).toEqual([]);
        expect(current.references).toEqual([]);
    });

    it('does not add an asynchronous drop after generation starts', async () => {
        await controller.connect();
        const client = runtime.clients.at(-1)!;
        const entered = deferred<void>(), finished = deferred<Record<string, never>>();
        client.request.mockImplementation(async () => { entered.resolve(); return finished.promise; });
        const read = deferred<NoteReference>();
        vi.mocked(host.getReference!).mockReturnValue(read.promise);
        const adding = controller.addDroppedReferences(documents(ids[0]));
        const rejected = expect(adding).rejects.toThrow('请等本轮结束');
        const sending = controller.send('本轮没有拖入引用');
        try {
            await entered.promise;
            read.resolve(reference(ids[0]));
            await rejected;
            expect(controller.activeChat.references).toEqual([]);
            expect(client.prompt.mock.calls[0][1][0].text).not.toContain('正文快照');
        } finally { finished.resolve({}); await sending; }
    });

    it('rechecks duplicate additions from two simultaneous drops before committing', async () => {
        const first = deferred<NoteReference>(), second = deferred<NoteReference>();
        vi.mocked(host.getReference!).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        const addingFirst = controller.addDroppedReferences(documents(ids[0]));
        const addingSecond = controller.addDroppedReferences(documents(ids[0]));
        first.resolve(reference(ids[0])); expect(await addingFirst).toBe(1);
        second.resolve(reference(ids[0])); expect(await addingSecond).toBe(0);
        expect(controller.activeChat.references.map(ref => ref.id)).toEqual([ids[0]]);
    });

    it('previews the captured selection snapshot without asking the host to reread it', async () => {
        await controller.addSelection();
        const original = controller.activeChat.references[0];
        const preview = await controller.previewReference(original.id);
        expect(preview).toEqual({ id: 'selection-snapshot', title: '固定选区', text: '选中时的正文', kind: 'selection' });
        expect(preview).not.toBe(original);
        expect(host.getReference).not.toHaveBeenCalled();
        expect(host.getSelection).toHaveBeenCalledTimes(1);
    });

    it('lazily reads a legacy reference with a valid ID but no body snapshot', async () => {
        controller.activeChat.references.push({ id: ids[0], title: '旧版引用' });
        expect(await controller.previewReference(ids[0])).toEqual(reference(ids[0]));
        expect(host.getReference).toHaveBeenCalledTimes(1);
        expect(host.getReference).toHaveBeenCalledWith(ids[0]);
    });

    it('does not turn an arbitrary legacy selection ID into a note read', async () => {
        controller.activeChat.references.push({ id: 'old-selection-id', title: '无正文旧选区' });
        expect(await controller.previewReference('old-selection-id')).toEqual({ id: 'old-selection-id', title: '无正文旧选区', text: '' });
        expect(host.getReference).not.toHaveBeenCalled();
    });

    it('reports nonexistent or already removed references before any host call', async () => {
        await expect(controller.previewReference(ids[0])).rejects.toThrow('已被移除');
        controller.activeChat.references.push(reference(ids[0]));
        await controller.removeReference(ids[0]);
        await expect(controller.previewReference(ids[0])).rejects.toThrow('已被移除');
        expect(host.getReference).not.toHaveBeenCalled();
    });

    it('surfaces a failed lazy preview rather than pretending an unread note is empty', async () => {
        controller.activeChat.references.push({ id: ids[0], title: '已删除文档的旧引用' });
        vi.mocked(host.getReference!).mockRejectedValue(new Error('fixture document no longer exists'));
        await expect(controller.previewReference(ids[0])).rejects.toThrow('no longer exists');
    });
});


describe('ChatController notebook scopes', () => {
    it('resolves notebook scopes independently and preserves explicit same-ID box documents in one atomic batch', async () => {
        const adding = controller.addDroppedReferences({ ...notebooks(ids[0]), ...documents(ids[0], ids[1]), 'application/siyuan-file': ids[0] });
        expect(await adding).toBe(3);
        expect(controller.activeChat.references.map(referenceKey)).toEqual([`notebook:${ids[0]}`, ids[0], ids[1]]);
        expect(host.getNotebookReference).toHaveBeenCalledTimes(1);
        expect(host.getNotebookReference).toHaveBeenCalledWith(ids[0]);
        expect(vi.mocked(host.getReference!).mock.calls.map(call => call[0])).toEqual([ids[0], ids[1]]);
        expect(host.saveData).toHaveBeenCalledTimes(1);
    });

    it('deduplicates notebook keys without suppressing a same-ID document', async () => {
        controller.activeChat.references.push(notebookReference(ids[0]));
        expect(await controller.addDroppedReferences({ ...notebooks(ids[0]), ...documents(ids[0]) })).toBe(1);
        expect(host.getNotebookReference).not.toHaveBeenCalled();
        expect(host.getReference).toHaveBeenCalledWith(ids[0]);
        expect(await controller.addDroppedReferences(notebooks(ids[0]))).toBe(0);
        expect(controller.activeChat.references.map(referenceKey)).toEqual([`notebook:${ids[0]}`, ids[0]]);
    });

    it('lets current-note attachment coexist with its same-ID notebook scope', async () => {
        controller.activeChat.references.push(notebookReference(ids[0]));
        await controller.addCurrentNote();
        await controller.addCurrentNote();
        expect(controller.activeChat.references.map(referenceKey)).toEqual([`notebook:${ids[0]}`, ids[0]]);
    });

    it('checks the six-item total before reading any member of a notebook/block batch', async () => {
        controller.activeChat.references.push(...ids.slice(0, 5).map(reference));
        await expect(controller.addDroppedReferences({ ...notebooks(ids[5]), ...documents(ids[6]) })).rejects.toThrow('最多引用 6');
        expect(host.getNotebookReference).not.toHaveBeenCalled();
        expect(host.getReference).not.toHaveBeenCalled();
        expect(host.saveData).not.toHaveBeenCalled();
    });

    it('rejects malformed or cross-workspace notebook markers without any host reads', async () => {
        await expect(controller.addDroppedReferences({ [NOTEBOOK_DRAG_TYPE]: '{broken', 'application/siyuan-file': ids[0] })).rejects.toThrow('笔记本拖拽数据无效');
        await expect(controller.addDroppedReferences({ [NOTEBOOK_DRAG_TYPE]: JSON.stringify({ ids: [ids[0]], workspaceDir: '/other' }), 'application/siyuan-file': ids[0] })).rejects.toThrow('另一个');
        expect(host.getNotebookReference).not.toHaveBeenCalled();
        expect(host.getReference).not.toHaveBeenCalled();
    });

    it('does not add any mixed member if the notebook metadata read fails', async () => {
        controller.activeChat.references.push(reference(ids[2]));
        vi.mocked(host.getNotebookReference!).mockRejectedValue(new Error('fixture notebook no longer exists'));
        await expect(controller.addDroppedReferences({ ...notebooks(ids[0]), ...documents(ids[1]) })).rejects.toThrow('no longer exists');
        expect(host.getReference).toHaveBeenCalledWith(ids[1]);
        expect(controller.activeChat.references.map(referenceKey)).toEqual([ids[2]]);
        expect(host.saveData).not.toHaveBeenCalled();
    });

    it.each(['notebook', 'block'] as const)('rejects a %s response whose kind does not match the typed target', async kind => {
        if (kind === 'notebook') vi.mocked(host.getNotebookReference!).mockResolvedValue(reference(ids[0]));
        else vi.mocked(host.getReference!).mockResolvedValue(notebookReference(ids[0]));
        await expect(controller.addDroppedReferences(kind === 'notebook' ? notebooks(ids[0]) : documents(ids[0]))).rejects.toThrow('不一致');
        expect(controller.activeChat.references).toEqual([]);
        expect(host.saveData).not.toHaveBeenCalled();
    });

    it('checks notebook-reader availability before starting any member of a mixed batch', async () => {
        host.getNotebookReference = undefined;
        await expect(controller.addDroppedReferences({ ...notebooks(ids[0]), ...documents(ids[1]) })).rejects.toThrow('不能读取思源笔记本范围');
        expect(host.getReference).not.toHaveBeenCalled();
        expect(controller.activeChat.references).toEqual([]);
    });

    it('does not attach a pending notebook scope after switching conversations', async () => {
        const original = controller.activeChat;
        const read = deferred<NoteReference>();
        vi.mocked(host.getNotebookReference!).mockReturnValue(read.promise);
        const adding = controller.addDroppedReferences(notebooks(ids[0]));
        const rejected = expect(adding).rejects.toThrow('对话已切换');
        await controller.newChat();
        read.resolve(notebookReference(ids[0])); await rejected;
        expect(original.references).toEqual([]);
        expect(controller.activeChat.references).toEqual([]);
    });

    it('addresses same-ID notebook and document previews and removal by canonical key', async () => {
        controller.activeChat.references.push(notebookReference(ids[0]), reference(ids[0]));
        expect(await controller.previewReference(`notebook:${ids[0]}`)).toEqual(notebookReference(ids[0]));
        expect(await controller.previewReference(ids[0])).toEqual(reference(ids[0]));
        expect(host.getNotebookReference).not.toHaveBeenCalled();
        expect(host.getReference).not.toHaveBeenCalled();
        await controller.removeReference(`notebook:${ids[0]}`);
        expect(controller.activeChat.references.map(referenceKey)).toEqual([ids[0]]);
        await expect(controller.previewReference(`notebook:${ids[0]}`)).rejects.toThrow('已被移除');
        expect(await controller.previewReference(ids[0])).toEqual(reference(ids[0]));
    });

    it('lazily reads a notebook without a snapshot through the notebook reader only', async () => {
        controller.activeChat.references.push({ id: ids[0], title: '旧范围', kind: 'notebook' });
        expect(await controller.previewReference(`notebook:${ids[0]}`)).toEqual(notebookReference(ids[0]));
        expect(host.getNotebookReference).toHaveBeenCalledWith(ids[0]);
        expect(host.getReference).not.toHaveBeenCalled();
        await expect(controller.previewReference(ids[0])).rejects.toThrow('已被移除');
    });

    it('never falls back to a block read for an unavailable or mismatched notebook preview', async () => {
        controller.activeChat.references.push({ id: ids[0], title: '范围', kind: 'notebook' });
        vi.mocked(host.getNotebookReference!).mockResolvedValue(reference(ids[0]));
        await expect(controller.previewReference(`notebook:${ids[0]}`)).rejects.toThrow('不一致');
        host.getNotebookReference = undefined;
        await expect(controller.previewReference(`notebook:${ids[0]}`)).rejects.toThrow('不能读取思源笔记本范围');
        expect(host.getReference).not.toHaveBeenCalled();
    });

    it('keeps notebook scope metadata separate from body snapshots in the model prompt', async () => {
        controller.activeChat.references.push(notebookReference(ids[0]), reference(ids[0]));
        expect(controller.state.settings.mcpEnabled).toBe(false);
        const prompt = buildPrompt('请按需检索这个范围', controller.activeChat.references);
        expect(prompt).toContain(`<notebook-reference id="${ids[0]}"`);
        expect(prompt).toContain(`<note-reference id="${ids[0]}"`);
        expect(prompt).toContain('尚未读取整本正文');
        expect(prompt).toContain('不是文档或块引用');
        expect(prompt).toContain('已连接的思源 MCP 按需检索');
        expect(prompt).toContain('工具不可用时如实说明');
        expect(prompt).toContain('仅笔记本范围元数据');
        expect(prompt).toContain(`正文快照 ${ids[0]}`);
        expect(prompt.match(/<notebook-reference /g)).toHaveLength(1);
        expect(prompt.match(/<note-reference /g)).toHaveLength(1);
    });
});

describe('message attachment snapshots', () => {
    it('preserves a selection source block in its sent snapshot and persisted history', async () => {
        const selection: NoteReference = { id: 'selection-source', sourceId: ids[0], title: '选区来源', kind: 'selection', text: '发送时选区' };
        vi.mocked(host.getSelection).mockResolvedValueOnce(selection);
        await controller.addSelection();
        await controller.send('解释这段选区');
        const message = controller.activeChat.messages[0];
        expect(message.references).toEqual([selection]);
        expect(await controller.previewReference(selection.id, message.id)).toEqual(selection);
        const saved = vi.mocked(host.saveData).mock.calls.at(-1)![1] as any;
        expect(saved.chats[0].messages[0].references[0].sourceId).toBe(ids[0]);
        vi.mocked(host.loadData).mockResolvedValueOnce(saved);
        await controller.initialize();
        expect(controller.activeChat.messages[0].references?.[0].sourceId).toBe(ids[0]);
    });

    it('persists the first message attachments before dispatch, clears the draft and does not repeat them in the next prompt', async () => {
        await controller.addDroppedReferences(documents(ids[0]));
        const draft = controller.activeChat.references[0];
        await controller.connect();
        const client = runtime.clients.at(-1)!;
        client.prompt.mockImplementationOnce(async () => {
            const saved = vi.mocked(host.saveData).mock.calls.at(-1)![1] as any;
            expect(saved.chats[0].references).toEqual([]);
            expect(saved.chats[0].messages[0].references).toEqual([draft]);
            return { messageId: 'first' };
        });
        expect(await controller.send('第一轮使用附件')).toBe(true);
        const first = controller.activeChat.messages[0];
        expect(first.references).toEqual([draft]);
        expect(first.references![0]).not.toBe(draft);
        expect(controller.activeChat.references).toEqual([]);
        draft.text = '发送后改变原对象';
        expect(first.references![0].text).toBe(`正文快照 ${ids[0]}`);
        expect(await controller.send('第二轮继续讨论')).toBe(true);
        expect(client.prompt.mock.calls[0][1][0].text).toContain(`正文快照 ${ids[0]}`);
        expect(client.prompt.mock.calls[1][1][0].text).toBe('第二轮继续讨论');
        expect(controller.activeChat.messages[1]).not.toHaveProperty('references');
        const saved = structuredClone(vi.mocked(host.saveData).mock.calls.at(-1)![1]) as any;
        vi.mocked(host.loadData).mockResolvedValueOnce(saved);
        await controller.initialize();
        expect(controller.activeChat.references).toEqual([]);
        expect(await controller.previewReference(ids[0], first.id)).toEqual(reference(ids[0]));
        expect(host.getReference).toHaveBeenCalledTimes(1);
    });

    it('keeps a later same-ID snapshot independent from the earlier message and its historical preview', async () => {
        await controller.addDroppedReferences(documents(ids[0]));
        await controller.send('旧快照');
        const first = controller.activeChat.messages[0];
        const updated = { ...reference(ids[0]), title: '更新后的标题', text: '新的正文内容' };
        vi.mocked(host.getReference!).mockResolvedValue(updated);
        await controller.addDroppedReferences(documents(ids[0]));
        expect(await controller.previewReference(ids[0])).toEqual(updated);
        const oldPreview = await controller.previewReference(ids[0], first.id);
        expect(oldPreview).toEqual(reference(ids[0]));
        oldPreview.text = '预览返回值被修改';
        await controller.send('新快照');
        const second = controller.activeChat.messages[1];
        expect(await controller.previewReference(ids[0], first.id)).toEqual(reference(ids[0]));
        expect(await controller.previewReference(ids[0], second.id)).toEqual(updated);
        expect(host.getReference).toHaveBeenCalledTimes(2);
    });

    it('addresses sent same-ID notebook and document attachments separately without falling back to the draft', async () => {
        await controller.addDroppedReferences({ ...notebooks(ids[0]), ...documents(ids[0]) });
        await controller.send('使用两种引用');
        const message = controller.activeChat.messages[0];
        expect(message.references?.map(referenceKey)).toEqual([`notebook:${ids[0]}`, ids[0]]);
        controller.activeChat.references.push(reference(ids[1]));
        expect(await controller.previewReference(`notebook:${ids[0]}`, message.id)).toEqual(notebookReference(ids[0]));
        expect(await controller.previewReference(ids[0], message.id)).toEqual(reference(ids[0]));
        await expect(controller.previewReference(ids[1], message.id)).rejects.toThrow('这条消息没有');
        await expect(controller.previewReference(ids[1], 'missing-message')).rejects.toThrow('找不到这条用户消息');
        expect(host.getNotebookReference).toHaveBeenCalledTimes(1);
        expect(host.getReference).toHaveBeenCalledTimes(1);
    });

    it('preserves legacy conversation references as draft attachments without assigning them to old messages', async () => {
        await controller.addDroppedReferences(documents(ids[0]));
        const saved = structuredClone(vi.mocked(host.saveData).mock.calls.at(-1)![1]) as any;
        saved.chats[0].messages = [{ id: 'legacy-user', role: 'user', text: '历史消息', time: 0 }];
        vi.mocked(host.loadData).mockResolvedValueOnce(saved);
        await controller.initialize();
        expect(controller.activeChat.references).toEqual([reference(ids[0])]);
        expect(controller.activeChat.messages[0]).not.toHaveProperty('references');
        await expect(controller.previewReference(ids[0], 'legacy-user')).rejects.toThrow('这条消息没有');
        await controller.send('本次才使用这些附件');
        expect(controller.activeChat.references).toEqual([]);
        expect(controller.activeChat.messages[1].references).toEqual([reference(ids[0])]);
    });

    it('never rereads a missing historical body as if it had been captured when the message was sent', async () => {
        const historical = { id: 'sent-user', role: 'user' as const, text: '旧引用', time: 0,
            references: [{ id: ids[0], title: '发送时没有正文的引用' }] };
        controller.activeChat.messages.push(historical);
        expect(await controller.previewReference(ids[0], historical.id)).toEqual({ ...historical.references[0], text: '' });
        expect(host.getReference).not.toHaveBeenCalled();
        expect(host.getNotebookReference).not.toHaveBeenCalled();
    });

    it('copies only reference metadata into message snapshots and keeps runtime credentials out of saved data', async () => {
        const secret = 'fixture-runtime-token';
        controller.state.settings.mcpToken = secret;
        controller.activeChat.references.push({ ...reference(ids[0]), runtimeToken: secret } as NoteReference);
        await controller.send('仅发送正文快照');
        expect(controller.activeChat.messages[0].references![0]).not.toHaveProperty('runtimeToken');
        for (const [, saved] of vi.mocked(host.saveData).mock.calls) expect(JSON.stringify(saved)).not.toContain(secret);
    });

    it.each(['note', 'selection'] as const)('rejects a late %s read after sending starts instead of overwriting the next draft', async kind => {
        const read = deferred<NoteReference>();
        if (kind === 'note') vi.mocked(host.getCurrentNote).mockReturnValueOnce(read.promise);
        else vi.mocked(host.getSelection).mockReturnValueOnce(read.promise);
        const adding = kind === 'note' ? controller.addCurrentNote() : controller.addSelection();
        const rejected = expect(adding).rejects.toThrow('请等本轮结束');
        await controller.connect();
        const client = runtime.clients.at(-1)!;
        const entered = deferred<void>(), completed = deferred<Record<string, never>>();
        client.request.mockImplementationOnce(async () => { entered.resolve(); return completed.promise; });
        const sending = controller.send('先发送本轮');
        try {
            await entered.promise;
            read.resolve(reference(ids[0]));
            await rejected;
            expect(controller.activeChat.references).toEqual([]);
            expect(controller.activeChat.messages[0]).not.toHaveProperty('references');
        } finally { completed.resolve({}); await sending; }
    });

    it.each(['note', 'selection'] as const)('rejects a late %s read after switching conversations', async kind => {
        const read = deferred<NoteReference>();
        if (kind === 'note') vi.mocked(host.getCurrentNote).mockReturnValueOnce(read.promise);
        else vi.mocked(host.getSelection).mockReturnValueOnce(read.promise);
        const original = controller.activeChat;
        const adding = kind === 'note' ? controller.addCurrentNote() : controller.addSelection();
        const rejected = expect(adding).rejects.toThrow('对话已切换');
        await controller.newChat();
        read.resolve(reference(ids[0]));
        await rejected;
        expect(original.references).toEqual([]);
        expect(controller.activeChat.references).toEqual([]);
    });
});
