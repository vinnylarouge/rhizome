// cores.test.js — bundled cores validate; seeding copies once; invalid user
// edits fall back to the bundled copy; prompt placeholders expand.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as cores from '../src/cores.js';

beforeEach(() => {
  process.env.RHIZOME_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'rhizome-cores-'));
});

test('all bundled cores load and validate', () => {
  for (const id of ['roundtable', 'retrospective', 'design-crit']) {
    const core = cores.get(id);
    assert.ok(core, `${id} loads`);
    assert.deepEqual(cores.validate(core), [], `${id} has no validation errors`);
    assert.ok(core.anchors.every((a) => a.color), `${id} anchors got colours`);
  }
});

test('seed() copies bundled cores once, never clobbers user edits', () => {
  const home = process.env.RHIZOME_HOME;
  cores.seed();
  const userFile = path.join(home, 'cores', 'roundtable', 'core.json');
  assert.ok(fs.existsSync(userFile));
  const edited = JSON.parse(fs.readFileSync(userFile, 'utf8'));
  edited.name = 'My Edited Roundtable';
  fs.writeFileSync(userFile, JSON.stringify(edited));
  cores.seed(); // second seed must not overwrite
  assert.equal(cores.get('roundtable').name, 'My Edited Roundtable');
});

test('invalid user core falls back to the bundled copy', () => {
  const home = process.env.RHIZOME_HOME;
  cores.seed();
  fs.writeFileSync(path.join(home, 'cores', 'roundtable', 'core.json'), '{ not json');
  const core = cores.get('roundtable');
  assert.ok(core, 'still loads');
  assert.equal(core.name, 'Roundtable (values & painpoints)', 'bundled copy used');
});

test('renderPrompt expands {{kinds}} and {{anchorLabels}}', () => {
  const core = cores.get('roundtable');
  const sys = cores.renderPrompt(core, 'triage');
  assert.ok(sys.includes('"value"|"painpoint"|"question"|"anecdote"|"claim"|"decision"|"other"'));
  assert.ok(sys.includes('["VALUES","PAINPOINTS","OPEN QUESTIONS"]'));
  assert.ok(!sys.includes('{{'), 'no unexpanded placeholders');
});

test('list() includes bundled cores and user-only cores', () => {
  const home = process.env.RHIZOME_HOME;
  const custom = structuredClone(cores.get('roundtable'));
  custom.id = 'my-custom';
  custom.name = 'My Custom Core';
  fs.mkdirSync(path.join(home, 'cores', 'my-custom'), { recursive: true });
  fs.writeFileSync(path.join(home, 'cores', 'my-custom', 'core.json'), JSON.stringify(custom));
  const ids = cores.list().map((c) => c.id);
  for (const id of ['roundtable', 'retrospective', 'design-crit', 'my-custom']) {
    assert.ok(ids.includes(id), `${id} listed`);
  }
});
