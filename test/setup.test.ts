import { test, expect } from 'bun:test';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('setup confirms, preserves existing servers, and backs up configs', async () => {
  const home = await mkdtemp(join(tmpdir(), 'agent-replay-config-'));
  await mkdir(join(home, '.cursor'), { recursive:true });
  await writeFile(join(home, '.claude.json'), JSON.stringify({ mcpServers:{ existing:{ command:'node', args:['existing.js'] } } }));
  await writeFile(join(home, '.cursor/mcp.json'), JSON.stringify({ mcpServers:{ existing:{ command:'node', args:['cursor.js'] } } }));
  const env = { ...process.env, AGENT_REPLAY_CONFIG_HOME: home };
  const first = spawnSync('node', [resolve('dist/cli.js'), 'setup'], { input:'n\n', env, encoding:'utf8' });
  expect(first.status).toBe(0);
  expect(JSON.parse(await readFile(join(home,'.claude.json'),'utf8')).mcpServers['agent-replay']).toBeUndefined();
  const second = spawnSync('node', [resolve('dist/cli.js'), 'setup'], { input:'y\n', env, encoding:'utf8' });
  expect(second.status).toBe(0);
  for (const file of ['.claude.json','.cursor/mcp.json']) {
    const data = JSON.parse(await readFile(join(home,file),'utf8'));
    expect(data.mcpServers.existing.command).toBe('node');
    expect(data.mcpServers['agent-replay'].command).toBe('node');
    expect((await readdir(join(home,file.includes('/')?'.cursor':'.'))).some(name=>name.includes('.bak-'))).toBe(true);
  }
});

test('clear requires confirmation before deleting sessions', async () => {
  const home = await mkdtemp(join(tmpdir(), 'agent-replay-clear-'));
  const session = join(home, 'sessions', 'example');
  await mkdir(session, { recursive:true });
  await writeFile(join(session, 'steps.jsonl'), '{}\n');
  const env = { ...process.env, AGENT_REPLAY_HOME: home };
  const declined = spawnSync('node', [resolve('dist/cli.js'), 'clear'], { input:'n\n', env, encoding:'utf8' });
  expect(declined.status).toBe(0);
  expect(await readdir(join(home,'sessions'))).toEqual(['example']);
  const confirmed = spawnSync('node', [resolve('dist/cli.js'), 'clear'], { input:'y\n', env, encoding:'utf8' });
  expect(confirmed.status).toBe(0);
  expect(await readdir(join(home,'sessions'))).toEqual([]);
});
