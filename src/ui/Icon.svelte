<script lang="ts">
    export let name = "plus";
    export let size = 18;
</script>

<svg style={`width:${size}px;height:${size}px;fill:none;display:block;flex-shrink:0`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {#if name === "plus"}<path d="M12 5v14M5 12h14" />
    {:else if name === "new"}<path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6M15.5 4.5l4 4M10 14l1-4L18.5 2.5a2.1 2.1 0 0 1 3 3L14 13z" />
    {:else if name === "settings"}<path d="M9.71 4.75 10.26 2.15 13.74 2.15 14.29 4.75 15.51 5.26 17.74 3.81 20.19 6.26 18.74 8.49 19.25 9.71 21.85 10.26 21.85 13.74 19.25 14.29 18.74 15.51 20.19 17.74 17.74 20.19 15.51 18.74 14.29 19.25 13.74 21.85 10.26 21.85 9.71 19.25 8.49 18.74 6.26 20.19 3.81 17.74 5.26 15.51 4.75 14.29 2.15 13.74 2.15 10.26 4.75 9.71 5.26 8.49 3.81 6.26 6.26 3.81 8.49 5.26Z" stroke-width="1.8" /><circle cx="12" cy="12" r="3.2" stroke-width="1.8" />
    {:else if name === "chevron"}<path d="m7 10 5 5 5-5" />
    {:else if name === "back"}<path d="m14 6-6 6 6 6" />
    {:else if name === "close"}<path d="m6 6 12 12M18 6 6 18" />
    {:else if name === "send"}<path d="M12 19V5m-6 6 6-6 6 6" />
    {:else if name === "stop"}<rect x="6.5" y="6.5" width="11" height="11" rx="1.4" fill="currentColor" stroke="none" />
    {:else if name === "copy"}<rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
    {:else if name === "note"}<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h6" />
    {:else if name === "notebook"}<rect x="5" y="3" width="15" height="18" rx="2" /><path d="M9 3v18M3 7h4M3 12h4M3 17h4M12 7h5M12 11h4" />
    {:else if name === "selection"}<path d="M8 4H5a1 1 0 0 0-1 1v3m12-4h3a1 1 0 0 1 1 1v3M4 16v3a1 1 0 0 0 1 1h3m12-4v3a1 1 0 0 1-1 1h-3M8 9h8M8 13h8M8 17h4" />
    {:else if name === "trash"}<path d="M3 6h18M9 6V3h6v3M5 6l1 14h12l1-14M10 10v6m4-6v6" />
    {:else if name === "write"}<path d="M13 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M10 14l1-4 8-8 3 3-8 8z" />
    {:else if name === "check"}<path d="m5 12 4 4L19 6" />
    {:else if name === "tool"}<path d="m14 6 4 4M5 20l8-8a6 6 0 0 0 7-7l-4 4-3-3 4-4a6 6 0 0 0-7 7l-8 8a2.1 2.1 0 0 0 3 3z" />
    {:else if name === "thinking"}<path d="M12 3a8 8 0 0 0-5 14.3V21l4-2a8 8 0 1 0 1-16zM8 10h.01M12 10h.01M16 10h.01" />
    {/if}
</svg>
