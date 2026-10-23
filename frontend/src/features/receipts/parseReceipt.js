// Turns OCR text from a UK receipt into suggested values: total, merchant, date, receipt number, VAT and line
// items. Every value is a suggestion the user confirms before saving.

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const TOTAL_STRONG =
  /grand\s*total|amount\s*due|balance\s*due|(?:total\s*)?to\s*pay\b|total\s*(?:due|paid|amount|payable|charged)|amount\s*(?:payable|charged|paid)|you\s*paid/i;
const TOTAL_PLAIN = /\btotal\b/i;
const CARD_PAYMENT =
  /\b(?:visa|mastercard|master\s*card|amex|maestro|card\s*payment|debit|credit|contactless)\b/i;
const NOT_A_TOTAL =
  /sub\s*-?\s*total|total\s*(?:items|saving|savings|discount|vat|tax|qty|quantity)|change|tendered|cash\s+paid/i;
/** Lines that are never purchase items: totals, tax and payment details. */
const NOT_AN_ITEM =
  /total|\bvat\b|\btax\b|change|tendered|\bcash\b|card\s*(?:payment|ending|number|no\b)|visa|mastercard|amex|maestro|\bdebit\b|contactless|balance|amount\s*(?:due|charged|paid)|you\s*paid|to\s*pay|payment/i;
const PRICE_ONLY = /^-?£?\s*\d{1,6}(?:,\d{3})*\.\d{2}$/;
// A minus sign counts only when attached to the amount ("-£0.50", "-0.50"), not OCR dashes ("Sheet - 4.50").
const AMOUNT = /(-(?=£?\d))?£?\s*(\d{1,6}(?:,\d{3})*[.,]\d{2})\b/g;

/** Normalises common OCR artefacts in one line. */
function cleanLine(line) {
  return line
    .replace(/^[^A-Za-z0-9£-]+/, "") // stray marks before the text (":", "=", "~", "|")
    .replace(/[^A-Za-z0-9£%.)]+$/, "") // and after it
    .replace(/T[0O]TAL/gi, "TOTAL")
    .replace(/(\d)\s*[.,]\s*(\d{2})\b/g, "$1.$2") // "14 . 50" / "14,50" → "14.50"
    .replace(/\s{2,}/g, " ")
    .trim();
}

function toPence(text) {
  let number = text.replace(/[£\s]/g, "");
  number =
    number.includes(".") && number.includes(",") ? number.replaceAll(",", "") : number.replace(",", ".");
  const pence = Math.round(Number(number) * 100);
  return Number.isSafeInteger(pence) ? pence : null;
}

function amountsIn(line) {
  return [...line.matchAll(AMOUNT)]
    .map((match) => ({ negative: match[1] === "-", pence: toPence(match[2]) }))
    .filter((amount) => amount.pence !== null);
}

function totalScore(line) {
  if (NOT_A_TOTAL.test(line)) return 0;
  if (TOTAL_STRONG.test(line)) return 100;
  if (TOTAL_PLAIN.test(line)) return 80;
  if (CARD_PAYMENT.test(line)) return 40;
  return 0;
}

function findTotal(lines) {
  const candidates = [];
  lines.forEach((line, index) => {
    const score = totalScore(line);
    if (!score) return;
    // Some receipts print the amount on the line below its label.
    const amounts = amountsIn(line).length ? amountsIn(line) : amountsIn(lines[index + 1] ?? "");
    for (const { negative, pence } of amounts)
      if (!negative && pence > 0) candidates.push({ amountPence: pence, label: line, score, index });
  });
  candidates.sort((a, b) => b.score - a.score || b.index - a.index);
  const best = candidates[0];
  const ambiguous =
    new Set(candidates.filter((c) => c.score === best?.score).map((c) => c.amountPence)).size > 1;
  return { best, ambiguous, candidates: candidates.slice(0, 5) };
}

/**
 * Sparse OCR can put a price on its own line below its label ("Bananas" / "0.95"). Re-attach such a price to the
 * line above when that line has no amount of its own.
 */
function joinDetachedPrices(lines) {
  const joined = [];
  for (const line of lines) {
    const previous = joined.at(-1);
    if (PRICE_ONLY.test(line) && previous && /[a-z]{2}/i.test(previous) && !amountsIn(previous).length)
      joined[joined.length - 1] = `${previous} ${line}`;
    else joined.push(line);
  }
  return joined;
}

/** Purchase lines: "Description   1.65" before the first total line. Discounts keep their minus sign. */
function findItems(lines) {
  const end = lines.findIndex((line) => /total/i.test(line) || totalScore(line) >= 80);
  const itemLines = end === -1 ? lines : lines.slice(0, end);
  return itemLines.flatMap((line) => {
    if (NOT_AN_ITEM.test(line)) return [];
    const match = line.match(/^(.{2,80}?)\s+(-(?=£?\d))?£?\s*(\d{1,5}[.,]\d{2})$/);
    if (!match || !/[a-z]{2}/i.test(match[1])) return [];
    const title = match[1].replace(/[^A-Za-z0-9)%]+$/, "").trim();
    const amount = `${match[2] ?? ""}${match[3].replace(",", ".")}`;
    return [{ title, amount }];
  });
}

function validIsoDate(year, month, day) {
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const date = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

const fullYear = (year) => (year.length === 2 ? 2000 + Number(year) : Number(year));
const monthNumber = (name) => MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;

// [pattern, match → [year, month, day]] tried in order; the first real calendar date wins.
const DATE_PATTERNS = [
  [/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g, (m) => [m[1], m[2], m[3]]], // 2026-10-21
  [/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/g, (m) => [fullYear(m[3]), m[2], m[1]]], // 21/10/2026, 21-10-26
  [
    /\b(\d{1,2})(?:st|nd|rd|th)?[ \t]+([A-Za-z]{3,9})\.?,?[ \t]+(\d{4}|\d{2})\b/g, // 21 Oct 2026
    (m) => (monthNumber(m[2]) ? [fullYear(m[3]), monthNumber(m[2]), m[1]] : null),
  ],
];

function findDate(text) {
  for (const [pattern, toParts] of DATE_PATTERNS)
    for (const match of text.matchAll(pattern)) {
      const parts = toParts(match);
      const iso = parts && validIsoDate(...parts);
      if (iso) return iso;
    }
  return null;
}

function findMerchant(lines) {
  const name = lines
    .slice(0, 4)
    .find(
      (line) =>
        /[a-z]{3}/i.test(line) && !/^(?:receipt|tax invoice|invoice|tel|vat|store|date|www\.)/i.test(line),
    );
  return name?.slice(0, 100) || "";
}

export function parseReceipt(rawText) {
  const text = String(rawText ?? "");
  const lines = joinDetachedPrices(text.split(/\r?\n/).map(cleanLine).filter(Boolean));
  const { best, ambiguous, candidates } = findTotal(lines);
  const items = findItems(lines);
  const itemsTotalPence = items.reduce((total, item) => total + (toPence(item.amount) ?? 0), 0);
  const itemsMatchTotal = Boolean(best && items.length && itemsTotalPence === best.amountPence);
  const vatLine = lines.find((line) => /^(?:VAT|TAX)\b/i.test(line) && /\d[.,]\d{2}$/.test(line));
  const receiptNumber =
    text.match(
      /(?:receipt|invoice|transaction|trans|txn)\s*(?:number|no\.?|#|:)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{1,39})/i,
    )?.[1] ?? "";

  let confidence = "none";
  if (best) confidence = !ambiguous && (best.score >= 80 || itemsMatchTotal) ? "high" : "review";

  return {
    merchant: findMerchant(lines),
    date: findDate(text),
    receiptNumber,
    currency: "GBP",
    amountPence: best?.amountPence ?? null,
    taxPence: vatLine ? toPence(vatLine.match(/(\d+[.,]\d{2})$/)[1]) : null,
    items,
    itemsTotalPence,
    itemsMatchTotal,
    candidates,
    ambiguous,
    confidence,
    text,
  };
}
