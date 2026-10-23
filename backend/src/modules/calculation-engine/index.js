import { manageHousehold } from "../households/index.js";
const VERSION = "1.2.0";
const uid = () => globalThis.crypto.randomUUID();
const sum = (a) => a.reduce((s, x) => s + x, 0);
function money(v) {
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(String(v))) throw Error("Enter an amount with up to two decimal places.");
  const [a, b = ""] = String(v).split(".");
  const n = Number(a) * 100 + Number(b.padEnd(2, "0"));
  if (!Number.isSafeInteger(n) || n <= 0) throw Error("Amount must be greater than zero.");
  return n;
}
const assert = (ok, msg) => {
  if (!ok) throw Error(msg);
};
function allocate(total, rows, method = "equal") {
  assert(Number.isSafeInteger(total) && total > 0, "Invalid amount.");
  assert(rows.length > 0, "Select at least one participant.");
  assert(new Set(rows.map((x) => x.memberId)).size === rows.length, "Duplicate participants.");
  const sorted = [...rows].sort((a, b) => a.memberId.localeCompare(b.memberId));
  if (method === "fixed") {
    const out2 = sorted.map((x) => ({ memberId: x.memberId, amountPence: money(x.value) }));
    assert(sum(out2.map((x) => x.amountPence)) === total, "Fixed shares must equal the expense total.");
    return out2;
  }
  assert(["equal", "percent", "weight"].includes(method), "Unknown split method.");
  const w = sorted.map((x) => (method === "equal" ? 1 : Number(x.value)));
  assert(
    w.every((x) => Number.isFinite(x) && x > 0 && x <= 1e5),
    "Shares must be positive numbers.",
  );
  const denom = sum(w);
  if (method === "percent") assert(Math.abs(denom - 100) < 1e-6, "Percentages must add up to 100%.");
  const wi = w.map((x) => Math.round(x * 1e4));
  const d = BigInt(sum(wi)),
    t = BigInt(total);
  const out = sorted.map((x, i) => ({
    memberId: x.memberId,
    amountPence: Number((t * BigInt(wi[i])) / d),
    remainder: (t * BigInt(wi[i])) % d,
  }));
  let left = total - sum(out.map((x) => x.amountPence));
  const priority = [...out].sort((a, b) =>
    a.remainder === b.remainder ? a.memberId.localeCompare(b.memberId) : a.remainder > b.remainder ? -1 : 1,
  );
  for (let i = 0; i < left; i++) priority[i].amountPence++;
  return out.map(({ memberId, amountPence }) => ({ memberId, amountPence }));
}
function validateExpense(e, members) {
  assert(
    typeof e.title === "string" && e.title.trim().length > 0 && e.title.length <= 140,
    "Enter a title (maximum 140 characters).",
  );
  assert(/^\d{4}-\d{2}-\d{2}$/.test(e.date) && !Number.isNaN(Date.parse(e.date)), "Choose a valid date.");
  assert(
    Number.isSafeInteger(e.amountPence) && e.amountPence > 0 && e.amountPence <= 1e8,
    "Invalid expense amount.",
  );
  const ids = new Set(
    members.filter((m) => m.joined <= e.date && (!m.left || m.left >= e.date)).map((m) => m.id),
  );
  assert(ids.has(e.purchasedBy), "Shopper must be a member on the expense date.");
  for (const field of ["funders", "allocations"]) {
    assert(Array.isArray(e[field]) && e[field].length > 0, "Funding and allocations are required.");
    assert(new Set(e[field].map((x) => x.memberId)).size === e[field].length, "Duplicate member entries.");
    assert(
      e[field].every((x) => ids.has(x.memberId) && Number.isSafeInteger(x.amountPence) && x.amountPence >= 0),
      "Invalid member or share amount.",
    );
    assert(
      sum(e[field].map((x) => x.amountPence)) === e.amountPence,
      field === "funders"
        ? "Actual funding must equal the expense total."
        : "Cost shares must equal the expense total.",
    );
  }
  return e;
}
function balances(s, start = "0000", end = "9999") {
  const rows = s.members.map((m) => ({ ...m, funded: 0, share: 0, net: 0 }));
  const map = Object.fromEntries(rows.map((x) => [x.id, x]));
  for (const e of s.expenses.filter((e2) => e2.status === "approved" && e2.date >= start && e2.date <= end)) {
    const sign = e.reversalOf ? -1 : 1;
    for (const f of e.funders) map[f.memberId].funded += sign * f.amountPence;
    for (const a of e.allocations) map[a.memberId].share += sign * a.amountPence;
  }
  for (const r of rows) r.net = r.funded - r.share;
  for (const c of s.closings.filter((c2) => c2.start >= start && c2.end <= end)) {
    for (const p of c.payments.filter((p2) => p2.status === "received")) {
      map[p.from].net += p.amountPence;
      map[p.to].net -= p.amountPence;
    }
  }
  return rows;
}
function netTransfers(rows) {
  const debt = rows
    .filter((x) => x.net < 0)
    .map((x) => ({ id: x.id, n: -x.net }))
    .sort((a, b) => b.n - a.n || a.id.localeCompare(b.id));
  const credit = rows
    .filter((x) => x.net > 0)
    .map((x) => ({ id: x.id, n: x.net }))
    .sort((a, b) => b.n - a.n || a.id.localeCompare(b.id));
  assert(sum(debt.map((x) => x.n)) === sum(credit.map((x) => x.n)), "Ledger does not balance.");
  const out = [];
  let i = 0,
    j = 0;
  while (i < debt.length && j < credit.length) {
    const n = Math.min(debt[i].n, credit[j].n);
    out.push({ from: debt[i].id, to: credit[j].id, amountPence: n });
    debt[i].n -= n;
    credit[j].n -= n;
    if (!debt[i].n) i++;
    if (!credit[j].n) j++;
  }
  return out;
}
function applyAction(previous, action, actorId) {
  const s = structuredClone(previous),
    actor = s.members.find((x) => x.id === actorId && !x.left);
  assert(actor, "Your membership is inactive.");
  const admin = ["owner", "admin"].includes(actor.role);
  const p = action.payload || {};
  const now = /* @__PURE__ */ new Date().toISOString();
  let detail;
  const locked = (date) => s.closings.some((c) => date >= c.start && date <= c.end);
  const expense = () => {
    const e = s.expenses.find((e2) => e2.id === p.id);
    assert(e, "Expense not found.");
    return e;
  };
  switch (action.type) {
    case "roomCreate":
    case "roomRename":
    case "roomDelete":
    case "memberUpdate":
    case "memberRole":
    case "memberRemove": {
      detail = manageHousehold(s, action.type, p, actor, now);
      break;
    }
    case "expense": {
      assert(!locked(p.date), "This period is locked. Add an amendment in an open period.");
      const e = validateExpense(p, s.members);
      assert(
        !s.settings.requireReceipts || e.receipt || p.status === "draft",
        "This household requires a receipt.",
      );
      assert(!s.expenses.some((x) => x.id === e.id), "Expense already saved.");
      s.expenses.unshift({
        ...e,
        id: e.id || uid(),
        createdBy: actorId,
        uploadedBy: actorId,
        status: p.status === "draft" ? "draft" : s.settings.approvals ? "pending" : "approved",
        createdAt: now,
      });
      detail = e.title;
      break;
    }
    case "submit": {
      const e = expense();
      assert(e.createdBy === actorId || admin, "Only the creator can submit this draft.");
      assert(e.status === "draft" && !locked(e.date), "Only open drafts can be submitted.");
      validateExpense(e, s.members);
      e.status = s.settings.approvals ? "pending" : "approved";
      detail = e.title;
      break;
    }
    case "approve": {
      assert(admin, "Admin permission required.");
      const e = expense();
      assert(e.status === "pending" && !locked(e.date), "Only pending open expenses can be approved.");
      e.status = "approved";
      e.approvedBy = actorId;
      detail = e.title;
      break;
    }
    case "disputeExpense": {
      const e = expense();
      assert(!locked(e.date), "Locked expenses require an amendment.");
      assert(e.status === "approved" || e.status === "pending", "Cannot dispute this expense.");
      assert(p.reason?.trim(), "Give a reason.");
      e.status = "disputed";
      e.reason = p.reason.slice(0, 500);
      detail = e.title;
      break;
    }
    case "resolveExpense": {
      assert(admin, "Admin permission required.");
      const e = expense();
      assert(e.status === "disputed" && !locked(e.date), "No open dispute.");
      assert(p.reason?.trim(), "Explain the resolution.");
      e.status = "approved";
      e.resolution = p.reason.slice(0, 500);
      detail = e.title;
      break;
    }
    case "reverse": {
      assert(admin, "Admin permission required.");
      const e = expense();
      assert(e.status === "approved" && !e.reversalOf, "Only an approved original expense can be reversed.");
      assert(!s.expenses.some((x) => x.reversalOf === e.id), "Already reversed.");
      assert(
        /^\d{4}-\d{2}-\d{2}$/.test(p.date) && !Number.isNaN(Date.parse(p.date)),
        "Choose a valid correction date.",
      );
      assert(!locked(p.date), "Choose a date in an open period.");
      assert(p.reason?.trim(), "Explain the correction.");
      const r = {
        ...e,
        id: uid(),
        title: `Reversal: ${e.title}`,
        date: p.date,
        reversalOf: e.id,
        reason: p.reason.slice(0, 500),
        receipt: null,
        createdBy: actorId,
        createdAt: now,
      };
      s.expenses.unshift(r);
      detail = r.title;
      break;
    }
    case "close": {
      assert(admin, "Admin permission required.");
      assert(
        /^\d{4}-\d{2}-\d{2}$/.test(p.start) && /^\d{4}-\d{2}-\d{2}$/.test(p.end) && p.start <= p.end,
        "Choose a valid date range.",
      );
      assert(
        !s.closings.some((c) => p.start <= c.end && p.end >= c.start),
        "This date range overlaps an existing closing.",
      );
      const es = s.expenses.filter((e) => e.date >= p.start && e.date <= p.end);
      assert(
        es.some((e) => e.status === "approved"),
        "No approved expenses in this period.",
      );
      assert(
        !es.some((e) => e.status !== "approved"),
        "Resolve pending expenses, drafts and disputes before closing.",
      );
      assert(
        !s.settings.requireReceipts || es.every((e) => e.receipt || e.reversalOf),
        "Attach missing receipts before closing.",
      );
      const lines = balances(s, p.start, p.end);
      const id = uid();
      s.closings.unshift({
        id,
        start: p.start,
        end: p.end,
        createdAt: now,
        createdBy: actorId,
        engine: VERSION,
        expenseIds: es.map((e) => e.id),
        lines,
        payments: netTransfers(lines).map((x, i) => ({
          ...x,
          id: uid(),
          reference: `TH-${id.slice(0, 6).toUpperCase()}-${i + 1}`,
          status: "requested",
        })),
      });
      detail = `${p.start} to ${p.end}`;
      break;
    }
    case "payment": {
      const c = s.closings.find((c2) => c2.id === p.closingId);
      assert(c, "Closing not found.");
      const t = c.payments.find((t2) => t2.id === p.id);
      assert(t, "Payment not found.");
      if (p.status === t.status) return previous;
      if (p.status === "sent") {
        assert(actorId === t.from, "Only the payer can mark a transfer sent.");
        assert(["requested", "disputed"].includes(t.status), "Invalid payment transition.");
      } else if (p.status === "received") {
        assert(actorId === t.to, "Only the recipient can confirm money received.");
        assert(t.status === "sent", "The payer must mark this transfer sent first.");
      } else if (p.status === "disputed") {
        assert([t.from, t.to].includes(actorId), "Only the payer or recipient can dispute.");
        assert(t.status !== "received", "Confirmed payments require a separate audited correction.");
        assert(p.reason?.trim(), "Give a dispute reason.");
        t.reason = p.reason.slice(0, 500);
      } else throw Error("Invalid payment status.");
      t.status = p.status;
      t.updatedAt = now;
      t.updatedBy = actorId;
      detail = t.reference;
      break;
    }
    case "book": {
      assert(admin, "Admin permission required.");
      assert(/^\d{4}-\d{2}-\d{2}$/.test(p.date), "Choose a date.");
      assert(["income", "expense"].includes(p.type), "Choose income or expense.");
      assert(p.description?.trim() && p.description.length <= 140, "Enter a description.");
      assert(Number.isSafeInteger(p.amountPence) && p.amountPence > 0, "Enter a positive amount.");
      s.books ??= [];
      assert(!s.books.some((e) => e.id === p.id), "Entry already recorded.");
      s.books.push({
        id: p.id || uid(),
        date: p.date,
        type: p.type,
        description: p.description,
        category: String(p.category || "Other").slice(0, 50),
        amountPence: p.amountPence,
        createdBy: actorId,
        createdAt: now,
      });
      detail = p.description;
      break;
    }
    case "settings": {
      assert(admin, "Admin permission required.");
      assert(p.name?.trim(), "Enter a household name.");
      s.name = p.name.slice(0, 100);
      s.settings = { approvals: !!p.approvals, requireReceipts: !!p.requireReceipts };
      detail = s.name;
      break;
    }
    default:
      throw Error("Unsupported action.");
  }
  s.version++;
  s.audit.unshift({ id: uid(), actorId, action: action.type, detail, at: now });
  return s;
}
export { VERSION, allocate, applyAction, balances, money, netTransfers, sum, uid, validateExpense };
