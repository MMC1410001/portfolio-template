/** Registers tests/ts-hooks.mjs. Used via `node --import`. */
import { register } from 'node:module';
register('./ts-hooks.mjs', import.meta.url);
