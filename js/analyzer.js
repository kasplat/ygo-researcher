/**
 * Statistical analysis engine for meta deck data.
 */

const CORE_THRESHOLD = 0.75;
const MIN_LISTS_FOR_CLASSIFICATION = 4;

function analyzeCardSet(decks, deckField, cardLookup) {
  const totalDecks = decks.length;
  const cardStats = new Map(); // cardId -> { count, totalCopies }

  for (const deck of decks) {
    const ids = deck[deckField] || [];
    const seen = new Map(); // cardId -> copies in this deck
    for (const id of ids) {
      seen.set(id, (seen.get(id) || 0) + 1);
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
      name: card ? card.name : `Unknown Card #${id}`,
      type: card ? card.type : 'Unknown',
      race: card ? card.race : '',
      archetype: card ? card.archetype : null,
      count: stats.count,
      frequency: totalDecks > 0 ? stats.count / totalDecks : 0,
      avgCopies: stats.count > 0 ? stats.totalCopies / stats.count : 0
    });
  }

  results.sort((a, b) => b.frequency - a.frequency || b.count - a.count);
  return results;
}

function splitCoreAndTech(cardList, totalDecks) {
  if (totalDecks < MIN_LISTS_FOR_CLASSIFICATION) {
    return { core: cardList, tech: [], tooFewLists: true };
  }

  const core = [];
  const tech = [];

  for (const card of cardList) {
    if (card.frequency >= CORE_THRESHOLD) {
      core.push(card);
    } else {
      tech.push(card);
    }
  }

  return { core, tech, tooFewLists: false };
}

export function analyzeDecks(decks, cardLookup) {
  // Group by archetype
  const archetypeMap = new Map();
  const tournamentSet = new Set();

  for (const deck of decks) {
    const arch = deck.archetype;
    if (!archetypeMap.has(arch)) {
      archetypeMap.set(arch, []);
    }
    archetypeMap.get(arch).push(deck);
    if (deck.tournamentName) {
      tournamentSet.add(deck.tournamentName);
    }
  }

  // Build archetype results
  const archetypes = [];
  for (const [name, archDecks] of archetypeMap) {
    const tournaments = new Set(archDecks.map(d => d.tournamentName).filter(Boolean));

    const mainCards = analyzeCardSet(archDecks, 'mainDeckIds', cardLookup);
    const extraCards = analyzeCardSet(archDecks, 'extraDeckIds', cardLookup);
    const sideCards = analyzeCardSet(archDecks, 'sideDeckIds', cardLookup);

    const { core: mainCore, tech: mainTech, tooFewLists } = splitCoreAndTech(mainCards, archDecks.length);
    const { core: extraCore, tech: extraTech } = splitCoreAndTech(extraCards, archDecks.length);

    archetypes.push({
      name,
      count: archDecks.length,
      percentage: decks.length > 0 ? (archDecks.length / decks.length) * 100 : 0,
      tournaments,
      decks: archDecks,
      tooFewLists,
      cards: {
        mainCore,
        mainTech,
        extraCore,
        extraTech,
        side: sideCards
      }
    });
  }

  archetypes.sort((a, b) => b.count - a.count);

  // Global card frequency
  const globalMain = analyzeCardSet(decks, 'mainDeckIds', cardLookup);
  const globalExtra = analyzeCardSet(decks, 'extraDeckIds', cardLookup);
  const globalSide = analyzeCardSet(decks, 'sideDeckIds', cardLookup);

  // Date range
  const dates = decks.map(d => d.parsedDate).filter(Boolean);
  const earliest = dates.length > 0 ? new Date(Math.min(...dates)) : null;
  const latest = dates.length > 0 ? new Date(Math.max(...dates)) : null;

  return {
    totalDecks: decks.length,
    totalTournaments: tournamentSet.size,
    dateRange: { earliest, latest },
    archetypes,
    globalCards: {
      main: globalMain,
      extra: globalExtra,
      side: globalSide
    }
  };
}
