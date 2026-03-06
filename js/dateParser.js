/**
 * Parses relative date strings like "6 days ago" into Date objects.
 */

export function parseRelativeDate(text) {
  if (!text || typeof text !== 'string') return null;

  const match = text.trim().match(/^(\d+)\s+(day|week|month|year)s?\s+ago$/i);
  if (!match) return null;

  const quantity = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const now = new Date();

  switch (unit) {
    case 'day':
      now.setDate(now.getDate() - quantity);
      break;
    case 'week':
      now.setDate(now.getDate() - quantity * 7);
      break;
    case 'month':
      now.setMonth(now.getMonth() - quantity);
      break;
    case 'year':
      now.setFullYear(now.getFullYear() - quantity);
      break;
    default:
      return null;
  }

  return now;
}

export function isWithinRange(submitDateText, rangeDays) {
  const deckDate = parseRelativeDate(submitDateText);
  if (!deckDate) return false;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - rangeDays);
  // Zero out time for day-level comparison
  cutoff.setHours(0, 0, 0, 0);

  return deckDate >= cutoff;
}
