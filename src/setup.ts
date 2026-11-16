import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { ENV_PREFIX, PRODUCT_NAME, SESSIONS_DIR } from './config.js';

const launcher = { command: 'npx', args: ['--yes', '@imge/cli@latest', 'mcp'] };
const base = process.env[`${ENV_PREFIX}_CONFIG_HOME`] || homedir();
type Config = { id: string; label: string; file: string; kind: 'json' | 'toml'; key?: string };
const configs: Config[] = [
  { id: 'claude-code', label: 'Claude Code', file: join(base, '.claude.json'), kind: 'json', key: 'mcpServers' },
  { id: 'claude-desktop', label: 'Claude Desktop', file: process.platform === 'darwin' ? join(base, 'Library/Application Support/Claude/claude_desktop_config.json') : process.platform === 'win32' ? join(base, 'AppData/Roaming/Claude/claude_desktop_config.json') : join(base, '.config/Claude/claude_desktop_config.json'), kind: 'json', key: 'mcpServers' },
  { id: 'cursor', label: 'Cursor', file: join(base, '.cursor/mcp.json'), kind: 'json', key: 'mcpServers' },
  { id: 'vs-code', label: 'VS Code', file: join(base, '.copilot/mcp-config.json'), kind: 'json', key: 'mcpServers' },
  { id: 'codex', label: 'Codex', file: join(base, '.codex/config.toml'), kind: 'toml' },
];

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: stdin, output: stdout });
  try { return /^y(?:es)?$/i.test((await rl.question(`${question} [y/N] `)).trim()); }
  finally { rl.close(); }
}
function selected(args: string[]): Config[] {
  const index = args.indexOf('--client');
  const client = index < 0 ? 'all' : args[index + 1];
  if (!client || (client !== 'all' && !configs.some(config => config.id === client))) throw new Error(`Unknown client: ${client}. Choose all, ${configs.map(config => config.id).join(', ')}.`);
  return client === 'all' ? configs : configs.filter(config => config.id === client);
}
function entry(config: Config) { return config.id === 'vs-code' ? { type:'stdio', ...launcher, tools:['*'] } : launcher; }
function snippet(config: Config) {
  if (config.kind === 'toml') return `[mcp_servers.${PRODUCT_NAME}]\ncommand = "npx"\nargs = ["--yes", "@imge/cli@latest", "mcp"]`;
  return JSON.stringify({ [config.key!]: { [PRODUCT_NAME]: entry(config) } }, null, 2);
}
function stamp() { return new Date().toISOString().replace(/[:.]/g, '-'); }
async function save(config: Config, original: string | null, updated: string) {
  await mkdir(dirname(config.file), { recursive: true });
  if (original !== null) await copyFile(config.file, `${config.file}.bak-${stamp()}`);
  await writeFile(config.file, updated);
}

export async function setup(args: string[] = []) {
  const targets = selected(args);
  for (const config of targets) console.log(`\n${config.label} · ${config.file}\n${snippet(config)}\n`);
  if (!(await confirm(`Add imge to ${targets.map(config => config.label).join(', ')}?`))) return;
  for (const config of targets) {
    const original = await readFile(config.file, 'utf8').catch(() => null);
    if (config.kind === 'toml') {
      if (original && /^\[mcp_servers\.imge\]$/m.test(original)) { console.log(`${config.label}: already configured`); continue; }
      const separator = original ? (original.endsWith('\n') ? '\n' : '\n\n') : '';
      await save(config, original, `${original || ''}${separator}${snippet(config)}\n`);
    } else {
      let data: Record<string, unknown>;
      try { data = original ? JSON.parse(original) as Record<string, unknown> : {}; }
      catch { console.error(`${config.label}: invalid JSON, skipped`); continue; }
      const servers = (data[config.key!] && typeof data[config.key!] === 'object' && !Array.isArray(data[config.key!])) ? data[config.key!] as Record<string, unknown> : {};
      if (PRODUCT_NAME in servers) { console.log(`${config.label}: already configured`); continue; }
      data[config.key!] = { ...servers, [PRODUCT_NAME]: entry(config) };
      await save(config, original, `${JSON.stringify(data, null, 2)}\n`);
    }
    console.log(`${config.label}: added${original !== null ? ' (backup saved)' : ''}`);
  }
}

export async function uninstall(args: string[] = []) {
  const targets = selected(args);
  if (!(await confirm(`Remove imge from ${targets.map(config => config.label).join(', ')}?`))) return;
  for (const config of targets) {
    const original = await readFile(config.file, 'utf8').catch(() => null);
    if (!original) { console.log(`${config.label}: not configured`); continue; }
    if (config.kind === 'toml') {
      const updated = original.replace(/^\[mcp_servers\.imge\]\s*\n(?:^(?!\[)[^\n]*\n)*/gm, '');
      if (updated === original) { console.log(`${config.label}: not configured`); continue; }
      await save(config, original, updated);
    } else {
      let data: Record<string, unknown>;
      try { data = JSON.parse(original) as Record<string, unknown>; }
      catch { console.error(`${config.label}: invalid JSON, skipped`); continue; }
      const servers = data[config.key!] as Record<string, unknown> | undefined;
      if (!servers || !(PRODUCT_NAME in servers)) { console.log(`${config.label}: not configured`); continue; }
      delete servers[PRODUCT_NAME];
      await save(config, original, `${JSON.stringify(data, null, 2)}\n`);
    }
    console.log(`${config.label}: removed (backup saved)`);
  }
  console.log('Saved sessions remain on disk. Run `npx @imge/cli clear` to delete them.');
}

export async function clearSessions() {
  const items = (await readdir(SESSIONS_DIR, { withFileTypes:true }).catch(() => [])).filter(item => item.isDirectory() && /^[\w-]+$/.test(item.name)).map(item => item.name);
  console.log(`${items.length} local session${items.length === 1 ? '' : 's'}.`);
  if (!items.length || !(await confirm('Delete all local sessions?'))) return;
  for (const item of items) await rm(join(SESSIONS_DIR, item), { recursive: true });
  console.log('Local sessions deleted.');
}
