import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
export default defineConfig({ cacheDir: '.cache/vite-preview', plugins: [svelte()], server: { port: 5178, strictPort: true }, publicDir: false });
