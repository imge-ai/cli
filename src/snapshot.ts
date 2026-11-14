import type { TargetInfo, Warning } from './schema.js';

export type SnapshotNode = { role: string; name: string; ref: string; line: string };
const NODE = /^\s*-\s+(?:<changed>\s+)?([\w-]+)(?:\s+"((?:\\.|[^"])*)")?[^\n]*?\[ref=([^\]]+)\]/gm;

export function extractAgentView(resultText: string): string {
  const marker = /^- Page Snapshot:|^### (?:Page )?Snapshot\s*$/m.exec(resultText);
  if (marker) {
    const tail = resultText.slice(marker.index + marker[0].length).trimStart();
    return tail.split(/^### [^\n]+$/m)[0].replace(/^```(?:yaml)?\s*\n?/, '').replace(/\n?```\s*$/, '').trimEnd();
  }
  const firstNode = resultText.search(/^\s*-\s+[\w-]+(?:\s+"[^"]*")?.*\[ref=/m);
  return firstNode >= 0 ? resultText.slice(firstNode).trimEnd() : '';
}

export function snapshotNodes(snapshot: string): SnapshotNode[] {
  return [...snapshot.matchAll(NODE)].map(match => ({ role: match[1], name: (match[2] || '').replace(/\\"/g, '"'), ref: match[3], line: match[0].trim() }));
}

export function mergeSnapshotState(previous: string, next: string): string {
  if (!next.includes('<changed>') && !next.includes('[unchanged]')) return next;
  const nodes = new Map(snapshotNodes(previous).map(node => [node.ref, node.line]));
  for (const node of snapshotNodes(next)) nodes.set(node.ref, node.line);
  return [...nodes.values()].join('\n');
}

export function targetFromSnapshot(args: Record<string, unknown>, priorSnapshot: string): { target: TargetInfo | null; warnings: Warning[]; occurrence: number } {
  const supplied = args.ref || args.target;
  const raw = typeof supplied === 'string' ? supplied.replace(/^ref=/, '') : null;
  if (!raw) return { target: null, warnings: [], occurrence: 0 };
  const nodes = snapshotNodes(priorSnapshot);
  const found = nodes.find(node => node.ref === raw);
  if (!found) return { target: { ref: raw, role: null, name: null, matchCount: null }, warnings: [], occurrence: 0 };
  const matches = nodes.filter(node => node.role === found.role && node.name === found.name);
  const warnings: Warning[] = [];
  if (matches.length > 1) warnings.push('same-name');
  if (!found.name) warnings.push('unnamed');
  return { target: { ref: raw, role: found.role, name: found.name, matchCount: matches.length }, warnings, occurrence: matches.findIndex(node => node.ref === raw) };
}
