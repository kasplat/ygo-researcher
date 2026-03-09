/**
 * UI rendering for the hand probability calculator.
 */

import { groupCards } from './ydkParser.js';
import { calculate } from './probability.js';

let cardLookup = null;
let deckGroups = [];    // [{ id, count, name, type }]
let pools = [];          // [{ id, name, memberGroupIndices: number[] }]
let poolIdCounter = 0;
let combos = [];         // [{ id, name, requirements: Requirement[] }]
let comboIdCounter = 0;

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

  const grid = document.getElementById('deckGrid');
  grid.innerHTML = deckGroups.map((g, i) => `
    <span class="deck-card" data-group-index="${i}" title="${escapeHtml(g.type)}">
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

  // +/- buttons to edit card counts
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
        pool.memberGroupIndices.includes(i) ? '' :
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
        ${deckGroups.map((g, i) => `<option value="${i}">${escapeHtml(g.name)} (${g.count}x)</option>`).join('')}
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

  for (const hs of [5, 6]) {
    try {
      const result = calculate({ ...input, handSize: hs });

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

  // Wire share button on first results display
  const shareBtn = document.getElementById('shareLinkBtn');
  if (shareBtn && !shareBtn._wired) {
    shareBtn.addEventListener('click', () => copyShareLink());
    shareBtn._wired = true;
  }

  updateHash();
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
    d: deckGroups.filter(g => g.count > 0).map(g => [g.id, g.count]),
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
  };
  return JSON.stringify(state);
}

export async function deserializeState(hash) {
  try {
    const encoded = hash.replace(/^#data=/, '');
    const json = await decompress(encoded);
    const state = JSON.parse(json);

    // Rebuild deckGroups
    deckGroups = state.d.map(([id, count]) => {
      const card = cardLookup.get(String(id));
      return {
        id: String(id),
        count,
        name: card ? card.name : `Unknown #${id}`,
        type: card ? card.type : 'Unknown',
      };
    });

    // Render deck grid
    const grid = document.getElementById('deckGrid');
    grid.innerHTML = deckGroups.map((g, i) => `
      <span class="deck-card" data-group-index="${i}" title="${escapeHtml(g.type)}">
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

    // Wire deck grid click handler
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
          for (const combo of combos) {
            combo.requirements = combo.requirements.filter(r => !(r.type === 'card' && r.groupIndex === gi));
          }
          for (const pool of pools) {
            const idx = pool.memberGroupIndices.indexOf(gi);
            if (idx !== -1) {
              pool.memberGroupIndices.splice(idx, 1);
              renderPool(pool);
            }
          }
          rerenderAllCombos();
        } else {
          card.querySelector('.card-count').textContent = deckGroups[gi].count;
          rerenderAllPools();
        }

        updateDeckCount();
        recalculate();
        return;
      }

      const card = e.target.closest('.deck-card');
      if (!card) return;
      const groupIndex = parseInt(card.dataset.groupIndex);
      if (combos.length === 0) addCombo();
      addRequirementToCombo(combos[combos.length - 1].id, { type: 'card', groupIndex });
    });

    // Wire pool/combo buttons
    document.getElementById('addPoolBtn').addEventListener('click', () => addPool());
    document.getElementById('addComboBtn').addEventListener('click', () => addCombo());

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
