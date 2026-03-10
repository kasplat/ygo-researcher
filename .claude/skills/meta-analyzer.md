# Meta Analyzer Architecture

Use this when modifying `index.html`, `js/app.js`, `js/ui.js`, `js/api.js`, `js/analyzer.js`, or `js/archetypeClassifier.js`.

## Data Pipeline

```
User clicks "Analyze Meta" (app.js)
  │
  ├─ loadCardDb() → IndexedDB cache (2-day TTL) or API fetch
  ├─ fetchArchetypes() → list of archetype names for classification
  │
  ├─ fetchDecks(format, startDate) → paginated API calls
  │    └─ GET /api/decks → Cloudflare Function proxy → ygoprodeck.com
  │    └─ Rate limited: 5 req/s, retry on 429/403
  │    └─ Stops after 3 consecutive pages outside date range
  │
  ├─ classifyDeck(deckName, archetypes)
  │    └─ First-appearing archetype match in deck name
  │    └─ Longer name wins ties
  │    └─ Falls back to raw deck name
  │
  ├─ analyzeDecks(classifiedDecks, cardLookup)
  │    └─ Group by archetype
  │    └─ Per archetype: card frequency, core/tech split (75% threshold)
  │    └─ Global card usage across all decks
  │
  └─ renderResults(analysis, cardLookup)
       └─ Archetype summary table (sortable)
       └─ Global card frequency table (with bar chart)
       └─ Card drill-down modal (per-archetype usage)
```

## Modules

### `js/api.js`
- `fetchDecks(format, startDate)` — Paginated fetch with rate limiting
- `fetchArchetypes()` — Single call for archetype name list
- Rate limiter: 200ms between requests, automatic retry on rate limit errors
- Stops pagination after 3 consecutive pages where all decks fall outside date range

### `js/cardDb.js`
- `getCardDatabase()` — Returns full card array (from cache or API)
- `buildCardLookup(cards)` — Returns `Map<string, card>` by card ID
- IndexedDB store: `cardDb` database, `cards` object store
- TTL: 2 days. Stores: id, name, type, race, archetype, altIds (alternate art IDs)
- Graceful fallback: if IndexedDB unavailable, fetches directly

### `js/archetypeClassifier.js`
- `initClassifier(archetypeNames)` — Builds sorted list (longest first for matching)
- `classifyDeck(deckName)` — Returns canonical archetype name
- Strategy: scan deck name for all archetype substrings, pick the one that appears earliest (leftmost); break ties by longest name

### `js/analyzer.js`
- `analyzeDecks(decks, cardLookup)` — Returns full analysis object
- Per-archetype stats: deck count, core cards (≥75% usage), tech cards (<75%)
- Global stats: card frequency across all decks, archetype distribution
- Cards include: name, count, frequency percentage, average copies

### `js/ui.js` (19K — largest meta module)
- `renderResults(analysis, cardLookup)` — Builds all result sections
- Sortable tables with click-to-sort headers (asc/desc toggle)
- Card drill-down dialog: click card name → modal with per-archetype breakdown
- Progress bar and status updates during data loading
- Inline bar charts for frequency visualization

## HTML Structure (`index.html`)

```
main.container
  ├─ nav.page-nav (cross-page: Meta Analyzer | Hand Calculator)
  ├─ header (title, description)
  ├─ section#controls (format dropdown, time range, analyze button)
  ├─ section#resultsSection
  │    ├─ .summary-bar (total decks, archetypes, date range)
  │    ├─ details#archetypeSection (archetype table, sortable)
  │    ├─ details#globalCardSection (global card table, tabs, filter)
  │    └─ dialog#cardDrilldown (per-card archetype breakdown modal)
  └─ section#loadingSection (progress bar, status text)
```

## Key Patterns

- **No client-side routing** — each page is a separate HTML file
- **Event delegation** — card links use delegated click handlers via `setupCardLinkDelegation()`
- **Collapsible sections** — `<details>` elements with custom styled `<summary>` headers
- **Sortable tables** — data-sort attribute on `<th>`, toggles `.sort-asc`/`.sort-desc` classes
