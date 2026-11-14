import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright';
import sharp from 'sharp';
import { connectPassiveCdpListeners } from './cdp-extension.js';
import { isSensitiveField, type FieldDescriptor } from './security.js';
import { ENV_PREFIX, PRODUCT_NAME } from './config.js';
import type { ClickPoint, TargetInfo } from './schema.js';

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No free CDP port');
  const port = address.port;
  await new Promise<void>(resolve => server.close(() => resolve()));
  return port;
}

export class BrowserBridge {
  private constructor(private owner: BrowserContext, private observer: Browser, private profileDir: string, readonly endpoint: string) {}
  static async start(): Promise<BrowserBridge> {
    const profileDir = await mkdtemp(join(tmpdir(), `${PRODUCT_NAME}-browser-`));
    const port = await freePort();
    const endpoint = `http://127.0.0.1:${port}`;
    const owner = await chromium.launchPersistentContext(profileDir, {
      channel: process.env[`${ENV_PREFIX}_BROWSER_CHANNEL`] || 'chrome',
      headless: true,
      args: [`--remote-debugging-port=${port}`],
    });
    try {
      for (let attempt = 0; attempt < 50; attempt++) {
        try { if ((await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(300) })).ok) break; }
        catch { await new Promise(resolve => setTimeout(resolve, 100)); }
      }
      const observer = await chromium.connectOverCDP(endpoint);
      connectPassiveCdpListeners(observer);
      return new BrowserBridge(owner, observer, profileDir, endpoint);
    } catch (error) { await owner.close(); await rm(profileDir, { recursive: true, force: true }); throw error; }
  }
  page(): Page | null {
    const pages = this.observer.contexts().flatMap(context => context.pages()).filter(page => !page.isClosed());
    return [...pages].reverse().find((page: Page) => page.url() !== 'about:blank') || pages.at(-1) || null;
  }
  private locator(page: Page, raw: string, target: TargetInfo | null, occurrence: number): Locator | null {
    if (target?.role) return page.getByRole(target.role as Parameters<Page['getByRole']>[0], { name: target.name || undefined, exact: true }).nth(Math.max(0, occurrence));
    if (/^[\w-]*e\d+$/.test(raw)) return null;
    const roleMatch = /^getByRole\(['"]([^'"]+)['"],\s*\{\s*name:\s*['"]([^'"]+)['"]/.exec(raw);
    if (roleMatch) return page.getByRole(roleMatch[1] as Parameters<Page['getByRole']>[0], { name: roleMatch[2], exact: true });
    try { return page.locator(raw).first(); } catch { return null; }
  }
  async inspectTarget(raw: string, target: TargetInfo | null, occurrence = 0): Promise<{ clickPoint: ClickPoint | null; sensitive: boolean; field: FieldDescriptor | null; target: TargetInfo | null }> {
    const page = this.page(); if (!page) return { clickPoint: null, sensitive: false, field: null, target };
    const locator = this.locator(page, raw, target, occurrence);
    if (!locator) return { clickPoint: null, sensitive: false, field: null, target };
    try {
      const [box, info] = await Promise.all([
        locator.boundingBox({ timeout: 1000 }),
        locator.evaluate(element => ({
          type: element.getAttribute('type'), autocomplete: element.getAttribute('autocomplete'),
          name: element.getAttribute('name'), id: element.id, placeholder: element.getAttribute('placeholder'), ariaLabel: element.getAttribute('aria-label'),
          tag: element.tagName.toLowerCase(), text: (element.textContent || '').trim().slice(0, 100),
        }), { timeout: 1000 }),
      ]);
      const point = box ? { x: box.x + box.width / 2, y: box.y + box.height / 2, width: 0, height: 0 } : null;
      const inferredRole = info.tag === 'button' ? 'button' : info.tag === 'a' ? 'link' : ['input','textarea'].includes(info.tag) ? 'textbox' : info.tag;
      const resolvedTarget = target?.role ? target : { ref: target?.ref || null, role: inferredRole, name: info.ariaLabel || info.text || info.placeholder || info.name || '', matchCount: null };
      return { clickPoint: point, sensitive: isSensitiveField(info), field: info, target: resolvedTarget };
    } catch { return { clickPoint: null, sensitive: false, field: null, target }; }
  }
  async capture(): Promise<{ png: Buffer | null; secrets: string[]; width: number; height: number }> {
    const page = this.page(); if (!page) return { png: null, secrets: [], width: 0, height: 0 };
    try {
      const png = await page.screenshot({ type: 'png', animations: 'disabled', timeout: 5000 });
      const metadata = await sharp(png).metadata();
      const width = metadata.width || 0, height = metadata.height || 0;
      const secrets: string[] = [], overlays: sharp.OverlayOptions[] = [];
      for (const frame of page.frames()) {
        for (const input of await frame.locator('input, textarea, select').all()) {
          try {
            const info = await input.evaluate(element => ({
              type: element.getAttribute('type'), autocomplete: element.getAttribute('autocomplete'), name: element.getAttribute('name'), id: element.id,
              placeholder: element.getAttribute('placeholder'), ariaLabel: element.getAttribute('aria-label'), value: (element as HTMLInputElement).value || '',
            }));
            if (!isSensitiveField(info)) continue;
            if (info.value) secrets.push(info.value);
            const box = await input.boundingBox();
            if (!box || !width || !height) continue;
            const left = Math.max(0, Math.floor(box.x)); const top = Math.max(0, Math.floor(box.y));
            const right = Math.min(width, Math.ceil(box.x + box.width)); const bottom = Math.min(height, Math.ceil(box.y + box.height));
            if (right > left && bottom > top) overlays.push({
              input: { create: { width: right-left, height: bottom-top, channels: 4, background: '#111111' } }, left, top,
            });
          } catch { /* A detached field is absent from the captured page. */ }
        }
      }
      return { png: overlays.length ? await sharp(png).composite(overlays).png().toBuffer() : png, secrets, width, height };
    } catch { return { png: null, secrets: [], width: 0, height: 0 }; }
  }
  async close() {
    await this.observer.close().catch(() => {});
    await this.owner.close().catch(() => {});
    await rm(this.profileDir, { recursive: true, force: true }).catch(() => {});
  }
}
