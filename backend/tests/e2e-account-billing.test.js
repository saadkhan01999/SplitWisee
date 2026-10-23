import test from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { boot, account, key } from "./helpers/http.js";

test("profile, export, access, rewards and support: own data only, no mass assignment", async (t) => {
  const env = await boot(t),
    c = env.client();
  const u = await account(env, c, "profile@example.test", "Pat");
  let r = await c.get("/api/v1/account/profile");
  assert.deepEqual(Object.keys(r.data).sort(), [
    "bio",
    "createdAt",
    "email",
    "id",
    "monthEndReminders",
    "name",
    "phone",
    "timeZone",
  ]);
  assert.equal(
    (
      await c.post("/api/v1/account/profile", {
        name: "",
        bio: "",
        timeZone: "Europe/London",
        monthEndReminders: true,
      })
    ).status,
    400,
  );
  assert.equal(
    (await c.post("/api/v1/account/profile", { name: "Pat", timeZone: "Mars/Base", monthEndReminders: true }))
      .status,
    400,
  );
  r = await c.post("/api/v1/account/profile", {
    name: "Pat Personal",
    bio: "Hi",
    timeZone: "Asia/Karachi",
    monthEndReminders: false,
    id: "victim",
    email: "attacker@example.test",
    role: "owner",
    operator: true,
    verifiedAt: null,
  });
  assert.equal(r.status, 200);
  const stored = env.db.raw.get("users").docs.find((x) => x.id === u.id);
  assert.deepEqual(
    [stored.id, stored.email, stored.name, stored.profile.timeZone, stored.role, stored.operator],
    [u.id, "profile@example.test", "Pat Personal", "Asia/Karachi", undefined, undefined],
  );
  assert.ok(stored.verifiedAt, "verification state cannot be overwritten");
  r = await c.get("/api/v1/account/export");
  assert.equal(r.data.format, "splitwisee-personal-v1");
  for (const secret of ["passwordHash", "csrf", "encrypted", "sessions"])
    assert.equal(JSON.stringify(r.data).includes(secret), false, secret);
  r = await c.get("/api/v1/account/access");
  assert.deepEqual(r.data, {
    free: false,
    freeUntil: null,
    subscribed: false,
    billingConfigured: false,
    pricePence: 99,
  });
  r = await c.get("/api/v1/account/rewards");
  assert.match(r.data.code, /^SW-[0-9A-F]{12}$/);
  assert.equal(r.data.url, "https://splitwisee.test/?ref=" + r.data.code);
  assert.equal(r.data.freeMonths, 0);
  assert.equal((await c.post("/api/v1/account/support", { subject: "", message: "x" })).status, 400);
  r = await c.post("/api/v1/account/support", { subject: "Help", message: "Cannot join room" });
  assert.equal(r.status, 201);
  assert.equal(env.db.raw.get("supportTickets").docs[0].userId, u.id);
});

test("welcome coupon: one benefit per account, usage cap, transaction path", async (t) => {
  const env = await boot(t),
    a = env.client(),
    b = env.client();
  await env.db
    .collection("coupons")
    .insertOne({ code: "WELCOME2", limit: 1, used: 0, months: 1, expires: "2099-12-31", active: true });
  await account(env, a, "coupon-a@example.test");
  await account(env, b, "coupon-b@example.test");
  assert.equal((await a.post("/api/v1/account/coupon", { code: "NOPE" })).status, 400);
  let r = await a.post("/api/v1/account/coupon", { code: "welcome2" });
  assert.equal(r.status, 200);
  assert.equal(r.data.free, true);
  assert.match(
    (await a.post("/api/v1/account/coupon", { code: "WELCOME2" })).data.error,
    /already been applied/,
  );
  assert.match(
    (await b.post("/api/v1/account/coupon", { code: "WELCOME2" })).data.error,
    /invalid, expired or fully used/,
  );
  assert.equal(env.db.raw.get("coupons").docs[0].used, 1);
  assert.equal(env.db.raw.get("welcomeBenefits").docs.length, 1);
  // Referral rewards are access/credit events, never cash or household reimbursements.
  r = await a.get("/api/v1/account/rewards");
  assert.equal(r.data.bonusMonths, 1);
  assert.ok(r.data.rewards.every((x) => x.kind === "access"));
});

test("optional payee bank details are encrypted, masked on read and removable", async (t) => {
  const keyHex = "ab".repeat(32),
    env = await boot(t, { env: { BANK_ENCRYPTION_KEY: undefined } }),
    c = env.client();
  await account(env, c, "bank@example.test");
  const body = { name: "Pat Example", sortCode: "11-22-33", accountNumber: "12345678", consent: true };
  assert.equal(
    (await c.post("/api/v1/account/bank", body)).status,
    503,
    "no key: refuse rather than store plaintext",
  );
  process.env.BANK_ENCRYPTION_KEY = keyHex;
  t.after(() => delete process.env.BANK_ENCRYPTION_KEY);
  assert.equal((await c.post("/api/v1/account/bank", { ...body, consent: false })).status, 400);
  assert.equal((await c.post("/api/v1/account/bank", { ...body, accountNumber: "123" })).status, 400);
  let r = await c.post("/api/v1/account/bank", body);
  assert.deepEqual(r.data, { name: "Pat Example", last4: "5678" });
  const raw = JSON.stringify(env.db.raw.get("users").docs);
  assert.equal(
    raw.includes("12345678") || raw.includes("112233"),
    false,
    "no plaintext bank numbers at rest",
  );
  assert.deepEqual((await c.get("/api/v1/account/bank")).data, { name: "Pat Example", last4: "5678" });
  assert.equal((await c.post("/api/v1/account/bank/remove")).status, 200);
  assert.deepEqual((await c.get("/api/v1/account/bank")).data, {});
});

test("billing without Stripe is refused honestly; enforcement gates paid writes", async (t) => {
  const env = await boot(t, {
      env: { STRIPE_SECRET_KEY: undefined, STRIPE_WEBHOOK_SECRET: undefined, BILLING_ENFORCED: "true" },
    }),
    c = env.client(),
    d = env.client();
  await account(env, c, "billing@example.test");
  assert.equal((await c.post("/api/v1/billing/checkout")).status, 503);
  assert.match((await c.post("/api/v1/billing/portal")).data.error, /No subscription customer/);
  const h = await c.post("/api/v1/households", { name: "Paywall", type: "flat" });
  assert.equal(h.status, 201, "creating a household is allowed");
  const state = (await c.get(`/api/v1/households/${h.data.id}`)).data;
  let r = await c.post(`/api/v1/households/${h.data.id}/actions`, {
    type: "roomCreate",
    payload: { name: "Den" },
    version: state.version,
    idempotencyKey: key(),
  });
  assert.equal(r.status, 402, "no subscription or earned month: paid operations refused");
  assert.match(r.data.error, /£0\.99\/month/);
  assert.equal((await c.get(`/api/v1/households/${h.data.id}`)).status, 200, "records remain readable");
  await env.db
    .collection("coupons")
    .insertOne({ code: "PILOT1", limit: 5, used: 0, months: 1, expires: "2099-12-31", active: true });
  assert.equal((await c.post("/api/v1/account/coupon", { code: "PILOT1" })).status, 200);
  r = await c.post(`/api/v1/households/${h.data.id}/actions`, {
    type: "roomCreate",
    payload: { name: "Den" },
    version: state.version,
    idempotencyKey: key(),
  });
  assert.equal(r.status, 200, "an earned access month enables paid operations");
  await account(env, d, "billing-2@example.test");
  assert.equal(
    (await env.client().post("/api/v1/billing/webhook", "{}", { "stripe-signature": "t=1,v1=bad" })).status,
    503,
    "webhook refuses when not configured",
  );
});

test("Stripe webhook: signature required; duplicate deliveries are processed once", async (t) => {
  const secret = "whsec_" + "x".repeat(32);
  const env = await boot(t, {
    env: { STRIPE_SECRET_KEY: "sk_test_offline_dummy", STRIPE_WEBHOOK_SECRET: secret },
  });
  const stripe = new Stripe("sk_test_offline_dummy");
  const payload = JSON.stringify({
    id: "evt_test_1",
    object: "event",
    type: "customer.updated",
    data: { object: { id: "obj_1", object: "test" } },
  });
  const post = (body, signature) =>
    fetch(env.base + "/api/v1/billing/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": signature },
      body,
    });
  assert.equal((await post(payload, "t=1,v1=forged")).status, 400);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  assert.equal(
    (await post(payload.replace("customer.updated", "invoice.paid"), header)).status,
    400,
    "tampered body fails the signature",
  );
  let r = await post(payload, header);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { received: true });
  r = await post(payload, header);
  assert.equal(r.status, 200);
  const events = env.db.raw.get("billingEvents").docs;
  assert.equal(events.length, 1);
  assert.equal(events[0].status, "done");
  assert.equal(env.db.raw.get("paymentRecords")?.docs.length ?? 0, 0, "no payment state is invented");
});
