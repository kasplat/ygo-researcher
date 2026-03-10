# Probability Engine Architecture

Use this when modifying `js/probability.js` or `tests/probability.test.js`.

## Public API

```js
calculate({ groups, combos, deckSize, handSize, pools })
// Returns: { probability, method, perCombo: [{ name, probability }] }
```

- `groups`: `[{ name, count }]` — card groups with copy counts
- `combos`: `[{ name, requirements }]` — each combo is an AND of requirements
- `pools`: `[{ id, name, memberGroupIndices }]` — optional OR groups
- `deckSize`: total cards in deck (usually 40)
- `handSize`: cards drawn (5 going first, 6 going second)

The overall result is P(at least one combo satisfied).

## Algorithm Selection

```
resolvePoolRequirements() → check for overlap
  │
  ├─ Overlap detected → force Monte Carlo
  │
  └─ No overlap → estimateCost()
       │
       ├─ Cost < 1M → exact (multivariate hypergeometric + inclusion-exclusion)
       │
       └─ Cost ≥ 1M → Monte Carlo simulation (200K trials)
```

Cost = `(2^numCombos - 1) * maxTermsPerCombo` where terms = product of (groupSize - min + 1) for each requirement.

## Exact Method

### Single Combo (`exactSingleCombo`)
Enumerates all valid draw tuples where you draw >= min from each required group:

```
For each required group i, loop x_i from min_i to min(size_i, handSize - drawn):
  product *= C(size_i, x_i)
  leftToDraw = handSize - sum(x_i)
  successSum += product * C(remainder, leftToDraw)

P = successSum / C(deckSize, handSize)
```

Uses precomputed binomial table (Pascal's triangle) for C(n,k).

### Multiple Combos (`exactMultiCombo`)
Inclusion-exclusion over all non-empty subsets of combos:

```
For each bitmask 1..(2^m - 1):
  Merge requirements: for overlapping groups, take max(min)
  P(merged) = exactSingleCombo(merged)
  result += (-1)^(|subset|+1) * P(merged)
```

## Pool Resolution (`resolvePoolRequirements`)

Pools let users say "any of these cards" (OR logic). Before exact calculation:

1. **Overlap detection**: A group used in multiple pools within the same combo, or used both as a direct card requirement and inside a pool — triggers simulation fallback.

2. **Virtual groups**: For non-overlapping pools, create a new virtual group whose count = sum of member counts. Rewrite pool requirements to point at the virtual group index.

```
Original: groups=[A(3), B(2), C(1)], pool P={A,B}, combo needs P≥1
Resolved: groups=[A(3), B(2), C(1), P_virtual(5)], combo needs P_virtual≥1
```

This is sound because non-overlapping groups are independent — drawing from the virtual group is equivalent to drawing from the union.

## Monte Carlo (`simulate`)

Fisher-Yates partial shuffle (only handSize elements), check each combo against the drawn hand. 200K iterations.

The deck array maps each card position to its groupIndex (-1 for ungrouped cards). For pool requirements, matchSets are precomputed as Sets of member groupIndices.

## Binomial Table

`ensureBinomialTable(maxN)` builds Pascal's triangle up to C(maxN, maxN) using Float64Array. Called automatically before calculations. Extended if pools create virtual groups larger than deckSize.

## Testing

73 tests in `tests/probability.test.js`. No test framework — uses direct `assert()` calls and `assertClose()` for floating-point comparison.

Test categories:
- Binomial coefficients (C(n,k) correctness)
- Single card probability (hypergeometric vs known values)
- Two-card combos (AND logic)
- Multiple combos (OR via inclusion-exclusion, verified against union formula)
- Edge cases (impossible combos, guaranteed draws, empty requirements)
- Known value cross-checks (P(≥1) + P(0) = 1)
- Symmetry and monotonicity (more copies → higher P, larger hand → higher P)
- Pool resolution (overlap detection, virtual groups, exact vs simulation)
- Pool calculation accuracy (verified against manual enumeration)

Run tests: `npx vitest run`

## Important: What NOT to Change

- `calculate()` is called from `handsUi.js` with cloned data — it must remain stateless
- Pool resolution must preserve groupIndex mapping (virtual groups are appended, never replace)
- The 200K simulation iteration count balances accuracy vs. latency for browser use
- Binomial table uses Float64Array for performance — don't switch to BigInt unless precision issues arise at very large deck sizes
