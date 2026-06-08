// app.js — client controller. Holds the websocket, applies state to the graph and
// the two side rails, and owns the scratchpad. Note commits POST immediately and the
// node shows up the instant the server broadcasts — never waiting on the LLM.

(function () {
  let state = null;
  let noteById = new Map();

  // ---- websocket with auto-reconnect ----
  let ws;
  function connect() {
    ws = new WebSocket(`ws://${location.host}/ws`);
    ws.onopen = () => setConn(true);
    ws.onclose = () => { setConn(false); setTimeout(connect, 1200); };
    ws.onerror = () => ws.close();
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'state') applyState(msg.state);
    };
  }
  function setConn(up) {
    const el = document.getElementById('conn');
    el.classList.toggle('down', !up);
    el.title = up ? 'connected' : 'reconnecting…';
  }

  function applyState(s) {
    state = s;
    noteById = new Map(s.notes.map((n) => [n.id, n]));
    document.getElementById('sessionTitle').textContent = s.session.title;
    syncPauseBtn();
    LoomGraph.update(s);
    renderFeed(s);
    renderChecks(s);
  }

  // ---- left rail: live activity feed of AI-generated structure ----
  const FEED_ICON = { theme: '✦', bridge: '↔', refine: '✎', heuristic: '◆', factcheck: '✓', boundary: '⟂', principle: '↳' };
  function renderFeed(s) {
    const el = document.getElementById('feedList');
    const items = [...(s.feed || [])].reverse();
    if (!items.length) { el.innerHTML = '<div class="empty">As you commit notes, generated themes, connections and refinements will stream in here.</div>'; return; }
    el.innerHTML = items.map((it) => `
      <div class="feed-item fi-${it.type}">
        <span class="fi-icon">${FEED_ICON[it.type] || '·'}</span>
        <div class="fi-main">
          <div class="fi-text">${esc(it.text)}</div>
          ${it.detail ? `<div class="fi-detail">${esc(it.detail)}</div>` : ''}
        </div>
      </div>`).join('');
  }

  // ---- right rail: fact-checks + boundary + generalisations ----
  function renderChecks(s) {
    const el = document.getElementById('checksList');
    // Group by note so a claim's verdict, boundary and principle read as one card.
    const byNote = new Map();
    const slot = (id) => { if (!byNote.has(id)) byNote.set(id, {}); return byNote.get(id); };
    for (const f of s.factChecks) slot(f.noteId).fc = f;
    for (const b of s.boundaryConditions) slot(b.noteId).boundary = b;
    for (const g of s.generalisations) slot(g.noteId).gen = g;

    const ordered = [...byNote.entries()].reverse();
    if (!ordered.length) { el.innerHTML = '<div class="empty">Fact-checks and boundary conditions appear here when claims or anecdotes are raised.</div>'; return; }

    el.innerHTML = ordered.map(([noteId, g]) => {
      const note = noteById.get(noteId);
      const v = g.fc ? g.fc.verdict : 'unknown';
      return `<div class="card fc-card ${v}">
        ${g.fc ? `<span class="verdict ${v}">${esc(v)}</span>` : ''}
        ${g.fc ? `<div class="ctitle">${esc(g.fc.statement)}</div><div class="cbody">${esc(g.fc.detail)}</div>` : ''}
        ${g.boundary ? `<div class="boundary">${esc(g.boundary.text)}</div>` : ''}
        ${g.gen ? `<div class="principle">${esc(g.gen.principle)}</div>` : ''}
        ${note ? `<div class="quote">${esc(trim(disp(note)))}</div>` : ''}
      </div>`;
    }).join('');
  }

  // ---- scratchpad (single field; Chatham House — no provenance captured) ----
  const input = document.getElementById('noteInput');

  function autoGrow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; }
  input.addEventListener('input', autoGrow);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
  });
  document.getElementById('commitBtn').addEventListener('click', commit);

  async function commit() {
    const text = input.value.trim();
    if (!text) return;
    input.value = ''; autoGrow(); input.focus();
    try {
      await fetch('/api/note', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    } catch (err) {
      input.value = text; autoGrow(); // restore so nothing is lost if the post fails
    }
  }

  // ---- pause ----
  const pauseBtn = document.getElementById('pauseBtn');
  pauseBtn.addEventListener('click', async () => {
    const next = !(state && state.paused);
    await fetch('/api/pause', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paused: next }) });
  });
  function syncPauseBtn() {
    const p = state && state.paused;
    pauseBtn.classList.toggle('paused', p);
    pauseBtn.textContent = p ? '▶ Resume AI' : '⏸ Pause AI';
  }

  // ---- editable title ----
  const titleEl = document.getElementById('sessionTitle');
  titleEl.addEventListener('blur', () => {
    fetch('/api/title', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: titleEl.textContent.trim() }) });
  });
  titleEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); } });

  function esc(s) { return (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function trim(s, n = 120) { return (s || '').length > n ? s.slice(0, n) + '…' : (s || ''); }
  function disp(note) { return note ? (note.clean || note.text) : ''; }

  connect();
  input.focus();
})();
