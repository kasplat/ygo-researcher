# YGO Researcher

A Yu-Gi-Oh! research tool for analyzing the competitive meta, calculating opening hand probabilities, and tracking card usage trends. Deployed on Cloudflare Pages — pure vanilla JS, no build step.

## Pages

### Hand Calculator (`hands.html`)
Import a `.ydk` deck file, define winning combos with card pools (OR logic), and calculate exact opening hand probabilities using multivariate hypergeometric math. Supports post-siding matchups with side deck swaps and shareable links.

### Meta Analyzer (`index.html`)
Fetch tournament decklists from YGOPRODeck, classify by archetype, and get statistical breakdowns: archetype representation, global card frequency, core/tech splits, and per-card drill-downs.

### Trends (`trends.html`)
Track card category usage across the meta with configurable categories. Ships with two defaults:

- **Hand Traps** — Ash Blossom, Maxx "C", Effect Veiler, Nibiru, etc.
- **Go-Second Side Techs** — Lightning Storm, Evenly Matched, Kaijus, etc.

For each category, the page shows:
- **Frequency heatmap** — card x archetype grid with color-coded usage percentages
- **Opening hand probabilities** — P(0/1/2/3+) going first and second per archetype, computed via exact hypergeometric math averaged across decklists

Users can create custom categories, toggle individual cards on/off, and add cards from the fetched data. All category configurations persist in localStorage. Deck data is cached in sessionStorage so switching between Meta Analyzer and Trends doesn't require re-fetching.

## Running Locally

```bash
node dev-server.js    # Starts on port 8767 with CORS proxy
```

## Testing

```bash
npx vitest run        # Probability engine tests
```
