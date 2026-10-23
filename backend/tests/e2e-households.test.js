import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { boot, account, key } from "./helpers/http.js";
import { createApp } from "../src/app.js";
import { createMemoryDb } from "./helpers/memory-db.js";
import { frontendRoot } from "../src/config/env.js";

// Dates are relative to today: members join today and the engine refuses expenses dated before a member joined.
const day = (n = 0) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
// Owner A, invited member B, outsider C — the PDF's QA-03..QA-13 scenarios driven through the real HTTP API.
async function household(t) {
  const env = await boot(t),
    a = env.client(),
    b = env.client(),
    c = env.client();
  const A = await account(env, a, "ahmed@example.test", "Ahmed"),
    B = await account(env, b, "salman@example.test", "Salman"),
    C = await account(env, c, "outsider@example.test", "Outsider");
  let r = await a.post("/api/v1/households", { name: "Maple House", type: "hostel", room: "Room 1" });
  assert.equal(r.status, 201);
  const id = r.data.id;
  r = await a.post(`/api/v1/households/${id}/invites`, {
    email: "salman@example.test",
    room: "Room 1",
    role: "owner",
  });
  assert.equal(r.status, 201);
  assert.equal(r.data.expiresInDays, 7);
  assert.equal(
    (await c.post("/api/v1/invites/accept", { token: r.data.token })).status,
    403,
    "wrong identity cannot use the invitation",
  );
  assert.equal((await b.post("/api/v1/invites/accept", { token: r.data.token })).status, 200);
  const state = async (who = a) => (await who.get(`/api/v1/households/${id}`)).data;
  const act = async (who, type, payload, version) =>
    who.post(`/api/v1/households/${id}/actions`, {
      type,
      payload,
      version: version ?? (await state(who)).version,
      idempotencyKey: key(),
    });
  return { env, a, b, c, A, B, C, id, state, act };
}

test("household create/list/read, invitation binding and cross-household isolation", async (t) => {
  const { a, b, c, A, B, id, state } = await household(t);
  assert.equal((await a.post("/api/v1/households", { name: "X", type: "castle" })).status, 400);
  const s = await state();
  assert.equal(s.members.length, 2);
  assert.equal(
    s.members.find((m) => m.id === B.id).role,
    "member",
    "invitations never grant a client-chosen role",
  );
  assert.equal(s._id, undefined);
  assert.equal(s.processedKeys, undefined);
  assert.deepEqual(
    (await b.get("/api/v1/households")).data.map((h) => h.id),
    [id],
  );
  assert.deepEqual((await c.get("/api/v1/households")).data, []);
  assert.equal(
    (await c.get(`/api/v1/households/${id}`)).status,
    404,
    "outsider sees not-found, not forbidden",
  );
  assert.equal((await c.post(`/api/v1/households/${id}/invites`, { email: "x@example.test" })).status, 404);
  assert.equal((await a.post(`/api/v1/households/${id}/invites`, { email: "not-an-address" })).status, 400);
  assert.equal(
    (await a.post(`/api/v1/households/${id}/invites`, { email: "x@example.test", room: "No such room" }))
      .status,
    400,
  );
  assert.equal(A.operator, false, "a household owner is not a platform operator");
  assert.equal((await a.post("/api/v1/operator/unlock", { code: "123456" })).status, 403);
});

test("expense dispatcher: exact pence, funders vs shopper, idempotency, versions and forged payloads", async (t) => {
  const { a, b, A, B, act, state } = await household(t);
  const exp = {
    title: "Weekly shop",
    date: day(0),
    amountPence: 9000,
    category: "Groceries",
    purchasedBy: A.id,
    method: "equal",
    funders: [
      { memberId: B.id, amountPence: 6000 },
      { memberId: A.id, amountPence: 3000 },
    ],
    allocations: [
      { memberId: A.id, amountPence: 4500 },
      { memberId: B.id, amountPence: 4500 },
    ],
  };
  const v = (await state()).version,
    idem = key();
  let r = await a.post(`/api/v1/households/${(await state()).id}/actions`, {
    type: "expense",
    payload: exp,
    version: v,
    idempotencyKey: idem,
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.expenses.length, 1);
  assert.equal(r.data.expenses[0].status, "approved");
  assert.equal(r.data.expenses[0].createdBy, A.id);
  r = await a.post(`/api/v1/households/${r.data.id}/actions`, {
    type: "expense",
    payload: exp,
    version: v,
    idempotencyKey: idem,
  });
  assert.equal(r.status, 200, "replayed idempotency key returns current state");
  assert.equal(r.data.expenses.length, 1, "no duplicate write");
  r = await act(a, "expense", { ...exp, title: "Stale" }, v);
  assert.equal(r.status, 409, "stale version is a conflict");
  r = await a.post(`/api/v1/households/${(await state()).id}/actions`, {
    type: "expense",
    payload: exp,
    version: (await state()).version,
  });
  assert.equal(r.status, 400, "idempotency key required");
  r = await act(a, "member", { name: "Ghost" });
  assert.deepEqual(
    [r.status, r.data.error],
    [400, "Unsupported action."],
    "members join only through verified invitations",
  );
  assert.equal((await act(a, "teleport", {})).data.error, "Unsupported action.");
  r = await act(a, "expense", { ...exp, id: { $ne: null } });
  assert.equal(r.status, 400, "object IDs are rejected");
  r = await act(a, "expense", { ...exp, funders: [{ memberId: A.id, amountPence: 8999 }] });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /Actual funding must equal/);
  r = await act(a, "expense", {
    ...exp,
    allocations: [
      { memberId: A.id, amountPence: 4500 },
      { memberId: "stranger", amountPence: 4500 },
    ],
  });
  assert.match(r.data.error, /Invalid member/);
  r = await act(a, "expense", { ...exp, amountPence: 10.5 });
  assert.equal(r.status, 400);
  r = await act(a, "expense", { ...exp, funders: "not-a-list" });
  assert.equal(r.status, 400, "wrong types are validation errors, not server errors");
  r = await act(b, "disputeExpense", { id: (await state()).expenses[0].id, reason: { $gt: "" } });
  assert.equal(r.status, 400);
  assert.equal(r.data.error, "Give a reason.");
  // Forged client fields are ignored: status/creator/reversal come from the server.
  r = await act(b, "expense", {
    ...exp,
    title: "Forged",
    status: "approved",
    createdBy: A.id,
    reversalOf: "x",
    approvedBy: A.id,
  });
  const forged = r.data.expenses.find((e) => e.title === "Forged");
  assert.equal(forged.createdBy, B.id);
  assert.equal(forged.reversalOf, undefined);
  // Zero-sum in integer pence: an odd penny must be allocated to someone; the server recomputes the sums.
  const odd = {
    ...exp,
    title: "Odd penny",
    amountPence: 1001,
    funders: [{ memberId: A.id, amountPence: 1001 }],
  };
  r = await act(a, "expense", {
    ...odd,
    allocations: [
      { memberId: A.id, amountPence: 500 },
      { memberId: B.id, amountPence: 500 },
    ],
  });
  assert.match(r.data.error, /Cost shares must equal/);
  r = await act(a, "expense", {
    ...odd,
    allocations: [
      { memberId: A.id, amountPence: 501 },
      { memberId: B.id, amountPence: 500 },
    ],
  });
  assert.equal(r.status, 200);
});

test("approvals, disputes, closing, sent-is-not-received and reversals keep history", async (t) => {
  const { a, b, A, B, act, state } = await household(t);
  let r = await act(a, "settings", { name: "Maple House", approvals: true, requireReceipts: false });
  assert.equal(r.data.settings.approvals, true);
  assert.equal((await act(b, "settings", { name: "Hijack" })).data.error, "Admin permission required.");
  r = await act(b, "expense", {
    title: "Shared shop",
    date: day(0),
    amountPence: 9000,
    purchasedBy: A.id,
    funders: [{ memberId: B.id, amountPence: 9000 }],
    allocations: [
      { memberId: A.id, amountPence: 4500 },
      { memberId: B.id, amountPence: 4500 },
    ],
  });
  const e = r.data.expenses[0];
  assert.equal(e.status, "pending");
  r = await act(a, "close", { start: day(0), end: day(10) });
  assert.equal(r.status, 400, "a period with only pending expenses cannot be closed");
  assert.equal((await act(b, "approve", { id: e.id })).data.error, "Admin permission required.");
  assert.equal((await act(a, "approve", { id: e.id })).data.expenses[0].status, "approved");
  assert.equal(
    (await act(b, "disputeExpense", { id: e.id, reason: "Wrong total" })).data.expenses[0].status,
    "disputed",
  );
  assert.equal(
    (await act(a, "resolveExpense", { id: e.id, reason: "Checked receipt" })).data.expenses[0].status,
    "approved",
  );
  assert.equal(
    (await act(b, "close", { start: day(0), end: day(10) })).data.error,
    "Admin permission required.",
  );
  r = await act(a, "close", { start: day(0), end: day(10) });
  assert.equal(r.status, 200);
  const closing = r.data.closings[0],
    p = closing.payments[0];
  assert.match(closing.snapshotHash, /^[a-f0-9]{64}$/);
  assert.deepEqual([p.from, p.to, p.amountPence, p.status], [A.id, B.id, 4500, "requested"]);
  assert.match((await act(a, "close", { start: day(5), end: day(20) })).data.error, /overlaps/);
  assert.match(
    (
      await act(a, "expense", {
        title: "Late",
        date: day(5),
        amountPence: 100,
        purchasedBy: A.id,
        funders: [{ memberId: A.id, amountPence: 100 }],
        allocations: [{ memberId: A.id, amountPence: 100 }],
      })
    ).data.error,
    /locked/,
  );
  const pay = (who, status, reason) =>
    act(who, "payment", { closingId: closing.id, id: p.id, status, reason });
  assert.equal((await pay(b, "sent")).data.error, "Only the payer can mark a transfer sent.");
  assert.equal((await pay(b, "received")).data.error, "The payer must mark this transfer sent first.");
  r = await pay(a, "sent");
  assert.equal(r.data.closings[0].payments[0].status, "sent", "payer declared sent");
  assert.equal((await pay(a, "received")).data.error, "Only the recipient can confirm money received.");
  r = await pay(b, "received");
  assert.equal(r.data.closings[0].payments[0].status, "received", "only the recipient confirms");
  const again = await pay(b, "received");
  assert.equal(again.data.version, r.data.version, "confirming twice changes nothing");
  // Reversal: original locked record untouched; linked correction in an open period.
  assert.match(
    (await act(a, "reverse", { id: e.id, date: day(3), reason: "Refund" })).data.error,
    /open period/,
  );
  r = await act(a, "reverse", { id: e.id, date: day(11), reason: "Shop refunded" });
  assert.equal(r.status, 200);
  const original = r.data.expenses.find((x) => x.id === e.id),
    reversal = r.data.expenses.find((x) => x.reversalOf === e.id);
  assert.equal(original.status, "approved");
  assert.equal(reversal.amountPence, original.amountPence);
  assert.match(
    (await act(a, "reverse", { id: e.id, date: day(11), reason: "again" })).data.error,
    /Already reversed/,
  );
  r = await act(a, "book", {
    id: "book-1",
    date: day(12),
    type: "income",
    description: "Deposit",
    amountPence: 5000,
  });
  assert.equal(r.data.books[0].amountPence, 5000);
  assert.equal(
    (await act(b, "book", { date: day(12), type: "income", description: "X", amountPence: 1 })).data.error,
    "Admin permission required.",
  );
  const audit = (await state()).audit.map((x) => x.action);
  for (const action of [
    "settings",
    "expense",
    "approve",
    "disputeExpense",
    "resolveExpense",
    "close",
    "payment",
    "reverse",
    "book",
  ])
    assert.ok(audit.includes(action), "audited: " + action);
});

test("rooms, roles and removal: owner/admin boundaries; removed member loses household and receipt access", async (t) => {
  const { env, a, b, A, B, id, act, state } = await household(t);
  const png = await fs.readFile(new URL("./fixtures/Receipt-OCR-Test.png", import.meta.url));
  let r = await b.post(`/api/v1/households/${id}/receipts`, {
    name: "shop.png",
    data: "data:image/png;base64," + png.toString("base64"),
  });
  assert.equal(r.status, 201);
  const receiptId = r.data.id;
  assert.equal((await act(b, "roomCreate", { name: "Studio" })).data.error, "Admin permission required.");
  assert.ok((await act(a, "roomCreate", { name: "Studio" })).data.rooms.includes("Studio"));
  assert.match((await act(a, "roomCreate", { name: "studio" })).data.error, /already exists/);
  r = await act(a, "memberUpdate", { id: B.id, name: "Salman K", room: "Studio" });
  assert.equal(r.data.members.find((m) => m.id === B.id).room, "Studio");
  assert.match((await act(a, "roomDelete", { room: "Studio" })).data.error, /Move all active members/);
  assert.match((await act(a, "memberRole", { id: A.id, role: "admin" })).data.error, /own role/);
  assert.equal(
    (await act(b, "memberRole", { id: B.id, role: "admin" })).data.error,
    "Admin permission required.",
  );
  r = await act(a, "memberRole", { id: B.id, role: "admin" });
  assert.equal(r.data.members.find((m) => m.id === B.id).role, "admin");
  assert.match(
    (await act(b, "memberRole", { id: A.id, role: "member" })).data.error,
    /owner role is protected/,
  );
  assert.match(
    (await act(b, "memberRemove", { id: A.id, confirm: true })).data.error,
    /owner cannot be removed/,
  );
  assert.equal(
    (await act(a, "memberRole", { id: B.id, role: "owner" })).data.error,
    "Choose admin or member.",
  );
  assert.equal((await act(a, "memberRemove", { id: B.id })).data.error, "Confirm removal.");
  assert.equal(
    (await act(a, "memberRemove", { id: B.id, confirm: "true" })).data.error,
    "Confirm removal.",
    "confirm must be boolean true",
  );
  r = await act(a, "memberRemove", { id: B.id, confirm: true });
  assert.ok(r.data.members.find((m) => m.id === B.id).left);
  assert.equal((await b.get(`/api/v1/households/${id}`)).status, 404, "removed member loses access");
  assert.equal(
    (await b.get(`/api/v1/households/${id}/receipts/${receiptId}`)).status,
    404,
    "removed member cannot download receipts",
  );
  assert.equal(
    (await a.get(`/api/v1/households/${id}/receipts/${receiptId}`)).status,
    200,
    "receipt evidence retained for remaining members",
  );
  assert.equal(env.db.raw.get("receipts").docs.length, 1);
  r = await act(a, "roomDelete", { room: "Studio" });
  assert.ok(!r.data.rooms.includes("Studio"), "empty room can be deleted after the member left");
  assert.equal((await state()).members.length, 2, "history retained: removed member is kept, marked left");
});

test("receipts: type/signature/size checks, byte-exact private download, inline view, isolation", async (t) => {
  const { a, c, A, id, act } = await household(t);
  const png = await fs.readFile(new URL("./fixtures/Receipt-OCR-Test.png", import.meta.url));
  const up = (who, name, data) => who.post(`/api/v1/households/${id}/receipts`, { name, data });
  let r = await up(a, "../../etc/passwd.png", "data:image/png;base64," + png.toString("base64"));
  assert.equal(r.status, 201);
  assert.equal(r.data.name, ".._.._etc_passwd.png", "file names are sanitised; storage uses server IDs");
  assert.equal(r.data.checksum, crypto.createHash("sha256").update(png).digest("hex"));
  const rid = r.data.id;
  const dl = await a.get(`/api/v1/households/${id}/receipts/${rid}`);
  assert.equal(dl.status, 200);
  assert.match(dl.headers.get("content-disposition"), /^attachment; filename=/);
  assert.equal(dl.headers.get("x-content-type-options"), "nosniff");
  assert.equal(dl.headers.get("cache-control"), "no-store");
  assert.match(
    (await a.get(`/api/v1/households/${id}/receipts/${rid}?inline=1`)).headers.get("content-disposition"),
    /^inline/,
  );
  for (const pdf of ["SplitWisee-v1.2.0-Sample-Receipt.pdf", "SplitWisee-v1.2.1-Sample-Receipt.pdf"]) {
    const bytes = await fs.readFile(new URL("./fixtures/" + pdf, import.meta.url));
    r = await up(a, pdf, "data:application/pdf;base64," + bytes.toString("base64"));
    assert.equal(r.status, 201, pdf);
    assert.equal(r.data.bytes, bytes.length);
  }
  assert.equal(
    (
      await up(
        a,
        "fake.png",
        "data:image/png;base64," + Buffer.from("<script>alert(1)</script>").toString("base64"),
      )
    ).status,
    400,
    "content signature must match",
  );
  assert.equal(
    (await up(a, "x.gif", "data:image/gif;base64,R0lGODlhAQABAAAAACw=")).status,
    400,
    "unsupported type",
  );
  assert.equal(
    (await up(a, "x.svg", "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")).status,
    400,
    "SVG is never accepted",
  );
  const big = Buffer.alloc(12 * 1024 * 1024 + 10);
  big.write("%PDF-");
  r = await up(a, "big.pdf", "data:application/pdf;base64," + big.toString("base64"));
  assert.equal(r.status, 400);
  assert.match(r.data.error, /under 12 MB/);
  assert.equal((await c.get(`/api/v1/households/${id}/receipts/${rid}`)).status, 404, "outsider cannot read");
  assert.equal(
    (
      await c.post(`/api/v1/households/${id}/receipts`, {
        name: "x.png",
        data: "data:image/png;base64," + png.toString("base64"),
      })
    ).status,
    404,
    "outsider cannot upload",
  );
  assert.equal(
    (await a.get(`/api/v1/households/${id}/receipts/..%2F..%2Fpackage.json`)).status,
    404,
    "path traversal is not possible",
  );
  // An expense can only reference the actor's own upload in this household, by exact string ID.
  const exp = {
    title: "With receipt",
    date: day(0),
    amountPence: 100,
    purchasedBy: A.id,
    funders: [{ memberId: A.id, amountPence: 100 }],
    allocations: [{ memberId: A.id, amountPence: 100 }],
  };
  assert.equal(
    (await act(a, "expense", { ...exp, receipt: { id: { $ne: null } } })).data.error,
    "Receipt not found.",
  );
  r = await act(a, "expense", {
    ...exp,
    receipt: { id: rid, name: "evil.html", data: "data:text/html,boom" },
  });
  assert.equal(r.status, 200);
  const saved = r.data.expenses[0].receipt;
  assert.deepEqual([saved.id, saved.mime, saved.data], [rid, "image/png", undefined]);
});

test("receipt storage directory: relative paths work, public locations are refused", async (t) => {
  const db = createMemoryDb(),
    cwd = process.cwd(),
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "sw-rel-"));
  t.after(async () => {
    process.chdir(cwd);
    await fs.rm(tmp, { recursive: true, force: true });
  });
  process.chdir(tmp);
  await createApp(db, { origin: "https://x.test", receiptDir: "./private-receipts" });
  await fs.access(path.join(tmp, "private-receipts"));
  process.chdir(cwd);
  await assert.rejects(
    () => createApp(db, { origin: "https://x.test", receiptDir: path.join(frontendRoot, "dist", "uploads") }),
    /must not be inside the frontend folder/,
  );
  await assert.rejects(
    () => createApp(db, { origin: "https://x.test", receiptDir: frontendRoot }),
    /must not be inside/,
  );
});

test("receipt download works when RECEIPT_DIR is relative (v1.2.6 regression: res.sendFile needs an absolute path)", async (t) => {
  const cwd = process.cwd(),
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "sw-rel2-"));
  t.after(async () => {
    process.chdir(cwd);
    await fs.rm(tmp, { recursive: true, force: true });
  });
  process.chdir(tmp);
  const env = await boot(t, {});
  // boot() uses an absolute temp dir; build a second app on the same DB with a relative directory.
  const app = await createApp(env.db, {
    origin: "https://splitwisee.test",
    receiptDir: "./rel-receipts",
    sendCode: async () => {},
  });
  process.chdir(cwd);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(
    () =>
      new Promise((r) => {
        server.closeAllConnections();
        server.close(r);
      }),
  );
  const { client } = await import("./helpers/http.js");
  const c = client(`http://127.0.0.1:${server.address().port}`),
    a = env.client();
  await account(env, a, "rel@example.test");
  const login = await c.post("/api/v1/auth/login", {
    email: "rel@example.test",
    password: "correct horse battery 42",
  });
  assert.equal(login.status, 200);
  const h = await c.post("/api/v1/households", { name: "Rel", type: "flat" });
  const png = await fs.readFile(new URL("./fixtures/Receipt-OCR-Test.png", import.meta.url));
  const up = await c.post(`/api/v1/households/${h.data.id}/receipts`, {
    name: "r.png",
    data: "data:image/png;base64," + png.toString("base64"),
  });
  assert.equal(up.status, 201);
  const dl = await c.get(`/api/v1/households/${h.data.id}/receipts/${up.data.id}`);
  assert.equal(dl.status, 200, JSON.stringify(dl.data).slice(0, 200));
});
