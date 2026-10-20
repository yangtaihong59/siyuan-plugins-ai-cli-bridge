import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { copyFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { resolve } from 'node:path';

const isDev = process.env.NODE_ENV === 'development';
const outDir = isDev ? 'dev' : 'dist';
const assets = ['plugin.json', 'README.md', 'README_zh_CN.md', 'ACCEPTANCE.md', 'LICENSE', 'icon.png', 'icon.svg', 'preview.png'];
export default defineConfig({
  publicDir: false,
  resolve: { alias: { '@': resolve('src') } },
  plugins: [svelte(), {
    name: 'siyuan-plugin-files',
    buildStart() {
      for (const file of assets) this.addWatchFile(resolve(file));
      for (const file of readdirSync('public/i18n').filter(file => file.endsWith('.json'))) this.addWatchFile(resolve('public/i18n', file));
    },
    writeBundle() {
      mkdirSync(`${outDir}/i18n`, { recursive: true });
      for (const file of assets) copyFileSync(file, resolve(outDir, file));
      for (const file of readdirSync('public/i18n').filter(file => file.endsWith('.json'))) copyFileSync(`public/i18n/${file}`, `${outDir}/i18n/${file}`);
    },
    generateBundle(_options, bundle) {
      const entry = bundle['index.js'];
      if (entry?.type === 'chunk' && /require\(['"]\.\//.test(entry.code)) this.error('Plugin bundle contains an unresolved local require.');
    },
  }],
  define: { __PLUGIN_VERSION__: JSON.stringify(JSON.parse(readFileSync('plugin.json', 'utf8')).version) },
  build: {
    outDir, emptyOutDir: true, target: 'es2020', sourcemap: isDev ? 'inline' : false,
    lib: { entry: resolve('src/index.ts'), formats: ['cjs'], fileName: () => 'index.js' },
    rollupOptions: {
      external: ['siyuan', ...builtinModules, ...builtinModules.map(name => `node:${name}`)],
      output: { inlineDynamicImports: true, assetFileNames: asset => asset.name === 'style.css' ? 'index.css' : '[name][extname]' },
    },
  },
});
