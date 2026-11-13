import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { uid } from "../modules/calculation-engine/index.js";
import { retentionByReceipt } from "../services/retention.js";
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
export const MAX_RECEIPT_BYTES = 12 * 1024 * 1024;
// The only route allowed a large JSON body (base64 of a 12 MB file); parsed only after session, entitlement and rate checks.
export const RECEIPT_UPLOAD_PATH = /^\/api\/v1\/households\/[^/]+\/receipts\/?$/;

// Original receipt bytes are stored privately under RECEIPT_DIR (never inside the public frontend) and are only
// readable by a current household member through the authenticated, no-store download route.
export function installReceipts(
  app,
  { db, session, endpoint, load, requirePaid, receiptDir, hash, uploadLimiter },
) {
  const receipts = db.collection("receipts");
  app.post(
    "/api/v1/households/:id/receipts",
    session,
    requirePaid,
    uploadLimiter,
    express.json({ limit: "18mb" }),
    endpoint(async (req, res) => {
      await load(req);
      const data = String(req.body?.data || "");
      const match =
        /^data:(image\/jpeg|image\/png|image\/webp|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(data);
      if (!match) fail("Use a JPEG, PNG, WebP or PDF receipt.");
      const bytes = Buffer.from(match[2], "base64");
      if (bytes.length > MAX_RECEIPT_BYTES || bytes.length < 8) fail("Receipt must be under 12 MB.");
      const mime = match[1];
      if (
        (mime === "image/jpeg" && !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)) ||
        (mime === "image/png" && bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") ||
        (mime === "image/webp" &&
          !(bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP")) ||
        (mime === "application/pdf" && bytes.subarray(0, 5).toString() !== "%PDF-")
      )
        fail("File content does not match the stated type.");
      const id = uid(),
        name = String(req.body.name || "Receipt")
          .replace(/[^a-zA-Z0-9_. -]/g, "_")
          .slice(0, 120);
      await fs.writeFile(path.join(receiptDir, id), bytes, { flag: "wx", mode: 384 });
      try {
        await receipts.insertOne({
          id,
          householdId: req.params.id,
          uploaderId: req.user.id,
          name,
          mime,
          checksum: hash(bytes),
          bytes: bytes.length,
          createdAt: new Date(),
          scanStatus: "not-scanned",
        });
      } catch (e) {
        await fs.unlink(path.join(receiptDir, id));
        throw e;
      }
      res
        .status(201)
        .json({ id, name, mime, bytes: bytes.length, checksum: hash(bytes), scanStatus: "client-review" });
    }),
  );
  // Receipt records with their retention dates: the original file is kept until one month after its period locks.
  app.get(
    "/api/v1/households/:id/receipts",
    session,
    endpoint(async (req, res) => {
      const household = await load(req);
      const until = retentionByReceipt(household);
      const list = await receipts
        .find(
          { householdId: household.id },
          { projection: { _id: 0, id: 1, name: 1, mime: 1, bytes: 1, createdAt: 1, purgedAt: 1 } },
        )
        .sort({ createdAt: -1 })
        .limit(2000)
        .toArray();
      res.json({
        legalHold: !!household.legalHold?.active,
        receipts: list.map((r) => ({ ...r, retentionUntil: until.get(r.id) ?? null })),
      });
    }),
  );
  app.get(
    "/api/v1/households/:id/receipts/:receiptId",
    session,
    endpoint(async (req, res) => {
      await load(req);
      const r = await receipts.findOne({
        id: String(req.params.receiptId),
        householdId: String(req.params.id),
      });
      if (!r) fail("Receipt not found.", 404);
      if (r.purgedAt)
        fail(
          `The original file was removed on ${new Date(r.purgedAt).toISOString().slice(0, 10)} under the receipt retention policy. The expense, its receipt details and the closing sheet are kept.`,
          410,
        );
      res.set({
        "Content-Type": r.mime,
        "Content-Disposition": `${req.query.inline === "1" ? "inline" : "attachment"}; filename="${r.name}"`,
        "X-Content-Type-Options": "nosniff",
      });
      // receiptDir is absolute (resolveReceiptDir); r.id is a server-generated UUID, never a client path.
      res.sendFile(path.join(receiptDir, r.id));
    }),
  );
}
