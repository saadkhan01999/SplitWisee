import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, balances } from "../src/modules/calculation-engine/index.js";
import { roomNames } from "../src/modules/households/index.js";
import { cleanProfile } from "../src/models/profile.js";
import { installAccount } from "../src/routes/account.js";
import { installInvitations } from "../src/routes/invitations.js";
import { requireMember } from "../src/routes/households.js";
import { cleanWebsite, defaultSettings } from "../src/modules/site-settings/index.js";
import { householdFixture } from "./fixtures/household.js";
import { buildAccounts } from "../src/modules/platform-accounting/index.js";
import { monthlyStatement, balanceMovements } from "../src/modules/platform-accounting/statement.js";
const act = (s, type, p, actor = "m1") => applyAction(s, { type, payload: p }, actor);

test("household roles protect owner, self and peer admins; members cannot escalate", () => {
  const s = householdFixture();
  for (const type of ["roomCreate", "memberRole", "memberRemove", "memberUpdate"])
    assert.throws(
      () => act(s, type, { name: "New", id: "m4", role: "admin", confirm: true, room: "Room 2" }, "m3"),
      /Admin permission/,
    );
  assert.throws(() => act(s, "memberRole", { id: "m1", role: "member" }), /own role/);
  assert.throws(() => act(s, "memberRemove", { id: "m1", confirm: true }, "m2"), /owner/);
  assert.throws(() => act(s, "memberRole", { id: "m1", role: "admin" }, "m2"), /protected/);
  const promoted = act(s, "memberRole", { id: "m3", role: "admin" }, "m2");
  assert.equal(promoted.members[2].role, "admin");
  assert.throws(() => act(promoted, "memberRole", { id: "m3", role: "member" }, "m2"), /existing admin/);
  assert.equal(act(promoted, "memberRole", { id: "m3", role: "member" }).members[2].role, "member");
  assert.throws(() => act(s, "memberRole", { id: "m3", role: "owner" }), /Choose admin/);
});
test("room edits persist empty rooms and reject duplicates or occupied deletion", () => {
  let s = act(householdFixture(), "roomCreate", { name: "Studio" });
  assert.ok(roomNames(s).includes("Studio"));
  assert.throws(() => act(s, "roomCreate", { name: "studio" }), /already/);
  assert.throws(() => act(s, "roomDelete", { room: "Room 1" }), /Move all/);
  s = act(s, "roomRename", { room: "Room 2", name: "Garden" });
  assert.equal(s.members[2].room, "Garden");
  s = act(s, "memberUpdate", { id: "m3", name: "Aisha Khan", room: "Studio" });
  assert.equal(s.members[2].room, "Studio");
  assert.equal(s.members[2].name, "Aisha Khan");
  assert.throws(() => act(s, "roomDelete", { room: "Room 2" }), /not found/);
});
test("empty room deletion and member removal preserve all financial records", () => {
  let s = act(householdFixture(), "roomCreate", { name: "Studio" });
  s = act(s, "roomDelete", { room: "Studio" });
  assert.ok(!roomNames(s).includes("Studio"));
  const before = balances(s).map((r) => r.net),
    expenseJSON = JSON.stringify(s.expenses);
  s = act(s, "memberRemove", { id: "m3", confirm: true });
  assert.ok(s.members[2].left);
  assert.deepEqual(
    balances(s).map((r) => r.net),
    before,
  );
  assert.equal(JSON.stringify(s.expenses), expenseJSON);
  assert.throws(() => act(s, "expense", {}, "m3"), /inactive/);
  assert.throws(() => requireMember(s, "m3"), /not found/);
  assert.equal(s.audit[0].action, "memberRemove");
});
test("profile updates target session owner and strip roles, IDs and login identities", async () => {
  const routes = {},
    updates = [];
  const session = () => {};
  installAccount(
    {
      get(p, ...h) {
        routes[p] = h;
      },
      post(p, ...h) {
        routes[p] = h;
      },
    },
    {
      db: {
        collection() {
          return {
            async updateOne(q, u) {
              updates.push({ q, u });
            },
          };
        },
      },
      session,
      endpoint: (f) => f,
      safeUser: (u) => ({ id: u.id, name: u.name }),
    },
  );
  const data = {
    name: "My name",
    bio: "Hello",
    timeZone: "Europe/London",
    monthEndReminders: false,
    id: "victim",
    email: "attacker@test.co",
    operator: true,
    role: "owner",
  };
  assert.equal(cleanProfile(data).operator, undefined);
  const handler = routes["/api/v1/account/profile"];
  assert.equal(handler[0], session);
  let result;
  await handler.at(-1)(
    { user: { id: "self", email: "safe@test.co" }, body: data },
    { json: (r) => (result = r) },
  );
  assert.deepEqual(updates[0].q, { id: "self" });
  assert.equal(updates[0].u.$set.email, undefined);
  assert.equal(result.profile.email, "safe@test.co");
  assert.equal(result.profile.monthEndReminders, false);
});
test("all active members may create identity-bound invitations with no elevated role", async () => {
  const routes = {},
    records = [],
    s = householdFixture(),
    session = () => {};
  installInvitations(
    {
      post(p, ...h) {
        routes[p] = h;
      },
    },
    {
      db: {
        collection() {
          return {
            async insertOne(r) {
              records.push(r);
            },
          };
        },
      },
      session,
      endpoint: (f) => f,
      load: async () => s,
      requireMember,
      email: (v) => v.trim().toLowerCase(),
      fail: (m) => {
        throw Error(m);
      },
      token: () => "secret",
      hash: (v) => "hashed-" + v,
      platform: {},
    },
  );
  let output;
  const res = {
    status() {
      return this;
    },
    json: (v) => (output = v),
  };
  const handlers = routes["/api/v1/households/:id/invites"];
  assert.equal(handlers[0], session);
  await handlers.at(-1)(
    { user: { id: "m3" }, body: { email: "Friend@example.test", room: "Room 2", role: "owner" } },
    res,
  );
  assert.equal(records[0].invitedBy, "m3");
  assert.equal(records[0].recipient, "friend@example.test");
  assert.equal(records[0].role, undefined);
  assert.equal(records[0].id, "hashed-secret");
  assert.equal(output.token, "secret");
  await assert.rejects(
    () => handlers.at(-1)({ user: { id: "m3" }, body: { email: "x@y.co", room: "Missing" } }, res),
    /existing room/,
  );
});
test("removed inviters cannot grant household access using an old link", async () => {
  const s = householdFixture();
  s.members[2].left = "2026-10-18";
  const routes = {};
  let writes = 0;
  installInvitations(
    {
      post(p, ...h) {
        routes[p] = h.at(-1);
      },
    },
    {
      db: {
        collection(n) {
          return {
            async findOne() {
              return n === "tokens"
                ? { id: "invite", householdId: s.id, invitedBy: "m3", room: "Room 2" }
                : s;
            },
            async updateOne() {
              writes++;
            },
          };
        },
      },
      session() {},
      endpoint: (f) => f,
      requireMember,
      email: (x) => x,
      fail: (m) => {
        throw Error(m);
      },
      hash: (x) => x,
      platform: {},
    },
  );
  await assert.rejects(
    () =>
      routes["/api/v1/invites/accept"](
        { user: { id: "new", email: "new@example.test" }, body: { token: "invite" } },
        {},
      ),
    /no longer/,
  );
  assert.equal(writes, 0);
});
test("website settings reject unsafe links, oversized slides and fast autoplay", () => {
  const s = cleanWebsite({ ...defaultSettings, announcements: ["Hello", "New feature"], showPricing: false });
  assert.equal(s.announcements.length, 2);
  assert.equal(s.showPricing, false);
  for (const patch of [
    { privacyUrl: "javascript:alert(1)" },
    { termsUrl: "http://insecure.test" },
    { announcements: Array(6).fill("x") },
    { announcementSeconds: 1 },
  ])
    assert.throws(() => cleanWebsite({ ...defaultSettings, ...patch }));
});
test("monthly statement separates bank and Stripe movements and balances asset changes", () => {
  const r = buildAccounts({
    month: "2026-10",
    transactions: [
      {
        id: "c",
        currency: "gbp",
        created: +new Date("2026-10-01") / 1000,
        type: "charge",
        amount: 10000,
        fee: 200,
        net: 9800,
      },
    ],
    entries: [
      {
        id: "bank",
        kind: "expense",
        date: "2026-10-02",
        amountPence: 1000,
        description: "Hosting",
        reference: "Bank1",
      },
    ],
  });
  const rows = monthlyStatement(r);
  assert.equal(rows.filter((r) => r.account.startsWith("1000")).at(-1).runningMovementPence, 9800);
  assert.equal(rows.filter((r) => r.account.startsWith("1010")).at(-1).runningMovementPence, -1000);
  const m = balanceMovements(r);
  assert.equal(
    m.filter((r) => r.section === "Asset movement").reduce((n, r) => n + r.pence, 0),
    m.filter((r) => r.section !== "Asset movement").reduce((n, r) => n + r.pence, 0),
  );
});
test("quick verification clears unverified preregistration password before authenticating", async () => {
  const { installPlatform } = await import("../src/routes/platform.js"),
    crypto = await import("node:crypto");
  const digest = (x) => crypto.createHash("sha256").update(x).digest("hex"),
    routes = {},
    updates = [],
    raw = "challenge",
    code = "123456",
    u = { id: "u", name: "User", email: "u@example.test", verifiedAt: null, passwordHash: "untrusted" };
  const db = {
    collection(n) {
      return {
        async findOneAndUpdate() {
          return {
            id: "token",
            method: "email",
            identifier: u.email,
            intent: "login",
            codeHash: digest(raw + code),
          };
        },
        async findOneAndDelete() {
          return { id: "token" };
        },
        async findOne() {
          return n === "users" ? u : null;
        },
        async updateOne(q, v) {
          updates.push({ n, q, v });
        },
        async insertOne() {},
      };
    },
  };
  installPlatform(
    {
      post(p, ...h) {
        routes[p] = h.at(-1);
      },
      get() {},
      use() {},
    },
    {
      db,
      session() {},
      endpoint: (f) => f,
      origin: "https://example.test",
      safeUser: (x) => ({ id: x.id }),
      cookieName: "s",
    },
  );
  let result;
  await routes["/api/v1/auth/quick/verify"](
    { body: { challengeId: raw, code } },
    { cookie() {}, json: (x) => (result = x) },
  );
  assert.equal(result.user.id, "u");
  assert.ok(updates.some((x) => x.n === "users" && x.v.$unset?.passwordHash === ""));
});
