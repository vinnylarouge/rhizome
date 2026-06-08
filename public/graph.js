// graph.js — the living knowledge graph. Exposes window.LoomGraph.update(state).
// Notes are small nodes, themes are glowing gold nodes, the three anchors are pinned
// as a stable scaffold, and bridges animate in as coloured edges. Positions persist
// across state pushes so the picture *evolves* instead of reshuffling.

(function () {
  const svg = d3.select('#graph');
  const tooltip = d3.select('#tooltip');
  let width = 0, height = 0;

  const root = svg.append('g');
  const gHull = root.append('g');     // hypernode-circles (behind everything)
  const gLink = root.append('g');     // membership + frame links (faint)
  const gBridge = root.append('g');   // bridges (coloured)
  const gNode = root.append('g');
  const gLabel = root.append('g');
  const gDrone = root.append('g');    // AI worker drones (top layer)

  let lastUserInteract = 0;
  const zoom = d3.zoom().scaleExtent([0.25, 3]).on('zoom', (e) => {
    root.attr('transform', e.transform);
    if (e.sourceEvent) lastUserInteract = Date.now(); // only real gestures pause auto-fit
  });
  svg.call(zoom);

  const nodeById = new Map();   // preserve x/y/vx/vy across updates
  let hullsOn = false;          // toggled by /organise
  let clusterStrength = 0;      // boosted by /organise
  let lastState = null;

  const sim = d3
    .forceSimulation()
    .force('link', d3.forceLink().id((d) => d.id)
      .distance((l) => (l.kind === 'bridge' ? 150 : l.kind === 'frame' ? 110 : 64))
      .strength((l) => (l.kind === 'bridge' ? 0.05 : l.kind === 'frame' ? 0.08 : 0.28)))
    .force('charge', d3.forceManyBody().strength(-190))
    .force('collide', d3.forceCollide().radius((d) => radius(d) + 10))
    .force('x', d3.forceX(() => width / 2).strength(0.03))
    .force('y', d3.forceY(() => height / 2).strength(0.03))
    .force('cluster', clusterForce)
    .on('tick', tick);

  // Pull notes toward their theme's centroid; strength rises with /organise so
  // related points gather into tight, separable groups (the hypernode-circles).
  function clusterForce(alpha) {
    if (clusterStrength <= 0) return;
    const k = clusterStrength * alpha;
    sim.nodes().forEach((n) => {
      if (n.type !== 'note' || !n.themeIds) return;
      const t = n.themeIds.map((id) => nodeById.get(id)).find((x) => x && x.type === 'theme');
      if (t) { n.vx += (t.x - n.x) * k; n.vy += (t.y - n.y) * k; }
    });
  }

  function radius(d) {
    if (d.type === 'anchor') return 30;
    if (d.type === 'theme') return Math.min(13 + d.count * 1.4, 26);
    if (d.type === 'frame') return 17;
    return 5.5;
  }

  function anchorPos() {
    return {
      'anchor-values': { x: width * 0.26, y: height * 0.3 },
      'anchor-painpoints': { x: width * 0.74, y: height * 0.3 },
      'anchor-questions': { x: width * 0.5, y: height * 0.8 },
    };
  }

  function resize() {
    const wrap = document.getElementById('graphWrap');
    width = wrap.clientWidth;
    height = wrap.clientHeight;
    svg.attr('viewBox', `0 0 ${width} ${height}`);
    const ap = anchorPos();
    for (const [id, p] of Object.entries(ap)) {
      const n = nodeById.get(id);
      if (n) { n.fx = p.x; n.fy = p.y; }
    }
    sim.alpha(0.3).restart();
  }
  window.addEventListener('resize', resize);

  function buildGraph(state) {
    const nodes = [];
    const links = [];
    const ap = anchorPos();

    for (const t of state.themes) {
      const isAnchor = t.kind === 'anchor';
      const prev = nodeById.get(t.id) || {};
      const n = {
        id: t.id,
        type: isAnchor ? 'anchor' : 'theme',
        label: t.label,
        summary: t.summary,
        count: t.noteIds.length,
        x: prev.x, y: prev.y, vx: prev.vx, vy: prev.vy,
      };
      if (isAnchor && ap[t.id]) { n.fx = ap[t.id].x; n.fy = ap[t.id].y; }
      nodes.push(n);
    }
    for (const note of state.notes) {
      const prev = nodeById.get(note.id) || {};
      nodes.push({
        id: note.id, type: 'note', text: note.clean || note.text, kind: note.kind,
        parent: note.parent, themeIds: note.themeIds, derived: note.derived, elaboration: note.elaboration,
        x: prev.x, y: prev.y, vx: prev.vx, vy: prev.vy,
      });
    }
    for (const fr of (state.frames || [])) {
      const prev = nodeById.get(fr.id) || {};
      nodes.push({
        id: fr.id, type: 'frame', label: fr.name, frameKind: fr.frameKind, gist: fr.gist,
        x: prev.x, y: prev.y, vx: prev.vx, vy: prev.vy,
      });
    }
    const present = new Set(nodes.map((n) => n.id));
    for (const note of state.notes) {
      for (const tid of note.themeIds) {
        if (present.has(tid)) links.push({ source: note.id, target: tid, kind: 'member' });
      }
    }
    for (const b of state.bridges) {
      if (present.has(b.source) && present.has(b.target))
        links.push({ source: b.source, target: b.target, kind: 'bridge', type: b.type, rationale: b.rationale, id: b.id });
    }
    for (const fr of (state.frames || [])) {
      for (const tid of (fr.themeIds || [])) {
        if (present.has(fr.id) && present.has(tid)) links.push({ source: fr.id, target: tid, kind: 'frame' });
      }
    }

    nodeById.clear();
    for (const n of nodes) nodeById.set(n.id, n);
    return { nodes, links };
  }

  let firstSeen = new Set();

  function update(state) {
    lastState = state;
    const { nodes, links } = buildGraph(state);
    const parentOf = new Map(nodes.map((n) => [n.id, n.parent]));

    // membership links (faintly tinted by the note's parent type)
    gLink.selectAll('line.link').data(links.filter((l) => l.kind === 'member'), (d) => d.source + '|' + d.target)
      .join(
        (enter) => enter.append('line').attr('class', (d) => 'link p-' + (parentOf.get(d.source) || 'none')),
        (u) => u.attr('class', (d) => 'link p-' + (parentOf.get(d.source) || 'none')),
        (ex) => ex.remove()
      );

    // frame links (frame → the themes it abstracts over)
    gLink.selectAll('line.frame-link').data(links.filter((l) => l.kind === 'frame'), (d) => d.source + '|' + d.target)
      .join((enter) => enter.append('line').attr('class', 'frame-link'), (u) => u, (ex) => ex.remove());

    // bridges: a fat invisible hit-path (easy to hover) + the visible curved stroke
    gBridge.selectAll('g.bridge-g').data(links.filter((l) => l.kind === 'bridge'), (d) => d.id)
      .join(
        (enter) => {
          const g = enter.append('g').attr('class', 'bridge-g')
            .on('mousemove', showBridgeTip).on('mouseleave', hideTip);
          g.append('path').attr('class', 'bridge-hit');
          g.append('path').attr('class', (d) => 'bridge ' + d.type);
          return g;
        },
        (u) => { u.select('path.bridge').attr('class', (d) => 'bridge ' + d.type); return u; },
        (ex) => ex.remove()
      );

    // nodes — newly-appeared ones get a temporary glow (tracked in `glowing`)
    const nodeSel = gNode.selectAll('circle.node').data(nodes, (d) => d.id)
      .join(
        (enter) => enter.append('circle')
          .attr('class', (d) => { if (!firstSeen.has(d.id)) { glowing.add(d.id); scheduleGlowClear(d.id); } return nodeClass(d); })
          .attr('r', radius)
          .call(drag(sim))
          .on('mousemove', showTip).on('mouseleave', hideTip),
        (u) => u.attr('class', (d) => nodeClass(d)).attr('r', radius),
        (ex) => ex.remove()
      );

    // labels (themes + anchors only)
    gLabel.selectAll('text.glabel').data(nodes.filter((n) => n.type !== 'note'), (d) => d.id)
      .join(
        (enter) => enter.append('text')
          .attr('class', (d) => (d.type === 'anchor' ? 'label-anchor p-' + (ANCHOR_KEY[d.id] || 'none') : d.type === 'frame' ? 'label-frame' : 'label-theme') + ' glabel')
          .text((d) => d.label),
        (u) => u.text((d) => d.label), (ex) => ex.remove()
      );

    nodes.forEach((n) => firstSeen.add(n.id));

    sim.nodes(nodes);
    sim.force('link').links(links);
    sim.alpha(0.5).restart();
    updateCounts(state);
    updateWorkingClass(); // re-apply drone "working" ring after the node rejoin
  }

  const ANCHOR_KEY = { 'anchor-values': 'values', 'anchor-painpoints': 'painpoints', 'anchor-questions': 'questions' };
  const glowing = new Set();
  function scheduleGlowClear(id) {
    setTimeout(() => {
      glowing.delete(id);
      gNode.selectAll('circle.node').filter((d) => d.id === id).attr('class', (d) => nodeClass(d));
    }, 2600);
  }
  function nodeClass(d) {
    let c;
    if (d.type === 'anchor') c = 'node node-anchor p-' + (ANCHOR_KEY[d.id] || 'none');
    else if (d.type === 'theme') c = 'node node-theme';
    else if (d.type === 'frame') c = 'node node-frame frame-' + (d.frameKind || 'frame');
    else c = 'node node-note p-' + (d.parent || 'none') + (d.derived ? ' derived' : '');
    return glowing.has(d.id) ? c + ' node-glow' : c;
  }

  function arcPath(d) {
    const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y;
    const dr = Math.hypot(dx, dy) * 1.6;
    return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;
  }
  function tick() {
    gLink.selectAll('line')
      .attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y);
    gBridge.selectAll('path').attr('d', (d) => (d && d.source && d.target ? arcPath(d) : null));
    gNode.selectAll('circle.node').attr('cx', (d) => d.x).attr('cy', (d) => d.y);
    gLabel.selectAll('text.glabel')
      .attr('x', (d) => d.x)
      .attr('y', (d) => d.y + (d.type === 'anchor' ? 46 : radius(d) + 15));
    renderHulls();
  }

  // Hypernode-circles: a translucent enclosing circle per emergent theme group.
  function renderHulls() {
    if (!hullsOn || !lastState) { gHull.selectAll('*').remove(); return; }
    const circles = lastState.themes
      .filter((t) => t.kind !== 'anchor')
      .map((t) => {
        const pts = t.noteIds.map((id) => nodeById.get(id)).filter((n) => n && n.x != null);
        const tn = nodeById.get(t.id); if (tn && tn.x != null) pts.push(tn);
        if (pts.length < 2) return null;
        const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
        const r = Math.max(...pts.map((p) => Math.hypot(p.x - cx, p.y - cy))) + 24;
        return { id: t.id, cx, cy, r };
      })
      .filter(Boolean);
    gHull.selectAll('circle.hull').data(circles, (d) => d.id)
      .join((enter) => enter.append('circle').attr('class', 'hull'), (u) => u, (ex) => ex.remove())
      .attr('cx', (d) => d.cx).attr('cy', (d) => d.cy).attr('r', (d) => d.r);
  }

  // ---- auto-fit: keep the whole graph framed & balanced as it grows ----------
  function fitToView(smooth) {
    const ns = sim.nodes();
    if (!ns.length || !width) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of ns) {
      if (n.x == null) continue;
      const r = radius(n) + (n.type === 'note' ? 12 : 34);
      minX = Math.min(minX, n.x - r); maxX = Math.max(maxX, n.x + r);
      minY = Math.min(minY, n.y - r); maxY = Math.max(maxY, n.y + r);
    }
    const cw = maxX - minX, ch = maxY - minY;
    if (!(cw > 0 && ch > 0)) return;
    const scale = Math.max(0.25, Math.min((width - 48) / cw, (height - 48) / ch, 1.5));
    const tx = width / 2 - scale * (minX + maxX) / 2;
    const ty = height / 2 - scale * (minY + maxY) / 2;
    const t = d3.zoomIdentity.translate(tx, ty).scale(scale);
    (smooth ? svg.transition().duration(650) : svg).call(zoom.transform, t);
  }
  function maybeFit() { if (Date.now() - lastUserInteract > 6000) fitToView(true); }
  setInterval(maybeFit, 2500);

  // ---- /organise: gather related points into separable hypernode-circles -----
  function organise() {
    hullsOn = true;
    clusterStrength = 0.5;
    sim.alpha(0.9).restart();
    setTimeout(() => { clusterStrength = 0.08; }, 2600); // relax to a gentle hold
  }

  // ---- highlight a graph element (from a feed click) -------------------------
  function highlight(id) {
    const node = nodeById.get(id);
    if (node && node.x != null) {
      centerOn(node.x, node.y);
      const sel = gNode.selectAll('circle.node').filter((d) => d.id === id);
      sel.classed('node-hl', true);
      setTimeout(() => sel.classed('node-hl', false), 2400);
      return;
    }
    const g = gBridge.selectAll('g.bridge-g').filter((d) => d.id === id);
    if (!g.empty()) {
      const d = g.datum();
      if (d.source && d.target) centerOn((d.source.x + d.target.x) / 2, (d.source.y + d.target.y) / 2);
      const p = g.select('path.bridge');
      p.classed('bridge-hl', true);
      setTimeout(() => p.classed('bridge-hl', false), 2400);
    }
  }
  function centerOn(x, y) {
    lastUserInteract = Date.now(); // hold auto-fit so the focus sticks briefly
    const cur = d3.zoomTransform(svg.node());
    const t = d3.zoomIdentity.translate(width / 2 - cur.k * x, height / 2 - cur.k * y).scale(cur.k);
    svg.transition().duration(500).call(zoom.transform, t);
  }

  // ---- AI worker drones: chevrons that orbit the node(s) under active work ----
  let activeIds = new Set();
  let droneRunning = false;
  function setActivity(ids) {
    activeIds = new Set(ids || []);
    updateWorkingClass();
    if (activeIds.size && !droneRunning) { droneRunning = true; requestAnimationFrame(droneLoop); }
  }
  function updateWorkingClass() {
    gNode.selectAll('circle.node').classed('node-working', (d) => activeIds.has(d.id));
  }
  function droneLoop() {
    renderDrones();
    if (activeIds.size) requestAnimationFrame(droneLoop);
    else { droneRunning = false; gDrone.selectAll('*').remove(); }
  }
  function renderDrones() {
    const t = Date.now() / 1000;
    const drones = [];
    let i = 0;
    for (const id of activeIds) {
      const n = nodeById.get(id);
      if (!n || n.x == null) continue;
      const ang = t * 2.6 + i * 2.1;          // orbit the node
      const rad = radius(n) + 16;
      // rot = ang - 90° makes the chevron apex point inward, at the node it circles
      drones.push({ id: id + i, x: n.x + Math.cos(ang) * rad, y: n.y + Math.sin(ang) * rad, rot: ang * 180 / Math.PI - 90 });
      i++;
    }
    gDrone.selectAll('path.drone').data(drones, (d) => d.id)
      .join(
        (enter) => enter.append('path').attr('class', 'drone').attr('d', 'M-5,4 L0,-6 L5,4'),
        (u) => u,
        (ex) => ex.remove()
      )
      .attr('transform', (d) => `translate(${d.x},${d.y}) rotate(${d.rot})`);
  }

  function drag(simulation) {
    return d3.drag()
      .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.2).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on('end', (e, d) => {
        if (!e.active) simulation.alphaTarget(0);
        if (d.type !== 'anchor') { d.fx = null; d.fy = null; }
      });
  }

  function showTip(event, d) {
    let html = '';
    if (d.type === 'note') {
      html = `<div>${escapeHtml(d.text)}</div><div class="tt-meta">${d.kind || ''}${d.derived ? ' · inferred by AI' : ''}</div>`
        + (d.elaboration ? `<div class="tt-elab">${escapeHtml(d.elaboration)}</div>` : '');
    } else if (d.type === 'frame') {
      html = `<div class="tt-frame">${escapeHtml(d.frameKind || 'frame')}</div><div><b>${escapeHtml(d.label)}</b></div>`
        + (d.gist ? `<div class="tt-meta">${escapeHtml(d.gist)}</div>` : '');
    } else {
      html = `<div><b>${escapeHtml(d.label)}</b></div>` + (d.summary ? `<div class="tt-meta">${escapeHtml(d.summary)}</div>` : '') + `<div class="tt-meta">${d.count || 0} notes</div>`;
    }
    const wrap = document.getElementById('graphWrap').getBoundingClientRect();
    tooltip.html(html).attr('hidden', null)
      .style('left', Math.min(event.clientX - wrap.left + 12, wrap.width - 290) + 'px')
      .style('top', (event.clientY - wrap.top + 12) + 'px');
  }
  function hideTip() { tooltip.attr('hidden', true); }

  function showBridgeTip(event, d) {
    const html = `<div class="tt-bridge">${escapeHtml(d.type)}</div><div class="tt-meta">${escapeHtml(d.rationale || 'connection')}</div>`;
    const wrap = document.getElementById('graphWrap').getBoundingClientRect();
    tooltip.html(html).attr('hidden', null)
      .style('left', Math.min(event.clientX - wrap.left + 12, wrap.width - 290) + 'px')
      .style('top', (event.clientY - wrap.top + 12) + 'px');
  }

  function updateCounts(state) {
    const emergent = state.themes.filter((t) => t.kind !== 'anchor').length;
    document.getElementById('counts').textContent =
      `${state.notes.length} notes · ${emergent} themes · ${state.bridges.length} bridges`;
  }

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // legend — explains the parent-type colour coding (protanopia-safe hues)
  document.getElementById('legend').innerHTML =
    '<span class="lg p-values">values</span>' +
    '<span class="lg p-painpoints">painpoints</span>' +
    '<span class="lg p-questions">questions</span>' +
    '<span class="lg lg-theme">theme</span>' +
    '<span class="lg lg-frame">abstraction</span>' +
    '<span class="lg lg-derived">inferred</span>' +
    '<span class="lg-sep"></span>' +
    '<span class="lg ed ed-tension">tension</span>' +
    '<span class="lg ed ed-echoes">echoes</span>' +
    '<span class="lg ed ed-causes">causes</span>' +
    '<span class="lg ed ed-relates">relates</span>' +
    '<span class="lg ed ed-abduced">inferred link</span>';

  resize();
  window.LoomGraph = { update, resize, organise, highlight, setActivity };
})();
