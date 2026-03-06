/**
 * All DOM rendering, sorting, filtering, and drill-down logic.
 */

// --- State ---
let currentResults = null;
let currentDecks = null;
let currentCardLookup = null;
let currentGlobalTab = 'main';

// --- Helpers ---

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatPercent(value) {
  return value.toFixed(1) + '%';
}

function formatAvg(value) {
  return value.toFixed(1);
}

function freqClass(frequency) {
  if (frequency >= 0.65) return 'freq-high';
  if (frequency >= 0.35) return 'freq-med';
  return 'freq-low';
}

function formatDate(date) {
  if (!date) return '?';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// --- Sortable tables ---

function makeSortable(tableEl, getData, renderRow) {
  const headers = tableEl.querySelectorAll('th[data-sort]');
  let currentSort = { key: null, asc: true };

  const doSort = () => {
    const data = getData();
    if (!currentSort.key) return;

    data.sort((a, b) => {
      const va = a[currentSort.key];
      const vb = b[currentSort.key];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
      return currentSort.asc ? cmp : -cmp;
    });

    const tbody = tableEl.querySelector('tbody');
    tbody.innerHTML = data.map(renderRow).join('');
  };

  headers.forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (currentSort.key === key) {
        currentSort.asc = !currentSort.asc;
      } else {
        currentSort = { key, asc: key === 'name' }; // default asc for name, desc for numbers
      }

      headers.forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
      th.classList.add(currentSort.asc ? 'sort-asc' : 'sort-desc');
      doSort();
    });
  });
}

// --- Loading UI ---

export function showLoading() {
  document.getElementById('loadingBar').style.display = '';
  document.getElementById('loadingStatus').style.display = '';
  document.getElementById('results').style.display = 'none';
  document.getElementById('sectionNav').style.display = 'none';
  document.getElementById('errorDisplay').style.display = 'none';
  document.getElementById('analyzeBtn').setAttribute('aria-busy', 'true');
  document.getElementById('analyzeBtn').disabled = true;
}

export function hideLoading() {
  document.getElementById('loadingBar').style.display = 'none';
  document.getElementById('loadingStatus').style.display = 'none';
  document.getElementById('analyzeBtn').removeAttribute('aria-busy');
  document.getElementById('analyzeBtn').disabled = false;
}

export function updateStatus(text) {
  document.getElementById('loadingStatus').textContent = text;
  document.getElementById('loadingStatus').style.display = '';
}

export function updateProgress(loaded, offset) {
  const bar = document.getElementById('loadingBar');
  // We don't know the total, so show loaded count
  bar.removeAttribute('value'); // indeterminate
  document.getElementById('loadingStatus').textContent = `Fetching decks... ${loaded} found (page ${Math.floor(offset / 20)})`;
}

export function showError(message) {
  hideLoading();
  const el = document.getElementById('errorDisplay');
  el.textContent = message;
  el.style.display = '';
}

// --- Render Results ---

export function renderResults(results, decks, cardLookup) {
  currentResults = results;
  currentDecks = decks;
  currentCardLookup = cardLookup;

  document.getElementById('results').style.display = '';
  document.getElementById('sectionNav').style.display = '';

  renderSummary(results);
  renderArchetypeTable(results);
  renderGlobalCards(results);
  renderArchetypeSelector(results);
  setupDrilldownClose();
  setupSectionNav();
  setupBackToTop();
}

// --- Summary ---

function renderSummary(results) {
  const el = document.getElementById('summary');
  const dateStr = results.dateRange.earliest && results.dateRange.latest
    ? `${formatDate(results.dateRange.earliest)} - ${formatDate(results.dateRange.latest)}`
    : 'N/A';

  el.innerHTML = `
    <div class="summary-stat">
      <div class="value">${results.totalDecks}</div>
      <div class="label">Deck Lists</div>
    </div>
    <div class="summary-stat">
      <div class="value">${results.totalTournaments}</div>
      <div class="label">Tournaments</div>
    </div>
    <div class="summary-stat">
      <div class="value">${results.archetypes.length}</div>
      <div class="label">Archetypes</div>
    </div>
    <div class="summary-stat">
      <div class="value" style="font-size:1.2rem">${dateStr}</div>
      <div class="label">Date Range</div>
    </div>
  `;
}

// --- Archetype Table ---

function renderArchetypeTable(results) {
  const data = results.archetypes.map(a => ({
    name: a.name,
    count: a.count,
    percentage: a.percentage,
    tournamentCount: a.tournaments.size,
    tournaments: [...a.tournaments].join(', ')
  }));

  const maxPct = Math.max(...data.map(d => d.percentage), 1);

  const renderRow = (row) => `
    <tr>
      <td><span class="archetype-link" data-archetype="${escapeHtml(row.name)}">${escapeHtml(row.name)}</span></td>
      <td>${row.count}</td>
      <td class="bar-cell">
        <span class="bar-fill" style="width: ${(row.percentage / maxPct) * 100}%"></span>
        ${formatPercent(row.percentage)}
      </td>
      <td title="${escapeHtml(row.tournaments)}">${row.tournamentCount}</td>
    </tr>`;

  const table = document.getElementById('archetypeTable');
  table.querySelector('tbody').innerHTML = data.map(renderRow).join('');

  makeSortable(table, () => data, renderRow);

  // Click archetype name -> jump to deep dive
  table.addEventListener('click', (e) => {
    const link = e.target.closest('.archetype-link');
    if (!link) return;
    const archName = link.dataset.archetype;
    const selector = document.getElementById('archetypeSelector');
    selector.value = archName;
    selector.dispatchEvent(new Event('change'));
    const details = document.getElementById('archetypeDetails');
    if (!details.open) details.open = true;
    details.scrollIntoView({ behavior: 'smooth' });
  });
}

// --- Global Card Frequency ---

function renderGlobalCards(results) {
  renderGlobalCardTab(currentGlobalTab);

  document.getElementById('globalCardTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    const tab = btn.dataset.tab;
    document.querySelectorAll('#globalCardTabs .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentGlobalTab = tab;
    renderGlobalCardTab(tab);
  });
}

function renderGlobalCardTab(tab) {
  const cards = currentResults.globalCards[tab];
  const data = cards.map((c, i) => ({
    rank: i + 1,
    id: c.id,
    name: c.name,
    type: c.type,
    deckCount: c.count,
    frequency: c.frequency,
    avgCopies: c.avgCopies
  }));

  const renderRow = (row) => `
    <tr class="${freqClass(row.frequency)}">
      <td>${row.rank}</td>
      <td><span class="card-link" data-card-id="${row.id}">${escapeHtml(row.name)}</span></td>
      <td>${escapeHtml(row.type)}</td>
      <td>${row.deckCount}</td>
      <td>${formatPercent(row.frequency * 100)}</td>
      <td>${formatAvg(row.avgCopies)}</td>
    </tr>`;

  const table = document.getElementById('globalCardTable');
  table.querySelector('tbody').innerHTML = data.map(renderRow).join('');

  makeSortable(table, () => data, renderRow);
}

// --- Archetype Deep Dive ---

function renderArchetypeSelector(results) {
  const selector = document.getElementById('archetypeSelector');
  selector.innerHTML = '<option value="">Select an archetype...</option>';

  for (const arch of results.archetypes) {
    const opt = document.createElement('option');
    opt.value = arch.name;
    opt.textContent = `${arch.name} (${arch.count} lists)`;
    selector.appendChild(opt);
  }

  selector.addEventListener('change', () => {
    const archName = selector.value;
    if (!archName) {
      document.getElementById('archetypeDetail').innerHTML = '';
      return;
    }
    const arch = results.archetypes.find(a => a.name === archName);
    if (arch) renderArchetypeDeepDive(arch);
  });
}

function renderArchetypeDeepDive(arch) {
  const container = document.getElementById('archetypeDetail');
  const totalDecks = arch.count;

  let html = `<p class="info-text">${totalDecks} lists across ${arch.tournaments.size} tournament(s): ${escapeHtml([...arch.tournaments].join(', '))}</p>`;

  if (arch.tooFewLists) {
    html += `<p class="info-text">Fewer than 4 lists - showing all cards (core/tech split requires more data)</p>`;
    html += renderCardTable('All Main Deck Cards', arch.cards.mainCore, totalDecks, 'main-all');
  } else {
    html += renderCardTable('Core Cards (75%+ of lists)', arch.cards.mainCore, totalDecks, 'main-core');
    html += renderTechCardTable('Tech Cards (under 75%)', arch.cards.mainTech, totalDecks, 'main-tech');
  }

  // Extra deck
  if (arch.cards.extraCore.length > 0 || arch.cards.extraTech.length > 0) {
    if (arch.tooFewLists) {
      html += renderCardTable('Extra Deck Cards', arch.cards.extraCore, totalDecks, 'extra-all');
    } else {
      html += renderCardTable('Extra Deck - Core', arch.cards.extraCore, totalDecks, 'extra-core');
      if (arch.cards.extraTech.length > 0) {
        html += renderTechCardTable('Extra Deck - Tech', arch.cards.extraTech, totalDecks, 'extra-tech');
      }
    }
  }

  // Side deck
  if (arch.cards.side.length > 0) {
    html += renderTechCardTable('Side Deck Trends', arch.cards.side, totalDecks, 'side');
  }

  container.innerHTML = html;
  attachDeepDiveSorting(container);
}

function renderCardTable(title, cards, totalDecks, tableId) {
  if (cards.length === 0) return '';

  const rows = cards.map(c => `
    <tr class="${freqClass(c.frequency)}">
      <td><span class="card-link" data-card-id="${c.id}">${escapeHtml(c.name)}</span></td>
      <td>${c.count}/${totalDecks} (${formatPercent(c.frequency * 100)})</td>
      <td>${formatAvg(c.avgCopies)}</td>
      <td>${escapeHtml(c.type)}</td>
    </tr>`).join('');

  return `
    <div class="deep-dive-section">
      <h4>${escapeHtml(title)}</h4>
      <div class="table-wrapper">
        <table class="compact-table sortable-table" id="dd-${tableId}">
          <thead>
            <tr>
              <th data-sort="name">Card Name</th>
              <th data-sort="frequency">In Lists</th>
              <th data-sort="avgCopies">Avg Copies</th>
              <th data-sort="type">Type</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function renderTechCardTable(title, cards, totalDecks, tableId) {
  if (cards.length === 0) return '';

  const filterId = `filter-${tableId}`;

  const rows = cards.map(c => `
    <tr class="${freqClass(c.frequency)}" data-name="${escapeHtml(c.name.toLowerCase())}">
      <td><span class="card-link" data-card-id="${c.id}">${escapeHtml(c.name)}</span></td>
      <td>${c.count}/${totalDecks}</td>
      <td>${formatPercent(c.frequency * 100)}</td>
      <td>${formatAvg(c.avgCopies)}</td>
      <td>${escapeHtml(c.type)}</td>
    </tr>`).join('');

  return `
    <div class="deep-dive-section">
      <h4>${escapeHtml(title)} <small>(${cards.length} cards)</small></h4>
      <input type="search" class="filter-input" id="${filterId}" placeholder="Filter cards..." data-table="dd-${tableId}">
      <div class="table-wrapper">
        <table class="compact-table sortable-table sticky-header" id="dd-${tableId}">
          <thead>
            <tr>
              <th data-sort="name">Card Name</th>
              <th data-sort="count">In Lists</th>
              <th data-sort="frequency">Frequency</th>
              <th data-sort="avgCopies">Avg Copies</th>
              <th data-sort="type">Type</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function attachDeepDiveSorting(container) {
  // Attach sorting to all generated tables
  container.querySelectorAll('.sortable-table').forEach(table => {
    const tableId = table.id;
    // Find the data source from current results
    const archName = document.getElementById('archetypeSelector').value;
    const arch = currentResults.archetypes.find(a => a.name === archName);
    if (!arch) return;

    let cardData;
    if (tableId.includes('main-core') || tableId.includes('main-all')) {
      cardData = arch.cards.mainCore;
    } else if (tableId.includes('main-tech')) {
      cardData = arch.cards.mainTech;
    } else if (tableId.includes('extra-core') || tableId.includes('extra-all')) {
      cardData = arch.cards.extraCore;
    } else if (tableId.includes('extra-tech')) {
      cardData = arch.cards.extraTech;
    } else if (tableId.includes('side')) {
      cardData = arch.cards.side;
    }

    if (!cardData) return;

    const totalDecks = arch.count;
    const istech = tableId.includes('tech') || tableId.includes('side');

    const renderRow = (c) => {
      const freqCls = freqClass(c.frequency);
      if (istech) {
        return `
          <tr class="${freqCls}" data-name="${escapeHtml(c.name.toLowerCase())}">
            <td><span class="card-link" data-card-id="${c.id}">${escapeHtml(c.name)}</span></td>
            <td>${c.count}/${totalDecks}</td>
            <td>${formatPercent(c.frequency * 100)}</td>
            <td>${formatAvg(c.avgCopies)}</td>
            <td>${escapeHtml(c.type)}</td>
          </tr>`;
      }
      return `
        <tr class="${freqCls}">
          <td><span class="card-link" data-card-id="${c.id}">${escapeHtml(c.name)}</span></td>
          <td>${c.count}/${totalDecks} (${formatPercent(c.frequency * 100)})</td>
          <td>${formatAvg(c.avgCopies)}</td>
          <td>${escapeHtml(c.type)}</td>
        </tr>`;
    };

    makeSortable(table, () => cardData, renderRow);
  });

  // Attach filter inputs
  container.querySelectorAll('.filter-input').forEach(input => {
    input.addEventListener('input', () => {
      const query = input.value.toLowerCase();
      const tableId = input.dataset.table;
      const table = document.getElementById(tableId);
      if (!table) return;
      const rows = table.querySelectorAll('tbody tr');
      rows.forEach(row => {
        const name = row.dataset.name || row.textContent.toLowerCase();
        row.style.display = name.includes(query) ? '' : 'none';
      });
    });
  });
}

// --- Card Drill-down ---

function setupDrilldownClose() {
  const dialog = document.getElementById('cardDrilldown');
  document.getElementById('closeDrilldown').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
}

function openCardDrilldown(cardId) {
  const card = currentCardLookup.get(cardId);
  const dialog = document.getElementById('cardDrilldown');

  document.getElementById('drilldownCardName').textContent = card ? card.name : `Unknown Card #${cardId}`;
  document.getElementById('drilldownCardInfo').textContent = card
    ? `${card.type} | ${card.race}${card.archetype ? ` | ${card.archetype}` : ''}`
    : '';

  // Find all decks containing this card
  const appearances = [];
  for (const deck of currentDecks) {
    const inMain = deck.mainDeckIds.filter(id => id === cardId).length;
    const inExtra = deck.extraDeckIds.filter(id => id === cardId).length;
    const inSide = deck.sideDeckIds.filter(id => id === cardId).length;
    const total = inMain + inExtra + inSide;

    if (total > 0) {
      const locations = [];
      if (inMain) locations.push(`Main x${inMain}`);
      if (inExtra) locations.push(`Extra x${inExtra}`);
      if (inSide) locations.push(`Side x${inSide}`);

      appearances.push({
        tournament: deck.tournamentName || 'Unknown',
        player: deck.tournamentPlayerName || 'Unknown',
        deckName: deck.deck_name,
        placement: deck.tournamentPlacement || '?',
        copies: total,
        location: locations.join(', '),
        deckUrl: `https://ygoprodeck.com/deck/${deck.pretty_url}`
      });
    }
  }

  document.getElementById('drilldownFrequency').textContent =
    `Appears in ${appearances.length} / ${currentDecks.length} decks (${formatPercent((appearances.length / currentDecks.length) * 100)})`;

  const rows = appearances.map(a => `
    <tr>
      <td>${escapeHtml(a.tournament)}</td>
      <td>${escapeHtml(a.player)}</td>
      <td>${escapeHtml(a.deckName)}</td>
      <td>${escapeHtml(a.placement)}</td>
      <td>${a.copies}</td>
      <td>${escapeHtml(a.location)}</td>
      <td><a href="${escapeHtml(a.deckUrl)}" target="_blank" rel="noopener">View on YGOPRODeck</a></td>
    </tr>`).join('');

  document.getElementById('drilldownTable').querySelector('tbody').innerHTML = rows;

  dialog.showModal();
}

// --- Section nav (IntersectionObserver) ---

let navObserver = null;

function setupSectionNav() {
  const nav = document.getElementById('sectionNav');
  const links = nav.querySelectorAll('.nav-link');
  const sectionIds = [...links].map(l => l.dataset.section);

  // Clean up previous observer if re-running analysis
  if (navObserver) navObserver.disconnect();

  // Track which sections are visible
  const visible = new Set();

  navObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        visible.add(entry.target.id);
      } else {
        visible.delete(entry.target.id);
      }
    }
    // Highlight the first visible section in DOM order
    for (const id of sectionIds) {
      if (visible.has(id)) {
        links.forEach(l => l.classList.toggle('active', l.dataset.section === id));
        break;
      }
    }
  }, { rootMargin: '-60px 0px -70% 0px' });

  for (const id of sectionIds) {
    const el = document.getElementById(id);
    if (el) navObserver.observe(el);
  }

  // Smooth scroll on click
  nav.addEventListener('click', (e) => {
    const link = e.target.closest('.nav-link');
    if (!link) return;
    e.preventDefault();
    const target = document.getElementById(link.dataset.section);
    if (target) {
      // If it's a collapsed <details>, open it first
      if (target.tagName === 'DETAILS' && !target.open) target.open = true;
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
}

// --- Back to top button ---

function setupBackToTop() {
  const btn = document.getElementById('backToTop');

  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 400);
  }, { passive: true });

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// --- Global click delegation for card links ---

export function setupCardLinkDelegation() {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('.card-link');
    if (!link) return;
    const cardId = link.dataset.cardId;
    if (cardId && currentDecks) {
      openCardDrilldown(cardId);
    }
  });
}
