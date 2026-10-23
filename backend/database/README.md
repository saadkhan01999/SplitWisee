# MongoDB: validators, indexes and initializer

| File | Purpose |
|---|---|
| `schema.js` | Registry of collection validators. |
| `models/*.js` | One `$jsonSchema` validator per collection. |
| `indexes.js` | Every index (single source of truth). |
| `init.js` | Additive initializer: applies validators and indexes, never deletes or inserts data. The API runs it on start; `npm run db:init` runs it on its own. |
| `compose.yml` | Optional local MongoDB 7 replica set bound to loopback (development only). |

There is no seed or demo data. Every record is created through the API by real sign-ups and household activity.

## Choose a database

**MongoDB Atlas (recommended).** Create a cluster (any tier, it is a replica set), a database user, and an IP access-list entry for your machine or server. Copy the `mongodb+srv://` connection string into `backend/.env`:

```ini
MONGODB_URI=mongodb+srv://<user>:<url-encoded-password>@<cluster-host>/?retryWrites=true&w=majority&appName=SplitWisee
MONGODB_DB=splitwisee_dev
```

**Local Docker.** Requires Docker Desktop:

```sh
docker compose -f database/compose.yml up -d
```

```ini
MONGODB_URI=mongodb://localhost:27017/?replicaSet=rs0&directConnection=true
MONGODB_DB=splitwisee_dev
```

A replica set is required: coupon redemption and welcome benefits use multi-document transactions. A standalone `mongod` starts, but those operations fail.

Then, from `backend/`:

```sh
npm run dev
```

The API creates collections, validators and indexes on first start. `npm run db:init` does the same without starting the server, which is useful in CI or with a separate migration user.

## Atlas permissions

The built-in `readWrite` role can create collections and indexes but not change validators (`collMod`). The API tolerates that on start and logs a notice. Apply validators once per release with a user that has `dbAdmin` on the database:

```sh
MONGODB_URI="<migration-user-uri>" npm run db:init
```

Use separate database users for the application (`readWrite`), migrations (`dbAdmin`), and backups.

## Data map

| Collection | Purpose and key relationships |
|---|---|
| users | Identity, verified email/phone/Google subject, subscription summary, referral code. String `id` is referenced elsewhere. |
| households | One aggregate: members, expense snapshots, closings, bookkeeping, audit and version. A member ID references `users.id`. Amounts are integer pence. |
| sessions | SHA-256 hash of the opaque cookie, userId, CSRF token, expiry and temporary operator unlock. TTL expiry. |
| tokens | Hashed verification, invitation and OAuth challenges with recipient, household and expiry. TTL. |
| throttles | Rate-limit counters and sign-in failure locks. Keys are SHA-256 digests (no raw IPs or emails). TTL. |
| receipts | Private file metadata: householdId, uploaderId, MIME, checksum and size. File bytes live in `RECEIPT_DIR`, never in public web assets. |
| referrals | One qualifying event per referred user. The owner receives an access month or a Stripe invoice credit. |
| welcomeBenefits | Unique per user. One welcome month across referral, invitation and coupon. |
| coupons | Unique code, one month, usage cap, used count, expiry date and enabled state. |
| couponRedemptions | Unique per user: coupon code and redemption time. |
| accessGrants | Audited operator-granted access months with a unique request ID for idempotency. |
| billingEvents | Signed Stripe webhook event IDs and completion state for retries. |
| paymentRecords | Invoice summaries and refund references. Card numbers are never stored. |
| operatorAudit | Operator, action, reason and requested/completed/failed status. |
| platformSettings | `public`: homepage copy, announcement, support email, maintenance banner. `owner-bank`: AES-256-GCM ciphertext and masked metadata (never public). |
| platformBankEntries | Append-only platform income and cost records. Voiding flags a record and keeps the original. |
| retentionCampaigns | Campaign drafts only; there is no automated delivery. |
| supportTickets | Authenticated user requests and operator resolution notes. |

## Integrity and limits

- Household writes require `id` plus `version` (optimistic concurrency) and keep original expense snapshots. Money is stored as integer GBP pence.
- Locked months are immutable; corrections are new entries.
- Operator lists are bounded: 200 users or households, 500 other records, 100 audit entries. Add cursor pagination before scaling beyond a pilot.
- A household has a 12 MB application limit, below MongoDB's 16 MB document ceiling. Large deployments should move expenses to an append-only collection.

## Upgrading an existing database

Back up the database and the receipt folder first. Keep the existing `MONGODB_DB` value to keep the data. `init.js` is additive: new collections, validators and indexes are applied, and nothing is removed. Records created by older versions remain valid without a backfill.
