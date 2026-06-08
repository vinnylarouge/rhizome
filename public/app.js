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
      else if (msg.type === 'status') showStatus(msg.text, msg.busy);
      else if (msg.type === 'activity') LoomGraph.setActivity(msg.ids);
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
  const FEED_ICON = { theme: '✦', bridge: '↔', refine: '✎', heuristic: '◆', factcheck: '✓', boundary: '⟂', principle: '↳', merge: '∪', abstract: '❖', elaborate: '＋' };
  let lastFeedSig = '';
  let selectedFeedId = null;   // selected feed line (for expand + /saymore target)
  let selectedRef = null;      // the graph element it points to
  function renderFeed(s, force) {
    const el = document.getElementById('feedList');
    const items = [...(s.feed || [])].reverse(); // newest first
    // Skip re-render (and the flash it causes) when nothing relevant changed.
    const sig = items.length + ':' + (items[0] ? items[0].id : '') + ':' + (selectedFeedId || '');
    if (!force && sig === lastFeedSig) return;
    lastFeedSig = sig;
    if (!items.length) { el.innerHTML = '<div class="empty">As you commit notes, generated themes, connections and refinements will stream in here.</div>'; el.scrollTop = 0; return; }
    el.innerHTML = items.map((it) => {
      const slug = it.head ? it.head.toLowerCase().replace(/[^a-z0-9]+/g, '-') : '';
      const head = it.head ? `<span class="fi-head fh-${slug}">${esc(it.head)}</span>` : '';
      const sel = it.id === selectedFeedId ? ' selected' : '';
      return `
      <div class="feed-item fi-${it.type}${sel}" data-id="${it.id}" data-ref="${it.ref || ''}">
        <span class="fi-icon">${FEED_ICON[it.type] || '·'}</span>
        <div class="fi-main">
          <div class="fi-text">${head}${esc(it.text)}</div>
          ${it.detail ? `<div class="fi-detail">${esc(it.detail)}</div>` : ''}
        </div>
      </div>`;
    }).join('');
    // When something is selected, keep it in view (it's expanded); else show newest.
    const selEl = selectedFeedId && el.querySelector('.feed-item.selected');
    if (selEl) selEl.scrollIntoView({ block: 'nearest' });
    else el.scrollTop = 0;
  }

  // Click a feed line → select it (expand + pin) and highlight its graph element.
  document.getElementById('feedList').addEventListener('click', (e) => {
    const item = e.target.closest('.feed-item');
    if (!item) return;
    const id = item.dataset.id, ref = item.dataset.ref;
    if (selectedFeedId === id) { selectedFeedId = null; selectedRef = null; }   // toggle off
    else { selectedFeedId = id; selectedRef = ref || null; if (ref) LoomGraph.highlight(ref); }
    renderFeed(state, true);
  });

  // ---- scratchpad (single field; Chatham House — no provenance captured) ----
  const input = document.getElementById('noteInput');

  function autoGrow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; }
  input.addEventListener('input', autoGrow);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
  });
  document.getElementById('commitBtn').addEventListener('click', commit);

  async function commit() {
    const raw = input.value.trim();
    if (!raw) return;
    if (raw[0] === '/') { runCommand(raw); return; }   // slash commands aren't notes
    input.value = ''; autoGrow(); input.focus();
    try {
      await fetch('/api/note', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: raw }) });
    } catch (err) {
      input.value = raw; autoGrow(); // restore so nothing is lost if the post fails
    }
  }

  function runCommand(raw) {
    const cmd = raw.toLowerCase().split(/\s+/)[0];
    input.value = ''; autoGrow(); input.focus();
    const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).catch(() => {});
    switch (cmd) {
      case '/merge': flashCmd('Consolidating themes…'); post('/api/merge'); break;
      case '/abstract': flashCmd('Finding abstractions…'); post('/api/abstract'); break;
      case '/chunk': flashCmd('Chunking long points…'); post('/api/chunk'); break;
      case '/organise': case '/organize': flashCmd('Organising…'); LoomGraph.organise(); break;
      case '/saymore':
        if (!selectedRef) { flashCmd('Select a feed item first'); break; }
        flashCmd('Elaborating…'); post('/api/saymore', { id: selectedRef }); break;
      default: flashCmd('Unknown command');
    }
  }

  // brief command confirmation in the placeholder
  function flashCmd(msg) {
    const ph = input.dataset.ph || input.placeholder;
    input.dataset.ph = ph;
    input.placeholder = '✓ ' + msg;
    setTimeout(() => { input.placeholder = input.dataset.ph; }, 1800);
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

  // ---- status pill (progress for chunky commands) ----
  let statusTimer = null, statusStart = 0, statusLabel = '';
  function showStatus(text, busy) {
    const el = document.getElementById('statusPill');
    if (!el) return;
    if (busy && text) {
      statusLabel = text; statusStart = Date.now(); el.hidden = false; tickStatus();
      if (statusTimer) clearInterval(statusTimer);
      statusTimer = setInterval(tickStatus, 1000);
    } else {
      if (statusTimer) { clearInterval(statusTimer); statusTimer = null; }
      el.hidden = true;
    }
  }
  function tickStatus() {
    const el = document.getElementById('statusPill');
    if (!el) return;
    const secs = Math.floor((Date.now() - statusStart) / 1000);
    el.textContent = `⟳ ${statusLabel}${secs ? ' ' + secs + 's' : ''}`;
  }

  connect();
  input.focus();
})();
