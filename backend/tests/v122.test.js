import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { cleanReceiptScan } from "../src/modules/receipts/metadata.js";
import { createApp } from "../src/app.js";
import { cleanExpense } from "../src/routes/households.js";
import { householdFixture } from "./fixtures/household.js";

test("server preserves bounded OCR evidence and strips forged metadata", () => {
  const scan = cleanReceiptScan({
    merchant: "A".repeat(200),
    text: "x".repeat(40000),
    amountPence: 12.3,
    reviewed: true,
    reviewedAt: "2026-10-17T12:00:00Z",
    items: [{ title: "Milk", amount: "2.50" }],
    operator: true,
  });
  assert.equal(scan.merchant.length, 100);
  assert.equal(scan.text.length, 30000);
  assert.equal(scan.amountPence, null);
  assert.equal(scan.operator, undefined);
  const e = cleanExpense({
    title: "Groceries",
    receipt: { id: "r", data: "private" },
    receiptScan: scan,
    items: scan.items,
  });
  assert.equal(e.receiptScan.items[0].title, "Milk");
  assert.equal(e.receipt.data, undefined);
});
test("original receipt byte integrity, inline viewing, household isolation and logout revocation", async () => {
  const dir = path.join(os.tmpdir(), "splitwisee-v122-" + crypto.randomUUID()),
    raw = "test-receipt-session",
    hashed = crypto.createHash("sha256").update(raw).digest("hex"),
    records = [];
  let signedIn = true;
  const db = {
    collection(name) {
      return {
        async findOne(q) {
          if (name === "sessions")
            return signedIn && q.id === hashed ? { id: hashed, userId: "m1", csrf: "test-csrf" } : null;
          if (name === "users") return { id: "m1", name: "Salman", verifiedAt: new Date() };
          if (name === "households") return q.id === "household-fixture" ? householdFixture() : null;
          if (name === "receipts")
            return records.find((r) => r.id === q.id && r.householdId === q.householdId) || null;
          return null;
        },
        async insertOne(r) {
          if (name === "receipts") records.push(r);
        },
        async deleteOne() {
          if (name === "sessions") signedIn = false;
        },
        async findOneAndUpdate() {
          return { hits: 1, resetAt: new Date(Date.now() + 60000) };
        },
      };
    },
  };
  const app = await createApp(db, { origin: "http://test.local", receiptDir: dir });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + server.address().port,
    headers = {
      cookie: "th_session=" + raw,
      origin: "http://test.local",
      "content-type": "application/json",
      "x-csrf-token": "test-csrf",
    };
  try {
    const bytes = await fs.readFile(new URL("./fixtures/Receipt-OCR-Test.png", import.meta.url));
    let response = await fetch(base + "/api/v1/households/household-fixture/receipts", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "original.png",
        data: "data:image/png;base64," + bytes.toString("base64"),
      }),
    });
    assert.equal(response.status, 201);
    const r = await response.json();
    assert.equal(r.mime, "image/png");
    assert.equal(r.checksum, crypto.createHash("sha256").update(bytes).digest("hex"));
    response = await fetch(base + `/api/v1/households/household-fixture/receipts/${r.id}?inline=1`, {
      headers,
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-disposition"), /^inline/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    response = await fetch(base + `/api/v1/households/other/receipts/${r.id}`, { headers });
    assert.equal(response.status, 404);
    response = await fetch(base + "/api/v1/auth/logout", { method: "POST", headers, body: "{}" });
    assert.equal(response.status, 200);
    response = await fetch(base + `/api/v1/households/household-fixture/receipts/${r.id}`, { headers });
    assert.equal(response.status, 401);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await fs.rm(dir, { recursive: true, force: true });
  }
});
