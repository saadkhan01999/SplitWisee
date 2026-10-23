const MAX_TOTAL_PENCE = 100_000_000;

/** "12.50" → 1250, or null when it is not a positive amount with at most two decimals (max £1,000,000). */
export function parsePounds(value) {
  const text = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const pence = Math.round(Number(text) * 100);
  return pence > 0 && pence <= MAX_TOTAL_PENCE ? pence : null;
}

/**
 * Equal split in whole pence: everyone pays `share`, and `extraPennies` people pay one penny more so the total is
 * covered exactly. This is the same rule the ledger uses for equal splits.
 */
export function equalSplit(totalPence, people) {
  return { share: Math.floor(totalPence / people), extraPennies: totalPence % people };
}
