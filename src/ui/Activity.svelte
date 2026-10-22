<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import type { DisplayDetail, Message as ChatMessage } from "../types";
    import type { AssistantActivity } from "./activity";
    import { activityPresentation } from "./activity";
    import Message from "./Message.svelte";
    import Icon from "./Icon.svelte";

    export let group: AssistantActivity;
    export let message: ChatMessage;
    export let detail: DisplayDetail = "full";
    const dispatch = createEventDispatcher<{ copy: string }>();
    let expanded = false;
    let lastPolicy = "";
    let sections: { id: string; update?: ChatMessage; steps: ChatMessage[]; toolCount: number; running: boolean; hasIssue: boolean }[] = [];
    $: policy = activityPresentation(detail, group);
    $: {
        const next: typeof sections = [];
        let section: typeof sections[number] | undefined;
        for (const step of policy.grouped ? group.messages : [message]) {
            const update = step.text && group.progressIds.has(step.id) ? step : undefined;
            if (!update && !step.reasoning && !step.tools?.length && !step.interrupted) continue;
            if (update || !section) {
                section = { id: step.id, update, steps: [], toolCount: 0, running: false, hasIssue: false };
                next.push(section);
            }
            if (step.reasoning || step.tools?.length || step.interrupted) section.steps.push(step);
            section.toolCount += step.tools?.length || 0;
            section.running ||= Boolean(group.active && (step.streaming || step.tools?.some(tool => tool.status === "running")));
            section.hasIssue ||= Boolean(step.interrupted || step.tools?.some(tool => tool.status === "error" || !group.active && tool.status === "running"));
        }
        sections = next;
    }
    $: policyKey = `${detail}:${policy.grouped}:${policy.phase}`;
    $: if (policyKey !== lastPolicy) {
        lastPolicy = policyKey;
        expanded = policy.defaultOpen;
    }
    function toggle(event: Event) {
        if (policy.grouped) expanded = (event.currentTarget as HTMLDetailsElement).open;
    }
</script>

<svelte:element this={policy.grouped ? "details" : "div"} class="process" class:grouped={policy.grouped} class:compact={detail === "compact"} open={policy.grouped ? expanded : undefined} on:toggle={toggle}>
    {#if policy.grouped}
        <summary class="process-summary" class:issue={group.hasIssue}><span class="process-icon" class:working={group.active}><Icon name={group.active ? "thinking" : group.hasIssue ? "tool" : "check"} size={13} /></span><span class="process-title">{group.summary}</span>{#if group.toolCount}<span class="process-count">{group.toolCount} 次调用</span>{/if}<Icon name="chevron" size={12} /></summary>
    {/if}
    <div class:process-content={policy.grouped}>
        {#each sections as section (section.id)}
            <div class="process-step">
                {#if section.update}
                    <div class="progress-update" aria-label="进度更新">
                        <span class="progress-label">进度更新</span>
                        <Message text={section.update.text} streaming={Boolean(section.update.streaming)} on:copy={event => dispatch("copy", event.detail)} />
                    </div>
                {/if}
                {#if section.steps.length}
                    <details class="step-details">
                        <summary class:issue={section.hasIssue}><span class="process-icon" class:working={section.running}><Icon name={section.running ? "thinking" : "tool"} size={13} /></span><span>思考与调用</span>{#if section.toolCount}<span class="process-count">{section.toolCount} 次调用</span>{/if}{#if section.running}<span class="step-status">执行中</span>{:else if section.hasIssue}<span class="step-status">有未完成项</span>{/if}<Icon name="chevron" size={12} /></summary>
                        <div class="step-content">
                            {#each section.steps as step (step.id)}
                                {#if step.reasoning}
                                    <details class="reasoning">
                                        <summary><Icon name="thinking" size={14} /><span>思考过程</span><Icon name="chevron" size={13} /></summary>
                                        <div class="reasoning-content"><Message text={step.reasoning} streaming={Boolean(step.streaming)} on:copy={event => dispatch("copy", event.detail)} /></div>
                                    </details>
                                {/if}
                                {#if step.tools?.length}
                                    <div class="tools" aria-label="工具活动">
                                        {#each step.tools as tool (tool.id)}
                                            <details class="tool" class:tool-error={tool.status === "error"}>
                                                <summary><span class="tool-icon" class:running={tool.status === "running" && group.active}><Icon name={tool.status === "completed" ? "check" : "tool"} size={13} /></span><span class="tool-name">{tool.name}</span><span class="tool-status">{tool.status === "running" ? group.active ? "执行中" : "未确认完成" : tool.status === "error" ? "未完成" : "已完成"}</span>{#if tool.text}<Icon name="chevron" size={12} />{/if}</summary>
                                                {#if tool.text}<pre>{tool.text}</pre>{/if}
                                            </details>
                                        {/each}
                                    </div>
                                {/if}
                                {#if step.interrupted && policy.grouped && !step.reasoning && !step.tools?.length}<div class="process-note">已停止</div>{/if}
                            {/each}
                        </div>
                    </details>
                {/if}
            </div>
        {/each}
    </div>
</svelte:element>

<style>
    .process, .process-step { min-width: 0; margin: 0; padding: 0; }
    .process-summary { display: flex; align-items: center; gap: 6px; min-height: 24px; color: var(--dsh-muted); font-size: 12px; line-height: 24px; }
    .process-summary.issue, .step-details > summary.issue { color: var(--b3-card-error-color, #b2413d); }
    .process-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .process-count { flex-shrink: 0; font-size: 10px; color: var(--dsh-muted); opacity: .75; }
    .process-icon { display: inline-flex; flex-shrink: 0; }
    .process-icon.working, .tool-icon.running { animation: pulse 1.2s ease-in-out infinite; }
    .process-summary :global(svg:last-child) { flex-shrink: 0; }
    .grouped[open] > .process-summary > :global(svg:last-child) { transform: rotate(180deg); }
    .process-content { margin: 8px 0 4px 5px; padding-left: 11px; border-left: 1px solid var(--dsh-border); }
    .process-content .process-step + .process-step { margin-top: 8px; }
    .compact .process-summary { font-size: 11px; }
    summary { cursor: pointer; user-select: none; list-style: none; }
    summary::-webkit-details-marker { display: none; }
    summary:focus-visible { outline: 2px solid var(--dsh-accent); outline-offset: 2px; }
    .step-details { color: var(--dsh-muted); }
    .step-details > summary { display: flex; align-items: center; gap: 6px; min-height: 24px; font-size: 12px; line-height: 24px; }
    .step-details[open] > summary > :global(svg:last-child) { transform: rotate(180deg); }
    .step-status { font-size: 10px; }
    .step-content { padding: 5px 0 5px 11px; margin: 2px 0 6px 5px; border-left: 1px solid var(--dsh-border); }
    .reasoning { margin: 0; padding: 0; color: var(--dsh-muted); }
    .reasoning summary { display: flex; align-items: center; gap: 6px; width: max-content; max-width: 100%; min-height: 24px; margin: 0; padding: 0; font-size: 13px; line-height: 24px; }
    .reasoning summary :global(svg:last-child) { transition: transform .15s; }
    .reasoning[open] summary :global(svg:last-child) { transform: rotate(180deg); }
    .reasoning-content { padding: 0 0 0 11px; margin: 8px 0 4px 5px; border-left: 1px solid var(--dsh-border); }
    .reasoning-content :global(.markdown-message) { color: var(--dsh-muted); font-size: 13px; line-height: 22px; }
    .progress-update { margin: 6px 0 8px; padding: 0 0 0 11px; border-left: 2px solid var(--dsh-border); color: var(--dsh-muted); }
    .progress-label { display: block; margin-bottom: 3px; font-size: 10px; line-height: 18px; }
    .progress-update :global(.markdown-message) { font-size: 13px; line-height: 22px; }
    .tools { margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
    .reasoning + .tools { margin-top: 4px; }
    .tool { margin: 0; padding: 0; border-radius: 6px; color: var(--dsh-muted); }
    .tool summary { display: flex; align-items: center; gap: 6px; min-height: 24px; margin: 0; padding: 0; font-size: 13px; line-height: 24px; }
    .tool summary:hover { color: var(--dsh-text); }
    .tool-icon { display: inline-flex; align-items: center; }
    .tool-name { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .tool-status { margin-left: 2px; font-size: 10px; opacity: .65; white-space: nowrap; }
    .tool-error { color: var(--b3-card-error-color, #b2413d); }
    .tool pre { max-height: 260px; overflow: auto; padding: 12px 16px; margin: 8px 0 4px; border: .5px solid var(--dsh-border); border-radius: 16px; background: var(--dsh-surface); font-size: 10px; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
    .process-note { color: var(--dsh-muted); font-size: 10px; line-height: 24px; }
    @keyframes pulse { 0%, 100% { opacity: .3; } 50% { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .process-icon.working, .tool-icon.running { animation: none; } }
</style>
