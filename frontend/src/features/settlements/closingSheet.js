import { retentionDate } from "@domain/periods/index.js";
import { brand } from "../../config/brand.js";
import { csvBlob } from "../../utils/csv.js";
import { exportFilename, jsonBlob } from "../../utils/downloads.js";
import { formatDate, formatLongDate, formatMoney } from "../../utils/format.js";
import { PdfReport } from "../../utils/pdf.js";

// A locked period's closing sheet. Everything comes from the frozen closing record (balances, transfers, expense
// list, names at the time of closing), so later corrections or renamed members never change a historical sheet.
// Closings locked before v1.4.0 have no stored expense list; their expenses are locked too, so they are read from
// the household by id.

export const CLOSING_SHEET_SCHEMA = "coinsplit-closing-sheet-v1";

export function closingStatus(closing) {
  const payments = closing.payments ?? [];
  const total = payments.length;
  const confirmed = payments.filter((payment) => payment.status === "received").length;
  const pending = total - confirmed;
  return {
    total,
    confirmed,
    pending,
    settled: pending === 0,
    label: pending === 0 ? "Settled" : `Locked · ${pending} pending`,
  };
}

export function closingName(closing) {
  if (closing.name) return closing.name;
  return `${formatLongDate(closing.start)} – ${formatLongDate(closing.end)}`;
}

/** Frozen expense rows of a closing. */
export function closingExpenses(household, closing) {
  if (closing.summary?.expenses) return closing.summary.expenses;
  const ids = new Set(closing.expenseIds || []);
  return household.expenses
    .filter((expense) => ids.has(expense.id))
    .map(({ id, title, date, category, amountPence, purchasedBy, reversalOf, receipt }) => ({
      id,
      title,
      date,
      category,
      amountPence,
      purchasedBy,
      reversalOf,
      receipt: receipt ? { id: receipt.id, name: receipt.name } : undefined,
    }));
}

const signed = (expense) => (expense.reversalOf ? -1 : 1) * expense.amountPence;

export const closingTotal = (household, closing) =>
  closing.summary?.totalPence ?? closingExpenses(household, closing).reduce((sum, e) => sum + signed(e), 0);

export const closingRetention = (closing) => closing.retentionUntil ?? retentionDate(closing.createdAt);

/** Names as they were when the period was locked (from the frozen balance lines). */
export function closingNames(household, closing) {
  const names = new Map(household.members.map((member) => [member.id, member.name]));
  for (const line of closing.lines ?? []) names.set(line.id, line.name);
  return (id) => names.get(id) ?? "Former member";
}

export const PAYMENT_LABEL = {
  received: "Recipient confirmed",
  sent: "Sent · awaiting recipient",
  disputed: "Needs review",
  requested: "Awaiting transfer",
};

export function closingSheet(household, closing) {
  const name = closingNames(household, closing);
  const status = closingStatus(closing);
  const expenses = closingExpenses(household, closing);
  return {
    name: closingName(closing),
    status,
    totalPence: closingTotal(household, closing),
    lockedAt: closing.createdAt,
    lockedBy: name(closing.createdBy),
    retentionUntil: closingRetention(closing),
    members: (closing.lines ?? [])
      .filter((line) => line.funded || line.share || line.net)
      .map((line) => ({
        id: line.id,
        name: line.name,
        funded: line.funded,
        share: line.share,
        net: line.net,
      })),
    transfers: (closing.payments ?? []).map((payment) => ({
      reference: payment.reference,
      from: name(payment.from),
      to: name(payment.to),
      amountPence: payment.amountPence,
      status: payment.status,
    })),
    expenses: expenses.map((expense) => ({
      ...expense,
      purchasedByName: name(expense.purchasedBy),
      signedPence: signed(expense),
    })),
  };
}

export const closingFilename = (household, closing, ext) =>
  exportFilename({
    household: household.name,
    document: "Closing-sheet",
    start: closing.start,
    end: closing.end,
    ext,
  });

const pounds = (pence) => (pence / 100).toFixed(2);

export function closingSheetCsv(household, closing) {
  const sheet = closingSheet(household, closing);
  return csvBlob([
    [brand.name, "Closing sheet", CLOSING_SHEET_SCHEMA, `v${brand.version}`],
    ["Household", household.name],
    ["Period", sheet.name, closing.start, closing.end],
    ["Status", sheet.status.label, `${sheet.status.confirmed} of ${sheet.status.total} transfers confirmed`],
    ["Locked", closing.createdAt, sheet.lockedBy],
    ["Original receipts kept until", sheet.retentionUntil],
    ["Exported", new Date().toISOString()],
    [],
    ["Member", "Funded GBP", "Share GBP", "Balance GBP"],
    ...sheet.members.map((m) => [m.name, pounds(m.funded), pounds(m.share), pounds(m.net)]),
    [],
    ["Transfer reference", "From", "To", "Amount GBP", "Status"],
    ...sheet.transfers.map((t) => [
      t.reference,
      t.from,
      t.to,
      pounds(t.amountPence),
      PAYMENT_LABEL[t.status],
    ]),
    [],
    ["Date", "Expense", "Category", "Paid by", "Amount GBP", "Receipt"],
    ...sheet.expenses.map((e) => [
      e.date,
      e.title,
      e.category,
      e.purchasedByName,
      pounds(e.signedPence),
      e.receipt?.name ?? "",
    ]),
    ["Total recorded", "", "", "", pounds(sheet.totalPence)],
  ]);
}

/** Machine-readable sheet. Money is integer GBP pence; the schema name only changes with a breaking change. */
export function closingSheetJson(household, closing) {
  const sheet = closingSheet(household, closing);
  return jsonBlob({
    schema: CLOSING_SHEET_SCHEMA,
    exportedAt: new Date().toISOString(),
    app: { name: brand.name, version: brand.version },
    currency: "GBP",
    household: { id: household.id, name: household.name },
    closing: {
      id: closing.id,
      name: sheet.name,
      start: closing.start,
      end: closing.end,
      lockedAt: closing.createdAt,
      engine: closing.engine,
      snapshotHash: closing.snapshotHash ?? null,
      status: sheet.status,
      totalPence: sheet.totalPence,
      originalReceiptsKeptUntil: sheet.retentionUntil,
    },
    members: sheet.members.map(({ id, name, funded, share, net }) => ({
      id,
      name,
      fundedPence: funded,
      sharePence: share,
      balancePence: net,
    })),
    transfers: sheet.transfers,
    expenses: sheet.expenses.map(
      ({ id, date, title, category, purchasedBy, signedPence, reversalOf, receipt }) => ({
        id,
        date,
        title,
        category,
        purchasedBy,
        amountPence: signedPence,
        reversalOf: reversalOf ?? null,
        receipt: receipt ?? null,
      }),
    ),
  });
}

export async function closingSheetPdf(household, closing) {
  const sheet = closingSheet(household, closing);
  const report = await PdfReport.create({
    label: "CLOSING SHEET",
    household: household.name,
    range: [closing.start, closing.end],
  });
  report.heading(sheet.name);
  report.muted(
    `${sheet.status.label}  |  ${sheet.status.confirmed} of ${sheet.status.total} transfers confirmed  |  Locked ${formatDate(sheet.lockedAt)} by ${sheet.lockedBy}`,
    9,
  );
  report.total("TOTAL RECORDED", formatMoney(sheet.totalPence));
  report.section("Member balances");
  report.table(
    [
      { label: "Member", width: 64 },
      { label: "Funded", width: 34, align: "right" },
      { label: "Share", width: 34, align: "right" },
      { label: "Balance", width: 42, align: "right" },
    ],
    sheet.members.map((m) => [
      m.name,
      formatMoney(m.funded),
      formatMoney(m.share),
      {
        text: formatMoney(Math.abs(m.net)),
        note: m.net > 0 ? "to receive" : m.net < 0 ? "to pay" : "settled",
      },
    ]),
  );
  report.section("Settlement transfers");
  if (sheet.transfers.length)
    report.table(
      [
        { label: "From → to", width: 80 },
        { label: "Reference", width: 34 },
        { label: "Amount", width: 26, align: "right" },
        { label: "Status", width: 34 },
      ],
      sheet.transfers.map((t) => [
        `${t.from} → ${t.to}`,
        t.reference,
        formatMoney(t.amountPence),
        PAYMENT_LABEL[t.status],
      ]),
    );
  else report.muted("Everyone was balanced: no transfers were needed.");
  report.section("Expenses in this period");
  report.table(
    [
      { label: "Expense", width: 74 },
      { label: "Date", width: 26 },
      { label: "Paid by", width: 44 },
      { label: "Amount", width: 30, align: "right" },
    ],
    sheet.expenses.map((e) => [e.title, e.date, e.purchasedByName, formatMoney(e.signedPence)]),
    { footer: ["Total recorded", "", "", formatMoney(sheet.totalPence)] },
  );
  return report.finish([
    `Frozen when the period was locked; later corrections appear in an open period. Original receipt files are kept until ${formatLongDate(sheet.retentionUntil)}.`,
    "Transfers happen in members' own banking apps: “received” is the recipient's confirmation, not bank verification.",
  ]);
}
