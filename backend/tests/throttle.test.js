import test from "node:test";
import assert from "node:assert/strict";
import { createAuthThrottle, throttleKey, MAX_FAILURES, LOCK_MS } from "../src/services/auth-throttle.js";
import { MongoRateLimitStore, createQuota } from "../src/middleware/rate-limit.js";
import { createMemoryDb } from "./helpers/memory-db.js";
const duplicate = () => Object.assign(new Error("E11000"), { code: 11000 });

test("lock policy constants match the owner requirement (4 failures, 15-minute temporary lock)", () => {
  assert.equal(MAX_FAILURES, 4);
  assert.equal(LOCK_MS, 15 * 60e3);
  assert.equal(
    throttleKey("login", " Person@Example.TEST "),
    throttleKey("login", "person@example.test"),
    "identifiers are normalised",
  );
  assert.notEqual(throttleKey("login", "a@b.c"), throttleKey("totp", "a@b.c"), "kinds are separate");
  assert.match(throttleKey("login", "a@b.c"), /^lock:login:[a-f0-9]{64}$/);
});

test("a concurrent first-attempt E11000 is retried, not reported as a lock", async () => {
  let calls = 0;
  const collection = {
    async findOne() {
      return null;
    },
    async updateOne() {},
    async findOneAndUpdate() {
      if (++calls === 1) throw duplicate();
      return { failures: 1 };
    },
  };
  const r = await createAuthThrottle(collection).reserve("login", "race@example.test");
  assert.deepEqual([r.allowed, r.attempt, calls], [true, 1, 2]);
});

test("a locked key keeps colliding and is refused with the remaining lock time", async () => {
  const now = Date.parse("2026-10-21T10:00:00Z"),
    lockedUntil = new Date(now + 5 * 60e3);
  let reads = 0;
  const collection = {
    async findOne() {
      return ++reads === 1 ? null : { lockedUntil };
    },
    async updateOne() {},
    async findOneAndUpdate() {
      throw duplicate();
    },
  };
  const r = await createAuthThrottle(collection, { now: () => now }).reserve("login", "locked@example.test");
  assert.deepEqual([r.allowed, r.retryAfter], [false, 300]);
});

test("other database errors are not swallowed (sign-in fails closed)", async () => {
  const collection = {
    async findOne() {
      return null;
    },
    async findOneAndUpdate() {
      throw new Error("network");
    },
  };
  await assert.rejects(() => createAuthThrottle(collection).reserve("login", "x@example.test"), /network/);
});

test("rate-limit store: windows reset after expiry and decrement never goes below zero", async () => {
  const db = createMemoryDb(),
    col = db.collection("throttles");
  await col.createIndex({ key: 1 }, { unique: true });
  const store = new MongoRateLimitStore(col, "unit");
  store.init({ windowMs: 50 });
  assert.equal((await store.increment("k")).totalHits, 1);
  assert.equal((await store.increment("k")).totalHits, 2);
  await store.decrement("k");
  await store.decrement("k");
  await store.decrement("k");
  assert.equal(col.docs[0].hits, 0);
  await new Promise((r) => setTimeout(r, 70));
  assert.equal((await store.increment("k")).totalHits, 1, "a new window starts after expiry");
  await store.resetKey("k");
  assert.equal(col.docs.length, 0);
  const consume = createQuota(col);
  const allowed = [];
  for (let i = 0; i < 4; i++) allowed.push(await consume("mail", " A@B.C ", 3, 60e3));
  assert.deepEqual(allowed, [true, true, true, false], "quota keys are normalised and capped");
});
