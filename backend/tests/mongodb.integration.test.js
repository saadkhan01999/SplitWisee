import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { MongoClient } from "mongodb";
import { initialiseDatabase } from "../database/init.js";
import { INDEXES } from "../database/indexes.js";
import { redeemCoupon } from "../src/services/promotions.js";
import { createAuthThrottle } from "../src/services/auth-throttle.js";
import { MongoRateLimitStore } from "../src/middleware/rate-limit.js";
import { boot, account } from "./helpers/http.js";
// Opt-in checks against a REAL MongoDB replica set / Atlas cluster (the in-memory double cannot prove these).
//   MONGODB_TEST_URI="mongodb://localhost:27017/?replicaSet=rs0&directConnection=true" npm run test:mongodb
// A unique database named splitwisee_it_<random>_test is created and dropped afterwards. Never point this at production.
const uri = process.env.MONGODB_TEST_URI;
const skip = !uri && "set MONGODB_TEST_URI to run (requires a replica set for transactions)";

test(
  "real MongoDB: validators, indexes, transactions, persistent locks and HTTP flow",
  { skip, timeout: 120e3 },
  async (t) => {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10e3 });
    await client.connect();
    const name = `splitwisee_it_${crypto.randomBytes(4).toString("hex")}_test`,
      db = client.db(name);
    t.after(async () => {
      await db.dropDatabase();
      await client.close();
    });
    await initialiseDatabase(db);
    await initialiseDatabase(db); // idempotent re-run (collMod path)
    for (const [collection, keys, options] of INDEXES) {
      const found = (await db.collection(collection).listIndexes().toArray()).find(
        (i) => JSON.stringify(i.key) === JSON.stringify(keys),
      );
      assert.ok(found, `${collection} ${JSON.stringify(keys)}`);
      if (options.unique) assert.equal(found.unique, true);
      if ("expireAfterSeconds" in options) assert.equal(found.expireAfterSeconds, options.expireAfterSeconds);
    }
    await assert.rejects(
      () => db.collection("users").insertOne({ id: "x" }),
      /validation/i,
      "validator requires a name",
    );
    await assert.rejects(
      () =>
        db
          .collection("households")
          .insertOne({ id: "h", name: "H", members: [], expenses: [], version: 1, currency: "EUR" }),
      /validation/i,
      "GBP only",
    );
    // Coupon redemption uses a multi-document transaction (replica set required).
    await db
      .collection("coupons")
      .insertOne({ code: "ITEST1", limit: 1, used: 0, months: 1, expires: "2099-12-31", active: true });
    const user = { id: "it-user", createdAt: new Date(), verifiedAt: new Date() };
    await redeemCoupon(db, user, "ITEST1");
    await assert.rejects(() => redeemCoupon(db, { ...user, id: "it-user-2" }, "ITEST1"), /fully used/);
    assert.equal((await db.collection("coupons").findOne({ code: "ITEST1" })).used, 1);
    // Failure lock: 12 parallel reservations, at most 4 allowed, enforced by the real unique index.
    const throttle = createAuthThrottle(db.collection("throttles"));
    const results = await Promise.all(
      Array.from({ length: 12 }, () => throttle.reserve("login", "race@example.test")),
    );
    assert.equal(results.filter((r) => r.allowed).length, 4);
    const store = new MongoRateLimitStore(db.collection("throttles"), "it");
    store.init({ windowMs: 60e3 });
    const hits = await Promise.all(Array.from({ length: 20 }, () => store.increment("1.2.3.4")));
    assert.deepEqual(
      hits.map((h) => h.totalHits).sort((a, b) => a - b),
      Array.from({ length: 20 }, (_, i) => i + 1),
      "no lost or duplicated counts under concurrency",
    );
    // Full HTTP flow on the real database.
    const env = await boot(t, { db }),
      c = env.client();
    await account(env, c, "it@example.test");
    const h = await c.post("/api/v1/households", { name: "Integration", type: "flat" });
    assert.equal(h.status, 201);
    const r = await c.post(`/api/v1/households/${h.data.id}/actions`, {
      type: "roomCreate",
      payload: { name: "Den" },
      version: 1,
      idempotencyKey: "integration-key-1",
    });
    assert.equal(r.status, 200);
    assert.equal((await c.get("/api/health")).data.status, "ok");
  },
);
