import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { createApp } from "../src/app.js";
import { initialiseDatabase } from "../database/init.js";
import { client, ORIGIN, PASSWORD } from "./helpers/http.js";
import { createMemoryDb } from "./helpers/memory-db.js";
// DEMO_SHOW_CODES (the Vercel demo): with no SMTP, codes come back in the API response instead of being emailed.

async function start(t, env) {
  const saved = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const db = createMemoryDb();
  await initialiseDatabase(db, { log: { warn() {} } });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "splitwisee-demo-"));
  // Real code sender (no test override) and production settings, as on Vercel.
  const app = await createApp(db, { origin: ORIGIN, receiptDir: dir, production: true });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await fs.rm(dir, { recursive: true, force: true });
    for (const [k, v] of Object.entries(saved))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  });
  return client(`http://127.0.0.1:${server.address().port}`);
}

test("demo mode returns sign-up, resend, reset and email sign-in codes and they work", async (t) => {
  const c = await start(t, { DEMO_SHOW_CODES: "true", SMTP_HOST: undefined });
  assert.equal((await c.get("/api/v1/public/config")).data.email, true);

  let r = await c.post("/api/v1/auth/register", {
    name: "Ana",
    email: "ana@example.test",
    password: PASSWORD,
  });
  assert.equal(r.status, 202);
  assert.match(r.data.demoCode, /^[a-f0-9]{64}$/);
  r = await c.post("/api/v1/auth/resend", { email: "ana@example.test" });
  assert.equal(r.status, 202);
  r = await c.post("/api/v1/auth/verify", { token: r.data.demoCode });
  assert.equal(r.status, 200);
  r = await c.post("/api/v1/auth/login", { email: "ana@example.test", password: PASSWORD });
  assert.equal(r.status, 200);

  r = await c.post("/api/v1/auth/reset-request", { email: "ana@example.test" });
  assert.equal(r.status, 202);
  r = await c.post("/api/v1/auth/reset", { token: r.data.demoCode, password: PASSWORD + "!" });
  assert.equal(r.status, 200);

  r = await c.post("/api/v1/auth/quick/start", {
    method: "email",
    identifier: "ben@example.test",
    name: "Ben",
    intent: "signup",
  });
  assert.equal(r.status, 200);
  assert.match(r.data.demoCode, /^\d{6}$/);
  r = await c.post("/api/v1/auth/quick/verify", { challengeId: r.data.challengeId, code: r.data.demoCode });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.email, "ben@example.test");
});

test("codes never reach the browser without demo mode or once SMTP is configured", async (t) => {
  let c = await start(t, { DEMO_SHOW_CODES: undefined, SMTP_HOST: undefined });
  assert.equal((await c.get("/api/v1/public/config")).data.email, false);
  let r = await c.post("/api/v1/auth/register", {
    name: "Ana",
    email: "ana@example.test",
    password: PASSWORD,
  });
  assert.equal(r.status, 503);
  assert.equal(r.data.demoCode, undefined);

  // SMTP wins over DEMO_SHOW_CODES: the (unreachable) mail server is used and nothing is returned.
  c = await start(t, { DEMO_SHOW_CODES: "true", SMTP_HOST: "127.0.0.1", SMTP_PORT: "9" });
  r = await c.post("/api/v1/auth/quick/start", {
    method: "email",
    identifier: "ben@example.test",
    intent: "login",
  });
  assert.equal(r.data.demoCode, undefined);
});
