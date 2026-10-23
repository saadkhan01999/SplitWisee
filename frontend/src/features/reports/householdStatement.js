import { balances, sum } from "@domain/calculation-engine/index.js";
import { brand } from "../../config/brand.js";
import { csvBlob } from "../../utils/csv.js";
import { formatLongDate, formatMoney, signedAmount } from "../../utils/format.js";
import { PdfReport } from "../../utils/pdf.js";

// Period exports for the Reports page: an expense CSV and a balance statement PDF.

export function periodState(household, start, end) {
  const closing = household.closings.find((item) => item.start === start && item.end === end);
  if (!closing) return "Preview (not locked)";
  return closing.payments.every((payment) => payment.status === "received")
    ? "Settled · recipient-confirmed"
    : "Locked";
}

export const expensesInPeriod = (household, start, end) =>
  household.expenses.filter((expense) => expense.date >= start && expense.date <= end);

export function expensesCsv(household, start, end, memberName) {
  const pounds = (pence) => (pence / 100).toFixed(2);
  const people = (rows) =>
    rows.map((row) => `${memberName(row.memberId)}: ${formatMoney(row.amountPence)}`).join("; ");
  return csvBlob([
    [brand.name, household.name, start, end, periodState(household, start, end), new Date().toISOString()],
    ["Date", "Title", "Category", "Status", "GBP amount", "Shopper", "Actual funders", "Cost shares"],
    ...expensesInPeriod(household, start, end).map((expense) => [
      expense.date,
      expense.title,
      expense.category,
      expense.status,
      pounds(signedAmount(expense)),
      memberName(expense.purchasedBy),
      people(expense.funders),
      people(expense.allocations),
    ]),
  ]);
}

export async function statementPdf(household, start, end) {
  const rows = balances(household, start, end).filter((row) => row.funded || row.share || row.net);
  const approved = expensesInPeriod(household, start, end).filter((expense) => expense.status === "approved");
  const report = await PdfReport.create({ label: "HOUSEHOLD STATEMENT" });

  report.heading(household.name);
  report.muted(
    `${formatLongDate(start)} to ${formatLongDate(end)}  |  ${periodState(household, start, end)}`,
    10,
  );
  report.total("APPROVED SPENDING", formatMoney(sum(approved.map(signedAmount))));
  report.section("Member balances");
  report.table(
    [
      { label: "Member", width: 64 },
      { label: "Funded", width: 34, align: "right" },
      { label: "Share", width: 34, align: "right" },
      { label: "Balance", width: 42, align: "right" },
    ],
    rows.map((row) => [
      row.name,
      formatMoney(row.funded),
      formatMoney(row.share),
      {
        text: formatMoney(Math.abs(row.net)),
        note: row.net > 0 ? "to receive" : row.net < 0 ? "to pay" : "settled",
      },
    ]),
  );
  report.section("Approved expenses");
  report.table(
    [
      { label: "Expense", width: 92 },
      { label: "Date", width: 28 },
      { label: "Category", width: 28 },
      { label: "Amount", width: 26, align: "right" },
    ],
    approved.map((expense) => [
      expense.title,
      expense.date,
      expense.category,
      formatMoney(signedAmount(expense)),
    ]),
  );
  return report.finish([
    "Balances use the exact-pence household ledger. Manual repayments are recipient-confirmed, not bank-verified.",
    "This statement is a household record, not a tax document.",
  ]);
}
