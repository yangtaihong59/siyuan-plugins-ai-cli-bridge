<script lang="ts">
    import { afterUpdate, onDestroy } from "svelte";
    import Message from "./Message.svelte";
    import Settings from "./Settings.svelte";
    import Activity from "./Activity.svelte";
    import { groupAssistantActivity, activityPresentation } from "./activity";
    import type { DisplayDetail } from "../types";
    import Icon from "./Icon.svelte";
    import ReferencePreview from "./ReferencePreview.svelte";
    import { referenceDropZone } from "./reference-drop";
    import { referenceKey } from "../references";

    export let controller: any;
    export let state: any;
    export let webPanel: { url: string; onOpen: (url: string) => Promise<void> | void } | undefined = undefined;

    let tab: "chat" | "settings" = "chat";
    export function openSettings() { tab = "settings"; }
    let draft = "";
    let localError = "";
    let notice = "";
    let pending = "";
    let composing = false;
    let dropActive = false;
    let headerActionsNear = false;
    let headerActionsElement: HTMLDivElement | undefined;
    let historyOpen = false;
    let attachOpen = false;
    let modelOpen = false;
    let deleteConfirm = "";
    let settings: any = {};
    let settingsSource = "";
    let settingsFieldsSource = "";
    let displaySaving = false;
    let messagesElement: HTMLDivElement;
    let inputElement: HTMLTextAreaElement;
    let historyElement: HTMLDetailsElement;
    let attachElement: HTMLDetailsElement;
    let modelElement: HTMLDivElement;
    let followTail = true;
    let lastDraft = "";
    let noticeTimer: ReturnType<typeof setTimeout>;

    $: if (state?.settings && settingsSource !== JSON.stringify(state.settings)) {
        const { displayDetail, ...fields } = state.settings;
        const fieldsSource = JSON.stringify(fields);
        settings = settingsSource && fieldsSource === settingsFieldsSource
            ? { ...settings, displayDetail }
            : { ...state.settings };
        settingsSource = JSON.stringify(state.settings);
        settingsFieldsSource = fieldsSource;
    }
    $: chat = state?.chats?.find((item: any) => item.id === state.activeChatId);
    $: messages = chat?.messages ?? [];
    $: references = chat?.references ?? [];
    $: error = localError || state?.error || "";
    $: busy = Boolean(state?.busy);
    $: connected = Boolean(state?.connected);
    $: displayDetail = (state?.settings?.displayDetail || "full") as DisplayDetail;
    $: activityByMessage = groupAssistantActivity(messages, busy);
    $: compactStatusVisible = displayDetail === "compact" && activityByMessage.get(messages.at(-1)?.id)?.hasProcess;
    $: hasSettingsChanges = JSON.stringify(settings) !== JSON.stringify(state?.settings ?? {});
    $: models = state?.models ?? [];
    $: currentModel = models.find((item: any) => item.provider === state?.settings?.provider && item.id === state?.settings?.model);
    $: modelName = currentModel?.name || state?.settings?.model || "选择模型";
    $: nativeReferenceHover = typeof window !== "undefined" && Boolean((window as any).siyuan?.config);
    $: hasStreamingMessage = messages.some((message: any) => message.streaming);
    $: if (!historyOpen) deleteConfirm = "";
    $: if (tab !== "chat") headerActionsNear = false;

    afterUpdate(() => {
        if (followTail && messagesElement) messagesElement.scrollTop = messagesElement.scrollHeight;
        if (inputElement && draft !== lastDraft) { resizeInput(); lastDraft = draft; }
    });
    onDestroy(() => clearTimeout(noticeTimer));

    function closeOutside(event: MouseEvent) {
        const target = event.target as Node;
        if (historyElement && !historyElement.contains(target)) historyOpen = false;
        if (attachElement && !attachElement.contains(target)) attachOpen = false;
        if (modelElement && !modelElement.contains(target)) modelOpen = false;
    }

    function resizeInput() {
        if (!inputElement) return;
        inputElement.style.height = "auto";
        inputElement.style.height = `${Math.min(192, Math.max(36, inputElement.scrollHeight))}px`;
    }

    function flash(text: string) {
        notice = text;
        clearTimeout(noticeTimer);
        noticeTimer = setTimeout(() => { notice = ""; }, 3000);
    }

    async function run(name: string, action: () => any, success = "") {
        localError = "";
        pending = name;
        try {
            await action();
            if (success) flash(success);
            return true;
        } catch (cause) {
            localError = cause instanceof Error ? cause.message : String(cause);
            return false;
        } finally {
            if (pending === name) pending = "";
        }
    }

    async function send() {
        const text = draft.trim();
        if (!text || busy || pending) return;
        draft = "";
        attachOpen = false;
        modelOpen = false;
        followTail = true;
        const result = await run("send", () => controller.send(text));
        if (!result && !draft) draft = text;
    }

    function keydown(event: KeyboardEvent) {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing && !composing && event.keyCode !== 229) {
            event.preventDefault();
            void send();
        }
    }

    async function save(connectAfter = false) {
        if (!hasSettingsChanges) {
            if (connectAfter) await run("connect", () => controller.connect(), "连接正常");
            return;
        }
        let args: unknown;
        try { args = JSON.parse(settings.argsText || "[]"); }
        catch { localError = "启动参数需要是 JSON 字符串数组，例如 [\"--flag\"]。"; return; }
        if (!Array.isArray(args) || args.some(item => typeof item !== "string")) {
            localError = "启动参数必须是 JSON 字符串数组。";
            return;
        }
        const saved = await run("save", () => controller.saveSettings({ ...settings }), "设置已保存");
        if (saved && connectAfter) await run("connect", () => controller.connect(), "连接正常");
    }

    async function setDisplayDetail(detail: DisplayDetail) {
        if (displaySaving) return;
        displaySaving = true;
        localError = "";
        try { await controller.setDisplayDetail(detail); }
        catch (cause) { localError = cause instanceof Error ? cause.message : String(cause); }
        finally { displaySaving = false; }
    }

    function onScroll() {
        if (messagesElement) followTail = messagesElement.scrollHeight - messagesElement.scrollTop - messagesElement.clientHeight < 72;
    }

    async function selectChat(event: Event) {
        const id = (event.currentTarget as HTMLSelectElement).value;
        if (!id) return;
        followTail = true;
        deleteConfirm = "";
        const selected = await run("select", () => controller.selectChat(id));
        if (selected) historyOpen = false;
    }

    async function deleteChat() {
        const id = chat?.id;
        if (!id) return;
        if (deleteConfirm !== id) { deleteConfirm = id; return; }
        const deleted = await run("delete", () => controller.deleteChat(id));
        if (deleted) { deleteConfirm = ""; historyOpen = false; }
    }

    async function addReference(selection = false) {
        attachOpen = false;
        await run(selection ? "selection" : "note", () => selection ? controller.addSelection() : controller.addCurrentNote(), selection ? "已加入选区" : "已加入当前笔记");
    }

    function toggleModels() {
        modelOpen = !modelOpen;
        attachOpen = false;
        historyOpen = false;
        if (modelOpen && !models.length && !state?.modelsLoading) void run("models", () => controller.refreshModels());
    }

    async function chooseModel(model: any) {
        if (busy || pending) return;
        const effort = state?.settings?.reasoningEffort || "";
        const preservedEffort = !effort || model.reasoning?.includes(effort) ? effort : "";
        const selected = await run("model", () => controller.selectModel(model.provider, model.id, preservedEffort));
        if (selected) modelOpen = false;
    }

    async function chooseReasoning(event: Event) {
        const effort = (event.currentTarget as HTMLSelectElement).value;
        await run("model", () => controller.selectModel(state.settings.provider, state.settings.model, effort));
    }

    async function chooseCwd() {
        await run("directory", async () => {
            const directory = await controller.chooseWorkingDirectory();
            if (directory) settings = { ...settings, cwd: directory };
        });
    }

    function updateHeaderActions(event: PointerEvent) {
        if (!headerActionsElement || event.pointerType === "touch") { headerActionsNear = false; return; }
        const rect = headerActionsElement.getBoundingClientRect();
        const dx = Math.max(rect.left - event.clientX, 0, event.clientX - rect.right);
        const dy = Math.max(rect.top - event.clientY, 0, event.clientY - rect.bottom);
        const near = dx * dx + dy * dy <= 96 * 96;
        if (near !== headerActionsNear) headerActionsNear = near;
    }

    async function dropReferences(data: Record<string, string>) {
        tab = "chat";
        attachOpen = false; historyOpen = false; modelOpen = false;
        await run("drop", () => controller.addDroppedReferences(data));
    }

    async function writeToNote(text: string) {
        await run("write", async () => {
            const written = await controller.writeToNote(text);
            flash(written ? "已写入笔记" : "已取消写入");
        });
    }
</script>

<svelte:window on:click={closeOutside} on:keydown={event => { if (event.key === "Escape") { historyOpen = false; attachOpen = false; modelOpen = false; } }} />

<div class="dsh-app" role="region" aria-label="DeepSeek Harness 侧栏" on:pointermove={updateHeaderActions} on:pointerleave={() => headerActionsNear = false} on:pointercancel={() => headerActionsNear = false} use:referenceDropZone={{ enabled: !busy && !pending, active: value => dropActive = value, drop: dropReferences }}>
    <header class="app-header">
        {#if tab === "chat"}
            <details class="history-menu" bind:open={historyOpen} bind:this={historyElement}>
                <summary class="conversation-title" title="切换对话"><span class="status-dot" class:online={connected} class:working={busy} title={busy ? "正在生成" : connected ? "Harness 已连接" : "发送时自动连接 Harness"}></span><span>{chat?.title || "新对话"}</span><Icon name="chevron" size={14} /></summary>
                <div class="history-popover">
                    <div class="popover-label">对话记录</div>
                    <label class="sr-only" for="dsh-chat-select">聊天记录</label>
                    <select id="dsh-chat-select" value={state?.activeChatId ?? ""} size={Math.min(6, Math.max(2, state?.chats?.length || 1))} on:change={selectChat} disabled={busy || !!pending}>
                        {#if !state?.chats?.length}<option value="">新对话</option>{/if}
                        {#each state?.chats ?? [] as item (item.id)}<option value={item.id}>{item.title || "新对话"}</option>{/each}
                    </select>
                    <div class="history-footer">
                        {#if deleteConfirm === chat?.id}<span>删除这个对话？</span><button class="cancel-delete" on:click={() => deleteConfirm = ""}>取消</button>{/if}
                        <button class="delete-chat" disabled={busy || !!pending || !chat} on:click={deleteChat}><Icon name="trash" size={14} />{deleteConfirm === chat?.id ? "确认删除" : "删除当前对话"}</button>
                    </div>
                </div>
            </details>
            <div class="header-actions" class:actions-near={headerActionsNear} bind:this={headerActionsElement}><button class="icon-button" title="新对话" aria-label="新建聊天" disabled={busy || !!pending} on:click={() => { historyOpen = false; followTail = true; void run("new", () => controller.newChat()); }}><Icon name="new" /></button><button class="icon-button" title="设置" aria-label="打开设置" on:click={() => { historyOpen = false; modelOpen = false; tab = "settings"; }}><Icon name="settings" size={20} /></button></div>
        {:else}
            <button class="settings-back" on:click={() => tab = "chat"}><Icon name="back" size={17} /><span>设置</span></button>
            <button class="icon-button" title="返回对话" aria-label="关闭设置" on:click={() => tab = "chat"}><Icon name="close" size={17} /></button>
        {/if}
    </header>

    {#if error}<div class="feedback error" role="alert"><span>{error}</span><button class="text-button" on:click={() => { tab = "settings"; void run("diagnose", () => controller.diagnose()); }}>诊断</button></div>{/if}
    {#if notice}<div class="notice" role="status">{notice}</div>{/if}

    {#if tab === "chat"}
        <div class="messages" bind:this={messagesElement} on:scroll={onScroll} role="log" aria-label="聊天内容" aria-busy={busy}>
            <div class="conversation">
                {#if !messages.length}
                    <section class="welcome"><h2>有什么想法？</h2><p>从一段笔记，或一个问题开始。</p></section>
                {:else}
                    {#each messages as message (message.id)}
                        {@const group = activityByMessage.get(message.id)}
                        {@const grouped = group ? activityPresentation(displayDetail, group).grouped : false}
                        {@const showActivity = group && (grouped ? group.hasProcess && group.id === message.id : Boolean(message.reasoning || message.tools?.length))}
                        {#if message.role !== "assistant" || message.text || showActivity || message.interrupted && !grouped || message.streaming && !grouped}
                            <article class="message" class:user={message.role === "user"} class:system={message.role === "system"} class:streaming={message.streaming} class:activity={message.role === "assistant" && !message.text}>
                                {#if message.role === "assistant"}
                                    {#if showActivity}<Activity {group} {message} detail={displayDetail} on:copy={event => run("copy", () => controller.copyMessage(event.detail), "已复制代码")} />{/if}
                                    {#if message.text}<div class="assistant-body"><Message text={message.text} streaming={Boolean(message.streaming)} on:copy={event => run("copy", () => controller.copyMessage(event.detail), "已复制代码")} /></div>
                                    {:else if message.streaming && !grouped && !message.reasoning && !message.tools?.length}<div class="thinking-placeholder" role="status"><span class="activity-dot"></span><span>思考中</span></div>{/if}
                                    {#if message.interrupted && (!grouped || message.text)}<div class="interrupted">已停止</div>{/if}
                                {:else}<div class="message-text">{message.text}</div>{/if}
                                {#if message.text && !message.streaming}
                                    <div class="message-actions"><button title="复制" aria-label="复制消息" on:click={() => run("copy", () => controller.copyMessage(message.text), "已复制")}><Icon name="copy" size={15} /></button>{#if message.role === "assistant"}<button title="写入笔记" aria-label="写入笔记" disabled={busy || !!pending} on:click={() => writeToNote(message.text)}><Icon name="write" size={15} /></button>{/if}</div>
                                {/if}
                            </article>
                        {/if}
                    {/each}
                {/if}
                {#if busy && !hasStreamingMessage && !compactStatusVisible}<div class="thinking-placeholder" role="status"><span class="activity-dot"></span><span>{state?.status || "正在连接…"}</span></div>{/if}
            </div>
        </div>

        <section class="composer" aria-label="发送消息">
            <div class="composer-box" class:drop-active={dropActive} role="group" aria-label="消息与笔记引用">
                {#if references.length}
                    <div class="references" aria-label="本轮引用">
                        {#each references as reference (referenceKey(reference))}<ReferencePreview {reference} {controller} busy={busy || !!pending} nativeHover={nativeReferenceHover} on:remove={event => run("reference", () => controller.removeReference(event.detail))} />{/each}
                    </div>
                {/if}
                <label class="sr-only" for="dsh-message">消息内容</label>
                <textarea id="dsh-message" bind:this={inputElement} bind:value={draft} on:input={resizeInput} on:keydown={keydown} on:compositionstart={() => composing = true} on:compositionend={() => composing = false} rows="1" placeholder="发送消息…" disabled={busy} spellcheck="false"></textarea>
                <div class="composer-controls">
                    <div class="composer-left">
                        <details class="attach-menu" bind:open={attachOpen} bind:this={attachElement}>
                            <summary class="attach-button" title="添加笔记或选区" aria-label="添加上下文"><Icon name="plus" size={18} /></summary>
                            <div class="attach-popover"><button disabled={busy || !!pending} on:click={() => addReference()}><Icon name="note" size={15} /><span>当前笔记</span></button><button disabled={busy || !!pending} on:click={() => addReference(true)}><Icon name="selection" size={15} /><span>当前选区</span></button></div>
                        </details>
                        <div class="model-menu" bind:this={modelElement}>
                            <button class="model-pill" class:active={modelOpen} title="选择模型" aria-haspopup="listbox" aria-expanded={modelOpen} disabled={busy || (!!pending && pending !== "models")} on:click={toggleModels}><span>{modelName}</span><Icon name="chevron" size={12} /></button>
                            {#if modelOpen}
                                <div class="model-popover">
                                    <div class="model-menu-header"><span>模型</span><button class="model-refresh" disabled={state?.modelsLoading || !!pending} on:click={() => run("models", () => controller.refreshModels())}>{state?.modelsLoading ? "刷新中…" : "刷新"}</button></div>
                                    {#if state?.modelsLoading && !models.length}
                                        <p class="model-empty" role="status">正在读取 Harness 模型…</p>
                                    {:else if state?.modelsError}
                                        <p class="model-error" role="alert">{state.modelsError}</p>
                                    {/if}
                                    {#if models.length}
                                        <div class="model-options" role="listbox" aria-label="可用模型">
                                            {#each models as model (`${model.provider}/${model.id}`)}
                                                <button class="model-option" class:selected={model.provider === state?.settings?.provider && model.id === state?.settings?.model} role="option" aria-selected={model.provider === state?.settings?.provider && model.id === state?.settings?.model} disabled={!!pending || busy} on:click={() => chooseModel(model)}>
                                                    <span class="model-info"><span class="model-label">{model.name || model.id}</span><span class="model-provider">{model.providerName || model.provider}</span></span>
                                                    {#if model.provider === state?.settings?.provider && model.id === state?.settings?.model}<Icon name="check" size={15} />{/if}
                                                </button>
                                            {/each}
                                        </div>
                                    {:else if !state?.modelsLoading && !state?.modelsError}
                                        <p class="model-empty">暂无可用模型，请先在 Harness 中配置模型或登录账号。</p>
                                    {/if}
                                    {#if currentModel?.reasoning?.length}
                                        <label class="reasoning-choice"><span>思考强度</span><select aria-label="思考强度" value={state?.settings?.reasoningEffort || ""} disabled={busy || !!pending} on:change={chooseReasoning}><option value="">默认</option>{#each currentModel.reasoning as effort}<option value={effort}>{{ off: "关闭", low: "低", high: "高", max: "最大" }[effort] || effort}</option>{/each}</select></label>
                                    {/if}
                                    <button class="model-settings" on:click={() => { modelOpen = false; tab = "settings"; }}>连接设置<Icon name="chevron" size={12} /></button>
                                </div>
                            {/if}
                        </div>
                    </div>
                    {#if busy}<button class="send-button stop-button" title="停止生成" aria-label="停止生成" disabled={pending === "stop"} on:click={() => run("stop", () => controller.stop())}><Icon name="stop" size={19} /></button>
                    {:else}<button class="send-button" title="发送（Enter）" aria-label="发送消息" disabled={!draft.trim() || !!pending} on:click={send}><Icon name="send" size={19} /></button>{/if}
                </div>
            </div>
            {#if busy}<p class="composer-hint">正在生成，点击停止以保留当前内容</p>{/if}
        </section>
    {:else}
        <Settings bind:settings {state} {pending} {busy} {displaySaving} {webPanel} changed={hasSettingsChanges} on:displayDetail={event => setDisplayDetail(event.detail)} on:save={() => save()} on:chooseCwd={chooseCwd} on:connect={() => save(true)} on:diagnose={() => run("diagnose", () => controller.diagnose())} on:disconnect={() => run("disconnect", () => controller.disconnect())} on:openWeb={event => { if (!busy && !pending && webPanel) void run("web", () => webPanel?.onOpen(event.detail)); }} />
    {/if}
</div>

<style>
    .dsh-app { --dsh-border: var(--b3-border-color, #e7e8ec); --dsh-bg: var(--b3-theme-background, #fff); --dsh-surface: var(--b3-theme-surface, #f5f6f8); --dsh-text: var(--b3-theme-on-background, #25262b); --dsh-muted: var(--b3-theme-on-surface, #888b96); --dsh-accent: var(--b3-theme-primary, #4176e6); --dsh-bubble: var(--b3-theme-surface, #edf3fe); position: relative; display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--dsh-bg); color: var(--dsh-text); font-family: var(--b3-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif); font-size: 13px; line-height: 1.5; }
    .dsh-app, .dsh-app * { box-sizing: border-box; }
    button, textarea, select { font: inherit; }
    button { display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 7px; color: inherit; background: transparent; cursor: pointer; line-height: 1.4; }
    button:disabled { opacity: .4; cursor: not-allowed; }
    button:not(:disabled):hover { background: var(--dsh-surface); }
    button:focus-visible, textarea:focus-visible, select:focus-visible, summary:focus-visible { outline: 2px solid var(--dsh-accent); outline-offset: 2px; }
    .app-header { position: relative; z-index: 3; display: flex; align-items: center; justify-content: space-between; min-height: 50px; padding: 8px 12px; gap: 8px; }
    .header-actions { display: flex; flex-shrink: 0; gap: 3px; }
    .icon-button { width: 30px; height: 30px; color: var(--dsh-muted); }
    .header-actions .icon-button { opacity: .75; transition: color .18s, opacity .18s; }
    .header-actions.actions-near .icon-button:not(:disabled), .header-actions:focus-within .icon-button:not(:disabled), .header-actions .icon-button:hover:not(:disabled) { color: var(--dsh-text); opacity: 1; }
    .header-actions .icon-button:disabled { opacity: .3; }
    .history-menu { min-width: 0; }
    summary { cursor: pointer; user-select: none; list-style: none; }
    summary::-webkit-details-marker { display: none; }
    .conversation-title { display: flex; align-items: center; gap: 7px; min-width: 0; max-width: 100%; height: 30px; padding: 0 5px; font-size: 12px; font-weight: 550; border-radius: 6px; }
    .conversation-title:hover { background: var(--dsh-surface); }
    .conversation-title > span:nth-child(2) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 210px; }
    .conversation-title :global(svg) { flex-shrink: 0; color: var(--dsh-muted); }
    .status-dot { flex: 0 0 5px; width: 5px; height: 5px; border-radius: 50%; background: var(--dsh-muted); opacity: .4; }
    .status-dot.online { background: var(--b3-card-success-color, #40a483); opacity: .85; }
    .status-dot.working { background: var(--dsh-accent); animation: pulse 1.4s ease-in-out infinite; opacity: 1; }
    .history-popover { position: absolute; left: 12px; top: 44px; width: calc(100% - 24px); max-width: 360px; padding: 8px; border: 1px solid var(--dsh-border); border-radius: 11px; background: var(--dsh-bg); box-shadow: 0 8px 32px #00000014; }
    .popover-label { padding: 3px 6px 8px; color: var(--dsh-muted); font-size: 10px; }
    .history-popover select { display: block; width: 100%; min-width: 0; padding: 0; border: 0; outline: 0; background: var(--dsh-bg); color: var(--dsh-text); font-size: 12px; }
    .history-popover option { padding: 8px; border-radius: 5px; overflow: hidden; text-overflow: ellipsis; }
    .history-popover option:checked { color: var(--dsh-accent); background: var(--dsh-surface) linear-gradient(0deg, var(--dsh-surface), var(--dsh-surface)); }
    .history-footer { display: flex; justify-content: flex-end; align-items: center; flex-wrap: wrap; gap: 5px; margin-top: 7px; padding-top: 7px; border-top: 1px solid var(--dsh-border); }
    .history-footer > span { flex: 1; color: var(--dsh-muted); font-size: 11px; }
    .history-footer button { gap: 5px; font-size: 10px; padding: 6px; }
    .delete-chat { color: var(--b3-card-error-color, #bc5a54); }
    .cancel-delete { color: var(--dsh-muted); }
    .settings-back { gap: 6px; padding: 5px 3px; font-size: 13px; font-weight: 550; }
    .feedback { display: flex; align-items: flex-start; gap: 7px; margin: 0 16px 6px; padding: 9px 11px; border-radius: 8px; font-size: 11px; overflow-wrap: anywhere; }
    .feedback span { flex: 1; min-width: 0; }
    .error { color: var(--b3-card-error-color, #b2413d); background: var(--b3-card-error-background, #fff3f1); }
    .text-button { flex-shrink: 0; padding: 0 3px; color: inherit; font-size: 11px; }
    .notice { position: absolute; top: 51px; left: 50%; z-index: 5; transform: translateX(-50%); max-width: calc(100% - 32px); padding: 7px 12px; border: 1px solid var(--dsh-border); border-radius: 20px; background: var(--dsh-bg); color: var(--dsh-muted); box-shadow: 0 3px 15px #0000000a; font-size: 11px; white-space: nowrap; }
    .messages { flex: 1; min-height: 80px; overflow-y: auto; overscroll-behavior: contain; }
    .conversation { display: flex; flex-direction: column; width: min(calc(100% - 32px), 920px); min-height: 100%; margin: 0 auto; padding: 12px 0 24px; }
    .welcome { display: flex; flex: 1; flex-direction: column; justify-content: center; align-items: center; padding: 28px 0 45px; text-align: center; }
    .welcome h2 { margin: 0 0 9px; color: var(--dsh-text); font-size: 23px; font-weight: 550; letter-spacing: -.5px; }
    .welcome p { margin: 0; color: var(--dsh-muted); font-size: 12px; }
    .message { position: relative; min-width: 0; margin: 0 0 26px; padding: 0; user-select: text; }
    .message.activity { margin-bottom: 8px; }
    .message.user { display: flex; flex-direction: column; align-items: flex-end; align-self: flex-end; max-width: 82%; margin-bottom: 24px; }
    .message-text { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 14px; line-height: 24px; }
    .user .message-text { max-width: 100%; padding: 10px 16px; border-radius: 20px; background: var(--dsh-bubble); line-height: 22px; }
    .system .message-text { color: var(--dsh-muted); font-size: 11px; }
    .assistant-body { min-width: 0; overflow-wrap: anywhere; }
    .assistant-body:not(:first-child) { margin-top: 12px; }
    .message-actions { display: flex; align-items: center; gap: 3px; min-height: 27px; margin: 5px 0 -13px; opacity: 0; transition: opacity .12s; }
    .message:hover .message-actions, .message:focus-within .message-actions { opacity: 1; }
    .message-actions button { width: 27px; height: 25px; color: var(--dsh-muted); }
    .thinking-placeholder { display: flex; align-items: center; gap: 7px; min-height: 24px; color: var(--dsh-muted); font-size: 11px; }
    .activity-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--dsh-accent); animation: pulse 1.2s ease-in-out infinite; }
    .interrupted { color: var(--dsh-muted); font-size: 10px; margin-top: 8px; }
    .composer { flex: 0 0 auto; width: min(calc(100% - 16px), 952px); margin: 0 auto; padding: 8px 0; }
    .composer-box { position: relative; border: 1px solid var(--dsh-border); border-radius: 28px; padding: 10px 14px 9px; background: var(--dsh-bg); transition: border-color .15s, background-color .15s; }
    .composer-box:focus-within { border-color: color-mix(in srgb, var(--dsh-accent) 45%, var(--dsh-border)); }
    .composer-box.drop-active { border-color: var(--dsh-accent); background: color-mix(in srgb, var(--dsh-bg) 94%, var(--dsh-accent)); box-shadow: 0 0 0 1px var(--dsh-accent); }
    .composer textarea { display: block; width: 100%; height: 36px; min-height: 36px; max-height: 192px; margin: 0; padding: 4px 3px 8px; resize: none; border: 0; outline: none; background: transparent; color: var(--dsh-text); font-size: 14px; line-height: 24px; }
    .composer textarea:focus-visible { outline: none; }
    .composer textarea::placeholder { color: var(--dsh-muted); opacity: .85; }
    .composer-controls { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 4px; }
    .composer-left { display: flex; align-items: center; min-width: 0; gap: 8px; }
    .attach-menu { position: relative; flex-shrink: 0; }
    .attach-button { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; color: var(--dsh-muted); }
    .attach-button:hover, .attach-menu[open] .attach-button { color: var(--dsh-text); background: var(--dsh-bg); }
    .attach-popover { position: absolute; bottom: 37px; left: -3px; z-index: 4; width: 150px; padding: 5px; border: 1px solid var(--dsh-border); border-radius: 10px; background: var(--dsh-bg); box-shadow: 0 6px 24px #00000012; }
    .attach-popover button { justify-content: flex-start; gap: 8px; width: 100%; padding: 9px; font-size: 11px; }
    .model-pill { min-width: 0; height: 28px; gap: 5px; padding: 0 8px; color: var(--dsh-muted); font-size: 13px; border-radius: 14px; }
    .model-pill span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px; }
    .model-pill:hover:not(:disabled) { color: var(--dsh-text); background: var(--dsh-bg); }
    .model-menu { min-width: 0; }
    .model-pill.active { color: var(--dsh-text); background: var(--dsh-surface); }
    .model-popover { position: absolute; bottom: 51px; left: 8px; z-index: 6; width: 280px; max-width: calc(100% - 16px); padding: 6px; border: 1px solid var(--dsh-border); border-radius: 16px; background: var(--dsh-bg); box-shadow: 0 8px 30px #00000018; }
    .model-menu-header { display: flex; align-items: center; justify-content: space-between; min-height: 28px; padding: 0 9px 4px; color: var(--dsh-muted); font-size: 11px; }
    .model-refresh { padding: 4px 5px; color: var(--dsh-muted); font-size: 11px; }
    .model-options { max-height: min(300px, 45vh); overflow-y: auto; padding: 2px; }
    .model-option { display: flex; justify-content: space-between; gap: 10px; width: 100%; padding: 9px 10px; border-radius: 9px; text-align: left; }
    .model-option.selected { color: var(--dsh-accent); background: var(--dsh-surface); }
    .model-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .model-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; line-height: 20px; }
    .model-provider { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsh-muted); font-size: 10px; line-height: 16px; }
    .model-empty, .model-error { margin: 4px; padding: 10px 9px 14px; font-size: 12px; line-height: 20px; color: var(--dsh-muted); overflow-wrap: anywhere; }
    .model-error { color: var(--b3-card-error-color, #b2413d); }
    .reasoning-choice { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 10px 6px; border-top: 1px solid var(--dsh-border); color: var(--dsh-muted); font-size: 11px; }
    .reasoning-choice select { max-width: 55%; border: 1px solid var(--dsh-border); border-radius: 6px; padding: 4px 6px; background: var(--dsh-bg); color: var(--dsh-text); font-size: 11px; }
    .model-settings { justify-content: space-between; width: calc(100% - 8px); margin: 5px 4px 0; padding: 9px 6px 5px; border-top: 1px solid var(--dsh-border); border-radius: 0; color: var(--dsh-muted); font-size: 11px; }
    button.send-button { flex: 0 0 34px; width: 34px; height: 34px; padding: 0; border-radius: 50%; color: var(--b3-theme-on-primary, #fff); background: var(--dsh-accent); }
    button.send-button:hover:not(:disabled) { background: var(--dsh-accent); filter: brightness(1.06); }
    button.send-button:disabled { color: var(--dsh-bg); background: var(--dsh-muted); opacity: .3; }
    button.stop-button { color: var(--dsh-text); background: var(--dsh-bg); border: 1px solid var(--dsh-border); }
    button.stop-button:hover:not(:disabled) { background: var(--dsh-bg); }
    .references { display: flex; flex-wrap: wrap; gap: 5px; max-height: 86px; padding-bottom: 7px; overflow-y: auto; }
    .composer-hint { min-height: 23px; margin: 0; padding: 6px 2px 4px; text-align: center; color: var(--dsh-muted); font-size: 9px; opacity: .7; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
    @keyframes pulse { 0%, 100% { opacity: .3; } 50% { opacity: 1; } }
    @media (hover: none) { .message-actions { opacity: 1; } .header-actions .icon-button:not(:disabled) { color: var(--dsh-text); opacity: 1; } }
    @media (max-width: 280px) { .app-header { padding-inline: 8px; } .conversation-title > span:nth-child(2) { max-width: 130px; } .conversation { width: calc(100% - 24px); } .composer-box { padding-inline: 8px; } .model-pill { padding-inline: 4px; } .model-pill span { max-width: 135px; } .composer-left { gap: 3px; } .message.user { max-width: 88%; } }
    @media (prefers-reduced-motion: reduce) { .status-dot.working, .activity-dot { animation: none; } }
</style>
