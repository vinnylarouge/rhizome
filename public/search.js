// search.js — cross-session AI search overlay. Debounced queries against
// /api/search; semantic when an embeddings tier is configured, labelled
// substring fallback otherwise. Clicking a result opens its session.

(function () {
  const overlay = document.getElementById('searchOverlay');
  const input = document.getElementById('searchInput');
  const resultsEl = document.getElementById('searchResults');
  const modeEl = document.getElementById('searchMode');

  const esc = (s) => (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let timer = null;
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 250); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });

  async function run() {
    const q = input.value.trim();
    if (!q) { resultsEl.innerHTML = ''; modeEl.textContent = ''; return; }
    let r;
    try { r = await fetch('/api/search?q=' + encodeURIComponent(q)).then((x) => x.json()); }
    catch { r = { mode: 'error', results: [] }; }
    modeEl.textContent =
      r.mode === 'semantic' ? 'semantic + text match' :
      r.mode === 'substring' ? 'text match only — configure an embeddings model in Settings for semantic search' : '';
    resultsEl.innerHTML = (r.results || []).map((x) => `
      <div class="search-row" data-session="${esc(x.sessionId)}">
        <div class="sr-main">
          <div class="sr-title">${esc(x.text)}</div>
          <div class="sr-meta">${esc(x.sessionTitle)} · ${esc(x.kind)}${x.via === 'semantic' ? ` · ${(x.score * 100).toFixed(0)}%` : ''}</div>
        </div>
      </div>`).join('') || '<div class="empty">No matches.</div>';
  }

  resultsEl.addEventListener('click', async (e) => {
    const row = e.target.closest('.search-row');
    if (!row) return;
    await fetch('/api/sessions/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.dataset.session }) }).catch(() => {});
    hide();
  });

  document.getElementById('searchClose').addEventListener('click', hide);

  function show(q) {
    overlay.hidden = false;
    if (q) { input.value = q; run(); }
    input.focus();
    input.select();
  }
  function hide() { overlay.hidden = true; }

  window.RhizomeSearch = { show, hide };
})();
