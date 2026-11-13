import { isIsoDate, londonToday, addDays, daysBetween } from "../modules/periods/index.js";
import { loadCharity, loadPromotion, promotionState } from "../services/campaigns.js";
import { purgeExpiredReceipts, RETENTION_SETTINGS_ID, retentionSettings } from "../services/retention.js";

const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const month = (value) => new Date(value).toISOString().slice(0, 7);
const inRange = (value, from, to) => {
  if (!value) return false;
  const day = new Date(value).toISOString().slice(0, 10);
  return day >= from && day <= to;
};

/**
 * Platform statistics for the owner: aggregate counts and totals only. No household names, members, expenses or
 * personal transactions are returned, and every query runs behind the operator unlock.
 */
export async function platformStats(db, { from, to }) {
  const users = await db
    .collection("users")
    .find(
      {},
      { projection: { _id: 0, createdAt: 1, lastLoginAt: 1, suspended: 1, verifiedAt: 1, subscription: 1 } },
    )
    .toArray();
  const households = await db
    .collection("households")
    .find({}, { projection: { _id: 0, suspended: 1, closings: 1, audit: 1, members: 1 } })
    .toArray();
  const dated = async (name, field = "at") =>
    (
      await db
        .collection(name)
        .find({}, { projection: { _id: 0, [field]: 1, status: 1, amountPence: 1, via: 1 } })
        .toArray()
    ).filter((row) => inRange(row[field], from, to));
  const [coupons, referrals, promotions, payments, invitations] = await Promise.all([
    dated("couponRedemptions"),
    dated("referrals"),
    dated("promotionRedemptions"),
    dated("paymentRecords"),
    dated("invitationEvents"),
  ]);

  let pendingTransfers = 0,
    pendingPence = 0,
    closingsInRange = 0,
    activeHouseholds = 0;
  const closingsByMonth = {};
  for (const h of households) {
    if (!h.suspended && (h.audit || []).some((entry) => inRange(entry.at, from, to))) activeHouseholds++;
    for (const closing of h.closings || []) {
      for (const payment of closing.payments || [])
        if (payment.status !== "received") {
          pendingTransfers++;
          pendingPence += payment.amountPence;
        }
      if (inRange(closing.createdAt, from, to)) {
        closingsInRange++;
        closingsByMonth[month(closing.createdAt)] = (closingsByMonth[month(closing.createdAt)] || 0) + 1;
      }
    }
  }

  const months = [];
  for (let m = from.slice(0, 7); m <= to.slice(0, 7) && months.length < 24;) {
    months.push(m);
    const [y, mm] = m.split("-").map(Number);
    m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`;
  }
  const count = (rows, field = "at") =>
    Object.fromEntries(
      months.map((m) => [m, rows.filter((row) => row[field] && month(row[field]) === m).length]),
    );
  const signups = count(
    users.filter((u) => inRange(u.createdAt, from, to)),
    "createdAt",
  );
  const referralCount = count(referrals);
  const couponCount = count(coupons);
  const promotionCount = count(promotions);
  const paid = payments.filter((p) => p.status === "paid");
  const trend = months.map((m) => ({
    month: m,
    signups: signups[m],
    closings: closingsByMonth[m] || 0,
    referrals: referralCount[m],
    couponRedemptions: couponCount[m],
    promotionRedemptions: promotionCount[m],
    paymentsPence: paid.filter((p) => month(p.at) === m).reduce((sum, p) => sum + (p.amountPence || 0), 0),
  }));

  return {
    range: { from, to, generatedAt: new Date().toISOString(), timeZone: "Europe/London" },
    users: {
      total: users.length,
      verified: users.filter((u) => u.verifiedAt).length,
      new: users.filter((u) => inRange(u.createdAt, from, to)).length,
      active: users.filter((u) => !u.suspended && inRange(u.lastLoginAt, from, to)).length,
      suspended: users.filter((u) => u.suspended).length,
      subscribed: users.filter((u) => ["active", "trialing"].includes(u.subscription?.status)).length,
    },
    households: {
      total: households.length,
      active: activeHouseholds,
      suspended: households.filter((h) => h.suspended).length,
      memberships: households.reduce((sum, h) => sum + (h.members || []).filter((m) => !m.left).length, 0),
    },
    settlements: { pendingTransfers, pendingPence, closings: closingsInRange },
    redemptions: {
      coupons: coupons.length,
      referrals: referrals.length,
      referralsByInvitation: referrals.filter((r) => r.via === "invitation").length,
      promotion: promotions.length,
    },
    invitations: {
      created: invitations.filter((i) => i.status === "created").length,
      accepted: invitations.filter((i) => i.status === "accepted").length,
    },
    payments: {
      paidPence: paid.reduce((sum, p) => sum + (p.amountPence || 0), 0),
      refundedPence: payments
        .filter((p) => p.status === "refunded")
        .reduce((sum, p) => sum + (p.amountPence || 0), 0),
      count: paid.length,
    },
    trend,
  };
}

export function installInsights(app, { db, guard, endpoint, event, receiptDir }) {
  app.get(
    "/api/v1/operator/stats",
    ...guard,
    endpoint(async (req, res) => {
      const today = londonToday();
      const to = req.query.to ? String(req.query.to) : today;
      const from = req.query.from ? String(req.query.from) : addDays(to, -29);
      if (!isIsoDate(from) || !isIsoDate(to) || from > to) fail("Choose a valid date range.");
      if (daysBetween(from, to) > 731) fail("Choose a range of at most two years.");
      res.json(await platformStats(db, { from, to }));
    }),
  );

  // Website campaigns and the retention policy, for the owner's editors.
  app.get(
    "/api/v1/operator/content",
    ...guard,
    endpoint(async (_req, res) => {
      const promotion = await loadPromotion(db);
      const holds = await db
        .collection("households")
        .find({ "legalHold.active": true }, { projection: { _id: 0, id: 1, name: 1, legalHold: 1 } })
        .toArray();
      res.json({
        promotion,
        promotionState: promotionState(promotion),
        charity: await loadCharity(db),
        retention: { ...(await retentionSettings(db)), holds },
      });
    }),
  );

  app.post(
    "/api/v1/operator/retention",
    ...guard,
    endpoint(async (req, res) => {
      if (typeof req.body.approved !== "boolean") fail("Choose whether the retention policy is approved.");
      const approved = req.body.approved;
      await event(
        req,
        approved ? "Receipt retention policy approved" : "Receipt retention policy withdrawn",
        () =>
          db.collection("platformSettings").updateOne(
            { id: RETENTION_SETTINGS_ID },
            {
              $set: {
                approved,
                approvedAt: approved ? new Date() : null,
                approvedBy: approved ? req.user.id : null,
              },
            },
            { upsert: true },
          ),
      );
      res.json(await retentionSettings(db));
    }),
  );

  app.post(
    "/api/v1/operator/retention/hold",
    ...guard,
    endpoint(async (req, res) => {
      if (typeof req.body.active !== "boolean") fail("Choose whether the legal hold is on.");
      const householdId = String(req.body.householdId || "");
      await event(req, `Legal hold ${req.body.active ? "placed" : "lifted"}: ${householdId}`, async () => {
        const result = await db.collection("households").updateOne(
          { id: householdId },
          {
            $set: {
              legalHold: {
                active: req.body.active,
                at: new Date(),
                by: req.user.id,
                reason: String(req.body.reason).slice(0, 500),
              },
            },
            // Members' saves replace the whole household document; a new version makes a concurrent save retry
            // instead of silently dropping the hold.
            $inc: { version: 1 },
          },
        );
        if (!result.matchedCount) fail("Household not found.", 404);
      });
      res.json({ ok: true });
    }),
  );

  app.post(
    "/api/v1/operator/retention/run",
    ...guard,
    endpoint(async (req, res) => {
      const settings = await retentionSettings(db);
      if (!settings.approved) fail("Approve the receipt retention policy before removing any files.", 409);
      const result = await event(req, "Receipt retention run requested", () =>
        purgeExpiredReceipts(db, receiptDir, { actorId: req.user.id }),
      );
      res.json(result);
    }),
  );
}
