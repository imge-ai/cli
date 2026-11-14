import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { ENV_PREFIX, PRODUCT_NAME, SESSIONS_DIR } from './config.js';

const launcher = { command: 'node', args: [resolve(process.argv[1]), 'mcp'] };
const base = process.env[`${ENV_PREFIX}_CONFIG_HOME`] || homedir();
type Config = { label: string; file: string; kind: 'json' | 'toml'; key?: string };
const configs: Config[] = [
  { label: 'Claude Code', file: join(base, '.claude.json'), kind: 'json', key: 'mcpServers' },
  { label: 'Claude Desktop', file: process.platform === 'darwin' ? join(base, 'Library/Application Support/Claude/claude_desktop_config.json') : process.platform === 'win32' ? join(base, 'AppData/Roaming/Claude/claude_desktop_config.json') : join(base, '.config/Claude/claude_desktop_config.json'), kind: 'json', key: 'mcpServers' },
  { label: 'Cursor', file: join(base, '.cursor/mcp.json'), kind: 'json', key: 'mcpServers' },
  { label: 'VS Code', file: join(base, '.copilot/mcp-config.json'), kind: 'json', key: 'mcpServers' },
  { label: 'Codex', file: join(base, '.codex/config.toml'), kind: 'toml' },
];

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: stdin, output: stdout });
  try { return /^y(?:es)?$/i.test((await rl.question(`${question} [y/N] `)).trim()); }
  finally { rl.close(); }
}

function snippet(config: Config) {
  if (config.kind === 'toml') return `[mcp_servers.${PRODUCT_NAME}]\ncommand = "node"\nargs = [${JSON.stringify(launcher.args[0])}, "mcp"]`;
  return JSON.stringify({ [config.key!]: { [PRODUCT_NAME]: entry(config) } }, null, 2);
}
function entry(config: Config) { return config.label === 'VS Code' ? { type:'stdio', ...launcher, tools:['*'] } : launcher; }

export async function setup() {
  for (const config of configs) console.log(`\n${config.label} · ${config.file}\n${snippet(config)}\n`);
  if (!(await confirm('Add these entries to the five config files?'))) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const config of configs) {
    await mkdir(dirname(config.file), { recursive: true });
    let original: string | null = null;
    try { original = await readFile(config.file, 'utf8'); } catch { /* New config. */ }
    if (config.kind === 'toml') {
      if (original && new RegExp(`^\\[mcp_servers\\.${PRODUCT_NAME}\\]`, 'm').test(original)) { console.log(`${config.label}: already configured`); continue; }
      if (original !== null) await copyFile(config.file, `${config.file}.bak-${stamp}`);
      await writeFile(config.file, `${original || ''}${original?.endsWith('\n') ? '\n' : original ? '\n\n' : ''}${snippet(config)}\n`);
    } else {
      let data: Record<string, unknown>;
      try { data = original ? JSON.parse(original) as Record<string, unknown> : {}; }
      catch { console.error(`${config.label}: invalid JSON, skipped`); continue; }
      const servers = (data[config.key!] && typeof data[config.key!] === 'object' && !Array.isArray(data[config.key!])) ? data[config.key!] as Record<string, unknown> : {};
      if (PRODUCT_NAME in servers) { console.log(`${config.label}: already configured`); continue; }
      data[config.key!] = { ...servers, [PRODUCT_NAME]: entry(config) };
      if (original !== null) await copyFile(config.file, `${config.file}.bak-${stamp}`);
      await writeFile(config.file, `${JSON.stringify(data, null, 2)}\n`);
    }
    console.log(`${config.label}: added${original !== null ? ' (backup saved)' : ''}`);
  }
}

export async function clearSessions() {
  const items = (await readdir(SESSIONS_DIR, { withFileTypes:true }).catch(() => [])).filter(item => item.isDirectory() && /^[\w-]+$/.test(item.name)).map(item => item.name);
  console.log(`${items.length} local session${items.length === 1 ? '' : 's'}.`);
  if (!items.length || !(await confirm('Delete all local sessions?'))) return;
  for (const item of items) await rm(join(SESSIONS_DIR, item), { recursive: true });
  console.log('Local sessions deleted.');
}
