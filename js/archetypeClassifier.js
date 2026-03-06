/**
 * Classifies deck names into canonical archetypes using the
 * ygoprodeck archetype list with first-appearing match strategy.
 * Deck names typically list the primary engine first, so the
 * earliest archetype match in the name is the best classification.
 */

let knownArchetypes = [];

export function initClassifier(archetypeList) {
  knownArchetypes = archetypeList.map(a => a.archetype_name);
}

export function classifyDeck(deckName) {
  const nameLower = deckName.toLowerCase();
  let bestMatch = null;
  let bestPos = Infinity;

  for (const arch of knownArchetypes) {
    const archLower = arch.toLowerCase();
    const pos = nameLower.indexOf(archLower);
    if (pos !== -1 && (pos < bestPos || (pos === bestPos && arch.length > bestMatch.length))) {
      bestPos = pos;
      bestMatch = arch;
    }
  }

  return bestMatch || deckName;
}
