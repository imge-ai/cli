import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';

const name = 'imge';
export default defineConfig({
  root: 'ui',
  plugins: [react(), tailwindcss(), { name: 'product-title', transformIndexHtml: html => html.replaceAll('%PRODUCT_NAME%', name) }],
  define: { __PRODUCT_NAME__: JSON.stringify(name) },
  build: { outDir: 'dist', emptyOutDir: true },
});
