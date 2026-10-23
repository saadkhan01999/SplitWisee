import test from "node:test";
import assert from "node:assert/strict";
import { buildAccounts, validateEntry, monthBounds } from "../src/modules/platform-accounting/index.js";
import { installFinance } from "../src/routes/finance.js";
const tx = (id, type, amount, fee = 0, date = "2026-10-10") => ({
  id,
  type,
  amount,
  fee,
  net: amount - fee,
  created: +new Date(date) / 1000,
  currency: "gbp",
});

test("monthly journals reconcile fees, refunds and payouts without counting payouts as expenses", () => {
  const r = buildAccounts({
    month: "2026-10",
    transactions: [
      tx("charge", "charge", 10000, 300),
      tx("refund", "refund", -2000),
      tx("payout", "payout", -5000),
      tx("old", "charge", 9999, 0, "2026-09-30"),
    ],
    entries: [
      {
        id: "e",
        kind: "expense",
        date: "2026-10-12",
        description: "Hosting",
        reference: "BANK1",
        amountPence: 1000,
      },
    ],
  });
  assert.equal(r.balanced, true);
  assert.equal(r.summary.find((x) => x.metric === "Provisional surplus before tax").pence, 6700);
  assert.equal(r.summary.find((x) => x.metric === "Stripe movement").pence, 2700);
  assert.equal(r.summary.find((x) => x.metric === "Payout clearing movement").pence, 5000);
  assert.equal(
    r.journal.some((x) => x.id === "old"),
    false,
  );
});
test("report flags unknown and non-GBP records and excludes voided manual entries", () => {
  const r = buildAccounts({
    month: "2026-10",
    transactions: [tx("x", "topup", 500), { ...tx("eur", "charge", 1000), currency: "eur" }],
    entries: [{ id: "v", kind: "expense", date: "2026-10-10", amountPence: 100, voided: true }],
  });
  assert.equal(r.exceptions.length, 2);
  assert.equal(r.entries.length, 1);
  assert.equal(r.summary[4].pence, 0);
  assert.equal(r.balanced, true);
});
test("bank entry validation rejects fractional pence, invalid dates, negatives and missing references", () => {
  const entry = {
    kind: "expense",
    date: "2026-10-10",
    amountPence: 100,
    description: "Hosting",
    reference: "ref",
  };
  assert.equal(validateEntry(entry).method, "bank_transfer");
  for (const patch of [{ amountPence: 1.1 }, { amountPence: -1 }, { date: "2026-02-30" }, { reference: "" }])
    assert.throws(() => validateEntry({ ...entry, ...patch }));
  assert.throws(() => monthBounds("2026-13"));
  assert.throws(() =>
    buildAccounts({ month: "2026-10", transactions: [{ ...tx("bad", "charge", 100), net: 90 }] }),
  );
});
test("payout endpoint retains idempotency, validates confirmation and never accepts a client-selected destination", async () => {
  const routes = {};
  let sent;
  const stripe = {
    payouts: {
      async create(body, options) {
        sent = { body, options };
        return { id: "po_test", status: "pending", livemode: false };
      },
    },
  };
  installFinance(
    {
      get() {},
      post(path, ...h) {
        routes[path] = h.at(-1);
      },
    },
    {
      db: {
        collection() {
          return {};
        },
      },
      guard: [],
      endpoint: (x) => x,
      stripe,
      event: async (_req, _action, fn) => fn(),
    },
  );
  const fn = routes["/api/v1/operator/finance/payout"],
    req = {
      user: { id: "owner" },
      body: {
        amountPence: 1234,
        requestId: "11111111-1111-1111-1111-111111111111",
        confirm: true,
        destination: "evil",
      },
    },
    res = {
      json(x) {
        this.body = x;
      },
    };
  await fn(req, res);
  assert.equal(sent.options.idempotencyKey, "sw-payout-" + req.body.requestId);
  assert.equal(sent.body.destination, undefined);
  assert.equal(res.body.status, "pending");
  await assert.rejects(() => fn({ ...req, body: { ...req.body, confirm: false } }, res), /Confirm/);
});
test("owner bank endpoint encrypts raw numbers and returns only masked metadata", async () => {
  const { encryptBank } = await import("../src/routes/platform.js");
  const routes = {};
  let stored;
  const previous = process.env.BANK_ENCRYPTION_KEY;
  process.env.BANK_ENCRYPTION_KEY = "ab".repeat(32);
  try {
    installFinance(
      {
        get() {},
        post(path, ...h) {
          routes[path] = h.at(-1);
        },
      },
      {
        db: {
          collection() {
            return {
              async updateOne(_q, update) {
                stored = update.$set;
              },
            };
          },
        },
        guard: [],
        endpoint: (x) => x,
        event: async (_r, _a, fn) => fn(),
        encryptBank,
      },
    );
    const res = {
      json(v) {
        this.body = v;
      },
    };
    await routes["/api/v1/operator/finance/bank"](
      { body: { name: "Example Owner", sortCode: "112233", accountNumber: "12345678", consent: true } },
      res,
    );
    assert.deepEqual(res.body, { name: "Example Owner", last4: "5678" });
    assert.ok(stored.encrypted.ciphertext);
    assert.equal(stored.accountNumber, undefined);
    assert.equal(stored.sortCode, undefined);
    await assert.rejects(
      () =>
        routes["/api/v1/operator/finance/bank"](
          { body: { name: "X", sortCode: "112233", accountNumber: "12345678" } },
          res,
        ),
      /consent/,
    );
  } finally {
    if (previous === undefined) delete process.env.BANK_ENCRYPTION_KEY;
    else process.env.BANK_ENCRYPTION_KEY = previous;
  }
});
