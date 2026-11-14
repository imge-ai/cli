import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';

const name = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {name:string}).name;
export default defineConfig({
  root: 'ui',
  plugins: [react(), tailwindcss(), { name: 'product-title', transformIndexHtml: html => html.replaceAll('%PRODUCT_NAME%', name) }],
  define: { __PRODUCT_NAME__: JSON.stringify(name) },
  build: { outDir: 'dist', emptyOutDir: true },
});
