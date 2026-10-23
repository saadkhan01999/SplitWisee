import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { nextMonth, rewardWindow, encryptBank, totp, installPlatform } from "../src/routes/platform.js";

test("calendar-month rewards clamp month-end and exclude invoice credit", () => {
  assert.equal(nextMonth("2027-01-31T10:00:00Z").toISOString(), "2027-02-28T10:00:00.000Z");
  const events = [
    { kind: "access", at: "2026-10-16T10:00:00Z" },
    { kind: "access", at: "2026-10-17T10:00:00Z" },
    { kind: "invoice", at: "2026-10-18T10:00:00Z" },
  ];
  assert.equal(rewardWindow(events, new Date("2026-10-18")).toISOString(), "2026-12-16T10:00:00.000Z");
  assert.equal(rewardWindow(events, new Date("2027-01-01")), null);
});
test("bank details are authenticated-encrypted, key required", () => {
  const key = crypto.randomBytes(32).toString("hex"),
    value = { accountNumber: "12345678", sortCode: "112233" },
    e = encryptBank(value, key);
  assert.ok(!e.ciphertext.includes("12345678"));
  const d = crypto.createDecipheriv("aes-256-gcm", Buffer.from(key, "hex"), Buffer.from(e.iv, "hex"));
  d.setAuthTag(Buffer.from(e.tag, "hex"));
  assert.deepEqual(
    JSON.parse(Buffer.concat([d.update(Buffer.from(e.ciphertext, "hex")), d.final()]).toString()),
    value,
  );
  assert.throws(() => encryptBank(value, ""));
});
test("TOTP matches RFC 6238 SHA1 6-digit truncation", () => {
  assert.equal(totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59000), "287082");
});
test("verified referral login awards once, repeated and self-referrals do not multiply rewards", async () => {
  const records = [],
    owner = { id: "owner", verifiedAt: new Date() },
    member = { id: "new", name: "New", verifiedAt: new Date(), referredBy: "owner" };
  const db = {
    collection(name) {
      return {
        async findOne(q) {
          if (name === "users") return q.id === "owner" ? owner : member;
          return null;
        },
        async insertOne(e) {
          if (name === "referrals") {
            if (records.some((x) => x.referredUserId === e.referredUserId))
              throw Object.assign(new Error("duplicate"), { code: 11000 });
            records.push(e);
          }
        },
        async updateOne() {
          return { matchedCount: 1 };
        },
      };
    },
  };
  const app = { get() {}, post() {}, use() {} };
  const p = installPlatform(app, {
    db,
    session() {},
    endpoint: (x) => x,
    sendCode() {},
    origin: "https://test.example",
    production: false,
    cookieName: "test",
    safeUser: (u) => ({ id: u.id }),
  });
  const res = { cookie() {} };
  await p.login(member, res);
  await p.login(member, res);
  assert.equal(records.length, 1);
  assert.equal(records[0].amountPence, 99);
  await p.login({ ...member, id: "owner", referredBy: "owner" }, res);
  assert.equal(records.length, 1);
});
