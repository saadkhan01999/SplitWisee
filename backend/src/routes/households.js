import { cleanReceiptScan } from "../modules/receipts/metadata.js";
import { applyAction, uid } from "../modules/calculation-engine/index.js";
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const SPLIT_METHODS = ["equal", "fixed", "percent", "weight", "items"];
const REF = /^[A-Za-z0-9_-]{1,100}$/;

export function requireMember(s, id) {
  if (!s?.members.some((m) => m.id === id && !m.left)) fail("Household not found.", 404);
  return s.members.find((m) => m.id === id);
}

// Explicit expense snapshot: never trusts client-supplied status, creator, reversal or receipt bytes.
export function cleanExpense(p) {
  const id = p.id === undefined || p.id === null || p.id === "" ? uid() : String(p.id);
  if (!REF.test(id)) fail("Invalid expense reference.");
  const rows = (list) =>
    Array.isArray(list)
      ? list.slice(0, 200).map((x) => ({ memberId: x?.memberId, amountPence: x?.amountPence }))
      : undefined;
  return {
    id,
    title: String(p.title || ""),
    date: String(p.date || ""),
    category: String(p.category || "Other").slice(0, 50),
    amountPence: p.amountPence,
    purchasedBy: p.purchasedBy,
    method: SPLIT_METHODS.includes(p.method) ? p.method : undefined,
    status: p.status === "draft" ? "draft" : "submitted",
    funders: rows(p.funders),
    allocations: rows(p.allocations),
    receiptScan: cleanReceiptScan(p.receiptScan),
    items: Array.isArray(p.items)
      ? p.items.slice(0, 200).map((i) => ({
          title: String(i?.title || "").slice(0, 140),
          amount: String(i?.amount || "").slice(0, 20),
          members: Array.isArray(i?.members) ? i.members.slice(0, 200).map(String) : [],
        }))
      : void 0,
    receipt: p.receipt?.id
      ? { id: String(p.receipt.id).slice(0, 100), name: String(p.receipt.name || "Receipt").slice(0, 120) }
      : null,
  };
}

// Allowlisted payload fields per action. Only types are enforced here; the calculation engine and
// modules/households rules remain the single source of business validation (lengths, roles, dates, money).
const str = (v) => (typeof v === "string" ? v : undefined);
const ref = (v) => (typeof v === "string" && REF.test(v) ? v : undefined);
const PAYLOADS = {
  submit: (p) => ({ id: ref(p.id) }),
  approve: (p) => ({ id: ref(p.id) }),
  disputeExpense: (p) => ({ id: ref(p.id), reason: str(p.reason) }),
  resolveExpense: (p) => ({ id: ref(p.id), reason: str(p.reason) }),
  reverse: (p) => ({ id: ref(p.id), date: str(p.date), reason: str(p.reason) }),
  close: (p) => ({ start: str(p.start), end: str(p.end) }),
  payment: (p) => ({
    closingId: ref(p.closingId),
    id: ref(p.id),
    status: str(p.status),
    reason: str(p.reason),
  }),
  settings: (p) => ({ name: str(p.name), approvals: !!p.approvals, requireReceipts: !!p.requireReceipts }),
  book: (p) => ({
    id: ref(p.id),
    date: str(p.date),
    type: str(p.type),
    description: str(p.description),
    category: str(p.category),
    amountPence: p.amountPence,
  }),
  roomCreate: (p) => ({ name: str(p.name) }),
  roomRename: (p) => ({ room: str(p.room), name: str(p.name) }),
  roomDelete: (p) => ({ room: str(p.room) }),
  memberUpdate: (p) => ({ id: ref(p.id), name: str(p.name), room: str(p.room) }),
  memberRole: (p) => ({ id: ref(p.id), role: str(p.role) }),
  memberRemove: (p) => ({ id: ref(p.id), confirm: p.confirm === true }),
};
export const ACTION_TYPES = ["expense", ...Object.keys(PAYLOADS)];
export function cleanActionPayload(type, payload) {
  const p = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  if (type === "expense") return cleanExpense(p);
  if (!Object.hasOwn(PAYLOADS, type)) fail("Unsupported action.");
  return PAYLOADS[type](p);
}

export const publicState = (s) => {
  const { _id, processedKeys, ...rest } = s;
  return rest;
};

export function createHouseholdLoader(households) {
  return async function load(req) {
    const s = await households.findOne({ id: String(req.params.id) });
    requireMember(s, req.user.id);
    if (s.suspended) fail("This household is suspended.", 403);
    return s;
  };
}

export function installHouseholds(app, { db, session, endpoint, load, requirePaid, hash }) {
  const households = db.collection("households"),
    receipts = db.collection("receipts");
  app.get(
    "/api/v1/households",
    session,
    endpoint(async (req, res) => {
      const list = await households
        .find(
          { members: { $elemMatch: { id: req.user.id, left: { $exists: false } } } },
          { projection: { id: 1, name: 1, type: 1, _id: 0 } },
        )
        .toArray();
      res.json(list);
    }),
  );
  app.post(
    "/api/v1/households",
    session,
    endpoint(async (req, res) => {
      const name = String(req.body.name || "").trim();
      if (
        !name ||
        name.length > 100 ||
        !["house", "flat", "room", "family", "hostel"].includes(req.body.type)
      )
        fail("Enter a household name and valid type.");
      const s = {
        id: uid(),
        name,
        type: req.body.type,
        currency: "GBP",
        version: 1,
        settings: { approvals: false, requireReceipts: false },
        members: [
          {
            id: req.user.id,
            name: req.user.name,
            role: "owner",
            room: String(req.body.room || "Room 1").slice(0, 60),
            joined: new Date().toISOString().slice(0, 10),
          },
        ],
        expenses: [],
        closings: [],
        audit: [
          {
            id: uid(),
            actorId: req.user.id,
            action: "household created",
            detail: name,
            at: new Date().toISOString(),
          },
        ],
        processedKeys: [],
      };
      await households.insertOne(s);
      delete s._id;
      delete s.processedKeys;
      res.status(201).json(s);
    }),
  );
  app.get(
    "/api/v1/households/:id",
    session,
    endpoint(async (req, res) => res.json(publicState(await load(req)))),
  );
  app.post(
    "/api/v1/households/:id/actions",
    session,
    requirePaid,
    endpoint(async (req, res) => {
      const s = await load(req);
      const { type, version, idempotencyKey } = req.body;
      if (typeof idempotencyKey !== "string" || idempotencyKey.length > 100 || idempotencyKey.length < 8)
        fail("Provide an idempotency key.");
      if (s.processedKeys?.includes(idempotencyKey)) return res.json(publicState(s));
      if (version !== s.version)
        fail("Someone changed this household. Refresh and review before saving.", 409);
      const payload = cleanActionPayload(type, req.body.payload);
      if (type === "expense" && payload.receipt) {
        const receipt = await receipts.findOne({
          id: payload.receipt.id,
          householdId: s.id,
          uploaderId: req.user.id,
        });
        if (!receipt) fail("Receipt not found.");
        payload.receipt.name = receipt.name;
        payload.receipt.mime = receipt.mime;
        payload.receipt.bytes = receipt.bytes;
        payload.receipt.checksum = receipt.checksum;
      }
      const next = applyAction(s, { type, payload }, req.user.id);
      if (next === s) return res.json(publicState(s));
      if (type === "close") {
        const c = next.closings[0];
        c.snapshotHash = hash(
          JSON.stringify({
            lines: c.lines,
            expenseIds: c.expenseIds,
            engine: c.engine,
            start: c.start,
            end: c.end,
          }),
        );
      }
      next.processedKeys = [...(s.processedKeys || []), idempotencyKey];
      delete next._id;
      if (Buffer.byteLength(JSON.stringify(next)) > 12 * 1024 * 1024)
        fail(
          "Household reached this pilot build’s storage limit. Export and archive before adding more records.",
          413,
        );
      const result = await households.replaceOne({ id: s.id, version: s.version }, next);
      if (!result.matchedCount) fail("Concurrent update. Refresh and try again.", 409);
      res.json(publicState(next));
    }),
  );
}
