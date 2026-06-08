// graph.js — the living knowledge graph. Exposes window.LoomGraph.update(state).
// Notes are small nodes, themes are glowing gold nodes, the three anchors are pinned
// as a stable scaffold, and bridges animate in as coloured edges. Positions persist
// across state pushes so the picture *evolves* instead of reshuffling.

(function () {
  const svg = d3.select('#graph');
  const tooltip = d3.select('#tooltip');
  let width = 0, height = 0;

  const root = svg.append('g');
  const gLink = root.append('g');     // membership links (faint)
  const gBridge = root.append('g');   // bridges (coloured)
  const gNode = root.append('g');
  const gLabel = root.append('g');

  svg.call(
    d3.zoom().scaleExtent([0.3, 3]).on('zoom', (e) => root.attr('transform', e.transform))
  );

  const nodeById = new Map();   // preserve x/y/vx/vy across updates

  const sim = d3
    .forceSimulation()
    .force('link', d3.forceLink().id((d) => d.id).distance((l) => (l.kind === 'bridge' ? 150 : 64)).strength((l) => (l.kind === 'bridge' ? 0.05 : 0.28)))
    .force('charge', d3.forceManyBody().strength(-190))
    .force('collide', d3.forceCollide().radius((d) => radius(d) + 10))
    .force('x', d3.forceX(() => width / 2).strength(0.03))
    .force('y', d3.forceY(() => height / 2).strength(0.03))
    .on('tick', tick);

  function radius(d) {
    if (d.type === 'anchor') return 30;
    if (d.type === 'theme') return Math.min(13 + d.count * 1.4, 26);
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
        parent: note.parent, themeIds: note.themeIds,
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

    nodeById.clear();
    for (const n of nodes) nodeById.set(n.id, n);
    return { nodes, links };
  }

  let firstSeen = new Set();

  function update(state) {
    const { nodes, links } = buildGraph(state);
    const parentOf = new Map(nodes.map((n) => [n.id, n.parent]));

    // membership links (faintly tinted by the note's parent type)
    gLink.selectAll('line.link').data(links.filter((l) => l.kind === 'member'), (d) => d.source + '|' + d.target)
      .join(
        (enter) => enter.append('line').attr('class', (d) => 'link p-' + (parentOf.get(d.source) || 'none')),
        (u) => u.attr('class', (d) => 'link p-' + (parentOf.get(d.source) || 'none')),
        (ex) => ex.remove()
      );

    // bridges (curved, coloured, animate in)
    gBridge.selectAll('path.bridge').data(links.filter((l) => l.kind === 'bridge'), (d) => d.id)
      .join(
        (enter) => enter.append('path').attr('class', (d) => 'bridge ' + d.type)
          .append('title').text((d) => `${d.type}: ${d.rationale}`).select(function () { return this.parentNode; }),
        (u) => u, (ex) => ex.remove()
      );

    // nodes
    const nodeSel = gNode.selectAll('circle.node').data(nodes, (d) => d.id)
      .join(
        (enter) => enter.append('circle')
          .attr('class', (d) => nodeClass(d) + (firstSeen.has(d.id) ? '' : ' node-enter'))
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
          .attr('class', (d) => (d.type === 'anchor' ? 'label-anchor p-' + (ANCHOR_KEY[d.id] || 'none') : 'label-theme') + ' glabel')
          .text((d) => d.label),
        (u) => u.text((d) => d.label), (ex) => ex.remove()
      );

    nodes.forEach((n) => firstSeen.add(n.id));

    sim.nodes(nodes);
    sim.force('link').links(links);
    sim.alpha(0.5).restart();
    updateCounts(state);
  }

  const ANCHOR_KEY = { 'anchor-values': 'values', 'anchor-painpoints': 'painpoints', 'anchor-questions': 'questions' };
  function nodeClass(d) {
    if (d.type === 'anchor') return 'node node-anchor p-' + (ANCHOR_KEY[d.id] || 'none');
    if (d.type === 'theme') return 'node node-theme';
    return 'node node-note p-' + (d.parent || 'none');
  }

  function tick() {
    gLink.selectAll('line.link')
      .attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y);
    gBridge.selectAll('path.bridge').attr('d', (d) => {
      const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y;
      const dr = Math.hypot(dx, dy) * 1.6;
      return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;
    });
    gNode.selectAll('circle.node').attr('cx', (d) => d.x).attr('cy', (d) => d.y);
    gLabel.selectAll('text.glabel')
      .attr('x', (d) => d.x)
      .attr('y', (d) => d.y + (d.type === 'anchor' ? 46 : radius(d) + 15));
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
      html = `<div>${escapeHtml(d.text)}</div><div class="tt-meta">${d.kind || ''}${d.speaker ? ' · ' + escapeHtml(d.speaker) : ''}</div>`;
    } else {
      html = `<div><b>${escapeHtml(d.label)}</b></div>` + (d.summary ? `<div class="tt-meta">${escapeHtml(d.summary)}</div>` : '') + `<div class="tt-meta">${d.count || 0} notes</div>`;
    }
    const wrap = document.getElementById('graphWrap').getBoundingClientRect();
    tooltip.html(html).attr('hidden', null)
      .style('left', Math.min(event.clientX - wrap.left + 12, wrap.width - 290) + 'px')
      .style('top', (event.clientY - wrap.top + 12) + 'px');
  }
  function hideTip() { tooltip.attr('hidden', true); }

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
    '<span class="lg p-questions">open questions</span>' +
    '<span class="lg lg-theme">theme</span>' +
    '<span class="lg lg-bridge">connection</span>';

  resize();
  window.LoomGraph = { update, resize };
})();
