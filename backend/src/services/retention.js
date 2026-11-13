import fs from "node:fs/promises";
import path from "node:path";
import { londonToday, RETENTION_MONTHS, retentionDate } from "../modules/periods/index.js";

// Original receipt files are kept for one extra month after their period is locked. Removal only ever happens once
// the platform owner has approved the policy, never for a household on legal hold, and it removes the original file
// only: the receipt record (name, size, checksum), the expense, the frozen closing sheet and all audit history stay.

export const RETENTION_SETTINGS_ID = "retention";

export async function retentionSettings(db) {
  const saved = await db.collection("platformSettings").findOne({ id: RETENTION_SETTINGS_ID });
  return {
    approved: saved?.approved === true,
    months: RETENTION_MONTHS,
    approvedAt: saved?.approvedAt ?? null,
    approvedBy: saved?.approvedBy ?? null,
    lastRunAt: saved?.lastRunAt ?? null,
    lastRunRemoved: saved?.lastRunRemoved ?? 0,
  };
}

/** Receipt id → the date its original file may be removed (only receipts in locked periods have one). */
export function retentionByReceipt(household) {
  const out = new Map();
  for (const closing of household.closings || []) {
    const until = closing.retentionUntil ?? retentionDate(closing.createdAt);
    const ids = new Set(closing.expenseIds || []);
    for (const expense of household.expenses || [])
      if (ids.has(expense.id) && expense.receipt?.id) out.set(expense.receipt.id, until);
  }
  return out;
}

/**
 * Removes original receipt files whose retention date has passed. Returns counts; does nothing unless approved.
 * Safe to run repeatedly: removed receipts are marked and skipped.
 */
export async function purgeExpiredReceipts(db, receiptDir, { now = new Date(), actorId = "system" } = {}) {
  const settings = await retentionSettings(db);
  if (!settings.approved) return { approved: false, removed: 0, held: 0, households: 0 };
  const today = londonToday(now);
  const receipts = db.collection("receipts");
  let removed = 0,
    held = 0,
    households = 0;
  for await (const household of db
    .collection("households")
    .find({}, { projection: { _id: 0, id: 1, closings: 1, expenses: 1, legalHold: 1 } })) {
    if (!household.closings?.length) continue;
    const due = [...retentionByReceipt(household)].filter(([, until]) => until < today).map(([id]) => id);
    if (!due.length) continue;
    if (household.legalHold?.active) {
      held += due.length;
      continue;
    }
    households++;
    for (const id of due) {
      const record = await receipts.findOne({ id, householdId: household.id, purgedAt: { $exists: false } });
      if (!record) continue;
      try {
        await fs.unlink(path.join(receiptDir, record.id));
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      await receipts.updateOne(
        { id: record.id },
        {
          $set: {
            purgedAt: now,
            purgeReason: "retention",
            retentionUntil: retentionByReceipt(household).get(id),
          },
        },
      );
      removed++;
    }
  }
  await db
    .collection("platformSettings")
    .updateOne(
      { id: RETENTION_SETTINGS_ID },
      { $set: { lastRunAt: now, lastRunRemoved: removed } },
      { upsert: true },
    );
  await db.collection("operatorAudit").insertOne({
    id: globalThis.crypto.randomUUID(),
    actorId,
    action: `Receipt retention run: ${removed} original ${removed === 1 ? "file" : "files"} removed, ${held} on legal hold`,
    at: now,
    status: "completed",
  });
  return { approved: true, removed, held, households };
}
