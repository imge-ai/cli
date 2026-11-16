import { test, expect } from 'bun:test';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mergeSnapshotState, targetFromSnapshot } from '../src/snapshot.js';
import { isSensitiveField, sanitizeArguments } from '../src/security.js';

function integration(mode: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('node', [resolve('test/integration.mjs'), mode], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => output += chunk);
    child.stderr.on('data', chunk => output += chunk);
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolvePromise() : reject(new Error(output || `Integration process exited ${code}`)));
  });
}

test('real Playwright MCP behavior and refs match with and without the proxy', async () => { await integration('pass'); }, 30000);
test('real type and fill-form calls mask values and screenshot fields', async () => { await integration('privacy'); }, 30000);
test('replay UI opens with a session and stops with MCP while keeping recordings', async () => { await integration('player'); }, 30000);
test('warning and snapshot merge logic', () => {
  const first = '- button "Add to cart" [ref=e2]\n- button "Add to cart" [ref=e3]\n- button [ref=e4]';
  expect(targetFromSnapshot({ref:'e2'}, first).warnings).toContain('same-name');
  expect(targetFromSnapshot({ref:'e4'}, first).warnings).toContain('unnamed');
  const merged = mergeSnapshotState(first, '- <changed> button "Add to cart" [active] [ref=e2]\n- ref=e3 [unchanged]\n- ref=e4 [unchanged]');
  expect(targetFromSnapshot({ref:'e2'}, merged).target?.name).toBe('Add to cart');
  expect(targetFromSnapshot({ref:'e3'}, merged).target?.name).toBe('Add to cart');
});
test('sensitive field detection and argument masking', () => {
  expect(isSensitiveField({type:'password'})).toBe(true);
  expect(isSensitiveField({autocomplete:'cc-exp-year'})).toBe(true);
  expect(isSensitiveField({name:'cardCvc'})).toBe(true);
  const masked = sanitizeArguments('browser_type', {ref:'e9', text:'topsecret'}, new Set(['e9']));
  expect(masked.arguments.text).toBe('••••');
  expect(masked.secrets).toContain('topsecret');
});
