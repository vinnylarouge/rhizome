// library.js — the session library overlay: resume or archive existing sessions,
// or start a new one by picking a discussion core. Shown automatically when no
// session is active; openable any time via /sessions or the topbar button.

(function () {
  const overlay = document.getElementById('libraryOverlay');
  const listEl = document.getElementById('sessionList');
  const coresEl = document.getElementById('coreCards');
  const titleEl = document.getElementById('newSessionTitle');
  const closeBtn = document.getElementById('libraryClose');
  let selectedCore = null;
  let forcedOpen = false; // true when shown because no session exists (no close)

  const esc = (s) => (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const post = (url, body) =>
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

  async function refresh() {
    const [sess, cors] = await Promise.all([
      fetch('/api/sessions').then((r) => r.json()).catch(() => ({ sessions: [] })),
      fetch('/api/cores').then((r) => r.json()).catch(() => ({ cores: [] })),
    ]);
    renderSessions(sess.sessions || []);
    renderCores(cors.cores || []);
  }

  function renderSessions(sessions) {
    if (!sessions.length) {
      listEl.innerHTML = '<div class="empty">No sessions yet — start one on the left.</div>';
      return;
    }
    listEl.innerHTML = sessions.map((s) => `
      <div class="session-row" data-id="${esc(s.id)}">
        <div class="sr-main">
          <div class="sr-title">${esc(s.title)}</div>
          <div class="sr-meta">${esc(s.coreName)} · ${s.startedAt ? new Date(s.startedAt).toLocaleString() : ''} · ${s.notes} notes</div>
        </div>
        <button class="pill sr-resume">Resume</button>
        <button class="pill sr-archive" title="Moves to sessions/.archive — never deletes">Archive</button>
      </div>`).join('');
  }

  function renderCores(cores) {
    if (!selectedCore && cores.length) selectedCore = cores[0].id;
    coresEl.innerHTML = cores.map((c) => `
      <div class="core-card${c.id === selectedCore ? ' selected' : ''}" data-id="${esc(c.id)}">
        <div class="cc-name">${esc(c.name)}</div>
        <div class="cc-desc">${esc(c.description)}</div>
      </div>`).join('');
  }

  coresEl.addEventListener('click', (e) => {
    const card = e.target.closest('.core-card');
    if (!card) return;
    selectedCore = card.dataset.id;
    coresEl.querySelectorAll('.core-card').forEach((el) => el.classList.toggle('selected', el.dataset.id === selectedCore));
  });

  listEl.addEventListener('click', async (e) => {
    const row = e.target.closest('.session-row');
    if (!row) return;
    if (e.target.closest('.sr-resume')) {
      await post('/api/sessions/open', { id: row.dataset.id });
      hide();
    } else if (e.target.closest('.sr-archive')) {
      await post('/api/sessions/archive', { id: row.dataset.id });
      refresh();
    }
  });

  document.getElementById('newSessionStart').addEventListener('click', createSession);
  titleEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); createSession(); } });
  async function createSession() {
    await post('/api/sessions', { title: titleEl.value.trim(), coreId: selectedCore });
    titleEl.value = '';
    hide();
  }

  closeBtn.addEventListener('click', hide);

  function show(forced) {
    forcedOpen = !!forced;
    closeBtn.hidden = forcedOpen; // nothing to go back to when no session exists
    overlay.hidden = false;
    refresh();
    titleEl.focus();
  }
  function hide() {
    overlay.hidden = true;
    forcedOpen = false;
  }
  // Called on every state push: no active session → force the library open;
  // a session appearing (created on another device) closes a forced overlay.
  function maybeShowForState(state) {
    if (!state) show(true);
    else if (forcedOpen) hide();
  }

  window.RhizomeLibrary = { show, hide, maybeShowForState };
})();
