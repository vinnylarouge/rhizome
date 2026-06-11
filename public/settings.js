// settings.js — the settings overlay: providers (OpenAI key or any local
// OpenAI-compatible endpoint), model tiers with per-tier connection tests, and
// extension-contributed fields. Keys arrive masked ('sk-…1234') and are posted
// back in the same form — the server swaps the mask for the stored key, so the
// real key never round-trips to the browser (the board is LAN-reachable).

(function () {
  const overlay = document.getElementById('settingsOverlay');
  const provEl = document.getElementById('providerCards');
  const presetEl = document.getElementById('providerPresets');
  const tierEl = document.getElementById('tierRows');
  const extEl = document.getElementById('extSettings');
  const savedEl = document.getElementById('settingsSaved');

  const TIERS = ['fast', 'strong', 'paper', 'embeddings'];
  const TIER_DESC = {
    fast: 'live workers — triage, themes, bridges',
    strong: 'fact-check · /abstract · /saymore',
    paper: '/compile — citations need OpenAI web search',
    embeddings: 'cross-session search index',
  };
  const PRESETS = [
    { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', flags: { reasoningEffort: true, webSearch: true, jsonMode: true } },
    { id: 'ollama', label: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', flags: { reasoningEffort: false, webSearch: false, jsonMode: true } },
    { id: 'lmstudio', label: 'LM Studio (local)', baseUrl: 'http://localhost:1234/v1', flags: { reasoningEffort: false, webSearch: false, jsonMode: true } },
    { id: 'custom', label: 'Custom endpoint', baseUrl: 'http://localhost:8000/v1', flags: { reasoningEffort: false, webSearch: false, jsonMode: false } },
  ];

  let model = null; // { settings, schemas } from GET /api/settings

  const esc = (s) => (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function render() {
    const s = model.settings;
    provEl.innerHTML = s.providers.map((p, i) => `
      <div class="provider-card" data-i="${i}">
        <div class="pc-row">
          <input class="pc-label" type="text" value="${esc(p.label)}" title="Display name" />
          <button class="pill pc-remove" title="Remove provider">✕</button>
        </div>
        <div class="pc-row">
          <input class="pc-url" type="text" value="${esc(p.baseUrl)}" placeholder="https://…/v1" title="OpenAI-compatible base URL" />
          <input class="pc-key" type="text" value="${esc(p.apiKey)}" placeholder="API key (empty for local)" title="API key — shown masked, stored server-side" />
        </div>
        <div class="pc-flags">
          <label><input class="pc-fl-effort" type="checkbox" ${p.flags?.reasoningEffort ? 'checked' : ''}/> reasoning effort</label>
          <label><input class="pc-fl-web" type="checkbox" ${p.flags?.webSearch ? 'checked' : ''}/> web search (citations)</label>
          <label><input class="pc-fl-json" type="checkbox" ${p.flags?.jsonMode ? 'checked' : ''}/> JSON mode</label>
        </div>
      </div>`).join('');

    presetEl.innerHTML = PRESETS.map((p, i) => `<button class="pill" data-preset="${i}">+ ${esc(p.label)}</button>`).join('');

    const options = (sel) => s.providers.map((p) => `<option value="${esc(p.id)}"${p.id === sel ? ' selected' : ''}>${esc(p.label)}</option>`).join('');
    tierEl.innerHTML = TIERS.map((t) => {
      const tier = s.tiers[t] || {};
      return `
      <div class="tier-row" data-tier="${t}">
        <div class="tr-name">${t}<div class="tr-desc">${TIER_DESC[t]}</div></div>
        <select class="tr-provider">${options(tier.providerId)}</select>
        <input class="tr-model" type="text" value="${esc(tier.model || '')}" placeholder="model name" />
        ${t === 'embeddings' ? '<span class="tr-effort-skip"></span>' : `<input class="tr-effort" type="text" value="${esc(tier.effort || '')}" placeholder="effort" title="reasoning effort (none/low/…) — sent only when the provider supports it" />`}
        <button class="pill tr-test">Test</button><span class="tr-result"></span>
      </div>`;
    }).join('');

    extEl.innerHTML = (model.schemas || []).map((sc) => `
      <div class="ext-block" data-ext="${esc(sc.extId)}">
        <div class="eb-name">${esc(sc.name)}</div>
        ${sc.fields.map((f) => `
          <div class="pc-row">
            <label class="eb-label">${esc(f.label)}</label>
            <input class="eb-field" data-key="${esc(f.key)}" type="text"
              value="${esc((s.extensions?.[sc.extId] || {})[f.key] || '')}" />
            ${f.type === 'folder' && window.rhizome?.pickFolder ? '<button class="pill eb-browse">Browse…</button>' : ''}
          </div>`).join('')}
      </div>`).join('') || '<div class="empty">No extension settings.</div>';
  }

  // Read the DOM back into model.settings (ids and masked keys preserved).
  function collect() {
    const s = model.settings;
    provEl.querySelectorAll('.provider-card').forEach((card) => {
      const p = s.providers[Number(card.dataset.i)];
      if (!p) return;
      p.label = card.querySelector('.pc-label').value.trim() || p.id;
      p.baseUrl = card.querySelector('.pc-url').value.trim();
      p.apiKey = card.querySelector('.pc-key').value.trim();
      p.flags = {
        reasoningEffort: card.querySelector('.pc-fl-effort').checked,
        webSearch: card.querySelector('.pc-fl-web').checked,
        jsonMode: card.querySelector('.pc-fl-json').checked,
      };
    });
    tierEl.querySelectorAll('.tier-row').forEach((row) => {
      const t = row.dataset.tier;
      s.tiers[t] = s.tiers[t] || {};
      s.tiers[t].providerId = row.querySelector('.tr-provider').value;
      s.tiers[t].model = row.querySelector('.tr-model').value.trim();
      const eff = row.querySelector('.tr-effort');
      if (eff) s.tiers[t].effort = eff.value.trim();
    });
    s.extensions = s.extensions || {};
    extEl.querySelectorAll('.ext-block').forEach((block) => {
      const ext = (s.extensions[block.dataset.ext] = s.extensions[block.dataset.ext] || {});
      block.querySelectorAll('.eb-field').forEach((f) => { ext[f.dataset.key] = f.value.trim(); });
    });
    return s;
  }

  async function save() {
    const body = { settings: collect() };
    const r = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => null);
    if (r && r.settings) { model.settings = r.settings; render(); }
    savedEl.hidden = false;
    setTimeout(() => { savedEl.hidden = true; }, 1600);
  }

  provEl.addEventListener('click', (e) => {
    const card = e.target.closest('.provider-card');
    if (card && e.target.closest('.pc-remove')) {
      collect();
      model.settings.providers.splice(Number(card.dataset.i), 1);
      render();
    }
  });

  presetEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-preset]');
    if (!btn) return;
    collect();
    const preset = PRESETS[Number(btn.dataset.preset)];
    let id = preset.id;
    for (let n = 2; model.settings.providers.some((p) => p.id === id); n++) id = `${preset.id}-${n}`;
    model.settings.providers.push({ id, label: preset.label, baseUrl: preset.baseUrl, apiKey: '', flags: { ...preset.flags } });
    render();
  });

  tierEl.addEventListener('click', async (e) => {
    const row = e.target.closest('.tier-row');
    if (!row || !e.target.closest('.tr-test')) return;
    const out = row.querySelector('.tr-result');
    out.textContent = '…';
    await save(); // tests run server-side against saved settings
    const r = await fetch('/api/settings/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tier: row.dataset.tier }) }).then((x) => x.json()).catch(() => ({ ok: false }));
    out.textContent = r.ok ? '✓' : '✗';
    out.className = 'tr-result ' + (r.ok ? 'ok' : 'bad');
  });

  extEl.addEventListener('click', async (e) => {
    if (!e.target.closest('.eb-browse')) return;
    const input = e.target.closest('.pc-row').querySelector('.eb-field');
    const dir = await window.rhizome.pickFolder();
    if (dir) input.value = dir;
  });

  document.getElementById('settingsSave').addEventListener('click', save);
  document.getElementById('settingsClose').addEventListener('click', () => { overlay.hidden = true; });

  async function show() {
    model = await fetch('/api/settings').then((r) => r.json()).catch(() => null);
    if (!model) return;
    render();
    overlay.hidden = false;
  }

  window.RhizomeSettings = { show, hide: () => { overlay.hidden = true; } };
})();
