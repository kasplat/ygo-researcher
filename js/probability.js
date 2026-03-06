/**
 * Hand probability calculator using exact multivariate hypergeometric
 * distribution with inclusion-exclusion, and Monte Carlo fallback.
 *
 * Data model:
 *   groups: [{ name, count }]           — card groups with copy counts
 *   combos: [{ name, requirements: [{ groupIndex, min }] }]
 *   deckSize: number (typically 40)
 *   handSize: number (5 going first, 6 going second)
 */

// --- Binomial coefficient table (Pascal's triangle) ---

let binomialTable = null;

function ensureBinomialTable(maxN) {
  if (binomialTable && binomialTable.length > maxN) return;
  const size = maxN + 1;
  binomialTable = new Array(size);
  for (let n = 0; n < size; n++) {
    binomialTable[n] = new Float64Array(size);
    binomialTable[n][0] = 1;
    for (let k = 1; k <= n; k++) {
      binomialTable[n][k] = binomialTable[n - 1][k - 1] + binomialTable[n - 1][k];
    }
  }
}

function C(n, k) {
  if (k < 0 || k > n) return 0;
  return binomialTable[n][k];
}

// --- Exact single-combo probability ---

/**
 * P(draw >= req[i].min from group[req[i].groupIndex] for ALL i)
 * from a deck of deckSize cards, drawing handSize.
 *
 * Uses enumeration of all valid draw tuples.
 */
function exactSingleCombo(groups, requirements, deckSize, handSize) {
  if (requirements.length === 0) return 1;

  const reqGroups = requirements.map(r => ({
    size: groups[r.groupIndex].count,  // copies in deck
    min: r.min,                         // minimum to draw
  }));

  // Check impossibility
  for (const rg of reqGroups) {
    if (rg.min > rg.size || rg.min > handSize) return 0;
  }

  const totalGroupCards = reqGroups.reduce((s, rg) => s + rg.size, 0);
  const remainder = deckSize - totalGroupCards;
  if (remainder < 0) return 0;

  const totalCombinations = C(deckSize, handSize);
  if (totalCombinations === 0) return 0;

  let successSum = 0;

  // Recursive enumeration of draw tuples
  function enumerate(idx, drawnSoFar, product) {
    if (idx === reqGroups.length) {
      const leftToDraw = handSize - drawnSoFar;
      if (leftToDraw < 0 || leftToDraw > remainder) return;
      successSum += product * C(remainder, leftToDraw);
      return;
    }

    const rg = reqGroups[idx];
    const maxDraw = Math.min(rg.size, handSize - drawnSoFar);

    for (let x = rg.min; x <= maxDraw; x++) {
      enumerate(idx + 1, drawnSoFar + x, product * C(rg.size, x));
    }
  }

  enumerate(0, 0, 1);
  return successSum / totalCombinations;
}

// --- Exact multi-combo probability (inclusion-exclusion) ---

/**
 * P(at least one combo is satisfied) using inclusion-exclusion.
 *
 * For each non-empty subset of combos, merge their requirements
 * (take max min-count for overlapping groups), compute P(merged),
 * and apply the inclusion-exclusion sign.
 */
function exactMultiCombo(groups, combos, deckSize, handSize) {
  if (combos.length === 0) return 0;
  if (combos.length === 1) return exactSingleCombo(groups, combos[0].requirements, deckSize, handSize);

  const m = combos.length;
  let result = 0;

  // Iterate all non-empty subsets via bitmask
  for (let mask = 1; mask < (1 << m); mask++) {
    // Merge requirements: for each group, take the max min-count
    const merged = new Map(); // groupIndex -> max min
    for (let i = 0; i < m; i++) {
      if (!(mask & (1 << i))) continue;
      for (const req of combos[i].requirements) {
        const existing = merged.get(req.groupIndex) || 0;
        merged.set(req.groupIndex, Math.max(existing, req.min));
      }
    }

    const mergedReqs = [...merged.entries()].map(([groupIndex, min]) => ({ groupIndex, min }));
    const p = exactSingleCombo(groups, mergedReqs, deckSize, handSize);

    // Inclusion-exclusion sign: positive for odd-sized subsets, negative for even
    const bits = popcount(mask);
    result += (bits % 2 === 1) ? p : -p;
  }

  return result;
}

function popcount(n) {
  let count = 0;
  while (n) { count += n & 1; n >>= 1; }
  return count;
}

// --- Monte Carlo simulation ---

function simulate(deckArray, combos, groups, handSize, iterations) {
  const deck = [...deckArray];
  const n = deck.length;
  let successes = 0;

  for (let iter = 0; iter < iterations; iter++) {
    // Fisher-Yates shuffle (only need handSize elements)
    for (let i = n - 1; i > n - 1 - handSize; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    // Check hand (last handSize elements)
    const hand = deck.slice(n - handSize);

    // Count cards per group in hand
    let anyComboSatisfied = false;
    for (const combo of combos) {
      let comboOk = true;
      for (const req of combo.requirements) {
        const group = groups[req.groupIndex];
        let count = 0;
        for (const cardIdx of hand) {
          if (cardIdx === req.groupIndex) count++;
        }
        if (count < req.min) { comboOk = false; break; }
      }
      if (comboOk) { anyComboSatisfied = true; break; }
    }

    if (anyComboSatisfied) successes++;
  }

  return successes / iterations;
}

/**
 * Build a deck array for simulation where each element is the group index.
 * Cards not in any group get index -1.
 */
function buildDeckArray(groups, deckSize) {
  const arr = [];
  for (let i = 0; i < groups.length; i++) {
    for (let j = 0; j < groups[i].count; j++) {
      arr.push(i);
    }
  }
  // Fill remainder with -1
  while (arr.length < deckSize) arr.push(-1);
  return arr;
}

// --- Public API ---

/**
 * Estimate the computation cost and decide method.
 */
function estimateCost(groups, combos) {
  const m = combos.length;
  // Max terms per combo evaluation
  let maxTermsPerCombo = 1;
  for (const combo of combos) {
    let terms = 1;
    for (const req of combo.requirements) {
      const groupSize = groups[req.groupIndex].count;
      terms *= (groupSize - req.min + 1);
    }
    maxTermsPerCombo = Math.max(maxTermsPerCombo, terms);
  }
  return (Math.pow(2, m) - 1) * maxTermsPerCombo;
}

const EXACT_THRESHOLD = 1_000_000;
const SIM_ITERATIONS = 200_000;

/**
 * Calculate the probability that at least one combo is drawn.
 *
 * Returns { probability, method, perCombo: [{ name, probability }] }
 */
export function calculate(input) {
  const { groups, combos, deckSize, handSize } = input;
  ensureBinomialTable(deckSize);

  // Validate
  const totalGroupCards = groups.reduce((s, g) => s + g.count, 0);
  if (totalGroupCards > deckSize) {
    throw new Error(`Group cards (${totalGroupCards}) exceed deck size (${deckSize})`);
  }

  const cost = estimateCost(groups, combos);
  const useExact = cost < EXACT_THRESHOLD;

  let probability;
  let method;

  if (useExact) {
    probability = exactMultiCombo(groups, combos, deckSize, handSize);
    method = 'exact';
  } else {
    const deckArray = buildDeckArray(groups, deckSize);
    probability = simulate(deckArray, combos, groups, handSize, SIM_ITERATIONS);
    method = `simulated (~${(SIM_ITERATIONS / 1000).toFixed(0)}K trials)`;
  }

  // Per-combo individual probabilities (always exact if possible)
  const perCombo = combos.map(combo => {
    const p = exactSingleCombo(groups, combo.requirements, deckSize, handSize);
    return { name: combo.name, probability: p };
  });

  return {
    probability: Math.max(0, Math.min(1, probability)),
    method,
    perCombo,
  };
}

// Export internals for testing
export { exactSingleCombo, exactMultiCombo, ensureBinomialTable, C, simulate, buildDeckArray };
