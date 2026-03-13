/**
 * Per-category per-archetype frequency analysis and opening hand probability math.
 */

import { ensureBinomialTable, C } from './probability.js';

/**
 * Analyze a single card category across all decks.
 *
 * @param {Object[]} decks - Classified deck objects with mainDeckIds/sideDeckIds
 * @param {Map} cardLookup - Card ID → card object
 * @param {{ id, name, zone, cardIds }} category - The category to analyze
 * @returns Analysis result object
 */
export function analyzeCategory(decks, cardLookup, category) {
  const catIdSet = new Set(category.cardIds);
  const deckField = category.zone === 'side' ? 'sideDeckIds' : 'mainDeckIds';
  const isMain = category.zone === 'main';

  // Group decks by archetype
  const archetypeMap = new Map();
  for (const deck of decks) {
    const arch = deck.archetype;
    if (!archetypeMap.has(arch)) archetypeMap.set(arch, []);
    archetypeMap.get(arch).push(deck);
  }

  // Global card frequency
  const globalFrequency = computeCardFrequency(decks, deckField, catIdSet, cardLookup);

  // Per-archetype analysis
  const archetypes = [];
  for (const [name, archDecks] of archetypeMap) {
    const cardFrequency = computeCardFrequency(archDecks, deckField, catIdSet, cardLookup);

    // Count total category copies per deck
    const perDeckCounts = archDecks.map(deck => countCategoryCards(deck, deckField, catIdSet));
    const avgCount = perDeckCounts.reduce((s, c) => s + c, 0) / archDecks.length;

    // Opening hand probabilities (only for main deck categories)
    let openingHand = null;
    if (isMain) {
      openingHand = {
        going1st: averageOpeningProbs(archDecks, deckField, catIdSet, 5),
        going2nd: averageOpeningProbs(archDecks, deckField, catIdSet, 6),
      };
    }

    archetypes.push({ name, deckCount: archDecks.length, cardFrequency, avgCount, openingHand });
  }

  archetypes.sort((a, b) => b.deckCount - a.deckCount);

  // Date range
  const dates = decks.map(d => d.parsedDate).filter(Boolean);
  const earliest = dates.length > 0 ? new Date(Math.min(...dates)) : null;
  const latest = dates.length > 0 ? new Date(Math.max(...dates)) : null;

  return { totalDecks: decks.length, dateRange: { earliest, latest }, globalFrequency, archetypes };
}

function computeCardFrequency(decks, deckField, catIdSet, cardLookup) {
  const totalDecks = decks.length;
  const cardStats = new Map();

  for (const deck of decks) {
    const ids = deck[deckField] || [];
    const seen = new Map();
    for (const id of ids) {
      if (!catIdSet.has(String(id))) continue;
      const key = String(id);
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    for (const [id, copies] of seen) {
      const entry = cardStats.get(id) || { count: 0, totalCopies: 0 };
      entry.count++;
      entry.totalCopies += copies;
      cardStats.set(id, entry);
    }
  }

  const results = [];
  for (const [id, stats] of cardStats) {
    const card = cardLookup.get(id);
    results.push({
      id,
      name: card ? card.name : `Unknown #${id}`,
      count: stats.count,
      frequency: totalDecks > 0 ? stats.count / totalDecks : 0,
      avgCopies: stats.count > 0 ? stats.totalCopies / stats.count : 0
    });
  }

  results.sort((a, b) => b.frequency - a.frequency || b.count - a.count);
  return results;
}

function countCategoryCards(deck, deckField, catIdSet) {
  const ids = deck[deckField] || [];
  let total = 0;
  for (const id of ids) {
    if (catIdSet.has(String(id))) total++;
  }
  return total;
}

/**
 * Compute average P(exactly 0), P(exactly 1), P(exactly 2), P(3+) across decks.
 */
function averageOpeningProbs(decks, deckField, catIdSet, handSize) {
  if (decks.length === 0) return [0, 0, 0, 0];

  const sums = [0, 0, 0, 0]; // p0, p1, p2, p3+

  for (const deck of decks) {
    const k = countCategoryCards(deck, deckField, catIdSet);
    const N = (deck.mainDeckIds || []).length;

    if (N === 0 || handSize > N) continue;
    ensureBinomialTable(Math.max(N, handSize));

    let p0 = 0, p1 = 0, p2 = 0;

    // P(exactly x) = C(k, x) * C(N-k, h-x) / C(N, h)
    const total = C(N, handSize);
    if (total === 0) continue;

    for (let x = 0; x <= Math.min(2, k, handSize); x++) {
      const remaining = handSize - x;
      if (remaining > N - k || remaining < 0) continue;
      const p = (C(k, x) * C(N - k, remaining)) / total;
      if (x === 0) p0 = p;
      else if (x === 1) p1 = p;
      else if (x === 2) p2 = p;
    }

    sums[0] += p0;
    sums[1] += p1;
    sums[2] += p2;
    sums[3] += 1 - p0 - p1 - p2;
  }

  const n = decks.length;
  return [sums[0] / n, sums[1] / n, sums[2] / n, sums[3] / n];
}
