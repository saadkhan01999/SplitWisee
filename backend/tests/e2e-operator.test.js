import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { boot, account } from "./helpers/http.js";
import { totp } from "../src/routes/platform.js";
const SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const uuid = () => crypto.randomUUID();

async function operatorSetup(t, opts = {}) {
  let clock = Date.parse("2026-10-21T12:00:00Z");
  const env = await boot(t, {
    now: () => clock,
    env: {
      SUPERADMIN_USER_ID: undefined,
      OPERATOR_USER_IDS: undefined,
      OPERATOR_TOTP_SECRETS: undefined,
      BANK_ENCRYPTION_KEY: undefined,
      STRIPE_SECRET_KEY: undefined,
      ...opts.env,
    },
  });
  const owner = env.client(),
    member = env.client();
  const O = await account(env, owner, "owner@example.test", "Platform Owner"),
    M = await account(env, member, "member@example.test", "Member");
  process.env.SUPERADMIN_USER_ID = O.id;
  process.env.OPERATOR_TOTP_SECRETS = JSON.stringify({ [O.id]: SECRET });
  t.after(() => {
    delete process.env.SUPERADMIN_USER_ID;
    delete process.env.OPERATOR_TOTP_SECRETS;
  });
  return {
    env,
    owner,
    member,
    O,
    M,
    advance: (ms) => {
      clock += ms;
    },
  };
}
// A valid code for a 30-second step that has not been used yet (replay protection rejects reused steps).
const code = (offsetSteps = 0) => totp(SECRET, Date.now() + offsetSteps * 30e3);
const wrongCode = () => {
  const c = code();
  return c === "000000" ? "111111" : "000000";
};

test("operator access: single allowlisted owner, TOTP unlock, four-failure lock, replay protection", async (t) => {
  const { owner, member, O, advance } = await operatorSetup(t);
  assert.equal((await member.get("/api/v1/me")).data.user.operator, false);
  assert.equal((await owner.get("/api/v1/me")).data.user.operator, true);
  assert.equal(
    (await member.post("/api/v1/operator/unlock", { code: code() })).status,
    403,
    "household members are not operators",
  );
  assert.equal((await member.get("/api/v1/operator/overview")).status, 403);
  assert.match(
    (await owner.get("/api/v1/operator/overview")).data.error,
    /authenticator code/,
    "allowlisted but locked until TOTP",
  );
  assert.equal((await owner.post("/api/v1/operator/unlock", { code: "12ab56" })).status, 400);
  for (let i = 0; i < 3; i++)
    assert.equal((await owner.post("/api/v1/operator/unlock", { code: wrongCode() })).status, 400);
  let r = await owner.post("/api/v1/operator/unlock", { code: wrongCode() });
  assert.equal(r.status, 429, "4th invalid code locks operator unlock");
  assert.ok(Number(r.headers.get("retry-after")) >= 899);
  assert.equal(
    (await owner.post("/api/v1/operator/unlock", { code: code() })).status,
    429,
    "valid code refused while locked",
  );
  advance(15 * 60e3 + 1000);
  r = await owner.post("/api/v1/operator/unlock", { code: code() });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.match(
    (await owner.post("/api/v1/operator/unlock", { code: code() })).data.error,
    /already used/,
    "a TOTP step cannot be replayed",
  );
  r = await owner.get("/api/v1/operator/overview");
  assert.equal(r.status, 200);
  const text = JSON.stringify(r.data);
  for (const secret of ["passwordHash", "encrypted", "csrf", "codeHash"])
    assert.equal(text.includes(secret), false, secret);
  assert.deepEqual(r.data.limits, { users: 200, households: 200, other: 500, audit: 100 });
  assert.ok(r.data.audit.some((a) => a.action === "operator unlocked" && a.actorId === O.id));
});

test("legacy operator lists fail closed; unlock expires", async (t) => {
  const { env, owner, O } = await operatorSetup(t);
  delete process.env.SUPERADMIN_USER_ID;
  process.env.OPERATOR_USER_IDS = O.id + ",someone-else";
  t.after(() => delete process.env.OPERATOR_USER_IDS);
  assert.equal((await owner.get("/api/v1/me")).data.user.operator, false);
  assert.equal((await owner.post("/api/v1/operator/unlock", { code: code() })).status, 403);
  process.env.SUPERADMIN_USER_ID = O.id;
  assert.equal((await owner.post("/api/v1/operator/unlock", { code: code() })).status, 200);
  for (const s of env.db.raw.get("sessions").docs)
    if (s.userId === O.id) s.operatorUntil = new Date(Date.now() - 1000);
  assert.equal((await owner.get("/api/v1/operator/overview")).status, 403, "15-minute elevation expires");
});

test("audited operator controls: suspension, coupons, grants, settings, campaigns, support", async (t) => {
  const { env, owner, member, O, M } = await operatorSetup(t);
  assert.equal((await owner.post("/api/v1/operator/unlock", { code: code() })).status, 200);
  const op = (path, body) => owner.post("/api/v1/operator/" + path, body);
  assert.equal(
    (await op("action", { entity: "users", id: M.id, suspended: true })).status,
    400,
    "reason required",
  );
  assert.equal(
    (await op("action", { entity: "users", id: { $ne: null }, suspended: true, reason: "test" })).status,
    404,
    "object IDs never match records",
  );
  assert.equal(
    env.db.raw.get("users").docs.some((u) => u.suspended),
    false,
  );
  assert.match(
    (await op("action", { entity: "users", id: O.id, suspended: true, reason: "oops" })).data.error,
    /own operator account/,
  );
  assert.equal(
    (await op("action", { entity: "users", id: M.id, suspended: true, reason: "Abuse report" })).status,
    200,
  );
  assert.equal((await member.get("/api/v1/me")).status, 401, "suspension revokes sessions");
  assert.equal(
    (await op("action", { entity: "users", id: M.id, suspended: false, reason: "Resolved" })).status,
    200,
  );
  let r = await op("coupons", { code: "autumn-26", limit: 50, expires: "2099-01-31", reason: "Pilot" });
  assert.equal(r.status, 201);
  assert.equal(r.data.code, "AUTUMN-26");
  assert.equal(
    (await op("coupons", { code: "AUTUMN-26", limit: 50, expires: "2099-01-31", reason: "dup" })).status,
    409,
  );
  assert.equal(
    (await op("coupons", { code: "x", limit: 0, expires: "2000-01-01", reason: "bad" })).status,
    400,
  );
  assert.equal(
    (await op("coupons/status", { code: "AUTUMN-26", active: false, reason: "Pause" })).status,
    200,
  );
  assert.equal((await op("coupons/status", { code: "MISSING", active: false, reason: "x" })).status, 404);
  assert.equal((await op("grant", { userId: M.id, requestId: "not-a-uuid", reason: "x" })).status, 400);
  const requestId = uuid();
  assert.equal((await op("grant", { userId: M.id, requestId, reason: "Goodwill" })).status, 200);
  assert.equal((await op("grant", { userId: M.id, requestId, reason: "Goodwill" })).status, 200);
  assert.equal(env.db.raw.get("accessGrants").docs.length, 1, "grant is idempotent per request ID");
  assert.equal(
    (await op("settings", { headline: "Hello", privacyUrl: "javascript:alert(1)", reason: "x" })).status,
    400,
  );
  assert.equal(
    (
      await op("settings", {
        headline: "Share a calmer home.",
        announcements: ["One", "Two"],
        reason: "Copy update",
      })
    ).status,
    200,
  );
  r = await env.client().get("/api/v1/public/settings");
  assert.equal(r.data.headline, "Share a calmer home.");
  assert.deepEqual(r.data.announcements, ["One", "Two"]);
  assert.equal(
    (await op("campaigns", { title: "T", message: "M", audience: "Everyone", reason: "x" })).status,
    400,
  );
  assert.equal(
    (
      await op("campaigns", {
        title: "Come back",
        message: "Your month is ending",
        audience: "Free month ending",
        reason: "Draft",
      })
    ).status,
    201,
  );
  await member.post("/api/v1/auth/login", {
    email: "member@example.test",
    password: "correct horse battery 42",
  });
  const ticket = (await member.post("/api/v1/account/support", { subject: "Help", message: "Room" })).data.id;
  assert.equal(
    (await op("support", { id: ticket, status: "resolved", note: "Fixed", reason: "Done" })).status,
    200,
  );
  assert.equal(
    (await op("support", { id: "missing", status: "resolved", note: "x", reason: "x" })).status,
    404,
  );
  const audit = env.db.raw.get("operatorAudit").docs;
  assert.ok(audit.length >= 10);
  assert.ok(
    audit.every((a) => a.actorId === O.id && ["completed", "failed"].includes(a.status ?? "completed")),
  );
  assert.ok(
    audit.some((a) => a.status === "failed"),
    "failed operations are audited as failed",
  );
});

test("platform finance: bank record encryption, idempotent manual entries, void, payouts/refunds need Stripe, accounting pack", async (t) => {
  const { env, owner } = await operatorSetup(t);
  assert.equal((await owner.post("/api/v1/operator/unlock", { code: code() })).status, 200);
  const op = (path, body) => owner.post("/api/v1/operator/" + path, body);
  let r = await owner.get("/api/v1/operator/finance");
  assert.deepEqual(r.data, {
    connected: false,
    bank: null,
    available: 0,
    pending: 0,
    payouts: [],
    destination: null,
  });
  const bank = {
    name: "Example Ltd",
    sortCode: "112233",
    accountNumber: "12345678",
    consent: true,
    reason: "Record",
  };
  assert.equal((await op("finance/bank", bank)).status, 503, "no encryption key: refused");
  process.env.BANK_ENCRYPTION_KEY = "cd".repeat(32);
  t.after(() => delete process.env.BANK_ENCRYPTION_KEY);
  assert.deepEqual((await op("finance/bank", bank)).data, { name: "Example Ltd", last4: "5678" });
  assert.equal(JSON.stringify(env.db.raw.get("platformSettings").docs).includes("12345678"), false);
  assert.equal(
    JSON.stringify((await env.client().get("/api/v1/public/settings")).data).includes("5678"),
    false,
    "public settings never expose the bank record",
  );
  const entry = {
    kind: "expense",
    date: "2026-10-12",
    description: "Hosting",
    reference: "BANK-1",
    amountPence: 1299,
    reason: "Invoice 42",
    requestId: uuid(),
  };
  assert.equal((await op("finance/entries", { ...entry, amountPence: 12.5 })).status, 400);
  assert.equal((await op("finance/entries", entry)).status, 201);
  assert.equal((await op("finance/entries", entry)).status, 201, "same request ID and data: idempotent");
  assert.equal(
    (await op("finance/entries", { ...entry, amountPence: 1300 })).status,
    409,
    "request ID reused for different data",
  );
  assert.equal(env.db.raw.get("platformBankEntries").docs.length, 1);
  r = await owner.get("/api/v1/operator/accounting?month=2026-10");
  assert.equal(r.status, 200);
  assert.equal(r.data.balanced, true);
  assert.equal(r.data.summary.find((x) => x.metric === "Recorded operating costs").pence, 1299);
  assert.equal((await owner.get("/api/v1/operator/accounting?month=2026-13")).status, 400);
  assert.equal((await op("finance/entries/void", { id: entry.requestId, reason: "Duplicate" })).status, 200);
  assert.equal(
    (await owner.get("/api/v1/operator/accounting?month=2026-10")).data.summary.find(
      (x) => x.metric === "Recorded operating costs",
    ).pence,
    0,
    "voided entries are excluded but retained",
  );
  assert.equal(env.db.raw.get("platformBankEntries").docs[0].voided, true);
  assert.equal((await op("finance/entries/void", { id: "missing", reason: "x" })).status, 404);
  assert.equal(
    (await op("finance/payout", { amountPence: 100, requestId: uuid(), confirm: true, reason: "x" })).status,
    503,
    "no Stripe: no payout",
  );
  await env.db
    .collection("paymentRecords")
    .insertOne({ id: "in_1", amountPence: 99, currency: "GBP", status: "paid", paymentIntent: "pi_1" });
  assert.equal(
    (await op("payments/refund", { id: "in_1", reason: "Customer request" })).status,
    503,
    "no Stripe: no refund, no fake success",
  );
  assert.equal(env.db.raw.get("paymentRecords").docs[0].status, "paid");
  assert.equal((await op("finance/bank/remove", { reason: "Rotate" })).status, 200);
});
