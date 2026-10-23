import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { createApp } from "../../src/app.js";
import { initialiseDatabase } from "../../database/init.js";
import { createMemoryDb } from "./memory-db.js";
export const ORIGIN = "https://splitwisee.test";
export const PASSWORD = "correct horse battery 42";

// Starts the real Express app (all middleware, limiters and routes) on 127.0.0.1 against an in-memory database.
// `env` temporarily overrides process.env for the lifetime of the test (restored in t.after).
export async function boot(t, { env = {}, db = null, now } = {}) {
  const saved = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  db ??= createMemoryDb();
  await initialiseDatabase(db, { log: { warn() {} } });
  const mail = [],
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "splitwisee-e2e-"));
  const app = await createApp(db, {
    origin: ORIGIN,
    receiptDir: dir,
    production: false,
    now,
    sendCode: async (to, subject, code) => {
      mail.push({ to, subject, code });
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await fs.rm(dir, { recursive: true, force: true });
    for (const [k, v] of Object.entries(saved))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  });
  const lastCode = (to, subject) =>
    mail.findLast((m) => m.to === to && (!subject || m.subject === subject))?.code;
  return { app, db, mail, base, dir, lastCode, client: () => client(base) };
}

// A browser-like client: keeps the HttpOnly session cookie and the CSRF token returned by /me and sign-in.
export function client(base) {
  let cookie = "",
    csrf = "";
  async function call(method, url, body, headers = {}) {
    const res = await fetch(base + url, {
      method,
      redirect: "manual",
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
        ...(csrf ? { "x-csrf-token": csrf } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) {
      const pair = c.split(";")[0];
      if (/^(__Host-)?th_session=/.test(pair)) cookie = pair.endsWith("=") ? "" : pair;
    }
    const text = await res.text();
    let data = text;
    try {
      data = JSON.parse(text);
    } catch {}
    if (data && typeof data === "object" && data.csrf) csrf = data.csrf;
    return { status: res.status, data, headers: res.headers };
  }
  return {
    get: (url, headers) => call("GET", url, undefined, headers),
    post: (url, body = {}, headers) => call("POST", url, body, headers),
    raw: call,
    get cookie() {
      return cookie;
    },
    get csrf() {
      return csrf;
    },
    forgetCsrf() {
      csrf = "";
    },
  };
}

// Registers, verifies (with the captured email code) and signs in a password account.
export async function account(env, c, email, name = "Test User") {
  let r = await c.post("/api/v1/auth/register", { name, email, password: PASSWORD });
  assert.equal(r.status, 202, JSON.stringify(r.data));
  r = await c.post("/api/v1/auth/verify", { token: env.lastCode(email, "Verify email") });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  r = await c.post("/api/v1/auth/login", { email, password: PASSWORD });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.user;
}

export const key = () => "test-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
