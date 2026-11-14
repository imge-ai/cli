import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { chromium } from 'playwright';
import sharp from 'sharp';

const mode = process.argv[2];
const page = '<!doctype html><html><head><title>Store</title></head><body><h1>Shop</h1><button id="wrong">Add to cart</button><button id="right" onclick="document.querySelector(\'#cart\').textContent=\'1 item\'">Add to cart</button><p id="cart">Cart empty</p><form><input type="password" aria-label="Password" autocomplete="current-password"><input aria-label="Card number" autocomplete="cc-number"><input aria-label="CVC" autocomplete="cc-csc"><input aria-label="Expiry" autocomplete="cc-exp"></form><button id="nameless"></button></body></html>';
const site = createServer((_req, res) => { res.setHeader('content-type', 'text/html'); res.end(page); });
await new Promise(done => site.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${site.address().port}/`;
const home = await mkdtemp(join(tmpdir(), 'agent-replay-integration-'));
const clients = [];
let browser = null;

function resultText(result) { return result.content.filter(item => item.type === 'text').map(item => item.text).join('\n'); }
function view(result) { const match = /- Page Snapshot:\s*```yaml\n([\s\S]*?)\n```/.exec(resultText(result)); assert.ok(match, 'inline action snapshot'); return match[1]; }
function ref(snapshot, name, nth = 0) { const matches = [...snapshot.matchAll(new RegExp(`- (?:button|textbox) "${name}"[^\\n]*?\\[ref=(e\\d+)\\]`, 'g'))]; assert.ok(matches[nth], `${name} ref`); return matches[nth][1]; }
async function connect(command, args, env = process.env) { const client = new Client({ name: 'test-agent', version: '1.0.0' }); await client.connect(new StdioClientTransport({ command, args, env, stderr: 'pipe' })); clients.push(client); return client; }
async function savedSteps() { const id = (await readdir(join(home, 'sessions')))[0]; const dir = join(home, 'sessions', id); const json = await readFile(join(dir, 'steps.jsonl'), 'utf8'); return { dir, json, steps: json.trim().split('\n').map(line => JSON.parse(line)) }; }

try {
  if (mode === 'pass') {
    const profile = await mkdtemp(join(tmpdir(), 'agent-replay-direct-'));
    const port = 39000 + Math.floor(Math.random() * 10000);
    browser = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, args: [`--remote-debugging-port=${port}`] });
    const direct = await connect('node', [resolve('node_modules/@playwright/mcp/cli.js'), `--cdp-endpoint=http://127.0.0.1:${port}`]);
    const proxy = await connect('node', [resolve('dist/cli.js'), 'mcp'], { ...process.env, AGENT_REPLAY_HOME: home, AGENT_REPLAY_TASK: 'Try to add a product to cart' });
    assert.deepEqual(await proxy.listTools(), await direct.listTools());
    const directNav = await direct.callTool({ name:'browser_navigate', arguments:{url} });
    const proxyNav = await proxy.callTool({ name:'browser_navigate', arguments:{url} });
    assert.deepEqual(proxyNav, directNav, 'navigate result unchanged');
    const directRef = ref(view(directNav), 'Add to cart');
    const proxyRef = ref(view(proxyNav), 'Add to cart');
    assert.equal(proxyRef, directRef);
    const directClick = await direct.callTool({ name:'browser_click', arguments:{element:'Add to cart',ref:directRef} });
    const proxyClick = await proxy.callTool({ name:'browser_click', arguments:{element:'Add to cart',ref:proxyRef} });
    assert.deepEqual(proxyClick, directClick, 'click result unchanged');
    assert.match(resultText(proxyClick), /Cart empty|ref=e/);
    const unnamed = /- button \[ref=(e\d+)\]/.exec(view(proxyNav));
    assert.ok(unnamed);
    await proxy.callTool({ name:'browser_click', arguments:{element:'unnamed button',ref:unnamed[1]} });
    const failure = await proxy.callTool({ name:'browser_click', arguments:{element:'missing button',ref:'e999'} });
    assert.ok(failure.isError);
    const saved = await savedSteps();
    assert.equal(saved.steps.length, 4);
    assert.deepEqual(saved.steps[1].target, { ref: proxyRef, role:'button', name:'Add to cart', matchCount:2 });
    assert.ok(saved.steps[1].warnings.includes('same-name'));
    assert.ok(saved.steps[1].clickPoint?.x > 0);
    assert.ok(saved.steps[2].warnings.includes('unnamed'));
    assert.ok(saved.steps[3].failureReason && saved.steps[3].failureReason !== 'Action failed');
    assert.equal((await readdir(saved.dir)).filter(name => name.endsWith('.png')).length, 4);
  } else if (mode === 'privacy') {
    const proxy = await connect('node', [resolve('dist/cli.js'), 'mcp'], { ...process.env, AGENT_REPLAY_HOME: home });
    const nav = await proxy.callTool({name:'browser_navigate',arguments:{url}});
    const snapshot = view(nav);
    const password = 'secret-password-9341', card = '4111111111111111', cvc = '9186', expiry = '11/29';
    const typed = await proxy.callTool({name:'browser_type',arguments:{element:'Password',ref:ref(snapshot,'Password'),text:password}});
    assert.equal(typed.isError, undefined, resultText(typed));
    const filled = await proxy.callTool({name:'browser_fill_form',arguments:{fields:[
      {name:'Card number',ref:ref(snapshot,'Card number'),type:'textbox',value:card},
      {name:'CVC',ref:ref(snapshot,'CVC'),type:'textbox',value:cvc},
      {name:'Expiry',ref:ref(snapshot,'Expiry'),type:'textbox',value:expiry},
    ]}});
    assert.equal(filled.isError, undefined, resultText(filled));
    const saved = await savedSteps();
    for (const secret of [password,card,cvc,expiry]) assert.ok(!saved.json.includes(secret), `${secret} found on disk`);
    assert.equal(saved.steps[1].arguments.text, '••••');
    for (const field of saved.steps[2].arguments.fields) assert.equal(field.value, '••••');
    const {data,info} = await sharp(join(saved.dir,saved.steps[2].screenshot)).raw().toBuffer({resolveWithObject:true});
    let maskedPixels = 0;
    for(let i=0;i<data.length;i+=info.channels) if(data[i]===17 && data[i+1]===17 && data[i+2]===17) maskedPixels++;
    assert.ok(maskedPixels>1000, `Expected solid mask boxes, got ${maskedPixels} pixels`);
  } else throw new Error('Unknown mode');
  console.log(`${mode} passed`);
} finally {
  for (const client of clients.reverse()) await client.close().catch(()=>{});
  if (browser) await browser.close().catch(()=>{});
  await new Promise(done => site.close(() => done()));
}
