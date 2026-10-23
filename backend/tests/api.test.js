import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { householdFixture } from "./fixtures/household.js";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const raw = "session-secret-for-test",
  hash = crypto.createHash("sha256").update(raw).digest("hex");
const db = {
  collection(name) {
    return {
      async findOne(q) {
        if (name === "sessions") return q.id === hash ? { id: hash, userId: "m1", csrf: "csrf-test" } : null;
        if (name === "users")
          return q.id === "m1"
            ? { id: "m1", name: "Salman", email: "test@example.test", verifiedAt: new Date() }
            : null;
        if (name === "households") {
          const s = householdFixture();
          if (q.id === "household-fixture") return s;
          if (q.id === "other") return { ...s, id: "other", members: [{ id: "outsider" }] };
        }
        return null;
      },
    };
  },
  async command() {
    return { ok: 1 };
  },
};

test("HTTP security boundaries: session, CSRF, origin and cross-household objects", async () => {
  const dir = path.join(os.tmpdir(), "tallyhaven-api-test-" + crypto.randomUUID());
  const app = await createApp(db, { origin: "http://tallyhaven.test", receiptDir: dir });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const headers = {
    cookie: "th_session=" + raw,
    origin: "http://tallyhaven.test",
    "content-type": "application/json",
    "x-csrf-token": "csrf-test",
  };
  try {
    let r = await fetch(base + "/api/v1/households/household-fixture");
    assert.equal(r.status, 401);
    r = await fetch(base + "/api/v1/households/household-fixture", { headers });
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.equal(data.id, "household-fixture");
    assert.equal(data._id, undefined);
    assert.equal(r.headers.get("cache-control"), "no-store");
    r = await fetch(base + "/api/v1/households/other", { headers });
    assert.equal(r.status, 404);
    r = await fetch(base + "/api/v1/households/other/receipts/guessed", { headers });
    assert.equal(r.status, 404);
    r = await fetch(base + "/api/v1/households/household-fixture/actions", {
      method: "POST",
      headers: { ...headers, "x-csrf-token": "wrong" },
      body: "{}",
    });
    assert.equal(r.status, 403);
    r = await fetch(base + "/api/v1/households/household-fixture/actions", {
      method: "POST",
      headers: { ...headers, origin: "http://evil.test" },
      body: "{}",
    });
    assert.equal(r.status, 403);
    r = await fetch(base + "/api/v1/households/household-fixture/receipts", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "bad.png",
        data: "data:image/png;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
      }),
    });
    assert.equal(r.status, 400);
    r = await fetch(base + "/api/v1/households/household-fixture/actions", {
      method: "POST",
      headers,
      body: JSON.stringify({ version: 0, idempotencyKey: "valid-key", type: "close" }),
    });
    assert.equal(r.status, 409);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await fs.rm(dir, { recursive: true, force: true });
  }
});
