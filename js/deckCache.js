/**
 * Shared sessionStorage cache for classified deck data.
 * Allows Meta Analyzer and Trends pages to share fetched decks.
 */

const CACHE_PREFIX = 'ygo-deck-cache-';

export function getCachedDecks(rangeDays) {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + rangeDays);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Rehydrate parsedDate from ISO string
    for (const deck of data) {
      if (deck.parsedDate) {
        deck.parsedDate = new Date(deck.parsedDate);
      }
    }
    return data;
  } catch (e) {
    return null;
  }
}

export function setCachedDecks(rangeDays, decks) {
  try {
    sessionStorage.setItem(CACHE_PREFIX + rangeDays, JSON.stringify(decks));
  } catch (e) {
    // sessionStorage full or unavailable — silently skip
  }
}
