import type { Browser } from 'playwright';

// CDP listener extension point: attach passive protocol event listeners here in a later version.
// The v1 proxy records MCP tool calls only; it does not inspect browser traffic.
export function connectPassiveCdpListeners(_browser: Browser): void {}
