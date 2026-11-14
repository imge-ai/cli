#!/usr/bin/env node
import { serveProxy } from './proxy.js';
import { PRODUCT_NAME } from './config.js';
import { startPlayer } from './player.js';
import { clearSessions, setup } from './setup.js';

const [command, ...extra] = process.argv.slice(2);
if (command === 'mcp') await serveProxy(extra);
else if (command === 'setup') await setup();
else if (command === 'clear') await clearSessions();
else if (!command) await startPlayer();
else if (command === '--help' || command === '-h') console.log(`Usage: ${PRODUCT_NAME} [setup|mcp|clear]`);
else { console.error(`Usage: ${PRODUCT_NAME} [setup|mcp|clear]`); process.exitCode = 1; }
