import { monthlyStatement, balanceMovements } from "./statement.js";
// Money is integer GBP pence. This is a monthly movement pack, not statutory accounts.
export function monthBounds(month) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw Error("Choose a valid month (2000–2099).");
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}
export function validateEntry(value) {
  const kind = String(value.kind || ""),
    date = String(value.date || ""),
    description = String(value.description || "").trim(),
    reference = String(value.reference || "").trim(),
    amountPence = Number(value.amountPence);
  if (
    !["income", "expense"].includes(kind) ||
    !/^20\d{2}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date ||
    !description ||
    description.length > 160 ||
    !reference ||
    reference.length > 100 ||
    !Number.isSafeInteger(amountPence) ||
    amountPence < 1 ||
    amountPence > 100000000
  )
    throw Error(
      "Provide a valid date, income/expense type, description, bank reference and positive amount up to £1,000,000.",
    );
  return { kind, date, description, reference, amountPence, currency: "GBP", method: "bank_transfer" };
}
export function buildAccounts({ month, transactions = [], entries = [], audit = [], connected = false }) {
  const { start, end } = monthBounds(month),
    inside = (d) => new Date(d) >= start && new Date(d) < end,
    journal = [],
    exceptions = [];
  const add = (id, date, description, account, debit, credit, source) =>
    journal.push({ id, date, description, account, debitPence: debit, creditPence: credit, source });
  const pair = (id, date, description, account, amount, cash, source) => {
    if (!amount) return;
    add(id, date, description, cash, Math.max(amount, 0), Math.max(-amount, 0), source);
    add(id, date, description, account, Math.max(-amount, 0), Math.max(amount, 0), source);
  };
  for (const t of transactions) {
    const date = new Date(t.created * 1000).toISOString().slice(0, 10);
    if (!inside(date)) continue;
    if (t.currency?.toLowerCase() !== "gbp") {
      exceptions.push({ id: t.id, issue: "Non-GBP transaction excluded; review currency ledger" });
      continue;
    }
    if (![t.amount, t.fee, t.net].every(Number.isSafeInteger) || t.amount - t.fee !== t.net)
      throw Error("Invalid provider monetary data: " + t.id);
    let account = ["charge", "payment"].includes(t.type)
      ? "4000 Subscription receipts"
      : ["refund", "payment_refund"].includes(t.type)
        ? "4010 Refunds"
        : ["payout", "payout_cancel", "payout_failure"].includes(t.type)
          ? "1100 Payout clearing"
          : "9990 Unclassified movements";
    if (account.startsWith("9990"))
      exceptions.push({ id: t.id, issue: "Classify provider movement: " + t.type });
    pair(t.id, date, t.description || t.type, account, t.amount, "1000 Stripe balance", "Stripe");
    pair(t.id, date, "Provider fee", "5000 Payment fees", -t.fee, "1000 Stripe balance", "Stripe");
  }
  const manual = entries.filter((e) => inside(e.date));
  for (const e of manual) {
    if (e.voided) continue;
    const v = validateEntry(e);
    pair(
      e.id,
      v.date,
      v.description,
      v.kind === "income" ? "4000 Subscription receipts" : "5100 Operating costs",
      v.amountPence * (v.kind === "income" ? 1 : -1),
      "1010 Bank ledger (unreconciled)",
      v.reference,
    );
  }
  const totals = {};
  for (const row of journal) {
    totals[row.account] ??= { account: row.account, debitPence: 0, creditPence: 0 };
    totals[row.account].debitPence += row.debitPence;
    totals[row.account].creditPence += row.creditPence;
  }
  const trial = Object.values(totals).map((r) => ({ ...r, balancePence: r.debitPence - r.creditPence })),
    net = (code) => trial.filter((r) => r.account.startsWith(code)).reduce((a, r) => a + r.balancePence, 0);
  const revenue = -net("4000") || 0,
    refunds = net("4010"),
    fees = net("5000"),
    costs = net("5100"),
    profit = revenue - refunds - fees - costs;
  const summary = [
    { metric: "Gross receipts", pence: revenue },
    { metric: "Refunds", pence: refunds },
    { metric: "Payment fees", pence: fees },
    { metric: "Recorded operating costs", pence: costs },
    { metric: "Provisional surplus before tax", pence: profit },
    { metric: "Stripe movement", pence: net("1000") },
    { metric: "Bank movement (unreconciled)", pence: net("1010") },
    { metric: "Payout clearing movement", pence: net("1100") },
  ];
  return {
    month,
    connected,
    summary,
    journal,
    trial,
    transactions: transactions.filter((t) => inside(t.created * 1000)),
    entries: manual,
    audit: audit.filter((a) => inside(a.at)),
    exceptions,
    balanced: journal.reduce((n, r) => n + r.debitPence - r.creditPence, 0) === 0,
    notes: [
      "GBP; UTC calendar month; integer pence in raw exports.",
      connected
        ? "Provider data covers this Stripe merchant account. Use a dedicated account for this platform."
        : "Stripe disconnected: bank entries only, provider totals incomplete.",
      "Monthly movement trial balance; no opening balances. Not a full balance sheet or statutory accounts.",
      "Provisional cash-based surplus excludes unrecorded expenses, accruals, tax and VAT adjustments. Accountant review required.",
      "Payouts are transfers to clearing, never operating expenses. Match clearing to bank statements before closing.",
      "Refunds use provider event dates. Unknown provider types appear in exceptions.",
      "Manual bank entries do not change subscriptions, collect money or initiate bank transfers.",
    ],
  };
}
export function accountSheets(report) {
  const rows = (items) =>
    items.length
      ? [
          Object.keys(items[0]),
          ...items.map((x) =>
            Object.keys(items[0]).map((k) =>
              typeof x[k] === "object" ? JSON.stringify(x[k]) : (x[k] ?? ""),
            ),
          ),
        ]
      : [["No records"]];
  return {
    "Read me": [["SplitWisee monthly accountant pack", report.month], ...report.notes.map((n) => [n])],
    "Monthly statement": rows(monthlyStatement(report)),
    "Balance sheet movements": rows(balanceMovements(report)),
    Summary: rows(report.summary),
    Journal: rows(report.journal),
    "Movement trial balance": rows(report.trial),
    "Provider transactions": rows(report.transactions),
    "Bank entries": rows(report.entries),
    Audit: rows(report.audit),
    Exceptions: rows(report.exceptions),
  };
}
