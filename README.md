# SplitWisee v1.3.0

Shared household expenses for flats, houses, families and hostels: receipt scanning, exact-pence splits, monthly
closings, member-to-member repayment tracking, bookkeeping, referrals and a £0.99/month subscription, plus a separate
console for the single platform owner.

The project is two independent packages:

| Package | Stack | Development | Production |
|---|---|---|---|
| [`backend/`](backend) | Node.js 22+, Express 5, MongoDB driver 6 (replica set), Argon2id, Stripe | `npm run dev` → <http://localhost:5000> | systemd or Docker service behind Nginx |
| [`frontend/`](frontend) | React 19, Redux Toolkit, Vite 8, Tesseract.js + PDF.js (in-browser OCR), jsPDF | `npm run dev` → <http://localhost:5173> | static files from `npm run build` |

There is no demo mode, seed data or sample household: every record comes from real sign-ups through the API.

## Quick start

Requirements: Node.js 22.9 or newer, and a MongoDB replica set (MongoDB Atlas, or Docker with
`backend/database/compose.yml`).

```bash
# 1. API
cd backend
npm ci
cp .env.example .env          # Windows: Copy-Item .env.example .env
#    edit .env: paste your Atlas connection string into MONGODB_URI
npm run dev                   # http://localhost:5000/api/health → {"status":"ok"}

# 2. Web app (second terminal)
cd frontend
npm ci
cp .env.example .env
npm run dev                   # http://localhost:5173 (member app) and /admin/ (operator console)
```

The Vite dev server proxies `/api` to the API, so the browser sees one origin (`APP_ORIGIN=http://localhost:5173`).
Without SMTP, `DEV_SHOW_EMAIL_CODES=true` prints sign-in codes in the API terminal (development only). On first start
the API creates its collections, validators and indexes in `MONGODB_DB`.

## Repository layout

```text
backend/
  src/
    app.js, server.js        Express app (JSON only) and the process entry point
    config/                  environment checks, receipt folder guard
    middleware/              security headers, sessions, CSRF/Origin, CORS, rate limits, errors
    routes/                  auth, account, households, invitations, receipts, platform, finance, admin
    modules/                 pure business rules shared with the web app (calculation engine, households,
                             receipt metadata, site settings, platform accounting)
    models/                  profile input cleaning and safe views
    services/, providers/    throttles, promotions, email/SMS/Google/Stripe adapters
  database/                  validators, indexes, initializer (no seed data)
  scripts/                   preflight (production readiness), route listing
  tests/                     node:test suites (+ opt-in real-MongoDB test)
  docs/                      API_REFERENCE.md, api/openapi.yaml, handover/ acceptance checklist
frontend/
  index.html, admin/index.html   member app and operator console entry points
  src/
    app/                     store, routing, bootstrap, preferences, hooks
    api/                     REST client (cookies + CSRF)
    components/              shared UI (Button, Field, Modal, Toast, …)
    features/                auth, dashboard, expenses, receipts (OCR, PDF), settlements, reports, bookkeeping,
                             household, rewards, bank, settings, calculator, website, install (PWA), layout
    styles/                  app, responsive and calculator styles
    service-worker.js        offline page and static-asset cache (published as /sw.js)
  admin/src/                 operator console (Redux store, dashboard, finance, statements)
  vite/                      build plugins: OCR assets, site metadata and CSP, service worker
  tests/                     Vitest + Testing Library (+ real Tesseract OCR test)
deploy/                      Nginx site config, security headers, systemd unit
docs/                        deployment guide, production readiness, requirements traceability, test results
```

## State management

Redux Toolkit holds application state; forms keep local component state.

| Slice | Holds |
|---|---|
| `session` | signed-in user, onboarding step, pending invitation |
| `household` | household list, the open household, save status; selectors for balances, members, roles |
| `navigation` | current page and tab, kept in step with the address bar (`#app/expenses`) |
| `ui` | theme, text size, layout, toast, open dialog |
| `site` | public website settings and enabled sign-in providers |
| `rewards` | referral code, earned months, free-access window |
| `calculator` | calculator entry, expression and history |
| `operator` (console) | unlock state, platform overview, finance report |

Household writes go through one thunk (`runHouseholdAction`) that sends the household `version` and an idempotency
key; on a conflict it reloads the latest household.

## Scripts

| Package | Command | Does |
|---|---|---|
| backend | `npm run dev` | API with auto-restart, loads `.env` |
| backend | `npm start` | API using the host's environment (production) |
| backend | `npm test` | all API tests (in-memory database double) |
| backend | `npm run test:mongodb` | real-database test against `MONGODB_TEST_URI` (creates and drops a `*_test` database) |
| backend | `npm run db:init` | apply validators and indexes only |
| backend | `npm run preflight` | production configuration checklist (`--json`, `--output file`) |
| backend | `npm run routes` | list registered routes |
| both | `npm run lint` / `npm run format` | ESLint 10 / Prettier |
| frontend | `npm run dev` | Vite dev server with `/api` proxy |
| frontend | `npm run build` | production build into `frontend/dist` |
| frontend | `npm run preview` | serve the build locally (proxies `/api`) |
| frontend | `npm test` | Vitest suites, including real Tesseract OCR on sample receipts |

## Configuration

- `backend/.env.example` documents every API variable: runtime and origins, MongoDB, receipt folder, SMTP, Google,
  Twilio, Stripe, bank encryption and the operator account. Production refuses to start without an HTTPS
  `APP_ORIGIN`, SMTP, configured billing with `BILLING_ENFORCED=true` and `RECEIPT_DIR`.
- `frontend/.env.example`: `VITE_SITE_URL` (canonical links, sitemap), `VITE_API_BASE_URL` (only for an API on its own
  subdomain) and the dev proxy target. These values are public; never put secrets in them.
- `.env` files are git-ignored. Only the templates are committed.

## REST API

JSON under `/api`. Writes need an allowed `Origin`; authenticated writes also need `X-CSRF-Token` (from sign-in or
`GET /api/v1/me`). Money is integer pence. Full contracts: [API_REFERENCE.md](backend/docs/API_REFERENCE.md) and
[openapi.yaml](backend/docs/api/openapi.yaml); the backend tests fail if a registered route is missing from this
table.

Access: **P** public · **S** signed-in session · **M** active household member · **$** subscription/access month when `BILLING_ENFORCED=true` · **O** single platform owner after TOTP unlock · **W** Stripe signature.

| Endpoint | Access | Rate class | Purpose |
|---|---|---|---|
| `GET /api/health` | P | api | Liveness + database ping (`503` when the DB is down) |
| `GET /api/v1/public/config` | P | api | Configured providers, price, version |
| `GET /api/v1/public/settings` | P | api | Allowlisted website copy and announcements |
| `POST /api/v1/auth/register` | P | register | Password sign-up (generic 202; ≤3 emails/hour/address) |
| `POST /api/v1/auth/verify` | P | verify | Confirm email verification code |
| `POST /api/v1/auth/resend` | P | resend | Resend verification code (generic 202) |
| `POST /api/v1/auth/login` | P | login + lock | Password sign-in; **4 failures → 15-minute lock** |
| `POST /api/v1/auth/reset-request` | P | resetRequest | Send reset code (generic 202) |
| `POST /api/v1/auth/reset` | P | reset | New password; revokes all sessions; clears lock |
| `POST /api/v1/auth/quick/start` | P | quick | Send email/SMS/WhatsApp one-time code |
| `POST /api/v1/auth/quick/verify` | P | quick | Verify code (**4 wrong codes consume the challenge**) |
| `GET /api/v1/auth/google/start` | P | google | Begin Google OAuth (PKCE + nonce) |
| `GET /api/v1/auth/google/callback` | P | google | Google OAuth return |
| `GET /api/v1/me` | S | api | Current user + CSRF token |
| `POST /api/v1/auth/logout` | S | api | Revoke session |
| `GET /api/v1/households` | S | api | My active households |
| `POST /api/v1/households` | S | api | Create household (creator = owner) |
| `GET /api/v1/households/:id` | M | api | Household state |
| `POST /api/v1/households/:id/actions` | M $ | api | Versioned, idempotent actions (expenses, approvals, disputes, reversals, closing, payments, settings, bookkeeping, rooms, roles, removal) |
| `POST /api/v1/households/:id/invites` | M | api | Recipient-bound 7-day invitation |
| `POST /api/v1/invites/accept` | S | api | Accept invitation as the intended identity |
| `POST /api/v1/households/:id/receipts` | M $ | upload | Upload original receipt (JPEG/PNG/WebP/PDF ≤12 MB) |
| `GET /api/v1/households/:id/receipts/:receiptId` | M | api | Private download / inline view |
| `GET /api/v1/account/profile` | S | api | Own profile |
| `POST /api/v1/account/profile` | S | api | Update own profile (no identity/role fields) |
| `GET /api/v1/account/export` | S | api | Personal data export |
| `GET /api/v1/account/access` | S | api | Plan / free access state |
| `GET /api/v1/account/rewards` | S | api | Referral code, link, earned months |
| `POST /api/v1/account/coupon` | S | api | Redeem one welcome coupon (transaction) |
| `GET /api/v1/account/bank` | S | api | Masked payee details |
| `POST /api/v1/account/bank` | S | api | Save encrypted payee details |
| `POST /api/v1/account/bank/remove` | S | api | Remove payee details |
| `POST /api/v1/account/support` | S | api | Create support request |
| `POST /api/v1/billing/checkout` | S | api | Stripe Checkout (£0.99/month) |
| `POST /api/v1/billing/portal` | S | api | Stripe billing portal |
| `POST /api/v1/billing/webhook` | W | — | Stripe events (signature-verified, processed once) |
| `POST /api/v1/operator/unlock` | S + owner | operator | TOTP unlock (4 wrong codes → 15-minute pause) |
| `GET /api/v1/operator/overview` | O | operator | Metrics and bounded record lists |
| `POST /api/v1/operator/action` | O | operator | Suspend/restore user or household |
| `POST /api/v1/operator/coupons` | O | operator | Create coupon |
| `POST /api/v1/operator/coupons/status` | O | operator | Enable/disable coupon |
| `POST /api/v1/operator/grant` | O | operator | Grant one access month (idempotent) |
| `POST /api/v1/operator/payments/refund` | O | operator | Full Stripe refund |
| `POST /api/v1/operator/settings` | O | operator | Website settings |
| `POST /api/v1/operator/campaigns` | O | operator | Retention campaign draft |
| `POST /api/v1/operator/support` | O | operator | Update support request |
| `GET /api/v1/operator/finance` | O | operator | Stripe balance/payouts, masked bank record |
| `POST /api/v1/operator/finance/bank` | O | operator | Save encrypted owner bank record |
| `POST /api/v1/operator/finance/bank/remove` | O | operator | Remove owner bank record |
| `POST /api/v1/operator/finance/entries` | O | operator | Manual bank journal entry (idempotent) |
| `POST /api/v1/operator/finance/entries/void` | O | operator | Void an entry (kept) |
| `POST /api/v1/operator/finance/payout` | O | operator | Stripe payout to merchant default bank |
| `GET /api/v1/operator/accounting` | O | operator | Monthly accountant report (`?month=YYYY-MM`) |

Every operator mutation requires an audit `reason` and is recorded. Household action types and their permissions are listed in [API_REFERENCE.md §3](backend/docs/API_REFERENCE.md#3-household-action-dispatcher--post-apiv1householdsidactions).

## Security notes

- Server-side enforcement only: hidden buttons are never the control. Household owner/admin is not the platform
  operator (one allowlisted owner account plus an authenticator code).
- Sessions: opaque HttpOnly `SameSite=Strict` cookies (`Secure`, `__Host-` in production), hashed at rest, revoked on
  sign-out, password reset and suspension. CSRF token and allowed Origin on every write. CORS is off unless
  `CORS_ORIGINS` lists exact origins; wildcards are never used.
- Sign-in: Argon2id; 4 consecutive failed passwords → 15-minute lock (stored in MongoDB, safe under concurrency, no
  account enumeration); 4 wrong one-time codes consume the challenge; 4 wrong operator codes pause unlocking.
- Input: allowlisted, type-checked payloads; 2 MB JSON limit (18 MB only for receipt upload, after authentication);
  internal errors never reach clients. Spreadsheet exports neutralise formula-like cells.
- Receipts: content-signature checks, private folder outside any web root, server-generated file names, member-only
  `no-store` downloads. OCR runs in the browser; no receipt is sent to a third party.
- Web app: strict Content-Security-Policy (no inline scripts; WebAssembly allowed for OCR), HSTS and
  `frame-ancestors 'none'` from Nginx; `/api` and `/admin/` are `noindex`.
- Not provided: tenant-to-tenant bank payments, automatic bank reconciliation, statutory accounts, penetration testing.
  See [PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md).

## Tests

```bash
cd backend && npm test && npm run lint
cd frontend && npm test && npm run lint && npm run build
```

Results, including a real-browser run against a real MongoDB replica set:
[TEST-RESULTS-v1.3.0-2026-10-22.md](docs/TEST-RESULTS-v1.3.0-2026-10-22.md). How the client's handover requirements
are covered: [REQUIREMENTS-TRACEABILITY.md](docs/REQUIREMENTS-TRACEABILITY.md).

## Deployment

Recommended: **Hostinger VPS KVM 2** (Ubuntu 24.04, Node 22, Nginx + Let's Encrypt, systemd) with **MongoDB Atlas**
and a private receipt folder with off-site backups. Nginx serves `frontend/dist` and proxies `/api` to the API on
`127.0.0.1:5000`. Step by step: [DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md).

### Vercel (demo)

[`vercel.json`](vercel.json) deploys both packages as one Vercel project with two services on one domain: `/api/*` goes
to the `backend` service (Express, entry point [`backend/src/vercel.js`](backend/src/vercel.js)) and every other path
to the `frontend` service (the Vite build). Import the repository with the root directory left at the repository root
and the **Services** framework preset.

- Set `MONGODB_URI` and `MONGODB_DB` in the project's environment variables, and allow `0.0.0.0/0` under Atlas
  Network Access (Vercel has no fixed IP addresses). Leave `VITE_API_BASE_URL` empty. Do not copy the rest of
  `.env.example`: its local-development values do not apply on Vercel. The API ignores `RECEIPT_DIR`,
  `TRUST_PROXY_HOPS=0` and a non-HTTPS `APP_ORIGIN` there, and `NODE_ENV` should be left to Vercel.
- `APP_ORIGIN` defaults to the deployment's own address; set it only for a custom domain that is not the project's
  primary production domain.
- Without `SMTP_HOST`, sign-up, sign-in and reset codes are shown on screen instead of being emailed, so anyone can sign
  in as any address. That is for showing the app only: set `DEMO_SHOW_CODES=false` or configure SMTP before real use.
- Receipts are kept in the function's temporary folder and disappear when Vercel recycles it, and Vercel limits
  request bodies to 4.5 MB. Use the VPS deployment above for production.
