// Single source of truth for MongoDB indexes (previously spread across server, platform and promotions modules;
// the specifications below are unchanged from v1.2.6 except the additive `throttles` entries).
// Additive only: never drops collections. The only removal is the legacy non-sparse users.email_1 index.
export const INDEXES = [
  ["users", { email: 1 }, { unique: true, sparse: true }],
  ["users", { id: 1 }, { unique: true }],
  ["users", { phone: 1 }, { unique: true, sparse: true }],
  ["users", { googleSub: 1 }, { unique: true, sparse: true }],
  ["users", { referralCode: 1 }, { unique: true, sparse: true }],
  ["sessions", { id: 1 }, { unique: true }],
  ["sessions", { expiresAt: 1 }, { expireAfterSeconds: 0 }],
  ["tokens", { id: 1 }, { unique: true }],
  ["tokens", { expiresAt: 1 }, { expireAfterSeconds: 0 }],
  ["households", { id: 1 }, { unique: true }],
  ["households", { "members.id": 1 }, {}],
  ["receipts", { id: 1 }, { unique: true }],
  ["receipts", { householdId: 1, createdAt: 1 }, {}],
  ["referrals", { referredUserId: 1 }, { unique: true }],
  ["referrals", { ownerId: 1, at: 1 }, {}],
  ["welcomeBenefits", { id: 1 }, { unique: true }],
  ["welcomeBenefits", { ownerId: 1 }, {}],
  ["coupons", { code: 1 }, { unique: true }],
  ["couponRedemptions", { userId: 1 }, { unique: true }],
  ["accessGrants", { id: 1 }, { unique: true }],
  ["accessGrants", { ownerId: 1 }, {}],
  ["billingEvents", { id: 1 }, { unique: true }],
  ["paymentRecords", { id: 1 }, { unique: true }],
  ["operatorAudit", { at: -1 }, {}],
  ["platformBankEntries", { id: 1 }, { unique: true }],
  ["platformBankEntries", { date: 1 }, {}],
  ["platformSettings", { id: 1 }, { unique: true }],
  ["retentionCampaigns", { id: 1 }, { unique: true }],
  ["supportTickets", { id: 1 }, { unique: true }],
  // v1.2.7: shared rate-limit windows and authentication failure locks. Bounded by TTL; one document per active key.
  ["throttles", { key: 1 }, { unique: true }],
  ["throttles", { expiresAt: 1 }, { expireAfterSeconds: 0 }],
];

export async function ensureIndexes(db) {
  const existing = await db
    .collection("users")
    .listIndexes()
    .toArray()
    .catch(() => []);
  const old = existing.find((i) => i.name === "email_1" && !i.sparse);
  if (old) await db.collection("users").dropIndex("email_1");
  for (const [collection, keys, options] of INDEXES)
    await db.collection(collection).createIndex(keys, options);
}
