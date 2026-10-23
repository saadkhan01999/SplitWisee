const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

export const EXPENSE_CATEGORIES = ["Groceries", "Bills", "Household", "Food & drink", "Transport", "Other"];

/** Integer pence → "£12.34". */
export const formatMoney = (pence) => gbp.format((pence || 0) / 100);

/** Today's date (YYYY-MM-DD) in the household's UK calendar. */
export const todayIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

export const firstDayOfMonth = (iso = todayIso()) => `${iso.slice(0, 7)}-01`;

export function lastDayOfMonth(iso = todayIso()) {
  const [year, month] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

const atNoon = (iso) => new Date(`${iso}T12:00:00Z`);

/** "3 Oct" */
export const formatShortDate = (iso) =>
  atNoon(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** "3 October 2026" */
export const formatLongDate = (iso) =>
  atNoon(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

export const formatDateTime = (value) => new Date(value).toLocaleString("en-GB");

export const formatDate = (value) => new Date(value).toLocaleDateString("en-GB");

/** Signed amount of an expense: reversals and refunds count negative. */
export const signedAmount = (expense) => (expense.reversalOf ? -1 : 1) * expense.amountPence;

export const initials = (name = "") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
