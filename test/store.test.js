// store.test.js — multi-session lifecycle: create/list/open round-trips, legacy
// migration, archive hides but never deletes.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as store from '../src/store.js';
import * as cores from '../src/cores.js';

let home;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'rhizome-store-'));
  process.env.RHIZOME_HOME = home;
  cores.seed();
});

test('boot with empty home → no active session', () => {
  store.load();
  assert.equal(store.hasActive(), false);
  assert.equal(store.get(), null);
  assert.deepEqual(store.listSessions(), []);
});

test('createSession → active, listed, persisted with core anchors', () => {
  store.load();
  const s = store.createSession({ title: 'Sprint 12 Retro', coreId: 'retrospective' });
  assert.ok(store.hasActive());
  assert.equal(s.session.title, 'Sprint 12 Retro');
  assert.equal(s.session.coreId, 'retrospective');
  assert.ok(s.themes.find((t) => t.label === 'WENT WELL'));
  assert.equal(cores.activeCore().id, 'retrospective');

  const list = store.listSessions();
  assert.equal(list.length, 1);
  assert.equal(list[0].title, 'Sprint 12 Retro');
  assert.equal(list[0].coreId, 'retrospective');
  assert.ok(fs.existsSync(path.join(home, 'sessions', list[0].id, 'session.json')));
});

test('notes persist; openSession round-trips and restores the core', () => {
  store.load();
  const a = store.createSession({ title: 'First', coreId: 'roundtable' });
  store.addNote({ text: 'note in first' });
  store.flush();
  const firstId = a.session.id;

  store.createSession({ title: 'Second', coreId: 'design-crit' });
  assert.equal(store.get().notes.length, 0);
  assert.equal(cores.activeCore().id, 'design-crit');

  store.openSession(firstId);
  assert.equal(store.get().notes.length, 1);
  assert.equal(store.get().notes[0].text, 'note in first');
  assert.equal(cores.activeCore().id, 'roundtable');
});

test('legacy loom files migrate into a session dir (nothing deleted)', () => {
  const legacy = {
    session: { id: 'loom-123', title: 'Oxford Roundtable', startedAt: '2026-06-09T10:00:00Z' },
    paused: false, notes: [{ id: 'n-1', text: 'old note', clean: 'Old note.', kind: 'claim', themeIds: [] }],
    themes: [], bridges: [], heuristicHits: [], factChecks: [], boundaryConditions: [],
    generalisations: [], feed: [], frames: [],
  };
  fs.writeFileSync(path.join(home, 'session.json'), JSON.stringify(legacy));
  fs.writeFileSync(path.join(home, 'events.jsonl'), '{"t":"x"}\n');
  store.load();
  assert.ok(store.hasActive(), 'legacy session auto-opened');
  assert.equal(store.get().session.title, 'Oxford Roundtable');
  assert.equal(store.get().notes.length, 1);
  assert.equal(store.get().session.coreId, 'roundtable');
  assert.ok(!fs.existsSync(path.join(home, 'session.json')), 'legacy file moved, not copied');
  const dirs = fs.readdirSync(path.join(home, 'sessions'));
  assert.equal(dirs.length, 1);
  assert.ok(fs.existsSync(path.join(home, 'sessions', dirs[0], 'events.jsonl')), 'events log moved too');
});

test('archiveSession hides from list but keeps every file', () => {
  store.load();
  const s = store.createSession({ title: 'Done Soon', coreId: 'roundtable' });
  const id = s.session.id;
  store.flush();
  store.archiveSession(id);
  assert.equal(store.listSessions().length, 0);
  assert.equal(store.hasActive(), false, 'archiving the active session deactivates it');
  assert.ok(fs.existsSync(path.join(home, 'sessions', '.archive', id, 'session.json')), 'files preserved');
});

test('startup auto-opens the most recent session', () => {
  store.load();
  store.createSession({ title: 'Older', coreId: 'roundtable' });
  store.flush();
  const b = store.createSession({ title: 'Newer', coreId: 'roundtable' });
  store.flush();
  store.load(); // simulated restart
  assert.equal(store.get().session.id, b.session.id);
});
