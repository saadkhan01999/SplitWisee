import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { backendRoot, frontendRoot, parseOrigins, version } from "../src/config/env.js";

function isHttpsOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value;
  } catch {
    return false;
  }
}

function operatorSecret(secretsJson, ownerId) {
  try {
    return String(JSON.parse(secretsJson || "{}")[ownerId] || "");
  } catch {
    return "";
  }
}

/**
 * Production configuration readiness for the API. It checks that settings are present and well-formed; it never
 * contacts providers and never prints secret values. Passing does not certify a launch.
 */
export function preflight({ env = process.env, nodeVersion = process.versions.node } = {}) {
  const checks = [];
  const add = (id, pass, detail, optional = false) =>
    checks.push({ id, status: pass ? "pass" : optional ? "review" : "blocked", detail });

  add("node", Number(nodeVersion.split(".")[0]) >= 22, "Node.js 22 or newer.");
  add("production-mode", env.NODE_ENV === "production", "Set NODE_ENV=production on the production service.");

  const httpsOrigin = isHttpsOrigin(env.APP_ORIGIN);
  add("https-origin", httpsOrigin, "APP_ORIGIN must be the exact HTTPS origin users open (no path).");
  add(
    "mongodb",
    /^mongodb(?:\+srv)?:\/\//.test(env.MONGODB_URI || "") &&
      !/YOUR_DB_USER|URL_ENCODED_PASSWORD|YOUR_CLUSTER_HOST/.test(env.MONGODB_URI || ""),
    "Set MONGODB_URI to your replica set / Atlas connection string and verify transactions.",
  );
  add("database-name", Boolean(env.MONGODB_DB), "Set an explicit MONGODB_DB for this environment.");
  add(
    "email",
    Boolean(env.SMTP_HOST && env.EMAIL_FROM),
    "Configure SMTP_HOST and EMAIL_FROM; test delivery.",
  );
  add("debug-email-off", env.DEV_SHOW_EMAIL_CODES !== "true", "Do not log verification codes in production.");
  add(
    "billing-enforced",
    env.BILLING_ENFORCED === "true",
    "Production startup requires BILLING_ENFORCED=true.",
  );
  add(
    "stripe-live-key",
    /^sk_live_/.test(env.STRIPE_SECRET_KEY || ""),
    "A live merchant key is needed for launch. Use test keys during QA.",
  );
  add("stripe-webhook", /^whsec_/.test(env.STRIPE_WEBHOOK_SECRET || ""), "Set the webhook signing secret.");
  add(
    "stripe-price",
    /^price_/.test(env.STRIPE_PRICE_ID || ""),
    "Set a recurring monthly GBP price; the API validates 99 pence.",
  );
  add(
    "bank-encryption",
    /^[a-f0-9]{64}$/i.test(env.BANK_ENCRYPTION_KEY || ""),
    "Set a unique 32-byte key as 64 hex characters.",
  );

  const owner = (env.SUPERADMIN_USER_ID || "").trim();
  add(
    "single-owner",
    Boolean(owner) && !owner.includes(","),
    "Set exactly one verified application user ID.",
  );
  const totp = Boolean(owner) && /^[A-Z2-7]{16,}$/i.test(operatorSecret(env.OPERATOR_TOTP_SECRETS, owner));
  add("owner-totp", totp, "Configure a Base32 TOTP secret for that owner.");

  let receipts = false;
  if (env.RECEIPT_DIR && path.isAbsolute(env.RECEIPT_DIR)) {
    const relative = path.relative(frontendRoot, path.resolve(env.RECEIPT_DIR));
    receipts = relative.startsWith("..") || path.isAbsolute(relative);
  }
  add(
    "receipt-storage",
    receipts,
    "Set RECEIPT_DIR to an absolute, persistent, private directory outside the frontend (ideally outside the checkout) and back it up.",
  );

  add("google", Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET), "Optional Google sign-in.", true);
  add(
    "phone",
    Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_VERIFY_SERVICE_SID),
    "Optional SMS/WhatsApp verification.",
    true,
  );
  add(
    "proxy-hops",
    Number(env.TRUST_PROXY_HOPS) > 0,
    "Behind a reverse proxy set TRUST_PROXY_HOPS (usually 1), or rate limits apply to the proxy instead of each client.",
    true,
  );
  add(
    "cors-origins",
    parseOrigins(env.CORS_ORIGINS).every((origin) => origin.startsWith("https://")),
    "CORS_ORIGINS entries must be HTTPS origins (only needed when the API is on a separate subdomain).",
    true,
  );
  add(
    "legacy-operator-list",
    !env.OPERATOR_USER_IDS,
    "OPERATOR_USER_IDS is deprecated; remove it and use SUPERADMIN_USER_ID only.",
    true,
  );

  const blocked = checks.filter((check) => check.status === "blocked").length;
  return {
    format: "splitwisee-preflight-v1",
    version,
    generatedAt: new Date().toISOString(),
    configuration: blocked ? "blocked" : "configured",
    launchVerified: false,
    blocked,
    checks,
    manualChecks: [
      "HTTPS site and /api on the production domain; frontend built with the production VITE_SITE_URL",
      "MongoDB initialization, transaction and restore test",
      "Email signup, verification, login, reset and logout on the deployed service",
      "Stripe test checkout, webhook, refund and payout status reconciliation",
      "Owner TOTP and role isolation",
      "Household invitations, room management, profile isolation and referral deduplication with real accounts",
      "iPhone Safari and Android Chrome installation, camera receipts and downloads on physical phones",
      "Monitoring, backup/restore and rollback ownership",
    ],
    note: "Configuration presence only. No provider calls, bank actions or secret values are included. Passing configuration does not certify launch readiness.",
  };
}

const runAsScript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (runAsScript) {
  const envFile = path.join(backendRoot, ".env");
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
  const report = preflight();
  const outputIndex = process.argv.indexOf("--output");
  if (outputIndex !== -1) {
    const target = process.argv[outputIndex + 1];
    if (!target) throw new Error("--output needs a file path");
    fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`SplitWisee API v${version} — configuration ${report.configuration}`);
    for (const check of report.checks)
      console.log(`[${check.status.toUpperCase()}] ${check.id}: ${check.detail}`);
    console.log(report.note);
  }
  process.exitCode = report.blocked ? 1 : 0;
}
