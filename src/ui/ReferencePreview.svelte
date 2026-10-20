<script lang="ts">
    import { createEventDispatcher, onDestroy } from "svelte";
    import Icon from "./Icon.svelte";
    import Message from "./Message.svelte";
    import { isSiYuanId, referenceKey } from "../references";

    export let reference: any;
    export let controller: any;
    export let busy = false;
    export let nativeHover = false;
    const dispatch = createEventDispatcher<{ remove: string }>();
    let element: HTMLDivElement;
    let anchor: HTMLButtonElement;
    let open = false;
    let loading = false;
    let error = "";
    let preview: any = null;
    let placement = "";
    let enterTimer: ReturnType<typeof setTimeout>;
    let leaveTimer: ReturnType<typeof setTimeout>;
    let loadId = 0;
    $: referenceIdentity = referenceKey(reference);
    $: notebook = reference?.kind === "notebook";
    $: referenceLabel = notebook ? `笔记本 · ${reference.title || "未命名"}` : reference.title || "笔记选区";
    $: native = nativeHover && !notebook && reference?.kind !== "selection" && isSiYuanId(reference?.id || "");
    $: previewText = String(preview?.text || "");
    $: truncated = Boolean(preview?.truncated || previewText.length > 1600);

    onDestroy(() => { clearTimeout(enterTimer); clearTimeout(leaveTimer); loadId++; });

    function hide() {
        clearTimeout(enterTimer); clearTimeout(leaveTimer);
        open = false;
        loadId++;
    }
    function cancelClose() { clearTimeout(leaveTimer); }
    function leave() {
        clearTimeout(enterTimer);
        leaveTimer = setTimeout(hide, 150);
    }
    function hover() {
        cancelClose();
        if (native || open) return;
        clearTimeout(enterTimer);
        enterTimer = setTimeout(show, 150);
    }
    function focusOut(event: FocusEvent) {
        if (!element?.contains(event.relatedTarget as Node)) leave();
    }
    function scroll(event: Event) {
        if (!element?.contains(event.target as Node)) hide();
    }
    function outside(event: MouseEvent) {
        if (open && !element?.contains(event.target as Node)) hide();
    }
    function position() {
        const rect = anchor.getBoundingClientRect();
        const panel = element.closest(".dsh-app")?.getBoundingClientRect() || { left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight, width: window.innerWidth };
        const width = Math.max(0, Math.min(320, panel.width - 24));
        const left = Math.max(panel.left + 12, Math.min(rect.left, panel.right - width - 12));
        const above = rect.top - panel.top - 16;
        placement = above >= 120
            ? `left:${left}px;bottom:${window.innerHeight - rect.top + 8}px;width:${width}px;max-height:${Math.min(300, above)}px`
            : `left:${left}px;top:${rect.bottom + 8}px;width:${width}px;max-height:${Math.max(90, Math.min(300, panel.bottom - rect.bottom - 16))}px`;
    }
    async function show() {
        if (native || !anchor) return;
        clearTimeout(enterTimer); clearTimeout(leaveTimer);
        position(); open = true; loading = true; error = "";
        const current = ++loadId;
        try {
            const result = await controller.previewReference(referenceIdentity);
            if (current !== loadId) return;
            preview = result;
        } catch (cause) {
            if (current !== loadId) return;
            error = cause instanceof Error ? cause.message : String(cause);
        } finally { if (current === loadId) loading = false; }
    }
</script>

<svelte:window on:click={outside} on:resize={hide} on:scroll|capture={scroll} on:keydown={event => { if (event.key === "Escape") hide(); }} />

<div class="reference" role="group" aria-label={`引用：${referenceLabel}`} bind:this={element} on:mouseenter={cancelClose} on:mouseleave={leave} on:focusout={focusOut}>
    <button class="reference-open" bind:this={anchor} aria-label={`预览：${referenceLabel}`} aria-expanded={native ? undefined : open} data-type={native ? "block-ref" : undefined} data-id={native ? reference.id : undefined} data-subtype={native ? "d" : undefined} on:mouseenter={hover} on:focus={hover} on:click={() => { if (!native) void show(); }}><Icon name={notebook ? "notebook" : "note"} size={13} /><span class="reference-title">{referenceLabel}</span></button>
    <button class="reference-remove" aria-label={`移除引用：${referenceLabel}`} disabled={busy} on:click={() => dispatch("remove", referenceIdentity)}><Icon name="close" size={12} /></button>
    {#if open}
        <div class="reference-preview" style={placement} role="region" aria-label={`引用预览：${referenceLabel}`} on:mouseenter={cancelClose} on:mouseleave={leave}>
            <div class="preview-heading"><Icon name={notebook ? "notebook" : "note"} size={14} /><strong>{notebook ? `笔记本 · ${preview?.title || reference.title || "未命名"}` : preview?.title || reference.title || "引用预览"}</strong><button class="preview-close" aria-label="关闭引用预览" on:click={hide}><Icon name="close" size={13} /></button></div>
            <div class="preview-body">
                {#if notebook}<p class="notebook-scope">笔记本范围引用</p>{/if}
                {#if loading}<p class="preview-status" role="status">读取中…</p>
                {:else if error}<p class="preview-error" role="alert">无法读取预览：{error}</p><button class="preview-retry" on:click={show}>重试</button>
                {:else if previewText}<Message text={previewText.slice(0, 1600)} streaming={true} />
                {:else}<p class="preview-status">{notebook ? "暂无笔记本范围信息。" : "暂无可预览的正文。"}</p>{/if}
            </div>
            {#if !loading && !error && truncated}<div class="preview-truncated">预览已截断</div>{/if}
        </div>
    {/if}
</div>

<style>
    .reference { display: inline-flex; align-items: center; min-width: 0; max-width: 100%; padding: 3px 3px 3px 5px; border: 1px solid var(--dsh-border); border-radius: 8px; background: var(--dsh-bg); color: var(--dsh-muted); font-size: 11px; }
    button { display: inline-flex; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 4px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
    button:hover { color: var(--dsh-text); background: var(--dsh-surface); }
    button:focus-visible { outline: 2px solid var(--dsh-accent); outline-offset: 2px; }
    button:disabled { opacity: .4; cursor: not-allowed; }
    .reference-open { justify-content: flex-start; gap: 5px; min-width: 0; max-width: 100%; min-height: 18px; padding: 0 3px 0 1px; }
    .reference-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .reference-remove { flex: 0 0 18px; width: 18px; height: 18px; margin-left: 3px; }
    .reference-preview { position: fixed; z-index: 12; display: flex; flex-direction: column; box-sizing: border-box; overflow: hidden; border: 1px solid var(--dsh-border); border-radius: 12px; color: var(--dsh-text); background: var(--dsh-bg); box-shadow: 0 8px 30px #00000020; user-select: text; }
    .preview-heading { display: flex; align-items: center; flex: 0 0 auto; gap: 7px; padding: 11px 12px; border-bottom: 1px solid var(--dsh-border); }
    .preview-heading strong { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 600; line-height: 20px; }
    .preview-close { flex-shrink: 0; width: 20px; height: 20px; color: var(--dsh-muted); }
    .preview-body { min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 11px 13px; }
    .preview-body :global(.markdown-message) { font-size: 12px; line-height: 20px; }
    .preview-body :global(.markdown-message h2), .preview-body :global(.markdown-message h3), .preview-body :global(.markdown-message h4) { font-size: 13px; }
    .notebook-scope { margin: 0 0 9px; color: var(--dsh-muted); font-size: 10px; line-height: 18px; }
    .preview-status, .preview-error { margin: 0; font-size: 12px; line-height: 20px; overflow-wrap: anywhere; }
    .preview-status { color: var(--dsh-muted); }
    .preview-error { color: var(--b3-card-error-color, #b2413d); }
    .preview-retry { margin-top: 7px; padding: 3px 6px; color: var(--dsh-accent); font-size: 11px; }
    .preview-truncated { flex: 0 0 auto; padding: 5px 13px 8px; color: var(--dsh-muted); font-size: 10px; }
</style>
