import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { BrowserBridge } from './browser.js';
import { ENV_PREFIX, PRODUCT_NAME, VERSION } from './config.js';
import { newSessionId, saveStep } from './storage.js';
import { extractAgentView, mergeSnapshotState, targetFromSnapshot } from './snapshot.js';
import { isSensitiveField, redactText, sanitizeArguments } from './security.js';
import type { Step, TargetInfo, Warning } from './schema.js';

const require = createRequire(import.meta.url);
const playwrightCli = join(dirname(require.resolve('@playwright/mcp/package.json')), 'cli.js');
const OBSERVATION_TOOLS = new Set(['browser_snapshot','browser_find','browser_take_screenshot','browser_console_messages','browser_network_requests','browser_network_request','browser_close','browser_install']);
export const isActionTool = (name: string) => name.startsWith('browser_') && !OBSERVATION_TOOLS.has(name);

function responseText(result: unknown): string {
  if (!result || typeof result !== 'object' || !('content' in result) || !Array.isArray(result.content)) return '';
  return result.content.filter((item: unknown) => item && typeof item === 'object' && 'type' in item && item.type === 'text').map((item: { text?: string }) => item.text || '').join('\n');
}
function shortFailure(text: string): string {
  const message = /"message"\s*:\s*"([^"\n]+)/.exec(text)?.[1];
  if (message) return message.slice(0, 180);
  return (text.split('\n').map(line => line.trim()).find(line => line && !line.startsWith('#') && /error|failed|timeout|not found/i.test(line)) || 'Action failed').slice(0, 180);
}

export async function serveProxy(extraArgs: string[] = []) {
  const bridge = await BrowserBridge.start();
  const upstream = new Client({ name: PRODUCT_NAME, version: VERSION });
  const upstreamTransport = new StdioClientTransport({ command: process.execPath, args: [playwrightCli, `--cdp-endpoint=${bridge.endpoint}`, ...extraArgs], stderr: 'inherit' });
  try { await upstream.connect(upstreamTransport); }
  catch (error) { await bridge.close(); throw error; }
  const downstream = new Server({ name: PRODUCT_NAME, version: VERSION }, { capabilities: { tools: { listChanged: true } } });
  const sessionId = newSessionId();
  let index = 0, lastSnapshot = '', firstUrl: string | null = null;
  let pending: Promise<unknown> = Promise.resolve();
  downstream.setRequestHandler(ListToolsRequestSchema, async () => upstream.listTools());
  downstream.setRequestHandler(CallToolRequestSchema, async request => {
    const operation = pending.then(async () => {
      const { name, arguments: rawArguments } = request.params;
      const args = (rawArguments || {}) as Record<string, unknown>;
      if (!isActionTool(name)) {
        const result = await upstream.callTool(request.params);
        const view = extractAgentView(responseText(result));
        if (view) lastSnapshot = mergeSnapshotState(lastSnapshot, view);
        return result;
      }
      const started = Date.now(), startedAt = new Date(started).toISOString();
      const rawTarget = typeof (args.ref || args.target) === 'string' ? String(args.ref || args.target) : '';
      const parsed = targetFromSnapshot(args, lastSnapshot);
      let target: TargetInfo | null = parsed.target;
      const warnings = [...parsed.warnings] as Warning[];
      let clickPoint = null as Step['clickPoint'];
      const sensitiveTargets = new Set<string>();
      if (rawTarget) {
        const inspected = await bridge.inspectTarget(rawTarget, target, parsed.occurrence);
        target = inspected.target;
        if (inspected.sensitive || isSensitiveField({ name: target?.name })) sensitiveTargets.add(rawTarget);
        if (name === 'browser_click') clickPoint = inspected.clickPoint;
        if (target?.name === '' && !warnings.includes('unnamed')) warnings.push('unnamed');
      }
      if (name === 'browser_fill_form' && Array.isArray(args.fields)) {
        for (const field of args.fields as Record<string, unknown>[]) {
          const ref = String(field.target || field.ref || '');
          if (!ref) continue;
          const found = targetFromSnapshot({ ref }, lastSnapshot);
          const inspected = await bridge.inspectTarget(ref, found.target, found.occurrence);
          if (inspected.sensitive || isSensitiveField({ name: String(field.name || '') })) sensitiveTargets.add(ref);
          if (!target) target = inspected.target;
          for (const warning of found.warnings) if (!warnings.includes(warning)) warnings.push(warning);
        }
      }
      const sanitized = sanitizeArguments(name, args, sensitiveTargets);
      let result: Awaited<ReturnType<typeof upstream.callTool>> | null = null;
      let thrown: unknown = null;
      try { result = await upstream.callTool(request.params); }
      catch (error) { thrown = error; }
      const captured = await bridge.capture();
      if (clickPoint) { clickPoint.width = captured.width; clickPoint.height = captured.height; }
      const ended = Date.now();
      const rawText = result ? responseText(result) : String(thrown);
      const secrets = [...sanitized.secrets, ...captured.secrets];
      const storedText = redactText(rawText, secrets);
      const rawView = result ? extractAgentView(rawText) : '';
      if (rawView) lastSnapshot = mergeSnapshotState(lastSnapshot, rawView);
      const error = result?.isError || thrown ? storedText : null;
      if (name === 'browser_navigate' && typeof args.url === 'string' && !firstUrl) firstUrl = args.url;
      const step: Step = {
        index: ++index, toolName: name, arguments: sanitized.arguments, resultText: storedText,
        agentView: redactText(rawView, secrets), error,
        failureReason: error ? shortFailure(error) : null,
        startedAt, endedAt: new Date(ended).toISOString(), durationMs: ended - started,
        screenshot: captured.png ? `${String(index).padStart(4,'0')}.png` : null,
        target, clickPoint, warnings,
        agent: downstream.getClientVersion()?.name || null, task: process.env[`${ENV_PREFIX}_TASK`] || null,
        firstUrl, trackingHits: [],
      };
      try { await saveStep(sessionId, step, captured.png); }
      catch (error) { console.error(`${PRODUCT_NAME}: could not save step: ${error instanceof Error ? error.message : String(error)}`); }
      if (thrown) throw thrown;
      return result!;
    });
    pending = operation.catch(() => undefined);
    return operation;
  });
  const close = async () => { await upstream.close().catch(() => {}); await bridge.close(); };
  process.once('SIGINT', () => { void close().then(() => process.exit(0)); });
  process.once('SIGTERM', () => { void close().then(() => process.exit(0)); });
  await downstream.connect(new StdioServerTransport());
  process.stdin.once('end', () => { void close(); });
}
