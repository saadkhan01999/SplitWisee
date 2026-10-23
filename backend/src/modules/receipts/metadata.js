// OCR is an untrusted suggestion. This bounded snapshot records what the user reviewed.
export function cleanReceiptScan(value) {
  if (!value || typeof value !== "object") return null;
  const text = (v, n) => String(v ?? "").slice(0, n);
  const amount = (v) => (Number.isSafeInteger(v) && v >= 0 && v <= 100000000 ? v : null);
  return {
    schemaVersion: 1,
    merchant: text(value.merchant, 100),
    date: /^\d{4}-\d{2}-\d{2}$/.test(value.date || "") ? value.date : null,
    receiptNumber: text(value.receiptNumber, 80),
    currency: "GBP",
    amountPence: amount(value.amountPence),
    taxPence: amount(value.taxPence),
    confidence: ["high", "review", "none"].includes(value.confidence) ? value.confidence : "review",
    ambiguous: !!value.ambiguous,
    text: text(value.text, 30000),
    reviewed: !!value.reviewed,
    reviewedAt: Number.isFinite(Date.parse(value.reviewedAt))
      ? new Date(value.reviewedAt).toISOString()
      : null,
    items: Array.isArray(value.items)
      ? value.items.slice(0, 200).map((i) => ({ title: text(i.title, 140), amount: text(i.amount, 20) }))
      : [],
  };
}
