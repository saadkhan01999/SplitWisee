import test from "node:test";
import assert from "node:assert/strict";
import { boot, account, PASSWORD } from "./helpers/http.js";
// End-to-end over HTTP against the real Express app (in-memory database double; see helpers/memory-db.mjs).

test("password signup, verification, session cookie, /me, CSRF/origin enforcement and logout", async (t) => {
  const env = await boot(t),
    c = env.client();
  let r = await c.post("/api/v1/auth/register", {
    name: "Ana",
    email: "Ana@Example.test",
    password: "short",
  });
  assert.equal(r.status, 400);
  r = await c.post("/api/v1/auth/register", { name: "Ana", email: "Ana@Example.test", password: PASSWORD });
  assert.equal(r.status, 202);
  const generic = r.data.message;
  r = await c.post("/api/v1/auth/register", { name: "Other", email: "ana@example.test", password: PASSWORD });
  assert.equal(r.status, 202);
  assert.equal(r.data.message, generic, "existing and new addresses get the same response");
  assert.equal(
    env.mail.filter((m) => m.to === "ana@example.test").length,
    1,
    "no second email for an existing account",
  );
  r = await c.post("/api/v1/auth/login", { email: "ana@example.test", password: PASSWORD });
  assert.equal(r.status, 403, "unverified account cannot sign in");
  r = await c.post("/api/v1/auth/verify", { token: "0".repeat(64) });
  assert.equal(r.status, 400);
  const code = env.lastCode("ana@example.test", "Verify email");
  assert.equal((await c.post("/api/v1/auth/verify", { token: code })).status, 200);
  assert.equal(
    (await c.post("/api/v1/auth/verify", { token: code })).status,
    400,
    "verification codes are single use",
  );
  const res = await fetch(env.base + "/api/v1/auth/login", {
    method: "POST",
    headers: { origin: "https://splitwisee.test", "content-type": "application/json" },
    body: JSON.stringify({ email: "ana@example.test", password: PASSWORD }),
  });
  assert.equal(res.status, 200);
  assert.match(
    res.headers.get("set-cookie"),
    /th_session=[a-f0-9]{64}; Max-Age=43200; Path=\/; Expires=.*; HttpOnly; SameSite=Strict/,
  );
  r = await c.post("/api/v1/auth/login", { email: "ana@example.test", password: PASSWORD });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.email, "ana@example.test");
  assert.equal(r.data.user.passwordHash, undefined);
  r = await c.get("/api/v1/me");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.ok(/^[a-f0-9]{64}$/.test(r.data.csrf));
  assert.equal(JSON.stringify(r.data).includes("passwordHash"), false);
  // Writes require the CSRF token and the exact origin.
  r = await c.post("/api/v1/households", { name: "Home", type: "house" }, { "x-csrf-token": "wrong" });
  assert.equal(r.status, 403);
  r = await c.post("/api/v1/households", { name: "Home", type: "house" }, { origin: "https://evil.test" });
  assert.equal(r.status, 403);
  r = await c.raw("POST", "/api/v1/households", { name: "Home", type: "house" }, { origin: "" });
  assert.equal(r.status, 403, "missing Origin header is refused");
  assert.equal((await c.post("/api/v1/auth/logout")).status, 200);
  assert.equal(c.cookie, "", "logout clears the cookie");
  assert.equal((await c.get("/api/v1/me")).status, 401);
});

test("password reset sends generic responses, revokes sessions and replaces the password", async (t) => {
  const env = await boot(t),
    c = env.client(),
    other = env.client();
  await account(env, c, "reset@example.test");
  assert.equal(
    (await other.post("/api/v1/auth/login", { email: "reset@example.test", password: PASSWORD })).status,
    200,
  );
  let r = await c.post("/api/v1/auth/reset-request", { email: "nobody@example.test" });
  const generic = r.data.message;
  assert.equal(r.status, 202);
  r = await c.post("/api/v1/auth/reset-request", { email: "reset@example.test" });
  assert.equal(r.status, 202);
  assert.equal(r.data.message, generic);
  assert.equal(
    (
      await c.post("/api/v1/auth/reset", {
        token: env.lastCode("reset@example.test", "Reset password"),
        password: "short",
      })
    ).status,
    400,
  );
  r = await c.post("/api/v1/auth/reset", {
    token: env.lastCode("reset@example.test", "Reset password"),
    password: "a brand new passphrase",
  });
  assert.equal(r.status, 200);
  assert.equal((await other.get("/api/v1/me")).status, 401, "every existing session is revoked");
  assert.equal(
    (await c.post("/api/v1/auth/login", { email: "reset@example.test", password: PASSWORD })).status,
    401,
  );
  assert.equal(
    (await c.post("/api/v1/auth/login", { email: "reset@example.test", password: "a brand new passphrase" }))
      .status,
    200,
  );
  // Resend only applies to unverified accounts.
  await c.post("/api/v1/auth/resend", { email: "reset@example.test" });
  assert.equal(
    env.mail.filter((m) => m.subject === "Verify email").length,
    1,
    "verified accounts get no further verification email",
  );
});

test("four consecutive failed passwords lock sign-in for 15 minutes; expiry, success and window rules", async (t) => {
  let clock = Date.parse("2026-10-21T10:00:00Z");
  const env = await boot(t, { now: () => clock }),
    c = env.client();
  await account(env, c, "lock@example.test");
  const wrong = () =>
    c.post("/api/v1/auth/login", { email: "lock@example.test", password: "wrong password 123" });
  const right = () => c.post("/api/v1/auth/login", { email: "lock@example.test", password: PASSWORD });
  let r = await wrong();
  assert.equal(r.status, 401);
  assert.match(r.data.error, /incorrect\. 3 attempts left/);
  assert.match((await wrong()).data.error, /2 attempts left/);
  assert.match((await wrong()).data.error, /1 attempt left/);
  r = await wrong();
  assert.equal(r.status, 429, "the 4th failure locks");
  assert.equal(r.headers.get("retry-after"), "900");
  assert.match(r.data.error, /paused for 15 minutes/);
  r = await right();
  assert.equal(r.status, 429, "even the correct password is refused while locked");
  assert.ok(Number(r.headers.get("retry-after")) > 0);
  clock += 14 * 60e3;
  assert.equal((await right()).status, 429, "still locked after 14 minutes");
  clock += 60e3 + 1000;
  assert.equal((await right()).status, 200, "lock expires after 15 minutes (not permanent)");
  assert.match((await wrong()).data.error, /3 attempts left/, "successful sign-in reset the counter");
  assert.equal((await right()).status, 200);
  // Consecutive failures are counted within a 15-minute window from the latest attempt.
  await wrong();
  await wrong();
  clock += 16 * 60e3;
  assert.match((await wrong()).data.error, /3 attempts left/, "stale failures do not accumulate");
  // The lock state is persisted (survives app restarts / other instances): it is stored in the throttles collection.
  const docs = [...env.db.raw.get("throttles").docs].filter((d) => d.key.startsWith("lock:login:"));
  assert.equal(docs.length, 1);
  assert.equal(
    JSON.stringify(docs[0]).includes("lock@example.test"),
    false,
    "identifiers are stored only as digests",
  );
});

test("unknown addresses are throttled identically (no account enumeration through the lock)", async (t) => {
  const env = await boot(t),
    c = env.client();
  await account(env, c, "known@example.test");
  const statuses = async (email) => {
    const out = [];
    for (let i = 0; i < 5; i++) {
      const r = await c.post("/api/v1/auth/login", { email, password: "wrong password 123" });
      out.push(r.status + ":" + r.data.error);
    }
    return out;
  };
  assert.deepEqual(await statuses("ghost@example.test"), await statuses("known@example.test"));
});

test("parallel wrong passwords cannot test more than four guesses", async (t) => {
  const env = await boot(t),
    c = env.client();
  await account(env, c, "race@example.test");
  const results = await Promise.all(
    Array.from({ length: 12 }, () =>
      c.post("/api/v1/auth/login", { email: "race@example.test", password: "wrong password 123" }),
    ),
  );
  const counts = results.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] || 0) + 1 }), {});
  assert.deepEqual(counts, { 401: 3, 429: 9 });
  assert.equal(
    (await c.post("/api/v1/auth/login", { email: "race@example.test", password: PASSWORD })).status,
    429,
  );
});

test("password reset is the controlled recovery that ends a lock immediately", async (t) => {
  const env = await boot(t),
    c = env.client();
  await account(env, c, "recover@example.test");
  for (let i = 0; i < 4; i++)
    await c.post("/api/v1/auth/login", { email: "recover@example.test", password: "wrong password 123" });
  assert.equal(
    (await c.post("/api/v1/auth/login", { email: "recover@example.test", password: PASSWORD })).status,
    429,
  );
  await c.post("/api/v1/auth/reset-request", { email: "recover@example.test" });
  assert.equal(
    (
      await c.post("/api/v1/auth/reset", {
        token: env.lastCode("recover@example.test", "Reset password"),
        password: "recovered passphrase 1",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await c.post("/api/v1/auth/login", {
        email: "recover@example.test",
        password: "recovered passphrase 1",
      })
    ).status,
    200,
  );
});

test("email OTP: four invalid codes consume the challenge; a new code is required", async (t) => {
  const env = await boot(t),
    c = env.client();
  let r = await c.post("/api/v1/auth/quick/start", {
    method: "email",
    identifier: "otp@example.test",
    name: "Otp User",
    intent: "signup",
  });
  assert.equal(r.status, 200);
  const challengeId = r.data.challengeId,
    code = env.lastCode("otp@example.test");
  const wrongCode = code === "000000" ? "111111" : "000000";
  assert.equal((await c.post("/api/v1/auth/quick/verify", { challengeId, code: "12ab" })).status, 400);
  for (const left of [3, 2, 1]) {
    r = await c.post("/api/v1/auth/quick/verify", { challengeId, code: wrongCode });
    assert.equal(r.status, 400);
    assert.match(r.data.error, new RegExp(`${left} attempts? left`));
  }
  r = await c.post("/api/v1/auth/quick/verify", { challengeId, code: wrongCode });
  assert.match(r.data.error, /can no longer be used/);
  r = await c.post("/api/v1/auth/quick/verify", { challengeId, code });
  assert.equal(r.status, 400, "even the correct code is refused after the 4th failure");
  assert.match(r.data.error, /expired or too many attempts/);
  assert.equal(
    env.db.raw.get("tokens").docs.filter((d) => d.type === "quick").length,
    0,
    "challenge deleted",
  );
  // A consumed challenge can be replaced straight away; while a live challenge exists the one-minute guard applies.
  r = await c.post("/api/v1/auth/quick/start", {
    method: "email",
    identifier: "otp@example.test",
    name: "Otp User",
    intent: "signup",
  });
  assert.equal(r.status, 200);
  assert.equal(
    (
      await c.post("/api/v1/auth/quick/start", {
        method: "email",
        identifier: "otp@example.test",
        name: "Otp User",
        intent: "signup",
      })
    ).status,
    429,
    "one-minute resend guard",
  );
  r = await c.post("/api/v1/auth/quick/verify", {
    challengeId: r.data.challengeId,
    code: env.lastCode("otp@example.test"),
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.email, "otp@example.test");
  assert.equal((await c.get("/api/v1/me")).status, 200);
});

test("OTP sign-in clears a password lock; login intent never creates accounts", async (t) => {
  const env = await boot(t),
    c = env.client();
  await account(env, c, "both@example.test");
  for (let i = 0; i < 4; i++)
    await c.post("/api/v1/auth/login", { email: "both@example.test", password: "wrong password 123" });
  let r = await c.post("/api/v1/auth/quick/start", {
    method: "email",
    identifier: "both@example.test",
    intent: "login",
  });
  r = await c.post("/api/v1/auth/quick/verify", {
    challengeId: r.data.challengeId,
    code: env.lastCode("both@example.test"),
  });
  assert.equal(r.status, 200);
  assert.equal(
    (await c.post("/api/v1/auth/login", { email: "both@example.test", password: PASSWORD })).status,
    200,
    "verified sign-in ended the lock",
  );
  r = await c.post("/api/v1/auth/quick/start", {
    method: "email",
    identifier: "new-person@example.test",
    intent: "login",
  });
  r = await c.post("/api/v1/auth/quick/verify", {
    challengeId: r.data.challengeId,
    code: env.lastCode("new-person@example.test"),
  });
  assert.equal(r.status, 404);
  assert.equal(
    env.db.raw.get("users").docs.some((u) => u.email === "new-person@example.test"),
    false,
  );
  assert.equal(
    (
      await c.post("/api/v1/auth/quick/start", {
        method: "sms",
        identifier: "+447700900123",
        intent: "login",
      })
    ).status,
    503,
    "phone provider absent: no simulated account",
  );
  assert.equal((await c.get("/api/v1/auth/google/start")).status, 503, "Google absent: no simulated account");
});

test("register rejects an unknown referral code identically for new and existing addresses", async (t) => {
  const env = await boot(t),
    c = env.client();
  await account(env, c, "taken@example.test");
  const a = await c.post("/api/v1/auth/register", {
    name: "X",
    email: "taken@example.test",
    password: PASSWORD,
    referralCode: "SW-NOPE",
  });
  const b = await c.post("/api/v1/auth/register", {
    name: "X",
    email: "fresh@example.test",
    password: PASSWORD,
    referralCode: "SW-NOPE",
  });
  assert.equal(a.status, 400);
  assert.deepEqual(a.data, b.data);
});
