import { readFile, stat } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { spawn } from 'node:child_process';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { listSessions, readSteps, sessionPath } from './storage.js';
import { ENV_PREFIX, PLAYER_PORT, PRODUCT_NAME } from './config.js';

const app = new Hono();
const uiRoot = resolve(new URL('../ui/dist/', import.meta.url).pathname);
const mime: Record<string, string> = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.woff2':'font/woff2', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon' };

app.get('/api/meta', c => c.json({ name: PRODUCT_NAME }));
app.get('/api/sessions', async c => c.json(await listSessions()));
app.get('/api/sessions/:id/steps', async c => {
  try { return c.json(await readSteps(c.req.param('id'))); }
  catch { return c.json({ error: 'Session not found' }, 404); }
});
app.get('/api/sessions/:id/images/:file', async c => {
  const file = c.req.param('file');
  if (!/^\d{4,}\.png$/.test(file)) return c.notFound();
  try { return c.body(await readFile(join(sessionPath(c.req.param('id')), file)), 200, { 'content-type': 'image/png', 'cache-control': 'no-store' }); }
  catch { return c.notFound(); }
});
app.get('*', async c => {
  const requested = c.req.path === '/' ? '/index.html' : c.req.path;
  const file = resolve(uiRoot, `.${requested}`);
  if (!file.startsWith(`${uiRoot}/`) && file !== uiRoot) return c.notFound();
  try {
    if (!(await stat(file)).isFile()) return c.notFound();
    return c.body(await readFile(file), 200, { 'content-type': mime[extname(file)] || 'application/octet-stream' });
  } catch { return c.notFound(); }
});

function openBrowser(url: string) {
  if (process.env[`${ENV_PREFIX}_NO_OPEN`] === '1') return;
  const platform = process.platform;
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.unref();
}

export async function startPlayer() {
  const url = `http://localhost:${PLAYER_PORT}`;
  try {
    const response = await fetch(`http://127.0.0.1:${PLAYER_PORT}/api/meta`, { signal: AbortSignal.timeout(300) });
    if (response.ok && (await response.json() as {name?: string}).name === PRODUCT_NAME) { openBrowser(url); console.log(url); return; }
  } catch { /* Start the local server. */ }
  await new Promise<void>((resolve, reject) => {
    const server = serve({ fetch: app.fetch, port: PLAYER_PORT, hostname: '127.0.0.1' }, () => resolve());
    server.once('error', reject);
  });
  openBrowser(url);
  console.log(url);
}
