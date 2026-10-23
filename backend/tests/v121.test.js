import test from "node:test";
import assert from "node:assert/strict";
import { grantWelcome, normaliseCoupon, redeemCoupon } from "../src/services/promotions.js";
import { installAdmin } from "../src/routes/admin.js";

test("one welcome benefit across referral and invitation, no unverified or old accounts", async () => {
  const records = [];
  const db = {
    collection() {
      return {
        async insertOne(v) {
          if (records.some((r) => r.id === v.id)) throw Object.assign(Error("duplicate"), { code: 11000 });
          records.push(v);
        },
      };
    },
  };
  const now = new Date("2026-10-17");
  const u = { id: "user", createdAt: now, verifiedAt: now };
  assert.equal(await grantWelcome(db, u, "referral", now), true);
  assert.equal(await grantWelcome(db, u, "invitation", now), false);
  assert.equal(
    await grantWelcome(db, { ...u, id: "old", createdAt: "2026-01-01" }, "invitation", now),
    false,
  );
  assert.equal(
    await grantWelcome(db, { ...u, id: "unverified", verifiedAt: null }, "invitation", now),
    false,
  );
  assert.equal(records.length, 1);
});
test("coupon validation rejects unrestricted values", () => {
  assert.equal(normaliseCoupon({ code: "welcome1", limit: 20, expires: "2099-12-31" }).months, 1);
  for (const value of [
    { code: "x", limit: 20, expires: "2099-12-31" },
    { code: "GOOD", limit: 0, expires: "2099-12-31" },
    { code: "GOOD", limit: 2, expires: "2000-01-01" },
  ])
    assert.throws(() => normaliseCoupon(value));
});
test("coupon redemption refuses prior welcome benefit and closes transaction session", async () => {
  let ended = false,
    changed = false;
  const db = {
    client: {
      startSession() {
        return {
          async withTransaction(fn) {
            await fn();
          },
          async endSession() {
            ended = true;
          },
        };
      },
    },
    collection(name) {
      return {
        async findOne() {
          return name === "welcomeBenefits" ? { id: "u" } : null;
        },
        async findOneAndUpdate() {
          changed = true;
        },
      };
    },
  };
  await assert.rejects(
    () => redeemCoupon(db, { id: "u", createdAt: new Date(), verifiedAt: new Date() }, "WELCOME1"),
    /already/,
  );
  assert.equal(ended, true);
  assert.equal(changed, false);
});
test("every operator mutation is guarded by session, role and unlock middleware", () => {
  const routes = [];
  const session = () => {},
    operator = () => {},
    unlocked = () => {};
  installAdmin(
    {
      get() {},
      post(path, ...handlers) {
        routes.push({ path, handlers });
      },
    },
    {
      db: {
        collection() {
          return {};
        },
      },
      session,
      operator,
      unlocked,
      endpoint: (x) => x,
    },
  );
  for (const r of routes.filter((r) => r.path.includes("/operator/")))
    assert.deepEqual(r.handlers.slice(0, 3), [session, operator, unlocked]);
  assert.equal(routes.filter((r) => r.path.includes("/operator/")).length, 12);
});
