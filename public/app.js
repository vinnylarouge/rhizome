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
  }

  // ---- left rail: live activity feed of AI-generated structure ----
  const FEED_ICON = { theme: '✦', bridge: '↔', refine: '✎', heuristic: '◆', factcheck: '✓', boundary: '⟂', principle: '↳', merge: '∪' };
  let lastFeedSig = '';
  function renderFeed(s) {
    const el = document.getElementById('feedList');
    const items = [...(s.feed || [])].reverse(); // newest first
    // Skip re-render (and the flash it causes) when the feed hasn't actually changed.
    const sig = items.length + ':' + (items[0] ? items[0].id : '');
    if (sig === lastFeedSig) return;
    lastFeedSig = sig;
    if (!items.length) { el.innerHTML = '<div class="empty">As you commit notes, generated themes, connections and refinements will stream in here.</div>'; el.scrollTop = 0; return; }
    el.innerHTML = items.map((it) => {
      const slug = it.head ? it.head.toLowerCase().replace(/[^a-z0-9]+/g, '-') : '';
      const head = it.head ? `<span class="fi-head fh-${slug}">${esc(it.head)}</span>` : '';
      return `
      <div class="feed-item fi-${it.type}">
        <span class="fi-icon">${FEED_ICON[it.type] || '·'}</span>
        <div class="fi-main">
          <div class="fi-text">${head}${esc(it.text)}</div>
          ${it.detail ? `<div class="fi-detail">${esc(it.detail)}</div>` : ''}
        </div>
      </div>`;
    }).join('');
    el.scrollTop = 0; // keep the newest in view
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
