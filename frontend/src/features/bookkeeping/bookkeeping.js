import { brand } from "../../config/brand.js";
import { csvBlob } from "../../utils/csv.js";

// Household income/expense journal: approved shared expenses appear automatically (refunds as money in) next to
// manual bookkeeping entries. It is a running journal, not a bank balance or double-entry ledger.

export function journal(household) {
  const shared = household.expenses
    .filter((expense) => expense.status === "approved")
    .map((expense) => ({
      id: expense.id,
      date: expense.date,
      description: expense.title,
      category: expense.category,
      amountPence: expense.amountPence,
      direction: expense.reversalOf ? 1 : -1,
      source: "Shared expense",
    }));
  const manual = (household.books ?? []).map((entry) => ({
    ...entry,
    direction: entry.type === "income" ? 1 : -1,
    source: "Bookkeeping",
  }));
  return [...shared, ...manual].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/** Opening balance, money in, money out and closing balance for `month` (YYYY-MM). */
export function monthlyBook(household, month) {
  const entries = journal(household);
  const signed = (entry) => entry.direction * entry.amountPence;
  const total = (list) => list.reduce((sum, entry) => sum + entry.amountPence, 0);
  const current = entries.filter((entry) => entry.date.slice(0, 7) === month);
  const opening = entries
    .filter((entry) => entry.date.slice(0, 7) < month)
    .reduce((sum, entry) => sum + signed(entry), 0);
  const income = total(current.filter((entry) => entry.direction > 0));
  const expenses = total(current.filter((entry) => entry.direction < 0));
  return { entries: current, opening, income, expenses, closing: opening + income - expenses };
}

export function bookCsv(household, month, book) {
  const pounds = (pence) => (pence / 100).toFixed(2);
  return csvBlob([
    [`${brand.name} bookkeeping`, household.name, month, "GBP"],
    ["Opening balance", pounds(book.opening)],
    ["Date", "Description", "Source", "Category", "Money in", "Money out"],
    ...book.entries.map((entry) => [
      entry.date,
      entry.description,
      entry.source,
      entry.category ?? "",
      entry.direction > 0 ? pounds(entry.amountPence) : "",
      entry.direction < 0 ? pounds(entry.amountPence) : "",
    ]),
    ["Closing balance", pounds(book.closing)],
  ]);
}
