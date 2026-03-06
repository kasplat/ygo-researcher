/**
 * Parse .ydk deck files into structured card ID arrays.
 *
 * .ydk format:
 *   #created by ...    ← comment
 *   #main              ← section marker
 *   89631139           ← card IDs, one per line
 *   89631139
 *   #extra
 *   23995346
 *   !side
 *   79853073
 */

export function parseYdk(text) {
  const lines = text.split(/\r?\n/);
  const result = { main: [], extra: [], side: [] };
  let currentSection = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // Section markers
    if (line === '#main') { currentSection = 'main'; continue; }
    if (line === '#extra') { currentSection = 'extra'; continue; }
    if (line === '!side') { currentSection = 'side'; continue; }

    // Skip comments (lines starting with # or ! that aren't section markers)
    if (line.startsWith('#') || line.startsWith('!')) continue;

    // Card ID — must be numeric
    if (/^\d+$/.test(line) && currentSection) {
      result[currentSection].push(line);
    }
  }

  return result;
}

/**
 * Group card IDs into { id, count } entries sorted by count descending.
 */
export function groupCards(cardIds) {
  const counts = new Map();
  for (const id of cardIds) {
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Validate a parsed deck and return warnings (non-blocking).
 */
export function validateDeck(parsed) {
  const warnings = [];
  const mainCount = parsed.main.length;

  if (mainCount < 40) warnings.push(`Main deck has ${mainCount} cards (minimum 40)`);
  if (mainCount > 60) warnings.push(`Main deck has ${mainCount} cards (maximum 60)`);
  if (parsed.extra.length > 15) warnings.push(`Extra deck has ${parsed.extra.length} cards (maximum 15)`);
  if (parsed.side.length > 15) warnings.push(`Side deck has ${parsed.side.length} cards (maximum 15)`);

  // Check for >3 copies of any card across main+extra+side
  const allIds = [...parsed.main, ...parsed.extra, ...parsed.side];
  const counts = new Map();
  for (const id of allIds) {
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  for (const [id, count] of counts) {
    if (count > 3) warnings.push(`Card #${id} has ${count} copies (maximum 3)`);
  }

  return warnings;
}
