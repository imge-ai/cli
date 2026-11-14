import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SESSIONS_DIR } from './config.js';
import type { Step } from './schema.js';

export function newSessionId(): string { return `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`; }
export function sessionPath(id: string): string {
  if (!/^[\w-]+$/.test(id)) throw new Error('Invalid session ID');
  return join(SESSIONS_DIR, id);
}
export async function saveStep(id: string, step: Step, png: Buffer | null): Promise<void> {
  const directory = sessionPath(id);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (png && step.screenshot) await writeFile(join(directory, step.screenshot), png, { mode: 0o600 });
  await appendFile(join(directory, 'steps.jsonl'), `${JSON.stringify(step)}\n`, { mode: 0o600 });
}
export async function readSteps(id: string): Promise<Step[]> {
  const contents = await readFile(join(sessionPath(id), 'steps.jsonl'), 'utf8');
  return contents.split('\n').filter(Boolean).map(line => JSON.parse(line) as Step);
}
export async function listSessions() {
  const entries = await readdir(SESSIONS_DIR, { withFileTypes: true }).catch(() => []);
  const items = await Promise.all(entries.filter(entry => entry.isDirectory()).map(async entry => {
    try {
      const steps = await readSteps(entry.name);
      if (!steps.length) return null;
      const first = steps[0], last = steps.at(-1)!;
      return { id: entry.name, task: first.task || first.firstUrl || '', agent: first.agent || 'Agent',
        startedAt: first.startedAt, durationMs: new Date(last.endedAt).getTime() - new Date(first.startedAt).getTime(),
        stepCount: steps.length, failed: steps.some(step => Boolean(step.error)) };
    } catch { return null; }
  }));
  return items.filter(item => item !== null).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
