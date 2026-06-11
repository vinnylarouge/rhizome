// extensions/index.js — the extension registry. Built-ins (Obsidian export, AI
// search) register here; RHIZOME_HOME/extensions/<name>/index.mjs is scanned for
// user extensions exporting the same `extension` contract:
//
//   export const extension = {
//     id, name,
//     commands?:       { '/cmd': { hint, handler(args, ctx) → message? } },
//     onSessionEvent?: async (event, payload, ctx) => {},   // e.g. 'note-enriched'
//     settingsSchema?: [{ key, label, type: 'text'|'folder' }],
//   }
//
// Everything is best-effort: a broken extension logs and is skipped; a throwing
// hook never breaks note-taking.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { home } from '../paths.js';
import { extension as obsidian } from './obsidian.js';
import { extension as search } from './search.js';

const loaded = [];

export async function loadAll() {
  loaded.length = 0;
  loaded.push(obsidian, search);
  const dir = path.join(home(), 'extensions');
  let names = [];
  try { names = fs.readdirSync(dir); } catch { /* none installed */ }
  for (const name of names) {
    const entry = path.join(dir, name, 'index.mjs');
    if (!fs.existsSync(entry)) continue;
    try {
      const mod = await import(pathToFileURL(entry).href);
      if (mod.extension?.id) {
        loaded.push(mod.extension);
      } else {
        console.error(`[ext] ${name}/index.mjs does not export an extension`);
      }
    } catch (e) {
      console.error(`[ext] failed to load ${name}: ${e.message}`);
    }
  }
  console.log(`[ext] loaded: ${loaded.map((e) => e.id).join(', ')}`);
  return loaded;
}

// Merged slash-command map: '/obsidian' → {extId, hint, handler}.
export function commands() {
  const out = {};
  for (const ext of loaded) {
    for (const [cmd, def] of Object.entries(ext.commands || {})) {
      out[cmd] = { extId: ext.id, hint: def.hint || cmd, handler: def.handler };
    }
  }
  return out;
}

// Fan an event out to every extension; one throwing hook never affects another.
export async function emit(event, payload, ctx) {
  for (const ext of loaded) {
    if (typeof ext.onSessionEvent !== 'function') continue;
    try {
      await ext.onSessionEvent(event, payload, ctx);
    } catch (e) {
      console.error(`[ext:${ext.id}] ${event} hook failed: ${e.message}`);
    }
  }
}

// Settings fields contributed by extensions, for the settings UI.
export function schemas() {
  return loaded
    .filter((e) => Array.isArray(e.settingsSchema) && e.settingsSchema.length)
    .map((e) => ({ extId: e.id, name: e.name, fields: e.settingsSchema }));
}
