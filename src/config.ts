import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { name: string; version: string };
export const PRODUCT_NAME = manifest.name;
export const VERSION = manifest.version;
export const PLAYER_PORT = 4747;
export const ENV_PREFIX = PRODUCT_NAME.replace(/-/g, '_').toUpperCase();
export const DATA_HOME = process.env[`${ENV_PREFIX}_HOME`] || join(homedir(), `.${PRODUCT_NAME}`);
export const SESSIONS_DIR = join(DATA_HOME, 'sessions');
