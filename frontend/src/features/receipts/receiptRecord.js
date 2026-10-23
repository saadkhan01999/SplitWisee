import { brand } from "../../config/brand.js";
import { csvBlob } from "../../utils/csv.js";
import { jsonBlob, safeFilename } from "../../utils/downloads.js";
import { formatLongDate, formatMoney } from "../../utils/format.js";
import { PdfReport } from "../../utils/pdf.js";

// The shareable record of one expense: who paid, each person's share and the difference, as PDF, CSV or JSON.

const sumPence = (rows, memberId) =>
  rows.filter((row) => row.memberId === memberId).reduce((total, row) => total + row.amountPence, 0);

/** Per person: money contributed, cost share and the difference for this expense (negated for reversals). */
export function receiptPeople(expense, memberName) {
  const ids = [...new Set([...expense.funders, ...expense.allocations].map((row) => row.memberId))];
  const sign = expense.reversalOf ? -1 : 1;
  return ids.map((id) => {
    const paid = sumPence(expense.funders, id);
    const share = sumPence(expense.allocations, id);
    return { id, name: memberName(id), paid, share, net: (paid - share) * sign };
  });
}

/** Receipt line amounts are stored as entered ("2.50", "-0.50"). */
export const formatItemAmount = (amount) => formatMoney(Math.round(Number(amount) * 100) || 0);

export const differenceLabel = (net) => (net > 0 ? "to receive" : net < 0 ? "to contribute" : "balanced");

export const receiptFileBase = (expense) =>
  `${brand.name}-${expense.date}-${safeFilename(expense.title || expense.id, "receipt")}`;

const pounds = (pence) => (pence / 100).toFixed(2);

export function receiptCsv(expense, memberName) {
  return csvBlob([
    [brand.name, "Expense record", `v${brand.version}`],
    ["Record ID", expense.id],
    ["Title", expense.title],
    ["Date", expense.date],
    ["Category", expense.category],
    ["Status", expense.status],
    ["Total GBP", pounds((expense.reversalOf ? -1 : 1) * expense.amountPence)],
    ["Purchased by", memberName(expense.purchasedBy)],
    [],
    ["Actual funder", "Amount GBP"],
    ...expense.funders.map((row) => [memberName(row.memberId), pounds(row.amountPence)]),
    [],
    ["Cost allocated to", "Amount GBP"],
    ...expense.allocations.map((row) => [memberName(row.memberId), pounds(row.amountPence)]),
    ...(expense.items?.length
      ? [[], ["Item", "Amount GBP"], ...expense.items.map((item) => [item.title, item.amount])]
      : []),
  ]);
}

export function receiptJson(expense, household) {
  return jsonBlob({
    format: "splitwisee-expense-v1",
    exportedAt: new Date().toISOString(),
    household: { id: household.id, name: household.name },
    expense,
  });
}

export async function receiptPdf(expense, household, memberName) {
  const report = await PdfReport.create({ label: "EXPENSE RECORD" });
  const people = receiptPeople(expense, memberName);
  const total = (rows) => formatMoney(rows.reduce((sum, row) => sum + row.amountPence, 0));

  report.heading(expense.title);
  report.muted(household.name, 10);
  report.muted(`${formatLongDate(expense.date)}  |  ${expense.category}  |  ${expense.status.toUpperCase()}`);
  report.total(
    expense.reversalOf ? "REFUND / REVERSAL" : "TOTAL EXPENSE",
    `${expense.reversalOf ? "−" : ""}${formatMoney(expense.amountPence)}`,
  );
  report.muted(`Reference: ${expense.id}`, 8);
  report.text(
    `Purchase made by: ${memberName(expense.purchasedBy)}  |  Recorded by: ${memberName(expense.createdBy)}`,
    { size: 9 },
  );
  report.muted(`Supporting receipt: ${expense.receipt ? "attached separately" : "not attached"}`);

  report.section("How this expense is shared");
  report.muted(
    "Paid is money contributed. Share is personal cost. The difference applies to this expense only.",
    8,
  );
  report.table(
    [
      { label: "Member", width: 77 },
      { label: "Paid", width: 31, align: "right" },
      { label: "Share", width: 31, align: "right" },
      { label: "Difference", width: 35, align: "right" },
    ],
    people.map((person) => [
      person.name,
      formatMoney(person.paid),
      formatMoney(person.share),
      { text: formatMoney(Math.abs(person.net)), note: differenceLabel(person.net) },
    ]),
    { footer: ["Total", total(expense.funders), total(expense.allocations), "Fully allocated"] },
  );

  if (expense.items?.length) {
    report.section("Purchased items");
    report.table(
      [
        { label: "Item", width: 134 },
        { label: "Amount", width: 40, align: "right" },
      ],
      expense.items.map((item) => [item.title || "Item", formatItemAmount(item.amount)]),
    );
  }
  if (expense.reason) {
    report.section("Correction note");
    report.text(expense.reason, { size: 9 });
  }

  return report.finish([
    "Shared expense record. Not a merchant tax invoice or proof of bank payment.",
    "Overall balances and confirmed repayments are shown separately in Settlements.",
  ]);
}
