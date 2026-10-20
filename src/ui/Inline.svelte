<script lang="ts">
    import { linkAttributes, type Inline as Token } from "./markdown";
    export let tokens: Token[] = [];
</script>

{#each tokens as token}{#if token.kind === "code"}<code class="inline-code">{token.text}</code>{:else if token.kind === "strong"}<strong>{token.text}</strong>{:else if token.kind === "emphasis"}<em>{token.text}</em>{:else if token.kind === "link"}<a {...linkAttributes(token.href)} href={token.href}>{token.text}</a>{:else}{token.text}{/if}{/each}

<style>
    .inline-code { font-family: var(--b3-font-family-code, ui-monospace, monospace); font-size: .9em; padding: 2px 4px; background: var(--dsh-surface, #f4f6f9); border: 1px solid var(--dsh-border, #e2e6ed); border-radius: 4px; white-space: pre-wrap; }
</style>
