import { parseReceipt } from "./parseReceipt.js";

// Receipts come in different layouts, and no single Tesseract page-segmentation mode reads all of them: a uniform
// block (6) keeps "label … price" on one line for most slips, a single column (4) suits mixed font sizes, and sparse
// text (11) recovers prices far from their labels. The first pass is usually enough; the others run only when the
// result is not convincing, and the best parse wins.

export const PAGE_MODES = ["6", "4", "11"];

/**
 * OCR passes for one image, in order: the cleaned image (see cleanForOcr) in each page mode, then the image as it
 * was, in case the clean-up itself hurt (a dark table close around the slip, for example), and last an enlarged
 * cleaned copy of a small image (see enlargedSize), for text too small to read.
 */
export const ocrPasses = (cleaned, original, enlarged = null) => [
  ...PAGE_MODES.map((pageMode) => ({ image: cleaned, pageMode })),
  { image: original, pageMode: PAGE_MODES[0] },
  ...(enlarged ? [{ image: enlarged, pageMode: PAGE_MODES[0] }] : []),
];

/** How useful a parsed reading is: a total first, then items that add up to it, then confidence and details. */
export function readingScore(reading) {
  let score = 0;
  if (reading.amountPence !== null) score += 10;
  if (reading.itemsMatchTotal) score += 6;
  score += { high: 3, review: 1, none: 0 }[reading.confidence] ?? 0;
  if (reading.date) score += 1;
  if (reading.merchant) score += 1;
  return score + Math.min(reading.items.length, 10) * 0.2;
}

/** A reading worth stopping at: a total that the items confirm, or an unambiguous high-confidence total. */
export const isConvincing = (reading) =>
  reading.amountPence !== null &&
  (reading.itemsMatchTotal || (reading.confidence === "high" && !reading.ambiguous));

/**
 * Runs OCR passes in turn until one gives a convincing reading, and returns the best parse.
 * @template Pass
 * @param {Pass[]} passes
 * @param {(pass: Pass, index: number) => Promise<string>} readText OCR text for one pass
 */
export async function bestReading(passes, readText) {
  let best = null;
  for (const [index, pass] of passes.entries()) {
    const reading = parseReceipt(await readText(pass, index));
    if (!best || readingScore(reading) > readingScore(best)) best = reading;
    if (isConvincing(best)) break;
  }
  return best;
}
