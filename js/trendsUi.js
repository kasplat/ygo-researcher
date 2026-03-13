/**
 * All DOM rendering for the Trends page:
 * category tabs, card chips, heatmap, opening hand distribution table.
 */

// --- Helpers ---

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatPercent(value) {
  return (value * 100).toFixed(1) + '%';
}

function formatDate(date) {
  if (!date) return '?';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function heatColor(frequency) {
  // 0 → transparent, 1 → full opacity green
  if (frequency === 0) return 'transparent';
  const alpha = 0.1 + frequency * 0.5;
  return `rgba(76, 175, 80, ${alpha.toFixed(2)})`;
}

function probColor(value, invert) {
  // For P(0): high = red. For P(1+): high = green.
  if (invert) {
    const alpha = 0.1 + value * 0.4;
    return `rgba(244, 67, 54, ${alpha.toFixed(2)})`;
  }
  const alpha = 0.1 + value * 0.4;
  return `rgba(76, 175, 80, ${alpha.toFixed(2)})`;
}

// --- Loading/Error ---

export function showLoading() {
  document.getElementById('loadingBar').style.display = '';
  document.getElementById('loadingStatus').style.display = '';
  document.getElementById('loadingBar').value = 0;
  document.getElementById('errorDisplay').style.display = 'none';
  document.getElementById('results').style.display = 'none';
}

export function hideLoading() {
  document.getElementById('loadingBar').style.display = 'none';
  document.getElementById('loadingStatus').style.display = 'none';
}

export function updateStatus(msg) {
  document.getElementById('loadingStatus').textContent = msg;
}

export function updateProgress(loaded, total) {
  const bar = document.getElementById('loadingBar');
  if (total > 0) {
    bar.value = Math.min(100, (loaded / total) * 100);
  }
  document.getElementById('loadingStatus').textContent = `Fetched ${loaded} decks...`;
}

export function showError(msg) {
  hideLoading();
  const el = document.getElementById('errorDisplay');
  el.textContent = msg;
  el.style.display = '';
}

export function showCacheIndicator() {
  document.getElementById('loadingStatus').style.display = '';
  document.getElementById('loadingStatus').textContent = 'Using cached data...';
  setTimeout(() => {
    document.getElementById('loadingStatus').style.display = 'none';
  }, 1500);
}

// --- Category Tabs ---

export function renderCategoryTabs(categories, activeId, onSelect, onAdd, onDelete, onRename) {
  const container = document.getElementById('categoryTabs');
  let html = '';
  for (const cat of categories) {
    const active = cat.id === activeId ? ' active' : '';
    html += `<button class="tab-btn category-tab${active}" data-cat-id="${escapeHtml(cat.id)}">${escapeHtml(cat.name)}</button>`;
  }
  html += `<button class="tab-btn category-tab add-category-btn">+ New</button>`;
  container.innerHTML = html;

  container.querySelectorAll('.category-tab:not(.add-category-btn)').forEach(btn => {
    btn.addEventListener('click', () => onSelect(btn.dataset.catId));
    // Right-click context menu for rename/delete
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const catId = btn.dataset.catId;
      const cat = categories.find(c => c.id === catId);
      if (!cat) return;
      showCategoryContextMenu(e, cat, onRename, onDelete);
    });
  });
  container.querySelector('.add-category-btn').addEventListener('click', onAdd);
}

function showCategoryContextMenu(e, cat, onRename, onDelete) {
  // Remove any existing context menu
  document.querySelectorAll('.cat-context-menu').forEach(m => m.remove());

  const menu = document.createElement('div');
  menu.className = 'cat-context-menu';
  menu.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;z-index:100;background:var(--pico-card-background-color);border:1px solid var(--pico-muted-border-color);border-radius:var(--pico-border-radius);padding:0.3rem 0;font-size:0.85rem;`;

  const renameBtn = document.createElement('div');
  renameBtn.textContent = 'Rename';
  renameBtn.style.cssText = 'padding:0.3rem 1rem;cursor:pointer;';
  renameBtn.addEventListener('click', () => { menu.remove(); onRename(cat.id); });

  const deleteBtn = document.createElement('div');
  deleteBtn.textContent = 'Delete';
  deleteBtn.style.cssText = 'padding:0.3rem 1rem;cursor:pointer;color:rgba(244,67,54,0.9);';
  deleteBtn.addEventListener('click', () => { menu.remove(); onDelete(cat.id); });

  menu.appendChild(renameBtn);
  if (!cat.isDefault) menu.appendChild(deleteBtn);
  document.body.appendChild(menu);

  const dismiss = () => { menu.remove(); document.removeEventListener('click', dismiss); };
  setTimeout(() => document.addEventListener('click', dismiss), 0);
}

// --- Card Chips ---

export function renderCardChips(category, cardLookup, allCardIds, onToggle, onAddCard) {
  const container = document.getElementById('cardChips');
  const catIdSet = new Set(category.cardIds);

  let html = '<div class="chip-row">';
  // Show all cards in category as toggle chips
  for (const cardId of category.cardIds) {
    const card = cardLookup.get(String(cardId));
    const name = card ? card.name : `#${cardId}`;
    html += `<button class="chip chip-active" data-card-id="${cardId}">${escapeHtml(name)} &times;</button>`;
  }
  html += '</div>';

  // Add-card dropdown
  html += `<div class="chip-add-row">
    <select id="addCardSelect"><option value="">+ Add card...</option></select>
  </div>`;

  container.innerHTML = html;

  // Wire chip toggles (remove card from category)
  container.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => onToggle(chip.dataset.cardId));
  });

  // Populate add-card dropdown with cards found in data but not in category
  const select = document.getElementById('addCardSelect');
  const available = allCardIds
    .filter(id => !catIdSet.has(String(id)))
    .map(id => {
      const card = cardLookup.get(String(id));
      return { id: String(id), name: card ? card.name : `#${id}` };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const c of available) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    select.appendChild(opt);
  }

  select.addEventListener('change', () => {
    if (select.value) {
      onAddCard(select.value);
      select.value = '';
    }
  });
}

// --- Summary ---

export function renderSummary(analysis) {
  const el = document.getElementById('summary');
  const dr = analysis.dateRange;
  el.innerHTML = `
    <div class="summary-stat"><div class="value">${analysis.totalDecks}</div><div class="label">Total Decks</div></div>
    <div class="summary-stat"><div class="value">${analysis.archetypes.length}</div><div class="label">Archetypes</div></div>
    <div class="summary-stat"><div class="value">${formatDate(dr.earliest)} — ${formatDate(dr.latest)}</div><div class="label">Date Range</div></div>
  `;
}

// --- Heatmap ---

export function renderHeatmap(analysis, maxArchetypes) {
  const container = document.getElementById('heatmapSection');
  const cards = analysis.globalFrequency;
  const archs = analysis.archetypes.slice(0, maxArchetypes || 15);

  if (cards.length === 0) {
    container.innerHTML = '<p class="info-text">No cards from this category found in the data.</p>';
    return;
  }

  // Build lookup: archetype name → Map<cardId, frequency>
  const archFreqMap = new Map();
  for (const arch of archs) {
    const map = new Map();
    for (const cf of arch.cardFrequency) {
      map.set(cf.id, cf);
    }
    archFreqMap.set(arch.name, map);
  }

  let html = '<div class="table-wrapper"><table class="heatmap-table compact-table"><thead><tr><th>Card</th>';
  for (const arch of archs) {
    html += `<th class="heatmap-arch-header" title="${escapeHtml(arch.name)} (${arch.deckCount})">${escapeHtml(truncate(arch.name, 18))}</th>`;
  }
  html += '<th>Global</th></tr></thead><tbody>';

  for (const card of cards) {
    html += `<tr><td class="heatmap-card-name">${escapeHtml(card.name)}</td>`;
    for (const arch of archs) {
      const cf = archFreqMap.get(arch.name)?.get(card.id);
      const freq = cf ? cf.frequency : 0;
      const avg = cf ? cf.avgCopies.toFixed(1) : '-';
      const pct = freq > 0 ? (freq * 100).toFixed(0) + '%' : '-';
      const title = freq > 0 ? `${(freq * 100).toFixed(1)}% (avg ${avg} copies)` : 'Not played';
      html += `<td class="heatmap-cell" style="background:${heatColor(freq)}" title="${title}">${pct}</td>`;
    }
    // Global column
    const gPct = (card.frequency * 100).toFixed(0) + '%';
    html += `<td class="heatmap-cell" style="background:${heatColor(card.frequency)};font-weight:bold" title="${(card.frequency * 100).toFixed(1)}%">${gPct}</td>`;
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  container.innerHTML = html;
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '\u2026' : str;
}

// --- Opening Hand Distribution Table ---

export function renderDistributionTable(analysis) {
  const container = document.getElementById('distributionSection');

  // Only show for main-deck categories
  const hasProbs = analysis.archetypes.some(a => a.openingHand);
  if (!hasProbs) {
    container.innerHTML = '<p class="info-text">Opening hand probabilities are only shown for main deck categories.</p>';
    return;
  }

  const archs = analysis.archetypes.filter(a => a.deckCount >= 2);

  let html = `<div class="table-wrapper"><table class="sortable-table compact-table" id="distTable">
    <thead><tr>
      <th data-sort="name">Archetype</th>
      <th data-sort="deckCount">Lists</th>
      <th data-sort="avgCount">Avg Copies</th>
      <th data-sort="p0_1st">P(0) 1st</th>
      <th data-sort="p1_1st">P(1) 1st</th>
      <th data-sort="p2_1st">P(2) 1st</th>
      <th data-sort="p3_1st">P(3+) 1st</th>
      <th data-sort="p0_2nd">P(0) 2nd</th>
      <th data-sort="p1_2nd">P(1) 2nd</th>
      <th data-sort="p2_2nd">P(2) 2nd</th>
      <th data-sort="p3_2nd">P(3+) 2nd</th>
    </tr></thead><tbody>`;

  for (const arch of archs) {
    const oh = arch.openingHand;
    if (!oh) continue;
    const g1 = oh.going1st;
    const g2 = oh.going2nd;

    html += `<tr>
      <td>${escapeHtml(arch.name)}</td>
      <td>${arch.deckCount}</td>
      <td>${arch.avgCount.toFixed(1)}</td>
      <td style="background:${probColor(g1[0], true)}">${formatPercent(g1[0])}</td>
      <td style="background:${probColor(g1[1], false)}">${formatPercent(g1[1])}</td>
      <td style="background:${probColor(g1[2], false)}">${formatPercent(g1[2])}</td>
      <td style="background:${probColor(g1[3], false)}">${formatPercent(g1[3])}</td>
      <td style="background:${probColor(g2[0], true)}">${formatPercent(g2[0])}</td>
      <td style="background:${probColor(g2[1], false)}">${formatPercent(g2[1])}</td>
      <td style="background:${probColor(g2[2], false)}">${formatPercent(g2[2])}</td>
      <td style="background:${probColor(g2[3], false)}">${formatPercent(g2[3])}</td>
    </tr>`;
  }

  html += '</tbody></table></div>';
  container.innerHTML = html;

  // Make sortable
  makeSortable(document.getElementById('distTable'), archs);
}

function makeSortable(tableEl, data) {
  const headers = tableEl.querySelectorAll('th[data-sort]');
  let currentSort = { key: null, asc: true };

  headers.forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (currentSort.key === key) {
        currentSort.asc = !currentSort.asc;
      } else {
        currentSort.key = key;
        currentSort.asc = key === 'name';
      }

      headers.forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
      th.classList.add(currentSort.asc ? 'sort-asc' : 'sort-desc');

      const rows = [...tableEl.querySelector('tbody').children];
      rows.sort((a, b) => {
        const colIdx = [...th.parentNode.children].indexOf(th);
        let va = a.children[colIdx].textContent.replace('%', '');
        let vb = b.children[colIdx].textContent.replace('%', '');

        const na = parseFloat(va);
        const nb = parseFloat(vb);
        if (!isNaN(na) && !isNaN(nb)) {
          return currentSort.asc ? na - nb : nb - na;
        }
        return currentSort.asc ? va.localeCompare(vb) : vb.localeCompare(va);
      });

      const tbody = tableEl.querySelector('tbody');
      for (const row of rows) tbody.appendChild(row);
    });
  });
}

// --- Show results container ---

export function showResults() {
  document.getElementById('results').style.display = '';
}
