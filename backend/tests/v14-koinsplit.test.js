import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { boot, account, key } from "./helpers/http.js";
import { totp } from "../src/routes/platform.js";
import {
  addMonths,
  cleanPeriod,
  monthEnd,
  nextPeriodRange,
  periodName,
  retentionDate,
} from "../src/modules/periods/index.js";
import { promotionState, PROMOTION_DEFAULTS } from "../src/services/campaigns.js";
import { purgeExpiredReceipts } from "../src/services/retention.js";

// KoinSplit Update Round 02 (v1.4.0): settlement periods, closing history, receipt retention, campaigns,
// platform statistics and the invitation/referral audit, driven through the real HTTP API.

const SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const day = (n = 0) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4590000000049454e44ae426082",
  "hex",
);

async function household(t, opts = {}) {
  const env = await boot(t, opts);
  const a = env.client(),
    b = env.client();
  const A = await account(env, a, "owner@example.test", "Jawaria"),
    B = await account(env, b, "kiran@example.test", "Kiran");
  let r = await a.post("/api/v1/households", { name: "Willow House", type: "house", room: "Room 1" });
  assert.equal(r.status, 201);
  const id = r.data.id;
  r = await a.post(`/api/v1/households/${id}/invites`, { email: "kiran@example.test", room: "Room 1" });
  assert.equal((await b.post("/api/v1/invites/accept", { token: r.data.token })).status, 200);
  const state = async (who = a) => (await who.get(`/api/v1/households/${id}`)).data;
  const act = async (who, type, payload, idempotencyKey = key()) =>
    who.post(`/api/v1/households/${id}/actions`, {
      type,
      payload,
      version: (await state(who)).version,
      idempotencyKey,
    });
  const expense = (extra = {}) => ({
    title: "Weekly shop",
    date: day(0),
    amountPence: 9000,
    category: "Groceries",
    purchasedBy: A.id,
    method: "equal",
    funders: [{ memberId: A.id, amountPence: 9000 }],
    allocations: [
      { memberId: A.id, amountPence: 4500 },
      { memberId: B.id, amountPence: 4500 },
    ],
    ...extra,
  });
  return { env, a, b, A, B, id, state, act, expense };
}

async function unlockedOperator(t, env, who) {
  const user = (await who.get("/api/v1/me")).data.user;
  process.env.SUPERADMIN_USER_ID = user.id;
  process.env.OPERATOR_TOTP_SECRETS = JSON.stringify({ [user.id]: SECRET });
  t.after(() => {
    delete process.env.SUPERADMIN_USER_ID;
    delete process.env.OPERATOR_TOTP_SECRETS;
  });
  const r = await who.post("/api/v1/operator/unlock", { code: totp(SECRET, Date.now()) });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return user;
}

test("period dates: next month, February and leap years, custom ranges, names and retention", () => {
  assert.deepEqual(nextPeriodRange("2026-10-31"), { start: "2026-11-01", end: "2026-11-30" });
  assert.deepEqual(nextPeriodRange("2028-01-31"), { start: "2028-02-01", end: "2028-02-29" });
  assert.deepEqual(nextPeriodRange("2027-01-31"), { start: "2027-02-01", end: "2027-02-28" });
  assert.deepEqual(nextPeriodRange("2026-12-31"), { start: "2027-01-01", end: "2027-01-31" });
  assert.deepEqual(nextPeriodRange("2026-11-15"), { start: "2026-11-16", end: "2026-12-15" });
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2028-01-31", 1), "2028-02-29");
  assert.equal(monthEnd("2028-02-10"), "2028-02-29");
  assert.equal(periodName("2026-11-01", "2026-11-30"), "November 2026");
  assert.equal(periodName("2026-10-16", "2026-11-15"), "16 Oct – 15 Nov 2026");
  assert.equal(periodName("2026-12-16", "2027-01-15"), "16 Dec 2026 – 15 Jan 2027");
  assert.equal(retentionDate("2026-11-30T21:00:00.000Z"), "2026-12-30");
  assert.equal(retentionDate("2026-01-31T09:00:00.000Z"), "2026-02-28");
  const closings = [{ start: "2026-10-01", end: "2026-10-31" }];
  assert.throws(() => cleanPeriod({ start: "2026-10-20", end: "2026-11-20" }, closings), /overlap a locked/);
  assert.throws(() => cleanPeriod({ start: "2026-11-01", end: "2027-11-30" }, closings), /one year/);
  assert.throws(() => cleanPeriod({ start: "2026-11-31", end: "2026-12-01" }, closings), /valid start/);
  assert.deepEqual(cleanPeriod({ start: "2026-11-01", end: "2026-11-30", name: "  " }, closings), {
    name: "November 2026",
    start: "2026-11-01",
    end: "2026-11-30",
  });
});

test("closing locks a frozen sheet and opens exactly one next period (idempotent, owner/admin only)", async (t) => {
  const { a, b, A, state, act, expense } = await household(t);
  let s = await state();
  assert.equal(s.periods.length, 1, "a new household starts with an open period");
  assert.equal(s.periods[0].status, "draft");

  assert.equal((await act(a, "expense", expense())).status, 200);
  const range = { start: `${day(0).slice(0, 7)}-01`, end: monthEnd(day(0)) };
  const closeKey = key();
  let r = await act(a, "close", range, closeKey);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  s = r.data;
  const [closing] = s.closings;
  assert.equal(closing.name, periodName(range.start, range.end));
  assert.equal(closing.summary.totalPence, 9000);
  assert.equal(closing.summary.expenseCount, 1);
  assert.equal(closing.summary.expenses[0].title, "Weekly shop");
  assert.equal(closing.retentionUntil, retentionDate(closing.createdAt));
  const drafts = s.periods.filter((p) => p.status === "draft");
  assert.equal(drafts.length, 1, "exactly one open period");
  assert.deepEqual({ start: drafts[0].start, end: drafts[0].end }, nextPeriodRange(range.end));
  assert.equal(drafts[0].previousClosingId, closing.id);
  assert.equal(s.periods.find((p) => p.status === "closed").closingId, closing.id);

  r = await a.post(`/api/v1/households/${s.id}/actions`, {
    type: "close",
    payload: range,
    version: s.version,
    idempotencyKey: closeKey,
  });
  assert.equal(r.status, 200, "a repeated close request is answered from the processed key");
  assert.equal(r.data.closings.length, 1);
  assert.equal(r.data.periods.length, 2);
  r = await act(a, "close", range);
  assert.equal(r.status, 400, "closing the same dates again is refused");
  assert.equal((await state()).periods.filter((p) => p.status === "draft").length, 1);

  // Only the owner/admin manage periods; one open period at a time; no overlap with locked dates.
  assert.equal((await act(b, "periodUpdate", { id: drafts[0].id, ...drafts[0] })).status, 400);
  r = await act(a, "periodCreate", { start: "2030-01-01", end: "2030-01-31" });
  assert.match(r.data.error, /already open/);
  r = await act(a, "periodUpdate", { id: drafts[0].id, start: range.start, end: drafts[0].end });
  assert.match(r.data.error, /overlap a locked period/);
  r = await act(a, "periodUpdate", {
    id: drafts[0].id,
    name: "Winter bills",
    start: drafts[0].start,
    end: addMonths(drafts[0].start, 1),
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.periods.find((p) => p.id === drafts[0].id).name, "Winter bills");

  // A later correction lives in the open period; the locked sheet keeps its original figures.
  const original = (await state()).expenses.find((e) => e.title === "Weekly shop");
  r = await act(a, "reverse", { id: original.id, date: drafts[0].start, reason: "Duplicate receipt" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const after = r.data.closings[0];
  assert.equal(after.summary.totalPence, 9000);
  assert.deepEqual(after.lines, closing.lines);
  assert.equal(after.snapshotHash, closing.snapshotHash);
  assert.equal(A.operator, false);
});

test("receipt retention: deadline shown, removal only after approval, legal hold, 410 after removal", async (t) => {
  const { env, a, id, state, act, expense } = await household(t);
  let r = await a.post(`/api/v1/households/${id}/receipts`, {
    name: "shop.png",
    data: "data:image/png;base64," + PNG.toString("base64"),
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const receiptId = r.data.id;
  assert.equal((await act(a, "expense", expense({ receipt: { id: receiptId } }))).status, 200);
  r = await a.get(`/api/v1/households/${id}/receipts`);
  assert.equal(r.data.receipts[0].retentionUntil, null, "kept while its period is open");
  const range = { start: `${day(0).slice(0, 7)}-01`, end: monthEnd(day(0)) };
  assert.equal((await act(a, "close", range)).status, 200);
  const until = (await state()).closings[0].retentionUntil;
  r = await a.get(`/api/v1/households/${id}/receipts`);
  assert.equal(r.data.receipts[0].retentionUntil, until);

  const later = new Date(`${until}T12:00:00Z`);
  later.setUTCDate(later.getUTCDate() + 1);
  assert.deepEqual(await purgeExpiredReceipts(env.db, env.dir, { now: later }), {
    approved: false,
    removed: 0,
    held: 0,
    households: 0,
  });
  assert.equal((await a.raw("GET", `/api/v1/households/${id}/receipts/${receiptId}`)).status, 200);

  const settings = env.db.collection("platformSettings");
  await settings.updateOne({ id: "retention" }, { $set: { approved: true } }, { upsert: true });
  await env.db
    .collection("households")
    .updateOne({ id }, { $set: { legalHold: { active: true, reason: "x" } } });
  assert.equal((await state()).legalHold, true, "members see the hold, not the operator's reason");
  let result = await purgeExpiredReceipts(env.db, env.dir, { now: later });
  assert.equal(result.removed, 0);
  assert.equal(result.held, 1);
  await env.db.collection("households").updateOne({ id }, { $set: { legalHold: { active: false } } });
  result = await purgeExpiredReceipts(env.db, env.dir, {
    now: new Date(`${until}T00:00:00Z`),
  });
  assert.equal(result.removed, 0, "nothing is removed on the deadline day itself");
  result = await purgeExpiredReceipts(env.db, env.dir, { now: later });
  assert.equal(result.removed, 1);
  await assert.rejects(fs.access(path.join(env.dir, receiptId)), "original file removed");
  r = await a.raw("GET", `/api/v1/households/${id}/receipts/${receiptId}`);
  assert.equal(r.status, 410);
  assert.match(r.data.error, /removed .* retention policy/);
  r = await a.get(`/api/v1/households/${id}/receipts`);
  assert.ok(r.data.receipts[0].purgedAt, "the record and its details remain");
  assert.equal((await state()).closings[0].summary.expenses[0].receipt.id, receiptId);
  result = await purgeExpiredReceipts(env.db, env.dir, { now: later });
  assert.equal(result.removed, 0, "a repeated run is a no-op");
  const audit = await env.db.collection("operatorAudit").find({}).toArray();
  assert.ok(audit.some((entry) => /Receipt retention run: 1 original file removed/.test(entry.action)));
});

test("promotion: schedule, £0 claim, one per account, no stacking, claim limit, audited settings", async (t) => {
  const { env, a, b, B } = await household(t);
  const visitor = env.client();
  await unlockedOperator(t, env, a);
  const save = (fields) =>
    a.post("/api/v1/operator/promotion", { ...PROMOTION_DEFAULTS, reason: "Christmas campaign", ...fields });

  assert.equal(
    (await b.post("/api/v1/operator/promotion", { ...PROMOTION_DEFAULTS, reason: "x" })).status,
    403,
  );
  assert.equal((await save({ startsAt: day(5), endsAt: day(1), announceFrom: day(0) })).status, 400);
  let r = await save({ announceFrom: day(-3), startsAt: day(2), endsAt: day(9), maxRedemptions: 2 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  r = await visitor.get("/api/v1/public/promotion");
  assert.equal(r.data.active, true);
  assert.equal(r.data.upcoming, true, "the banner shows before claims open");
  assert.equal(r.data.redeemable, false);
  assert.match((await b.post("/api/v1/account/promotion")).data.error, /opens on/);

  assert.equal(
    (await save({ announceFrom: day(-3), startsAt: day(-1), endsAt: day(9), maxRedemptions: 2 })).status,
    200,
  );
  r = await visitor.get("/api/v1/public/promotion");
  assert.equal(r.data.redeemable, true);
  assert.equal(r.data.pricePence, 0);
  // Kiran joined by invitation, so a welcome month is already running: the offer does not stack on it.
  assert.match((await b.post("/api/v1/account/promotion")).data.error, /cannot be combined/);

  const c = env.client(),
    d = env.client(),
    e = env.client();
  const C = await account(env, c, "third@example.test", "Third");
  const D = await account(env, d, "fourth@example.test", "Fourth");
  await account(env, e, "fifth@example.test", "Fifth");
  r = await c.post("/api/v1/account/promotion");
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.pricePence, 0);
  assert.ok(r.data.freeUntil);
  assert.equal((await c.get("/api/v1/account/access")).data.free, true);
  assert.match((await c.post("/api/v1/account/promotion")).data.error, /already claimed/);
  assert.equal((await d.post("/api/v1/account/promotion")).status, 201);
  r = await e.post("/api/v1/account/promotion");
  assert.equal(r.status, 409);
  assert.match(r.data.error, /claim limit/);
  r = await visitor.get("/api/v1/public/promotion");
  assert.equal(r.data.soldOut, true);

  assert.equal(
    (await save({ enabled: false, announceFrom: day(-3), startsAt: day(-1), endsAt: day(9) })).status,
    200,
  );
  assert.equal((await visitor.get("/api/v1/public/promotion")).data.active, false);
  assert.equal((await e.post("/api/v1/account/promotion")).status, 409);
  const redemptions = await env.db.collection("promotionRedemptions").find({}).toArray();
  assert.deepEqual(redemptions.map((x) => x.userId).sort(), [C.id, D.id].sort());
  assert.ok(B.id);
  const audit = (await a.get("/api/v1/operator/overview")).data.audit;
  assert.ok(audit.some((x) => /Promotion switched off/.test(x.action)));
  assert.ok(audit.some((x) => /Promotion scheduled/.test(x.action)));
  assert.equal(promotionState({ ...PROMOTION_DEFAULTS, used: 0 }, "2026-10-31").active, false);
  assert.equal(promotionState({ ...PROMOTION_DEFAULTS, used: 0 }, "2026-12-01").redeemable, true);
  assert.equal(promotionState({ ...PROMOTION_DEFAULTS, used: 0 }, "2027-01-01").active, false);
});

test("charity: no unnamed claim, versioned wording, public statement only once published", async (t) => {
  const { env, a } = await household(t);
  const visitor = env.client();
  await unlockedOperator(t, env, a);
  assert.deepEqual((await visitor.get("/api/v1/public/charity")).data, { published: false });
  const base = {
    percent: 25,
    basis: "net profit from KoinSplit subscriptions",
    period: "each calendar year (1 January to 31 December)",
    beneficiary: "",
    conditions: "Before tax, after refunds, payment fees and operating costs.",
    reporting: "Published yearly with proof of payment.",
    effectiveFrom: "2027-01-01",
    reason: "Charity commitment",
  };
  let r = await a.post("/api/v1/operator/charity", { ...base, published: true });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /Name the charity/);
  r = await a.post("/api/v1/operator/charity", { ...base, published: false });
  assert.equal(r.data.charity.version, 1);
  assert.equal((await visitor.get("/api/v1/public/charity")).data.published, false);
  r = await a.post("/api/v1/operator/charity", {
    ...base,
    beneficiary: "Example Foundation",
    published: true,
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.charity.version, 2);
  assert.equal(r.data.charity.history.length, 2);
  r = await visitor.get("/api/v1/public/charity");
  assert.equal(r.data.published, true);
  assert.equal(
    r.data.statement,
    "25% of our net profit from KoinSplit subscriptions goes to Example Foundation, each calendar year (1 January to 31 December).",
  );
  assert.equal(r.data.version, 2);
});

test("platform statistics: owner-only, unlock required, aggregates without personal records", async (t) => {
  const { env, a, b, act, expense } = await household(t);
  assert.equal((await a.get("/api/v1/operator/stats")).status, 403, "not the configured owner");
  await unlockedOperator(t, env, a);
  assert.equal(
    (await b.get("/api/v1/operator/stats")).status,
    403,
    "household members never see platform stats",
  );
  await act(a, "expense", expense());
  await act(a, "close", { start: `${day(0).slice(0, 7)}-01`, end: monthEnd(day(0)) });
  let r = await a.get("/api/v1/operator/stats");
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.users.total, 2);
  assert.equal(r.data.users.new, 2);
  assert.equal(r.data.households.total, 1);
  assert.equal(r.data.households.active, 1);
  assert.equal(r.data.settlements.pendingTransfers, 1);
  assert.equal(r.data.settlements.pendingPence, 4500);
  assert.equal(r.data.settlements.closings, 1);
  assert.equal(r.data.invitations.created, 1);
  assert.equal(r.data.invitations.accepted, 1);
  assert.equal(r.data.redemptions.referralsByInvitation, 1, "the invitation's referral is labelled");
  assert.ok(r.data.trend.length >= 1);
  assert.doesNotMatch(JSON.stringify(r.data), /Willow House|Kiran|Jawaria|example\.test|Weekly shop/);
  assert.equal((await a.get("/api/v1/operator/stats?from=2026-12-01&to=2026-11-01")).status, 400);
  assert.equal((await a.get("/api/v1/operator/stats?from=2020-01-01&to=2026-11-01")).status, 400);
  r = await a.get(`/api/v1/operator/stats?from=${day(-400)}&to=${day(0)}`);
  assert.ok(r.data.trend.length >= 13);

  r = await a.get("/api/v1/operator/content");
  assert.equal(r.data.retention.approved, false);
  assert.equal(r.data.promotion.title, "Christmas offer");
  assert.equal((await a.post("/api/v1/operator/retention/run", { reason: "Monthly" })).status, 409);
  r = await a.post("/api/v1/operator/retention", { approved: true, reason: "Approved by finance" });
  assert.equal(r.data.approved, true);
  r = await a.post("/api/v1/operator/retention/run", { reason: "Monthly" });
  assert.equal(r.status, 200);
  assert.equal(r.data.approved, true);
  assert.equal(
    (
      await a.post("/api/v1/operator/retention/hold", {
        householdId: "missing",
        active: true,
        reason: "Dispute",
      })
    ).status,
    404,
  );
  assert.equal(
    (await a.post("/api/v1/operator/retention", { approved: true })).status,
    400,
    "audit reason required",
  );
});

test("invitation and referral links: single use, expiry, recipient binding, recovery messages", async (t) => {
  const { env, a, b, B, id, state } = await household(t);
  const outsider = env.client();
  await account(env, outsider, "outsider@example.test", "Outsider");

  let r = await a.post(`/api/v1/households/${id}/invites`, { email: "new@example.test", room: "Room 1" });
  const token = r.data.token;
  r = await outsider.post("/api/v1/invites/accept", { token });
  assert.equal(r.status, 403);
  assert.match(r.data.error, /different email or phone/);
  assert.equal((await outsider.post("/api/v1/invites/accept", { token: "nope" })).status, 404);

  const n = env.client();
  const N = await account(env, n, "new@example.test", "Newcomer");
  assert.equal((await n.post("/api/v1/invites/accept", { token })).status, 200);
  assert.equal(
    (await n.post("/api/v1/invites/accept", { token })).status,
    200,
    "same person, same link: no error",
  );
  r = await outsider.post("/api/v1/invites/accept", { token });
  assert.equal(r.status, 410);
  assert.match(r.data.error, /already been used/);
  const s = await state();
  assert.equal(s.members.filter((m) => m.id === N.id).length, 1, "joined once");
  assert.match(s.audit.find((x) => x.action === "member joined").detail, /invited by Jawaria/);

  r = await a.post(`/api/v1/households/${id}/invites`, { email: "late@example.test", room: "Room 1" });
  const late = env.client();
  await account(env, late, "late@example.test", "Late");
  await env.db.collection("tokens").updateOne(
    { type: "invite", recipient: "late@example.test" },
    {
      $set: { expiresAt: new Date(Date.now() - 1000) },
    },
  );
  r = await late.post("/api/v1/invites/accept", { token: r.data.token });
  assert.equal(r.status, 410);
  assert.match(r.data.error, /expired/);

  const referrals = await env.db.collection("referrals").find({}).toArray();
  assert.deepEqual(
    referrals.map((x) => [x.referredUserId, x.via]).sort(),
    [
      [B.id, "invitation"],
      [N.id, "invitation"],
    ].sort(),
  );
  assert.equal((await b.get("/api/v1/account/rewards")).data.code.startsWith("KS-"), true);
});
