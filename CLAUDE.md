# YGO Researcher — Hong Kong v2

## What This Is

A dual-page Yu-Gi-Oh! research tool deployed on Cloudflare Pages. Pure vanilla JS (ES modules), no build step, no framework. Uses PicoCSS for styling.

## Pages

| Page | Entry HTML | Entry JS | UI Module | Purpose |
|------|-----------|----------|-----------|---------|
| Meta Analyzer | `index.html` | `js/app.js` | `js/ui.js` | Fetch tournament decks, analyze card frequencies by archetype |
| Hand Calculator | `hands.html` | `js/handsApp.js` | `js/handsUi.js` | Import .ydk, define combos, calculate opening hand probabilities |

## Architecture

```
hands.html                     index.html
    │                              │
handsApp.js                     app.js
    │                              │
handsUi.js ──► probability.js   ui.js ──► analyzer.js
    │                              │         │
ydkParser.js                    api.js   archetypeClassifier.js
    │                              │
cardDb.js ◄────────────────── cardDb.js
    │                              │
(IndexedDB cache)            dateParser.js
```

## Key Modules

- **`js/probability.js`** — Core math engine. Exact multivariate hypergeometric with inclusion-exclusion, Monte Carlo fallback. `calculate()` is the public API. No DOM, no state — pure functions. See `.claude/skills/probability-engine.md`.
- **`js/handsUi.js`** — Largest file (~900 lines). Manages ALL hand calculator state (deckGroups, sideGroups, pools, combos, matchups) and rendering. See `.claude/skills/hand-calculator.md`.
- **`js/cardDb.js`** — IndexedDB cache with 2-day TTL for the card database from ygoprodeck.com.
- **`js/ydkParser.js`** — Parses `.ydk` format into `{ main: string[], extra: string[], side: string[] }`. `groupCards()` deduplicates into `[{ id, count }]`.

## Critical Data Model — Hand Calculator

```
deckGroups: [{ id, count, name, type }]   — indexed by position (groupIndex)
sideGroups: [{ id, count, name, type }]   — separate array for side deck display
pools:      [{ id, name, memberGroupIndices: number[] }]
combos:     [{ id, name, requirements: Requirement[] }]
matchups:   [{ id, name, swaps: [{ out, in, count }] }]
```

**groupIndex is sacred.** Pools and combos reference cards by their index in `deckGroups`. Side-only cards are merged into `deckGroups` with `count: 0` at import time so they get stable indices. Never remap or reorder `deckGroups` after import.

## Conventions

- No build step — files are served directly by Cloudflare Pages
- No package.json dependencies for production — only vitest for testing
- All state lives in module-level `let` variables in `handsUi.js`
- Panel rendering pattern: find-or-create DOM element by ID, set innerHTML, wire event listeners (see `renderPool()`, `renderCombo()`, `renderMatchup()`)
- Recalculation is debounced via `recalculate()` → 50ms → `doRecalculate()`
- Shareable links: compact JSON → DEFLATE compress → base64url → URL hash `#data=...`

## Running Locally

```bash
node dev-server.js    # Starts on port 8767 with CORS proxy
```

## Testing

```bash
npx vitest run        # 73 tests in tests/probability.test.js
```

Tests cover the probability engine only (pure math, no DOM). The test file uses direct assertions, not a test framework's describe/it — vitest just runs it.

## Deployment

Cloudflare Pages with Functions:
- `functions/_middleware.js` — Password protection (env var `SITE_PASSWORD`)
- `functions/api/decks.js` — CORS proxy for ygoprodeck.com API
- Password: set via Cloudflare dashboard or `.dev.vars` locally

## Skills

See `.claude/skills/` for detailed architecture docs:
- `hand-calculator.md` — State management, UI patterns, serialization
- `probability-engine.md` — Math internals, algorithm selection, pool resolution
- `meta-analyzer.md` — API flow, analysis pipeline, classification
- `deployment.md` — Cloudflare Pages, middleware, local dev
