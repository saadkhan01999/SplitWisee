import crypto from "node:crypto";
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
function normaliseCoupon(input) {
  const code = String(input.code || "")
      .trim()
      .toUpperCase(),
    limit = Number(input.limit),
    expires = String(input.expires || "");
  if (
    !/^[A-Z0-9-]{4,30}$/.test(code) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 1e4 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(expires) ||
    expires < /* @__PURE__ */ new Date().toISOString().slice(0, 10)
  )
    fail("Provide a valid coupon code, future expiry and redemption limit (1\u201310,000).");
  return { code, limit, expires, months: 1, used: 0, active: true };
}
async function grantWelcome(db, user, source, now = /* @__PURE__ */ new Date()) {
  if (!user.verifiedAt || !user.createdAt || now - new Date(user.createdAt) > 7 * 864e5 || user.subscription)
    return false;
  try {
    await db
      .collection("welcomeBenefits")
      .insertOne({ id: user.id, ownerId: user.id, kind: "access", source, at: now, amountPence: 99 });
    return true;
  } catch (e) {
    if (e.code === 11e3) return false;
    throw e;
  }
}
async function accessEvents(db, userId) {
  return [
    ...(await db.collection("referrals").find({ ownerId: userId }).toArray()),
    ...(await db.collection("welcomeBenefits").find({ ownerId: userId }).toArray()),
    ...(await db.collection("accessGrants").find({ ownerId: userId }).toArray()),
  ];
}
async function redeemCoupon(db, user, code) {
  if (
    !user.verifiedAt ||
    !user.createdAt ||
    Date.now() - new Date(user.createdAt) > 7 * 864e5 ||
    user.subscription
  )
    fail("Welcome coupons apply only to new verified accounts without a subscription.");
  const session = db.client.startSession();
  let benefit;
  try {
    await session.withTransaction(async () => {
      if (await db.collection("welcomeBenefits").findOne({ id: user.id }, { session }))
        fail("Your welcome offer has already been applied.");
      const coupon = await db.collection("coupons").findOneAndUpdate(
        {
          code: String(code).trim().toUpperCase(),
          active: true,
          expires: { $gte: /* @__PURE__ */ new Date().toISOString().slice(0, 10) },
          $expr: { $lt: ["$used", "$limit"] },
        },
        { $inc: { used: 1 } },
        { session, returnDocument: "after" },
      );
      if (!coupon) fail("Coupon is invalid, expired or fully used.");
      benefit = {
        id: user.id,
        ownerId: user.id,
        source: "coupon:" + coupon.code,
        kind: "access",
        at: /* @__PURE__ */ new Date(),
        amountPence: 99,
      };
      await db.collection("welcomeBenefits").insertOne(benefit, { session });
      await db
        .collection("couponRedemptions")
        .insertOne(
          { id: crypto.randomUUID(), code: coupon.code, userId: user.id, at: /* @__PURE__ */ new Date() },
          { session },
        );
    });
    return benefit;
  } finally {
    await session.endSession();
  }
}
export { accessEvents, grantWelcome, normaliseCoupon, redeemCoupon };
