import { buildAccounts, monthBounds, validateEntry } from "../modules/platform-accounting/index.js";
const bad = (m, status = 400) => {
  throw Object.assign(Error(m), { status });
};
export function installFinance(app, { db, guard, endpoint, stripe, event, encryptBank }) {
  const entries = db.collection("platformBankEntries"),
    settings = db.collection("platformSettings");
  app.get(
    "/api/v1/operator/finance",
    ...guard,
    endpoint(async (req, res) => {
      const stored = await settings.findOne({ id: "owner-bank" }),
        bank = stored ? { name: stored.name, last4: stored.last4 } : null;
      if (!stripe)
        return res.json({ connected: false, bank, available: 0, pending: 0, payouts: [], destination: null });
      const [balance, payouts, account] = await Promise.all([
        stripe.balance.retrieve(),
        stripe.payouts.list({ limit: 20 }),
        stripe.accounts.retrieve(),
      ]);
      const dest = account.external_accounts?.data?.find(
        (b) => b.object === "bank_account" && b.currency === "gbp" && b.default_for_currency,
      );
      res.json({
        connected: true,
        livemode: balance.livemode,
        bank,
        available: balance.available.filter((b) => b.currency === "gbp").reduce((n, b) => n + b.amount, 0),
        pending: balance.pending.filter((b) => b.currency === "gbp").reduce((n, b) => n + b.amount, 0),
        destination: dest ? { name: dest.bank_name, last4: dest.last4 } : null,
        payouts: payouts.data.map((p) => ({
          id: p.id,
          amountPence: p.amount,
          currency: p.currency,
          status: p.status,
          arrival: new Date(p.arrival_date * 1000).toISOString().slice(0, 10),
        })),
      });
    }),
  );
  app.post(
    "/api/v1/operator/finance/bank",
    ...guard,
    endpoint(async (req, res) => {
      const name = String(req.body.name || "").trim(),
        sortCode = String(req.body.sortCode || "").replaceAll("-", ""),
        accountNumber = String(req.body.accountNumber || "");
      if (
        !name ||
        name.length > 80 ||
        !/^\d{6}$/.test(sortCode) ||
        !/^\d{8}$/.test(accountNumber) ||
        req.body.consent !== true
      )
        bad("Provide account holder, 6-digit sort code, 8-digit account number and consent.");
      const encrypted = encryptBank({ sortCode, accountNumber }, process.env.BANK_ENCRYPTION_KEY);
      await event(req, "Platform bank record updated", () =>
        settings.updateOne(
          { id: "owner-bank" },
          { $set: { name, last4: accountNumber.slice(-4), encrypted, updatedAt: new Date() } },
          { upsert: true },
        ),
      );
      res.json({ name, last4: accountNumber.slice(-4) });
    }),
  );
  app.post(
    "/api/v1/operator/finance/bank/remove",
    ...guard,
    endpoint(async (req, res) => {
      await event(req, "Platform bank record removed", () => settings.deleteOne({ id: "owner-bank" }));
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/v1/operator/finance/entries",
    ...guard,
    endpoint(async (req, res) => {
      const value = validateEntry(req.body);
      if (!/^[a-f0-9-]{36}$/i.test(req.body.requestId || "")) bad("A request ID is required.");
      const existing = await entries.findOne({ id: req.body.requestId });
      if (existing && Object.keys(value).some((k) => existing[k] !== value[k]))
        bad("This request ID already belongs to a different bank entry.", 409);
      await event(req, "Manual bank entry recorded", () =>
        entries.updateOne(
          { id: req.body.requestId },
          { $setOnInsert: { id: req.body.requestId, ...value, actorId: req.user.id, at: new Date() } },
          { upsert: true },
        ),
      );
      res.status(201).json({ ok: true });
    }),
  );
  app.post(
    "/api/v1/operator/finance/entries/void",
    ...guard,
    endpoint(async (req, res) => {
      const row = await entries.findOne({ id: String(req.body.id || "") });
      if (!row) bad("Bank entry not found.", 404);
      await event(req, "Manual bank entry voided: " + row.id, () =>
        entries.updateOne(
          { id: row.id },
          { $set: { voided: true, voidedAt: new Date(), voidedBy: req.user.id } },
        ),
      );
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/v1/operator/finance/payout",
    ...guard,
    endpoint(async (req, res) => {
      if (!stripe) bad("Stripe is not configured.", 503);
      const amount = Number(req.body.amountPence),
        requestId = String(req.body.requestId || "");
      if (
        !Number.isSafeInteger(amount) ||
        amount < 1 ||
        amount > 100000000 ||
        !/^[a-f0-9-]{36}$/i.test(requestId) ||
        req.body.confirm !== true
      )
        bad("Confirm the amount and payout destination before submitting.");
      // Stripe enforces available funds and the merchant account default GBP destination.
      const payout = await event(req, "Platform payout requested", () =>
        stripe.payouts.create(
          { amount, currency: "gbp", method: "standard", metadata: { operatorId: req.user.id, requestId } },
          { idempotencyKey: "sw-payout-" + requestId },
        ),
      );
      res.json({ id: payout.id, status: payout.status, livemode: payout.livemode });
    }),
  );
  app.get(
    "/api/v1/operator/accounting",
    ...guard,
    endpoint(async (req, res) => {
      const month = String(req.query.month || ""),
        { start, end } = monthBounds(month),
        transactions = [];
      if (stripe) {
        for await (const t of stripe.balanceTransactions.list({
          created: { gte: Math.floor(+start / 1000), lt: Math.floor(+end / 1000) },
          limit: 100,
        })) {
          if (transactions.length >= 10000)
            bad("Month exceeds 10,000 provider movements. Export directly from Stripe for this period.", 413);
          transactions.push({
            id: t.id,
            created: t.created,
            currency: t.currency,
            type: t.type,
            amount: t.amount,
            fee: t.fee,
            net: t.net,
            description: t.description || "",
            source: typeof t.source === "string" ? t.source : t.source?.id || "",
          });
        }
      }
      const manual = await entries
        .find(
          { date: { $gte: month + "-01", $lt: end.toISOString().slice(0, 10) } },
          { projection: { _id: 0 } },
        )
        .limit(10001)
        .toArray();
      const audit = await db
        .collection("operatorAudit")
        .find({ at: { $gte: start, $lt: end } }, { projection: { _id: 0 } })
        .limit(10001)
        .toArray();
      if (manual.length > 10000 || audit.length > 10000)
        bad("Month exceeds the report limit. Use a database export; no partial workbook generated.", 413);
      res.json(buildAccounts({ month, transactions, entries: manual, audit, connected: !!stripe }));
    }),
  );
}
