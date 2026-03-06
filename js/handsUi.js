/**
 * UI rendering for the hand probability calculator.
 */

import { groupCards } from './ydkParser.js';
import { calculate } from './probability.js';

let cardLookup = null;
let deckGroups = [];    // [{ id, count, name, type }]
let combos = [];        // [{ name, requirements: [{ groupIndex, min }] }]
let comboIdCounter = 0;
let handSize = 5;
let onRecalc = null;    // callback

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// --- Init ---

export function init(lookup) {
  cardLookup = lookup;
  document.getElementById('handSize').addEventListener('change', (e) => {
    handSize = parseInt(e.target.value);
    recalculate();
  });
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
      <span class="card-count">${g.count}</span>
      ${escapeHtml(g.name)}
    </span>
  `).join('');

  document.getElementById('deckCount').textContent = `(${parsedDeck.main.length} cards)`;
  document.getElementById('deckDisplay').style.display = '';
  document.getElementById('comboBuilder').style.display = '';

  // Click a card in deck grid -> add to last combo (or create one)
  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.deck-card');
    if (!card) return;
    const groupIndex = parseInt(card.dataset.groupIndex);
    if (combos.length === 0) addCombo();
    addRequirementToCombo(combos[combos.length - 1].id, groupIndex);
  });

  // Setup combo builder
  document.getElementById('addComboBtn').addEventListener('click', () => addCombo());
  combos = [];
  comboIdCounter = 0;
  document.getElementById('comboList').innerHTML = '';
  addCombo(); // Start with one empty combo
}

// --- Combo Builder ---

function addCombo() {
  const id = comboIdCounter++;
  const combo = { id, name: `Combo ${id + 1}`, requirements: [] };
  combos.push(combo);
  renderCombo(combo);
  return combo;
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

  panel.innerHTML = `
    <div class="combo-header">
      <input type="text" value="${escapeHtml(combo.name)}" data-combo-id="${combo.id}" class="combo-name-input">
      <button class="remove-combo outline secondary" data-combo-id="${combo.id}">Remove</button>
    </div>
    <div class="combo-reqs" id="combo-reqs-${combo.id}">
      ${combo.requirements.map((req, ri) => {
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
      <option value="">+ Add card...</option>
      ${deckGroups.map((g, i) => `<option value="${i}">${escapeHtml(g.name)} (${g.count}x)</option>`).join('')}
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
    addRequirementToCombo(combo.id, parseInt(e.target.value));
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

function addRequirementToCombo(comboId, groupIndex) {
  const combo = combos.find(c => c.id === comboId);
  if (!combo) return;

  // Don't add duplicate group to same combo
  if (combo.requirements.some(r => r.groupIndex === groupIndex)) return;

  combo.requirements.push({ groupIndex, min: 1 });
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

  try {
    const result = calculate({
      deckSize,
      handSize,
      groups,
      combos: activeCombos.map(c => ({
        name: c.name,
        requirements: c.requirements,
      })),
    });

    document.getElementById('mainProbability').textContent =
      (result.probability * 100).toFixed(2) + '%';
    document.getElementById('methodIndicator').textContent = result.method;

    // Per-combo breakdown
    const perCombo = document.getElementById('perComboResults');
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
    document.getElementById('mainProbability').textContent = 'Error';
    document.getElementById('methodIndicator').textContent = err.message;
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
