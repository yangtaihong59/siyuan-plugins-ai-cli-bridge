<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { parseMarkdown } from "./markdown";
    import Inline from "./Inline.svelte";

    export let text = "";
    export let streaming = false;
    const dispatch = createEventDispatcher<{ copy: string }>();
    $: blocks = parseMarkdown(text, streaming);
</script>

<div class="markdown-message">
    {#each blocks as block}
        {#if block.kind === "code"}
            <div class="code-block">
                <div class="code-toolbar"><span>{block.language || "代码"}</span>{#if !streaming}<button aria-label={`复制${block.language ? ` ${block.language} ` : ""}代码`} on:click={() => dispatch("copy", block.text)}>复制代码</button>{/if}</div>
                <pre><code>{block.text}</code></pre>
            </div>
        {:else if block.kind === "rule"}<hr />
        {:else if block.kind === "list"}
            <svelte:element this={block.ordered ? "ol" : "ul"} start={block.ordered ? block.start : undefined}>
                {#each block.items as item}<li><Inline tokens={item} /></li>{/each}
            </svelte:element>
        {:else if block.kind === "table"}
            <!-- Keyboard focus is required to scroll wide tables without a pointer. -->
            <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
            <div class="table-scroll" role="region" aria-label="表格，可横向滚动" tabindex="0">
                <table>
                    <thead><tr>{#each block.header as cell, column}<th scope="col" style:text-align={block.alignments[column] || undefined}><Inline tokens={cell} /></th>{/each}</tr></thead>
                    {#if block.rows.length}<tbody>{#each block.rows as row}<tr>{#each row as cell, column}<td style:text-align={block.alignments[column] || undefined}><Inline tokens={cell} /></td>{/each}</tr>{/each}</tbody>{/if}
                </table>
            </div>
        {:else}
            <svelte:element this={block.kind === "heading" ? `h${Math.min(block.level + 1, 6)}` : block.kind === "quote" ? "blockquote" : "p"}>
                <Inline tokens={block.content} />
            </svelte:element>
        {/if}
    {/each}
</div>

<style>
    .markdown-message { min-width: 0; overflow-wrap: anywhere; color: inherit; line-height: 24px; font-size: 14px; }
    .markdown-message :global(p) { margin: 0 0 10px; white-space: pre-wrap; }
    .markdown-message :global(p:last-child) { margin-bottom: 0; }
    .markdown-message :global(h2), .markdown-message :global(h3), .markdown-message :global(h4), .markdown-message :global(h5), .markdown-message :global(h6) { margin: 18px 0 8px; line-height: 1.5; font-weight: 650; color: inherit; }
    .markdown-message :global(h2:first-child), .markdown-message :global(h3:first-child), .markdown-message :global(h4:first-child) { margin-top: 0; }
    .markdown-message :global(h2) { font-size: 18px; }
    .markdown-message :global(h3) { font-size: 16px; }
    .markdown-message :global(h4) { font-size: 14px; }
    .markdown-message :global(h5), .markdown-message :global(h6) { font-size: 13px; }
    .markdown-message :global(ul), .markdown-message :global(ol) { margin: 6px 0 12px; padding-left: 22px; }
    .markdown-message :global(li) { margin: 4px 0; white-space: pre-wrap; padding-left: 2px; }
    .markdown-message :global(blockquote) { margin: 10px 0; border-left: 3px solid var(--dsh-border, #dce0e9); padding: 3px 10px; white-space: pre-wrap; color: var(--dsh-muted, #697180); }
    .markdown-message :global(strong) { font-weight: 650; }
    .markdown-message :global(a) { color: var(--dsh-accent, #4d6bfe); text-decoration: underline; text-underline-offset: 2px; }
    .markdown-message :global(hr) { height: 1px; border: 0; background: var(--dsh-border, #e2e6ed); margin: 16px 0; }
    .table-scroll { display: block; width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; overflow-x: auto; overscroll-behavior-x: contain; margin: 10px 0 14px; border: 1px solid var(--dsh-border, #e2e6ed); border-radius: 7px; }
    .table-scroll:focus-visible { outline: 2px solid var(--dsh-accent, #4d6bfe); outline-offset: 2px; }
    .markdown-message .table-scroll table { display: table; width: max-content; min-width: 100%; max-width: none; table-layout: auto; border-collapse: collapse; border-spacing: 0; border: 0; margin: 0; color: inherit; background: transparent; font: inherit; }
    .markdown-message .table-scroll thead { display: table-header-group; }
    .markdown-message .table-scroll tbody { display: table-row-group; }
    .markdown-message .table-scroll tr { display: table-row; border: 0; background: transparent; }
    .markdown-message .table-scroll th, .markdown-message .table-scroll td { display: table-cell; box-sizing: border-box; min-width: 88px; max-width: 220px; padding: 7px 10px; border: 0; border-right: 1px solid var(--dsh-border, #e2e6ed); border-bottom: 1px solid var(--dsh-border, #e2e6ed); text-align: left; white-space: normal; overflow-wrap: anywhere; word-break: normal; vertical-align: top; color: inherit; background: transparent; font: inherit; }
    .markdown-message .table-scroll th { font-weight: 650; background: var(--dsh-surface, #f4f6f9); }
    .markdown-message .table-scroll th:last-child, .markdown-message .table-scroll td:last-child { border-right: 0; }
    .markdown-message .table-scroll tbody tr:last-child td { border-bottom: 0; }
    .code-block { max-width: 100%; margin: 10px 0 14px; border: 1px solid var(--dsh-border, #e2e6ed); border-radius: 7px; overflow: hidden; background: var(--dsh-surface, #f4f6f9); }
    .code-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 7px; padding: 5px 8px; border-bottom: 1px solid var(--dsh-border, #e2e6ed); font-size: 10px; line-height: 1.5; color: var(--dsh-muted, #697180); }
    .code-toolbar span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .code-toolbar button { flex: 0 0 auto; padding: 2px 5px; border: 0; background: transparent; color: inherit; font: inherit; border-radius: 4px; cursor: pointer; }
    .code-toolbar button:hover { color: var(--dsh-accent, #4d6bfe); background: var(--dsh-bg, #fff); }
    .code-toolbar button:focus-visible { outline: 2px solid var(--dsh-accent, #4d6bfe); outline-offset: 1px; }
    pre { margin: 0; padding: 10px; overflow-x: auto; tab-size: 4; font-family: var(--b3-font-family-code, ui-monospace, monospace); font-size: 11px; line-height: 1.7; white-space: pre; }
    pre code { font: inherit; }
</style>
