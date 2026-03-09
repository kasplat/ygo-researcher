/**
 * UI rendering for the hand probability calculator.
 */

import { groupCards } from './ydkParser.js';
import { calculate } from './probability.js';

let cardLookup = null;
let deckGroups = [];    // [{ id, count, name, type }]
let sideGroups = [];     // [{ id, count, name, type }]
let pools = [];          // [{ id, name, memberGroupIndices: number[] }]
let poolIdCounter = 0;
let combos = [];         // [{ id, name, requirements: Requirement[] }]
let comboIdCounter = 0;
let matchups = [];       // [{ id, name, swaps: [{ out: groupIndex, in: groupIndex }] }]
let matchupIdCounter = 0;

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// --- Init ---

export function init(lookup) {
  cardLookup = lookup;
}

// --- Deck Display ---

export function renderDeck(parsedDeck) {
  const mainGroups = groupCards(parsedDeck.main);
  deckGroups = mainGroups.map(g => {
    const card = cardLookup.get(g.id);
    return {
      id: g.id,
      count: g.count,
      name: card ? card.name : `Unknown #${g.id}`,
      type: card ? card.type : 'Unknown',
    };
  });

  // Side deck
  renderSideDeck(parsedDeck.side);

  // Merge side-only cards into deckGroups with count 0 (Chunk 1)
  mergeSideCardsIntoDeckGroups();

  const grid = document.getElementById('deckGrid');
  grid.innerHTML = deckGroups.map((g, i) => `
    <span class="deck-card" data-group-index="${i}" title="${escapeHtml(g.type)}"${g.count === 0 ? ' style="display:none"' : ''}>
      <button class="count-btn count-minus" data-action="minus">&minus;</button>
      <span class="card-count">${g.count}</span>
      <button class="count-btn count-plus" data-action="plus">+</button>
      ${escapeHtml(g.name)}
    </span>
  `).join('');

  updateDeckCount();
  document.getElementById('deckDisplay').style.display = '';
  document.getElementById('poolBuilder').style.display = '';
  document.getElementById('comboBuilder').style.display = '';
  document.getElementById('matchupBuilder').style.display = '';

  // +/- buttons to edit card counts
  wireDeckGrid(grid);

  // Setup pool builder
  document.getElementById('addPoolBtn').addEventListener('click', () => addPool());
  pools = [];
  poolIdCounter = 0;
  document.getElementById('poolList').innerHTML = '';

  // Setup combo builder
  document.getElementById('addComboBtn').addEventListener('click', () => addCombo());
  combos = [];
  comboIdCounter = 0;
  document.getElementById('comboList').innerHTML = '';
  addCombo(); // Start with one empty combo

  // Setup matchup builder
  document.getElementById('addMatchupBtn').addEventListener('click', () => addMatchup());
  matchups = [];
  matchupIdCounter = 0;
  document.getElementById('matchupList').innerHTML = '';
}

function mergeSideCardsIntoDeckGroups() {
  const existingIds = new Set(deckGroups.map(g => g.id));
  for (const sg of sideGroups) {
    if (!existingIds.has(sg.id)) {
      deckGroups.push({
        id: sg.id,
        count: 0,
        name: sg.name,
        type: sg.type,
      });
      existingIds.add(sg.id);
    }
  }
}

function wireDeckGrid(grid) {
  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.count-btn');
    if (btn) {
      e.stopPropagation();
      const card = btn.closest('.deck-card');
      const gi = parseInt(card.dataset.groupIndex);
      const action = btn.dataset.action;

      if (action === 'plus') {
        deckGroups[gi].count++;
      } else if (action === 'minus' && deckGroups[gi].count > 0) {
        deckGroups[gi].count--;
      }

      if (deckGroups[gi].count === 0) {
        card.style.display = 'none';
        // Clean up combo requirements referencing this card
        for (const combo of combos) {
          combo.requirements = combo.requirements.filter(r => !(r.type === 'card' && r.groupIndex === gi));
        }
        // Clean up pool memberships
        for (const pool of pools) {
          const idx = pool.memberGroupIndices.indexOf(gi);
          if (idx !== -1) {
            pool.memberGroupIndices.splice(idx, 1);
            renderPool(pool);
          }
        }
        rerenderAllCombos();
      } else {
        card.style.display = '';
        card.querySelector('.card-count').textContent = deckGroups[gi].count;
        rerenderAllPools();
      }

      updateDeckCount();
      recalculate();
      return;
    }

    // Click a card in deck grid -> add to last combo (or create one)
    const card = e.target.closest('.deck-card');
    if (!card) return;
    const groupIndex = parseInt(card.dataset.groupIndex);
    if (combos.length === 0) addCombo();
    addRequirementToCombo(combos[combos.length - 1].id, { type: 'card', groupIndex });
  });
}

function renderSideDeck(sideCardIds) {
  sideGroups = groupCards(sideCardIds).map(g => {
    const card = cardLookup.get(g.id);
    return {
      id: g.id,
      count: g.count,
      name: card ? card.name : `Unknown #${g.id}`,
      type: card ? card.type : 'Unknown',
    };
  });

  renderSideDeckGrid();
}

function renderSideDeckGrid() {
  const section = document.getElementById('sideDeckDisplay');
  if (sideGroups.length === 0 || sideGroups.every(g => g.count === 0)) {
    section.style.display = 'none';
    return;
  }

  section.style.display = '';
  updateSideDeckCount();

  const grid = document.getElementById('sideDeckGrid');
  grid.innerHTML = sideGroups.map((g, i) => `
    <span class="deck-card" data-side-index="${i}" title="${escapeHtml(g.type)}"${g.count === 0 ? ' style="display:none"' : ''}>
      <button class="count-btn count-minus" data-action="minus">&minus;</button>
      <span class="card-count">${g.count}</span>
      <button class="count-btn count-plus" data-action="plus">+</button>
      ${escapeHtml(g.name)}
    </span>
  `).join('');

  wireSideDeckGrid(grid);
}

function wireSideDeckGrid(grid) {
  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.count-btn');
    if (!btn) return;
    e.stopPropagation();

    const card = btn.closest('.deck-card');
    const si = parseInt(card.dataset.sideIndex);
    const action = btn.dataset.action;

    if (action === 'plus') {
      sideGroups[si].count++;
    } else if (action === 'minus' && sideGroups[si].count > 0) {
      sideGroups[si].count--;
    }

    if (sideGroups[si].count === 0) {
      card.style.display = 'none';
      if (sideGroups.every(g => g.count === 0)) {
        document.getElementById('sideDeckDisplay').style.display = 'none';
      }
    } else {
      card.querySelector('.card-count').textContent = sideGroups[si].count;
    }

    updateSideDeckCount();
  });
}

function updateSideDeckCount() {
  const total = sideGroups.reduce((s, g) => s + g.count, 0);
  document.getElementById('sideDeckCount').textContent = `(${total} cards)`;
}

// --- Pool Builder ---

function addPool() {
  const id = poolIdCounter++;
  const pool = { id, name: `Pool ${id + 1}`, memberGroupIndices: [] };
  pools.push(pool);
  renderPool(pool);
  rerenderAllCombos();
  return pool;
}

function renderPool(pool) {
  const list = document.getElementById('poolList');
  let panel = document.getElementById(`pool-${pool.id}`);
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'pool-panel';
    panel.id = `pool-${pool.id}`;
    list.appendChild(panel);
  }

  panel.innerHTML = `
    <div class="pool-header">
      <input type="text" value="${escapeHtml(pool.name)}" data-pool-id="${pool.id}" class="pool-name-input">
      <button class="remove-pool outline secondary" data-pool-id="${pool.id}">Remove</button>
    </div>
    <div class="pool-members" id="pool-members-${pool.id}">
      ${pool.memberGroupIndices.map((gi, mi) => {
        const g = deckGroups[gi];
        return `
          <span class="pool-member">
            ${escapeHtml(g.name)} (${g.count}x)
            <button class="remove-member" data-pool-id="${pool.id}" data-member-index="${mi}">&times;</button>
          </span>`;
      }).join('')}
    </div>
    <select class="pool-add-card" data-pool-id="${pool.id}">
      <option value="">+ Add card...</option>
      ${deckGroups.map((g, i) =>
        pool.memberGroupIndices.includes(i) || g.count === 0 ? '' :
        `<option value="${i}">${escapeHtml(g.name)} (${g.count}x)</option>`
      ).join('')}
    </select>
  `;

  // Wire events
  panel.querySelector('.pool-name-input').addEventListener('input', (e) => {
    pool.name = e.target.value;
    rerenderAllCombos();
    recalculate();
  });

  panel.querySelector('.remove-pool').addEventListener('click', () => {
    // Remove pool requirements from all combos
    for (const combo of combos) {
      combo.requirements = combo.requirements.filter(r => !(r.type === 'pool' && r.poolId === pool.id));
    }
    pools = pools.filter(p => p.id !== pool.id);
    panel.remove();
    rerenderAllCombos();
    recalculate();
  });

  panel.querySelector('.pool-add-card').addEventListener('change', (e) => {
    if (e.target.value === '') return;
    const gi = parseInt(e.target.value);
    if (!pool.memberGroupIndices.includes(gi)) {
      pool.memberGroupIndices.push(gi);
      renderPool(pool);
      rerenderAllCombos();
      recalculate();
    }
    e.target.value = '';
  });

  panel.querySelectorAll('.remove-member').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const mi = parseInt(e.target.dataset.memberIndex);
      pool.memberGroupIndices.splice(mi, 1);
      renderPool(pool);
      rerenderAllCombos();
      recalculate();
    });
  });
}

function getPoolTotalCount(pool) {
  return pool.memberGroupIndices.reduce((s, gi) => s + deckGroups[gi].count, 0);
}

// --- Combo Builder ---

function addCombo() {
  const id = comboIdCounter++;
  const combo = { id, name: `Combo ${id + 1}`, requirements: [] };
  combos.push(combo);
  renderCombo(combo);
  return combo;
}

function updateDeckCount() {
  const total = deckGroups.reduce((s, g) => s + g.count, 0);
  document.getElementById('deckCount').textContent = `(${total} cards)`;
}

function rerenderAllPools() {
  for (const pool of pools) renderPool(pool);
}

function rerenderAllCombos() {
  for (const combo of combos) renderCombo(combo);
}

function renderCombo(combo) {
  const list = document.getElementById('comboList');
  let panel = document.getElementById(`combo-${combo.id}`);
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'combo-panel';
    panel.id = `combo-${combo.id}`;
    list.appendChild(panel);
  }

  const activePools = pools.filter(p => p.memberGroupIndices.length > 0);

  panel.innerHTML = `
    <div class="combo-header">
      <input type="text" value="${escapeHtml(combo.name)}" data-combo-id="${combo.id}" class="combo-name-input">
      <button class="remove-combo outline secondary" data-combo-id="${combo.id}">Remove</button>
    </div>
    <div class="combo-reqs" id="combo-reqs-${combo.id}">
      ${combo.requirements.map((req, ri) => {
        if (req.type === 'pool') {
          const pool = pools.find(p => p.id === req.poolId);
          if (!pool) return '';
          const totalCount = getPoolTotalCount(pool);
          return `
            <span class="combo-req pool-req">
              <span class="pool-label">Pool</span>
              ${escapeHtml(pool.name)}
              <select data-combo-id="${combo.id}" data-req-index="${ri}" class="min-select">
                ${Array.from({ length: totalCount }, (_, i) => i + 1).map(n =>
                  `<option value="${n}" ${n === req.min ? 'selected' : ''}>${n}+</option>`
                ).join('')}
              </select>
              <button class="remove-req" data-combo-id="${combo.id}" data-req-index="${ri}">&times;</button>
            </span>`;
        }
        const g = deckGroups[req.groupIndex];
        return `
          <span class="combo-req">
            ${escapeHtml(g.name)}
            <select data-combo-id="${combo.id}" data-req-index="${ri}" class="min-select">
              ${Array.from({ length: g.count }, (_, i) => i + 1).map(n =>
                `<option value="${n}" ${n === req.min ? 'selected' : ''}>${n}+</option>`
              ).join('')}
            </select>
            <button class="remove-req" data-combo-id="${combo.id}" data-req-index="${ri}">&times;</button>
          </span>`;
      }).join('')}
    </div>
    <select class="combo-add-card" data-combo-id="${combo.id}">
      <option value="">+ Add card or pool...</option>
      ${activePools.length > 0 ? `
        <optgroup label="Pools">
          ${activePools.map(p => `<option value="pool:${p.id}">${escapeHtml(p.name)} (${getPoolTotalCount(p)} cards)</option>`).join('')}
        </optgroup>
      ` : ''}
      <optgroup label="Cards">
        ${deckGroups.map((g, i) => g.count > 0 ? `<option value="${i}">${escapeHtml(g.name)} (${g.count}x)</option>` : '').join('')}
      </optgroup>
    </select>
  `;

  // Wire events
  panel.querySelector('.combo-name-input').addEventListener('input', (e) => {
    combo.name = e.target.value;
    recalculate();
  });

  panel.querySelector('.remove-combo').addEventListener('click', () => {
    combos = combos.filter(c => c.id !== combo.id);
    panel.remove();
    recalculate();
  });

  panel.querySelector('.combo-add-card').addEventListener('change', (e) => {
    if (e.target.value === '') return;
    const val = e.target.value;
    if (val.startsWith('pool:')) {
      const poolId = parseInt(val.split(':')[1]);
      addRequirementToCombo(combo.id, { type: 'pool', poolId });
    } else {
      addRequirementToCombo(combo.id, { type: 'card', groupIndex: parseInt(val) });
    }
    e.target.value = '';
  });

  panel.querySelectorAll('.min-select').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const ri = parseInt(e.target.dataset.reqIndex);
      combo.requirements[ri].min = parseInt(e.target.value);
      recalculate();
    });
  });

  panel.querySelectorAll('.remove-req').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const ri = parseInt(e.target.dataset.reqIndex);
      combo.requirements.splice(ri, 1);
      renderCombo(combo);
      recalculate();
    });
  });
}

function addRequirementToCombo(comboId, req) {
  const combo = combos.find(c => c.id === comboId);
  if (!combo) return;

  // Don't add duplicate
  if (req.type === 'pool') {
    if (combo.requirements.some(r => r.type === 'pool' && r.poolId === req.poolId)) return;
    combo.requirements.push({ type: 'pool', poolId: req.poolId, min: 1 });
  } else {
    if (combo.requirements.some(r => r.type !== 'pool' && r.groupIndex === req.groupIndex)) return;
    combo.requirements.push({ type: 'card', groupIndex: req.groupIndex, min: 1 });
  }

  renderCombo(combo);
  recalculate();
}

// --- Matchup Builder ---

function addMatchup() {
  const id = matchupIdCounter++;
  const matchup = { id, name: `Matchup ${id + 1}`, swaps: [] };
  matchups.push(matchup);
  renderMatchup(matchup);
  recalculate();
  return matchup;
}

function renderMatchup(matchup) {
  const list = document.getElementById('matchupList');
  let panel = document.getElementById(`matchup-${matchup.id}`);
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'matchup-panel';
    panel.id = `matchup-${matchup.id}`;
    list.appendChild(panel);
  }

  // Build available cards for "out" (main deck cards with count > 0)
  // and "in" (side deck cards with count > 0, mapped to their deckGroup index)
  const sideGroupIndexMap = buildSideGroupIndexMap();

  panel.innerHTML = `
    <div class="matchup-header">
      <input type="text" value="${escapeHtml(matchup.name)}" data-matchup-id="${matchup.id}" class="matchup-name-input">
      <button class="remove-matchup outline secondary" data-matchup-id="${matchup.id}">Remove</button>
    </div>
    <div class="matchup-swaps" id="matchup-swaps-${matchup.id}">
      ${matchup.swaps.map((swap, si) => {
        const maxOut = deckGroups[swap.out].count;
        const sideEntry = sideGroups.find(sg => sg.id === deckGroups[swap.in].id);
        const maxIn = sideEntry ? sideEntry.count : 3;
        const maxCount = Math.max(1, Math.min(maxOut, maxIn));
        return `
        <div class="swap-row" data-swap-index="${si}">
          <select class="swap-count-select" data-matchup-id="${matchup.id}" data-swap-index="${si}">
            ${Array.from({ length: maxCount }, (_, i) => i + 1).map(n =>
              `<option value="${n}" ${n === swap.count ? 'selected' : ''}>${n}x</option>`
            ).join('')}
          </select>
          <span class="swap-card">${escapeHtml(deckGroups[swap.out].name)}</span>
          <span class="swap-arrow">&rarr;</span>
          <span class="swap-card side-card">${escapeHtml(deckGroups[swap.in].name)}</span>
          <button class="remove-swap" data-matchup-id="${matchup.id}" data-swap-index="${si}">&times;</button>
        </div>`;
      }).join('')}
    </div>
    <div class="swap-add-row">
      <select class="swap-out-select" data-matchup-id="${matchup.id}">
        <option value="">Card out...</option>
        ${deckGroups.map((g, i) => g.count > 0 ? `<option value="${i}">${escapeHtml(g.name)} (${g.count}x)</option>` : '').join('')}
      </select>
      <span class="swap-arrow">&rarr;</span>
      <select class="swap-in-select" data-matchup-id="${matchup.id}">
        <option value="">Card in...</option>
        ${sideGroups.length > 0 ? `<optgroup label="Side Deck">
          ${sideGroups.map(sg => {
            const gi = sideGroupIndexMap.get(sg.id);
            return sg.count > 0 && gi !== undefined
              ? `<option value="${gi}">${escapeHtml(sg.name)} (${sg.count}x side)</option>`
              : '';
          }).join('')}
        </optgroup>` : ''}
        <optgroup label="Main Deck">
          ${deckGroups.map((g, i) => g.count > 0 ? `<option value="${i}">${escapeHtml(g.name)} (${g.count}x)</option>` : '').join('')}
        </optgroup>
      </select>
      <button class="add-swap-btn outline" data-matchup-id="${matchup.id}">+ Swap</button>
    </div>
  `;

  // Wire events
  panel.querySelector('.matchup-name-input').addEventListener('input', (e) => {
    matchup.name = e.target.value;
    recalculate();
  });

  panel.querySelector('.remove-matchup').addEventListener('click', () => {
    matchups = matchups.filter(m => m.id !== matchup.id);
    panel.remove();
    recalculate();
  });

  panel.querySelector('.add-swap-btn').addEventListener('click', () => {
    const outSel = panel.querySelector('.swap-out-select');
    const inSel = panel.querySelector('.swap-in-select');
    if (outSel.value === '' || inSel.value === '') return;
    const outIdx = parseInt(outSel.value);
    const inIdx = parseInt(inSel.value);
    matchup.swaps.push({ out: outIdx, in: inIdx, count: 1 });
    renderMatchup(matchup);
    recalculate();
  });

  // Wire swap count selectors
  panel.querySelectorAll('.swap-count-select').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const si = parseInt(e.target.dataset.swapIndex);
      matchup.swaps[si].count = parseInt(e.target.value);
      recalculate();
    });
  });

  panel.querySelectorAll('.remove-swap').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const si = parseInt(e.target.dataset.swapIndex);
      matchup.swaps.splice(si, 1);
      renderMatchup(matchup);
      recalculate();
    });
  });
}

function buildSideGroupIndexMap() {
  // Map side deck card IDs to their index in deckGroups
  const map = new Map();
  for (const sg of sideGroups) {
    const gi = deckGroups.findIndex(g => g.id === sg.id);
    if (gi !== -1) map.set(sg.id, gi);
  }
  return map;
}

function rerenderAllMatchups() {
  for (const matchup of matchups) renderMatchup(matchup);
}

// --- Calculation ---

let recalcTimer = null;

function recalculate() {
  clearTimeout(recalcTimer);
  recalcTimer = setTimeout(doRecalculate, 50);
}

function doRecalculate() {
  const activeCombos = combos.filter(c => c.requirements.length > 0);

  if (activeCombos.length === 0) {
    document.getElementById('resultsSection').style.display = 'none';
    return;
  }

  document.getElementById('resultsSection').style.display = '';

  const deckSize = deckGroups.reduce((s, g) => s + g.count, 0);
  const groups = deckGroups.map(g => ({ name: g.name, count: g.count }));
  const activePools = pools.filter(p => p.memberGroupIndices.length > 0);

  const input = {
    deckSize,
    groups,
    pools: activePools.map(p => ({
      id: p.id,
      name: p.name,
      memberGroupIndices: [...p.memberGroupIndices],
    })),
    combos: activeCombos.map(c => ({
      name: c.name,
      requirements: c.requirements.map(r => ({ ...r })),
    })),
  };

  // Base deck results
  const baseResults = {};
  for (const hs of [5, 6]) {
    try {
      const result = calculate({ ...input, handSize: hs });
      baseResults[hs] = result;

      document.getElementById(`mainProbability${hs}`).textContent =
        (result.probability * 100).toFixed(2) + '%';
      document.getElementById(`methodIndicator${hs}`).textContent = result.method;

      const perCombo = document.getElementById(`perComboResults${hs}`);
      if (result.perCombo.length > 1) {
        perCombo.innerHTML = `
          <table class="per-combo-table">
            <tbody>
              ${result.perCombo.map(pc => `
                <tr>
                  <td>${escapeHtml(pc.name)}</td>
                  <td class="combo-prob">${(pc.probability * 100).toFixed(2)}%</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <small class="info-text">Individual combo probabilities (overlaps mean the total differs from the sum)</small>
        `;
      } else {
        perCombo.innerHTML = '';
      }
    } catch (err) {
      document.getElementById(`mainProbability${hs}`).textContent = 'Error';
      document.getElementById(`methodIndicator${hs}`).textContent = err.message;
    }
  }

  // Matchup results (Chunk 3 & 4)
  const matchupResultsEl = document.getElementById('matchupResults');
  const activeMatchups = matchups.filter(m => m.swaps.length > 0);

  if (activeMatchups.length > 0 && baseResults[5] && baseResults[6]) {
    const rows = [];
    for (const matchup of activeMatchups) {
      const sidedGroups = deckGroups.map(g => ({ name: g.name, count: g.count }));

      // Apply swaps
      for (const swap of matchup.swaps) {
        const n = swap.count || 1;
        sidedGroups[swap.out].count = Math.max(0, sidedGroups[swap.out].count - n);
        sidedGroups[swap.in].count += n;
      }

      const sidedDeckSize = sidedGroups.reduce((s, g) => s + g.count, 0);
      const sidedInput = {
        ...input,
        deckSize: sidedDeckSize,
        groups: sidedGroups,
      };

      const row = { name: matchup.name, results: {} };
      for (const hs of [5, 6]) {
        try {
          const result = calculate({ ...sidedInput, handSize: hs });
          row.results[hs] = result.probability;
        } catch {
          row.results[hs] = null;
        }
      }
      rows.push(row);
    }

    matchupResultsEl.innerHTML = `
      <h3 class="matchup-table-title">Post-Siding Comparison</h3>
      <table class="matchup-comparison-table">
        <thead>
          <tr>
            <th>Matchup</th>
            <th>Going First</th>
            <th>Going Second</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Base (no side)</td>
            <td>${(baseResults[5].probability * 100).toFixed(2)}%</td>
            <td>${(baseResults[6].probability * 100).toFixed(2)}%</td>
          </tr>
          ${rows.map(row => {
            const delta5 = row.results[5] !== null ? row.results[5] - baseResults[5].probability : null;
            const delta6 = row.results[6] !== null ? row.results[6] - baseResults[6].probability : null;
            return `
              <tr>
                <td>${escapeHtml(row.name)}</td>
                <td>${formatMatchupCell(row.results[5], delta5)}</td>
                <td>${formatMatchupCell(row.results[6], delta6)}</td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
  } else {
    matchupResultsEl.innerHTML = '';
  }

  // Wire share button on first results display
  const shareBtn = document.getElementById('shareLinkBtn');
  if (shareBtn && !shareBtn._wired) {
    shareBtn.addEventListener('click', () => copyShareLink());
    shareBtn._wired = true;
  }

  updateHash();
}

function formatMatchupCell(prob, delta) {
  if (prob === null) return 'Error';
  const pct = (prob * 100).toFixed(2) + '%';
  if (delta === null || Math.abs(delta) < 0.0001) return pct;
  const sign = delta > 0 ? '+' : '';
  const cls = delta > 0 ? 'delta-positive' : 'delta-negative';
  return `${pct} <span class="${cls}">(${sign}${(delta * 100).toFixed(2)}%)</span>`;
}

// --- Shareable Links ---

async function compress(str) {
  const stream = new Blob([str]).stream().pipeThrough(new CompressionStream('deflate'));
  const buf = await new Response(stream).arrayBuffer();
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function decompress(b64) {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Response(stream).text();
}

export function serializeState() {
  // Build pool index map: pool.id -> index in serialized array
  const poolIndexMap = new Map();
  pools.forEach((p, i) => poolIndexMap.set(p.id, i));

  const state = {
    d: deckGroups.map(g => [g.id, g.count]),
    s: sideGroups.filter(g => g.count > 0).map(g => [g.id, g.count]),
    p: pools.map(p => ({ n: p.name, m: [...p.memberGroupIndices] })),
    c: combos.map(c => ({
      n: c.name,
      r: c.requirements.map(r => {
        if (r.type === 'pool') {
          return { t: 'p', p: poolIndexMap.get(r.poolId), m: r.min };
        }
        return { t: 'c', g: r.groupIndex, m: r.min };
      }),
    })),
    m: matchups.map(mu => ({
      n: mu.name,
      w: mu.swaps.map(sw => [sw.out, sw.in, sw.count || 1]),
    })),
  };
  return JSON.stringify(state);
}

export async function deserializeState(hash) {
  try {
    const encoded = hash.replace(/^#data=/, '');
    const json = await decompress(encoded);
    const state = JSON.parse(json);

    // Rebuild deckGroups (includes count-0 side-only cards)
    deckGroups = state.d.map(([id, count]) => {
      const card = cardLookup.get(String(id));
      return {
        id: String(id),
        count,
        name: card ? card.name : `Unknown #${id}`,
        type: card ? card.type : 'Unknown',
      };
    });

    // Restore side deck
    sideGroups = [];
    if (state.s && state.s.length > 0) {
      sideGroups = state.s.map(([id, count]) => {
        const card = cardLookup.get(String(id));
        return {
          id: String(id),
          count,
          name: card ? card.name : `Unknown #${id}`,
          type: card ? card.type : 'Unknown',
        };
      });

      // Merge any side-only cards that aren't already in deckGroups
      mergeSideCardsIntoDeckGroups();
    }

    // Render deck grid
    const grid = document.getElementById('deckGrid');
    grid.innerHTML = deckGroups.map((g, i) => `
      <span class="deck-card" data-group-index="${i}" title="${escapeHtml(g.type)}"${g.count === 0 ? ' style="display:none"' : ''}>
        <button class="count-btn count-minus" data-action="minus">&minus;</button>
        <span class="card-count">${g.count}</span>
        <button class="count-btn count-plus" data-action="plus">+</button>
        ${escapeHtml(g.name)}
      </span>
    `).join('');

    updateDeckCount();
    document.getElementById('deckDisplay').style.display = '';
    document.getElementById('poolBuilder').style.display = '';
    document.getElementById('comboBuilder').style.display = '';
    document.getElementById('matchupBuilder').style.display = '';

    // Render side deck
    if (sideGroups.length > 0) {
      renderSideDeckGrid();
    }

    // Wire deck grid click handler
    wireDeckGrid(grid);

    // Wire pool/combo/matchup buttons
    document.getElementById('addPoolBtn').addEventListener('click', () => addPool());
    document.getElementById('addComboBtn').addEventListener('click', () => addCombo());
    document.getElementById('addMatchupBtn').addEventListener('click', () => addMatchup());

    // Rebuild pools
    pools = [];
    poolIdCounter = 0;
    document.getElementById('poolList').innerHTML = '';
    const poolIdByIndex = [];
    for (const sp of (state.p || [])) {
      const pool = addPool();
      pool.name = sp.n;
      pool.memberGroupIndices = [...sp.m];
      poolIdByIndex.push(pool.id);
      renderPool(pool);
    }

    // Rebuild combos
    combos = [];
    comboIdCounter = 0;
    document.getElementById('comboList').innerHTML = '';
    for (const sc of (state.c || [])) {
      const combo = addCombo();
      combo.name = sc.n;
      combo.requirements = sc.r.map(r => {
        if (r.t === 'p') {
          return { type: 'pool', poolId: poolIdByIndex[r.p], min: r.m };
        }
        return { type: 'card', groupIndex: r.g, min: r.m };
      });
      renderCombo(combo);
    }

    // Rebuild matchups (Chunk 5)
    matchups = [];
    matchupIdCounter = 0;
    document.getElementById('matchupList').innerHTML = '';
    for (const sm of (state.m || [])) {
      const matchup = addMatchup();
      matchup.name = sm.n;
      matchup.swaps = sm.w.map(w => ({ out: w[0], in: w[1], count: w[2] || 1 }));
      renderMatchup(matchup);
    }

    rerenderAllCombos();
    recalculate();
    return true;
  } catch (err) {
    console.warn('Failed to deserialize state from URL:', err);
    return false;
  }
}

async function updateHash() {
  if (deckGroups.length === 0) return;
  try {
    const json = serializeState();
    const encoded = await compress(json);
    const newHash = '#data=' + encoded;
    history.replaceState(null, '', newHash);
  } catch (err) {
    // Silently fail — hash update is non-critical
  }
}

export async function copyShareLink() {
  try {
    const json = serializeState();
    const encoded = await compress(json);
    const url = window.location.origin + window.location.pathname + '#data=' + encoded;
    await navigator.clipboard.writeText(url);
    const feedback = document.getElementById('shareLinkFeedback');
    feedback.textContent = 'Copied!';
    setTimeout(() => { feedback.textContent = ''; }, 2000);
  } catch (err) {
    const feedback = document.getElementById('shareLinkFeedback');
    feedback.textContent = 'Failed to copy';
    setTimeout(() => { feedback.textContent = ''; }, 2000);
  }
}

// --- Warnings ---

export function showWarnings(warnings) {
  const el = document.getElementById('importWarnings');
  if (warnings.length === 0) {
    el.style.display = 'none';
    return;
  }
  el.style.display = '';
  el.innerHTML = warnings.map(w => `<div>${escapeHtml(w)}</div>`).join('');
}
