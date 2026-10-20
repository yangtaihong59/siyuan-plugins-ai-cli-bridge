<script lang="ts">
    import { createEventDispatcher } from "svelte";
    export let settings: any = {};
    export let state: any;
    export let pending = "";
    export let busy = false;
    export let changed = false;
    export let displaySaving = false;
    export let webPanel: { url: string; onOpen: (url: string) => Promise<void> | void } | undefined = undefined;
    let webUrl = "";
    let webUrlSource: string | undefined;
    $: if (webPanel && webPanel.url !== webUrlSource) { webUrl = webPanel.url; webUrlSource = webPanel.url; }
    const dispatch = createEventDispatcher();
</script>

<div class="settings-scroll">
    <div class="settings-content">
        <section class="connection">
            <div class="section-title"><h2>Harness</h2><span class="connection-text"><span class="connection-dot" class:online={state?.connected}></span>{state?.connected ? "已连接" : "发送时自动连接"}</span></div>
            <p class="hint">沿用本机 Harness 的账号与配置，模型在输入框下方选择。</p>
            <button class="secondary connection-button" disabled={busy || !!pending} on:click={() => dispatch("connect")}>{pending === "connect" ? "连接中…" : state?.connected ? "检查连接" : "连接 Harness"}</button>
        </section>
        <section>
            <div class="section-title"><h2>信息展示</h2>{#if displaySaving}<span class="display-saving" role="status">保存中…</span>{/if}</div>
            <div class="display-options" role="group" aria-label="信息展示">
                {#each [{ id: "compact", label: "简洁" }, { id: "balanced", label: "适中" }, { id: "full", label: "详细" }] as option}
                    <button type="button" class:selected={state?.settings?.displayDetail === option.id} aria-pressed={state?.settings?.displayDetail === option.id} disabled={displaySaving} on:click={() => dispatch("displayDetail", option.id)}>{option.label}</button>
                {/each}
            </div>
            <p class="hint">{state?.settings?.displayDetail === "compact" ? "正文优先，过程收进一条详情。" : state?.settings?.displayDetail === "balanced" ? "生成时显示过程，完成后自动收起。" : "保留每一步思考与工具调用。"}</p>
        </section>
        <section>
            <h2>工作目录</h2>
            <div class="directory-field"><label class="sr-only" for="dsh-cwd">工作目录</label><input id="dsh-cwd" bind:value={settings.cwd} placeholder="自动创建默认工作目录" autocomplete="off" spellcheck="false" /><button class="secondary directory-button" title="选择工作目录" aria-label="选择工作目录" disabled={busy || !!pending} on:click={() => dispatch("chooseCwd")}>{pending === "directory" ? "选择中…" : "选择…"}</button></div>
            <p class="hint">文件与终端操作使用这个目录。</p>
        </section>
        {#if changed}<div class="save-actions"><button class="save" disabled={busy || !!pending} on:click={() => dispatch("save")}>{pending === "save" ? "保存中…" : "保存设置"}</button></div>{/if}
        <details class="advanced">
            <summary>高级设置</summary>
            <div class="advanced-fields">
                <p class="hint">通常无需修改。无法自动连接时，可在这里指定运行环境。</p>
                <label for="dsh-command">启动命令</label><input id="dsh-command" bind:value={settings.command} placeholder="自动检测 dsh" autocomplete="off" spellcheck="false" />
                <label for="dsh-args">启动参数</label><textarea id="dsh-args" bind:value={settings.argsText} rows="2" placeholder="[]" autocomplete="off" spellcheck="false"></textarea>
                <label for="dsh-node">Node.js 路径</label><input id="dsh-node" bind:value={settings.nodePath} placeholder="自动" autocomplete="off" spellcheck="false" />
                <label for="dsh-profile">Profile</label><input id="dsh-profile" bind:value={settings.profile} placeholder="sdk" autocomplete="off" spellcheck="false" />
                <label for="dsh-home">DSH_HOME</label><input id="dsh-home" bind:value={settings.home} placeholder="沿用本机 Harness 配置" autocomplete="off" spellcheck="false" />
                <div class="manual-model"><p class="hint">手动指定模型（也可在聊天输入框下方选择）</p><label for="dsh-provider">Provider ID</label><input id="dsh-provider" bind:value={settings.provider} autocomplete="off" spellcheck="false" /><label for="dsh-model">模型 ID</label><input id="dsh-model" bind:value={settings.model} autocomplete="off" spellcheck="false" /></div>
            </div>
        </details>
        <details class="diagnostics">
            <summary>诊断与日志</summary>
            <div class="diagnostic-actions"><button class="secondary" disabled={busy || !!pending} on:click={() => dispatch("diagnose")}>{pending === "diagnose" ? "诊断中…" : "运行诊断"}</button>{#if state?.connected}<button class="secondary" disabled={busy || !!pending} on:click={() => dispatch("disconnect")}>断开连接</button>{/if}</div>
            {#if state?.logs?.length}<pre>{state.logs.join("\n")}</pre>{:else}<p class="hint">暂无日志。</p>{/if}
        </details>
        {#if webPanel}
            <section class="web-panel">
                <h2>网页面板</h2>
                <label class="sr-only" for="dsh-web-url">网页地址</label><input id="dsh-web-url" type="url" bind:value={webUrl} placeholder="http://localhost:4096" disabled={busy || !!pending} autocomplete="off" spellcheck="false" />
                <p class="hint">嵌入其他 Agent 网页或 Web 工具。</p>
                <button class="secondary web-button" disabled={busy || !!pending || !webUrl.trim()} on:click={() => dispatch("openWeb", webUrl.trim())}>{pending === "web" ? "打开中…" : "打开网页面板"}</button>
            </section>
        {/if}
    </div>
</div>

<style>
    .settings-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 2px 22px 24px; }
    .settings-content { max-width: 440px; margin: 0 auto; }
    section { padding: 18px 0 20px; border-bottom: 1px solid var(--dsh-border); }
    h2 { margin: 0 0 12px; font-size: 13px; font-weight: 600; }
    label { display: block; margin: 14px 0 6px; color: var(--dsh-muted); font-size: 12px; }
    input, textarea { box-sizing: border-box; width: 100%; min-width: 0; padding: 9px 10px; border: 1px solid var(--dsh-border); border-radius: 9px; color: var(--dsh-text); background: var(--dsh-bg); font-family: var(--b3-font-family-code, ui-monospace, monospace); font-size: 11px; line-height: 1.5; }
    textarea { resize: vertical; }
    input::placeholder, textarea::placeholder { color: var(--dsh-muted); opacity: .6; }
    input:focus-visible, textarea:focus-visible, button:focus-visible, summary:focus-visible { outline: 2px solid var(--dsh-accent); outline-offset: 2px; }
    .hint { margin: 8px 0 0; font-size: 11px; line-height: 18px; color: var(--dsh-muted); overflow-wrap: anywhere; }
    .section-title { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .section-title h2 { margin: 0; }
    .display-options { display: flex; gap: 3px; margin-top: 12px; padding: 3px; border: 1px solid var(--dsh-border); border-radius: 10px; background: var(--dsh-surface); }
    .display-options button { flex: 1; min-width: 0; padding: 7px 5px; background: transparent; color: var(--dsh-muted); }
    .display-options button.selected { color: var(--dsh-text); background: var(--dsh-bg); box-shadow: 0 1px 3px #0000000b; }
    .display-saving { color: var(--dsh-muted); font-size: 10px; }
    .connection-text { display: inline-flex; align-items: center; gap: 5px; color: var(--dsh-muted); font-size: 10px; }
    .connection-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--dsh-muted); opacity: .5; }
    .connection-dot.online { background: var(--b3-card-success-color, #40a483); opacity: 1; }
    .connection-button { margin-top: 14px; }
    .directory-field { display: flex; align-items: stretch; gap: 7px; }
    .directory-field input { flex: 1; }
    .directory-button { flex-shrink: 0; padding-inline: 11px; }
    .advanced { padding: 18px 0; border-bottom: 1px solid var(--dsh-border); }
    summary { cursor: pointer; color: var(--dsh-muted); font-size: 12px; user-select: none; }
    .advanced-fields { padding: 2px 0 3px; }
    .manual-model { margin-top: 18px; padding-top: 8px; border-top: 1px solid var(--dsh-border); }
    .save-actions { display: flex; padding: 18px 0 0; }
    button { display: inline-flex; align-items: center; justify-content: center; font: inherit; font-size: 12px; border: 0; border-radius: 8px; padding: 8px 12px; cursor: pointer; }
    button:disabled { opacity: .45; cursor: not-allowed; }
    .save { color: var(--b3-theme-on-primary, #fff); background: var(--dsh-accent); }
    .secondary { color: var(--dsh-text); background: var(--dsh-surface); }
    button:hover:not(:disabled) { filter: brightness(.97); }
    .diagnostics { padding-top: 18px; }
    .web-panel { margin-top: 18px; padding-bottom: 0; border-top: 1px solid var(--dsh-border); border-bottom: 0; }
    .web-button { margin-top: 12px; }
    .diagnostic-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
    pre { max-height: 220px; overflow: auto; margin: 14px 0 0; padding: 10px; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 10px; line-height: 1.6; border-radius: 8px; background: var(--dsh-surface); color: var(--dsh-muted); user-select: text; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
    @media (max-width: 280px) { .settings-scroll { padding-inline: 14px; } .directory-field { flex-wrap: wrap; } .directory-field input { flex-basis: 100%; } .directory-button { margin-left: auto; } }
</style>
