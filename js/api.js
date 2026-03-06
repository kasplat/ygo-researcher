/**
 * API fetching with rate limiting and pagination.
 *
 * The deck API at ygoprodeck.com doesn't send CORS headers,
 * so browser requests go through our Cloudflare Pages Function
 * proxy at /api/decks. The card DB API at db.ygoprodeck.com has
 * proper CORS headers and can be called directly.
 */

import { isWithinRange } from './dateParser.js';

const RATE_LIMIT_DELAY_MS = 200; // 5 req/s, well under the 20/s limit
const DECKS_PER_PAGE = 20;
const STOP_AFTER_CONSECUTIVE_MISSES = 3;

let lastRequestTime = 0;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getDeckApiUrl(offset, num) {
  // Use local proxy (Cloudflare Pages Function) to avoid CORS
  return `/api/decks?format=Tournament+Meta+Decks&offset=${offset}&num=${num}`;
}

async function throttledFetch(url) {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_DELAY_MS) {
    await sleep(RATE_LIMIT_DELAY_MS - elapsed);
  }
  lastRequestTime = Date.now();

  const resp = await fetch(url);
  if (!resp.ok) {
    if (resp.status === 429 || resp.status === 403) {
      // Rate limited - wait and retry once
      await sleep(5000);
      lastRequestTime = Date.now();
      const retry = await fetch(url);
      if (!retry.ok) throw new Error(`API rate limited (${retry.status}). Try again in a few minutes.`);
      return retry.json();
    }
    throw new Error(`API error: ${resp.status}`);
  }
  return resp.json();
}

function parseDeckCards(deck) {
  try {
    deck.mainDeckIds = JSON.parse(deck.main_deck || '[]');
    deck.extraDeckIds = JSON.parse(deck.extra_deck || '[]');
    deck.sideDeckIds = JSON.parse(deck.side_deck || '[]');
  } catch {
    deck.mainDeckIds = [];
    deck.extraDeckIds = [];
    deck.sideDeckIds = [];
  }
}

export async function fetchDecks(rangeDays, onProgress) {
  const allDecks = [];
  let offset = 0;
  let consecutiveOutOfRange = 0;

  while (true) {
    const url = getDeckApiUrl(offset, DECKS_PER_PAGE);
    const page = await throttledFetch(url);

    if (!page || !Array.isArray(page) || page.length === 0) break;

    let anyInRange = false;
    for (const deck of page) {
      if (isWithinRange(deck.submit_date, rangeDays)) {
        parseDeckCards(deck);
        allDecks.push(deck);
        anyInRange = true;
      }
    }

    if (!anyInRange) {
      consecutiveOutOfRange++;
      if (consecutiveOutOfRange >= STOP_AFTER_CONSECUTIVE_MISSES) break;
    } else {
      consecutiveOutOfRange = 0;
    }

    offset += DECKS_PER_PAGE;

    if (onProgress) onProgress(allDecks.length, offset);
  }

  return allDecks;
}

export async function fetchArchetypes() {
  const url = 'https://db.ygoprodeck.com/api/v7/archetypes.php';
  return throttledFetch(url);
}
