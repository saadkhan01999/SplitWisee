import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { boot, account, PASSWORD } from "./helpers/http.js";
import { createMemoryDb } from "./helpers/memory-db.js";
import { classifyError } from "../src/middleware/errors.js";
const version = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

test("health, public config/settings and security headers", async (t) => {
  const env = await boot(t),
    c = env.client();
  let r = await c.get("/api/health");
  assert.deepEqual([r.status, r.data], [200, { status: "ok" }]);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(r.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.match(
    r.headers.get("content-security-policy"),
    /default-src 'self';.*script-src 'self' 'wasm-unsafe-eval'/,
  );
  assert.match(r.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("x-powered-by"), null);
  r = await c.get("/api/v1/public/config");
  assert.equal(r.data.version, version);
  assert.equal(r.data.pricePence, 99);
  assert.equal(r.data.currency, "GBP");
  for (const k of ["email", "google", "phone", "billing", "bankEncryption"])
    assert.equal(typeof r.data[k], "boolean");
  assert.equal(
    JSON.stringify(r.data).match(/sk_|whsec_|SECRET|PASSWORD/i),
    null,
    "no secrets in public config",
  );
  await env.db
    .collection("platformSettings")
    .updateOne(
      { id: "public" },
      { $set: { headline: "Hi", internalNote: "x", encrypted: { ciphertext: "y" } } },
      { upsert: true },
    );
  r = await c.get("/api/v1/public/settings");
  assert.equal(r.data.headline, "Hi");
  assert.equal(r.data.internalNote, undefined);
  assert.equal(r.data.encrypted, undefined);
  env.db.command = async () => {
    throw Object.assign(new Error("connect ECONNREFUSED 10.0.0.5:27017"), { name: "MongoNetworkError" });
  };
  r = await c.get("/api/health");
  assert.deepEqual(
    [r.status, r.data],
    [503, { status: "unavailable" }],
    "database outage is a 503 without driver details",
  );
});

test("API-only server: no frontend files or pages are served; every unknown path is a JSON 404", async (t) => {
  const env = await boot(t),
    c = env.client();
  for (const url of ["/", "/index.html", "/admin/", "/robots.txt", "/app.js", "/api/v1/nope"]) {
    const r = await c.get(url);
    assert.deepEqual([r.status, r.data], [404, { error: "Endpoint not found." }], url);
  }
});

test("CORS is off by default and, when configured, allows only the listed origins with credentials", async (t) => {
  const plain = await boot(t);
  let r = await fetch(plain.base + "/api/v1/public/config", {
    headers: { origin: "https://app.example.com" },
  });
  assert.equal(r.headers.get("access-control-allow-origin"), null, "no CORS unless CORS_ORIGINS is set");
  const env = await boot(t, { env: { CORS_ORIGINS: "https://app.example.com" } });
  r = await fetch(env.base + "/api/v1/auth/login", {
    method: "OPTIONS",
    headers: { origin: "https://app.example.com", "access-control-request-method": "POST" },
  });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get("access-control-allow-origin"), "https://app.example.com");
  assert.equal(r.headers.get("access-control-allow-credentials"), "true");
  assert.match(r.headers.get("access-control-allow-headers"), /X-CSRF-Token/);
  r = await fetch(env.base + "/api/v1/public/config", { headers: { origin: "https://evil.example" } });
  assert.equal(r.headers.get("access-control-allow-origin"), null, "unlisted origins get no CORS headers");
  r = await fetch(env.base + "/api/v1/auth/resend", {
    method: "POST",
    headers: { origin: "https://app.example.com", "content-type": "application/json" },
    body: JSON.stringify({ email: "x@example.test" }),
  });
  assert.equal(r.status, 202, "a listed origin passes the Origin check");
  r = await fetch(env.base + "/api/v1/auth/resend", {
    method: "POST",
    headers: { origin: "https://evil.example", "content-type": "application/json" },
    body: JSON.stringify({ email: "x@example.test" }),
  });
  assert.equal(r.status, 403, "other origins are still refused");
});

test("errors: internal details hidden, JSON and size errors are clear, unknown API is JSON 404", async (t) => {
  const env = await boot(t),
    c = env.client();
  await account(env, c, "err@example.test");
  let r = await c.raw("POST", "/api/v1/auth/login", "{bad json");
  assert.deepEqual([r.status, r.data.error], [400, "Request body must be valid JSON."]);
  r = await c.post("/api/v1/auth/login", { email: "a@b.co", password: "x".repeat(3 * 1024 * 1024) });
  assert.deepEqual(
    [r.status, r.data.error],
    [413, "Request is too large."],
    "2 MB limit outside receipt uploads",
  );
  r = await c.get("/api/v1/does-not-exist");
  assert.deepEqual([r.status, r.data], [404, { error: "Endpoint not found." }]);
  const original = env.db.collection("households").find;
  env.db.collection("households").find = () => {
    throw new TypeError("Cannot read properties of undefined (reading 'secretInternals')");
  };
  t.after(() => {
    env.db.collection("households").find = original;
  });
  r = await c.get("/api/v1/households");
  assert.deepEqual(
    [r.status, r.data],
    [500, { error: "Service temporarily unavailable. Please try again." }],
  );
  assert.deepEqual(
    classifyError(
      Object.assign(new Error('E11000 duplicate key users email_1 dup key: { email: "x@y" }'), {
        name: "MongoServerError",
        code: 11000,
      }),
    ).status,
    500,
  );
  assert.deepEqual(classifyError(new Error("Choose a valid date range.")), {
    status: 400,
    message: "Choose a valid date range.",
  });
  assert.deepEqual(
    classifyError(
      Object.assign(new Error("No such price"), {
        type: "StripeInvalidRequestError",
        code: "resource_missing",
        statusCode: 400,
      }),
    ),
    { status: 502, message: "The payment provider could not complete this request (resource_missing)." },
  );
  const e = Object.assign(new Error("ENOENT: no such file, open '/srv/private-receipts/abc'"), {
    code: "ENOENT",
  });
  assert.equal(classifyError(e).status, 500, "file-system paths never reach clients");
});

test("rate-limit classes return 429 with standard headers and are shared across app instances", async (t) => {
  const db = createMemoryDb();
  const one = await boot(t, { db }),
    two = await boot(t, { db });
  const c1 = one.client(),
    c2 = two.client();
  for (let i = 0; i < 10; i++)
    assert.equal(
      (await (i % 2 ? c1 : c2).post("/api/v1/auth/resend", { email: `x${i}@example.test` })).status,
      202,
    );
  const r = await c2.post("/api/v1/auth/resend", { email: "x@example.test" });
  assert.equal(r.status, 429, "the 11th request is refused even though it hit the other instance");
  assert.match(r.headers.get("ratelimit-policy"), /10;w=3600/);
  assert.ok(Number(r.headers.get("retry-after")) > 0);
  assert.match(r.data.error, /Too many code requests/);
  const docs = db.raw.get("throttles").docs.filter((d) => d.key.startsWith("rl:resend:"));
  assert.equal(docs.length, 1);
  assert.ok(docs[0].expiresAt instanceof Date, "TTL-bounded");
  assert.equal(JSON.stringify(docs).includes("127.0.0.1"), false, "IP addresses are stored only as digests");
});

test("per-address email caps stop inbox flooding without revealing whether the account exists", async (t) => {
  const env = await boot(t),
    c = env.client();
  await account(env, c, "victim@example.test");
  const replies = [];
  for (let i = 0; i < 5; i++)
    replies.push((await c.post("/api/v1/auth/reset-request", { email: "victim@example.test" })).data);
  assert.equal(new Set(replies.map((x) => JSON.stringify(x))).size, 1, "identical responses");
  assert.equal(
    env.mail.filter((m) => m.subject === "Reset password").length,
    3,
    "at most three reset emails per address per hour",
  );
  for (let i = 0; i < 6; i++)
    await c
      .post("/api/v1/auth/quick/start", {
        method: "email",
        identifier: "flood@example.test",
        intent: "signup",
        name: "F",
      })
      .then(() => {
        for (const d of env.db.raw.get("tokens").docs) d.createdAt = new Date(0);
      });
  assert.equal(
    env.mail.filter((m) => m.to === "flood@example.test").length,
    5,
    "at most five sign-in codes per address per hour",
  );
  const login = await c.post("/api/v1/auth/login", { email: "victim@example.test", password: PASSWORD });
  assert.equal(login.status, 200);
});

test("login per-IP limiter counts only failures (successful sign-ins are not throttled)", async (t) => {
  const env = await boot(t),
    c = env.client();
  await account(env, c, "busy@example.test");
  for (let i = 0; i < 25; i++)
    assert.equal(
      (await c.post("/api/v1/auth/login", { email: "busy@example.test", password: PASSWORD })).status,
      200,
    );
  const r = await c.post("/api/v1/auth/login", { email: "busy@example.test", password: PASSWORD });
  assert.match(r.headers.get("ratelimit-policy"), /20;w=900/);
  assert.equal(r.status, 200);
});
