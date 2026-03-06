/**
 * IndexedDB cache for the YGOPRODeck card database.
 * Stores minimal card fields with a 2-day TTL.
 */

const DB_NAME = 'ygo-meta-analyzer';
const DB_VERSION = 1;
const CARDS_STORE = 'cards';
const META_STORE = 'meta';
const CACHE_TTL_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(CARDS_STORE)) {
        db.createObjectStore(CARDS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getFromStore(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAllFromStore(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function clearAndPopulate(db, storeName, items) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.clear();
    for (const item of items) {
      store.put(item);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function putInStore(db, storeName, item) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function fetchCardDatabaseFromApi() {
  const resp = await fetch('https://db.ygoprodeck.com/api/v7/cardinfo.php');
  if (!resp.ok) throw new Error(`Card DB fetch failed: ${resp.status}`);
  const data = await resp.json();
  return data.data;
}

function decodeHtmlEntities(text) {
  if (!text) return text;
  return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'");
}

function extractMinimalCards(rawCards) {
  return rawCards.map(c => {
    // Collect alternate art image IDs (deck lists sometimes reference these)
    const altIds = [];
    for (const img of (c.card_images || [])) {
      if (img.id !== c.id) {
        altIds.push(img.id);
      }
    }
    return {
      id: c.id,
      name: decodeHtmlEntities(c.name),
      type: c.type,
      archetype: c.archetype || null,
      race: c.race,
      altIds
    };
  });
}

export async function getCardDatabase() {
  let db;
  try {
    db = await openDb();
  } catch {
    // IndexedDB unavailable - fetch directly
    return extractMinimalCards(await fetchCardDatabaseFromApi());
  }

  // Check cache freshness
  const meta = await getFromStore(db, META_STORE, 'lastFetched');
  if (meta && (Date.now() - meta.timestamp) < CACHE_TTL_MS) {
    const cached = await getAllFromStore(db, CARDS_STORE);
    if (cached.length > 0) {
      return cached;
    }
  }

  // Fetch fresh data
  const minimal = extractMinimalCards(await fetchCardDatabaseFromApi());

  await clearAndPopulate(db, CARDS_STORE, minimal);
  await putInStore(db, META_STORE, { key: 'lastFetched', timestamp: Date.now() });

  return minimal;
}

export function buildCardLookup(cards) {
  const map = new Map();
  for (const card of cards) {
    map.set(String(card.id), card);
    // Also register alternate art IDs pointing to the same card
    for (const altId of (card.altIds || [])) {
      map.set(String(altId), card);
    }
  }
  return map;
}
