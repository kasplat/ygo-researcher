# Hand Calculator Architecture

Use this when modifying `hands.html`, `js/handsUi.js`, or `js/handsApp.js`.

## State Model (`js/handsUi.js`)

All state is module-level variables:

```
deckGroups[]    — Main deck cards + side-only cards (count 0). Index = groupIndex.
sideGroups[]    — Side deck cards for display/editing. Separate from deckGroups.
pools[]         — Card pools for OR logic. Members reference groupIndex.
combos[]        — Winning combos. Requirements reference groupIndex or poolId.
matchups[]      — Post-siding matchups. Swaps reference groupIndex pairs.
poolIdCounter   — Monotonic ID generator for pools.
comboIdCounter  — Monotonic ID generator for combos.
matchupIdCounter — Monotonic ID generator for matchups.
```

## The groupIndex Contract

**This is the most important invariant in the codebase.**

Every pool membership, combo requirement, and matchup swap references cards by their index in `deckGroups`. This index is assigned at import time and must never change.

When a .ydk file is imported:
1. Main deck cards → `deckGroups` (indices 0..N-1)
2. Side deck cards → `sideGroups` (for display)
3. `mergeSideCardsIntoDeckGroups()` appends side-only cards to `deckGroups` with `count: 0` (indices N..M)

After this, `deckGroups` is append-only. Cards set to count 0 via -/+ buttons are hidden but never removed. This preserves all existing references.

## Panel Rendering Pattern

All three builders (pool, combo, matchup) follow the same pattern:

```js
function renderThing(thing) {
  const list = document.getElementById('thingList');
  let panel = document.getElementById(`thing-${thing.id}`);
  if (!panel) {
    panel = document.createElement('div');
    panel.id = `thing-${thing.id}`;
    list.appendChild(panel);
  }
  panel.innerHTML = `...`;  // Full re-render
  // Wire event listeners on the new DOM
  panel.querySelector('.name-input').addEventListener('input', ...);
  panel.querySelector('.remove-btn').addEventListener('click', ...);
  // etc.
}
```

This means event listeners are recreated on every render. Don't cache DOM references across renders.

## Dropdown Helpers

Card selection dropdowns use shared helpers that alphabetize and split into optgroups:

- `mainDeckOptions(filterFn)` — Options for cards with count > 0
- `sideDeckOptions(filterFn)` — Options for side-only cards (count 0 in deckGroups)
- `cardOptgroups(filterFn)` — Combined with "Main Deck" / "Side Deck" optgroup labels
- `cardLabel(g)` — "Card Name (3x)" or "Card Name (side)"
- `isSideOnly(groupIndex)` — True if count 0 AND exists in sideGroups

## Calculation Flow

```
User action → recalculate() [debounced 50ms] → doRecalculate()
  │
  ├─ Build input: { deckSize, groups, pools, combos }
  │
  ├─ Base deck: calculate() for handSize 5 and 6
  │
  ├─ Per matchup:
  │    Clone deckGroups counts → apply swaps → calculate()
  │    (swap.count copies out, swap.count copies in)
  │
  ├─ Render base results (probability + per-combo breakdown)
  ├─ Render matchup comparison table (with delta coloring)
  │
  └─ updateHash() → serialize → compress → URL hash
```

The `calculate()` API (`probability.js`) accepts `{ groups, combos, deckSize, handSize, pools }` and returns `{ probability, method, perCombo }`. It handles pool resolution and exact vs. simulation selection internally.

## Serialization Format

Shareable links encode state as compressed JSON in the URL hash:

```json
{
  "d": [[cardId, count], ...],        // deckGroups (ALL, including count-0)
  "s": [[cardId, count], ...],        // sideGroups (count > 0 only)
  "p": [{ "n": "name", "m": [groupIndex, ...] }],  // pools
  "c": [{ "n": "name", "r": [requirement, ...] }],  // combos
  "m": [{ "n": "name", "w": [[outIdx, inIdx, count], ...] }]  // matchups
}
```

Requirements: `{ "t": "c", "g": groupIndex, "m": min }` for cards, `{ "t": "p", "p": poolIndex, "m": min }` for pools.

Compression: JSON → DEFLATE (CompressionStream API) → base64url → `#data=...`

## Deserialization (`deserializeState`)

This function reconstructs the entire UI from a URL hash. It:
1. Decompresses and parses the JSON
2. Rebuilds deckGroups and sideGroups from card IDs (looks up names via cardLookup)
3. Merges side-only cards into deckGroups
4. Renders the deck grid + side deck grid
5. Wires the deck grid click handler
6. Wires pool/combo/matchup add buttons
7. Rebuilds pools with correct IDs (poolIdByIndex mapping for combo references)
8. Rebuilds combos with correct pool ID references
9. Rebuilds matchups with swap indices
10. Triggers recalculate()

This is ~100 lines and fragile — changes to any builder must be mirrored here.

## Adding a New Builder Section

If you add a new section (like a "constraint" builder), follow this checklist:
1. Add module state: `let things = []; let thingIdCounter = 0;`
2. Add HTML section in `hands.html` (hidden by default)
3. Add `addThing()`, `renderThing()`, removal logic
4. Wire the add button in both `renderDeck()` AND `deserializeState()`
5. Reset state in both `renderDeck()` AND `deserializeState()`
6. Show the section in both `renderDeck()` AND `deserializeState()`
7. Add to `serializeState()` with a new compact key
8. Add to `deserializeState()` with rebuild logic
9. If it affects calculation, update `doRecalculate()`
