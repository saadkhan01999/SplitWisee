import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path of the backend package (the folder that contains package.json). */
export const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** The frontend package of this repository. Everything in it is public once built, so receipts must never live there. */
export const frontendRoot = path.resolve(backendRoot, "../frontend");

export const version = JSON.parse(fs.readFileSync(path.join(backendRoot, "package.json"), "utf8")).version;

const PLACEHOLDER = /YOUR_DB_USER|URL_ENCODED_PASSWORD|YOUR_CLUSTER_HOST/;

const isInside = (child, parent) => {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const isOrigin = (value) => {
  try {
    const url = new URL(value);
    return url.origin === value;
  } catch {
    return false;
  }
};

/** Splits a comma-separated list of origins, ignoring blanks. */
export const parseOrigins = (value = "") =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * Validates process configuration. Returns `{ errors, warnings }`: errors stop the server, warnings are printed once.
 * Values are never echoed, so the output is safe to log.
 */
export function checkEnvironment(env = process.env) {
  const errors = [];
  const warnings = [];
  const production = env.NODE_ENV === "production";

  if (!env.MONGODB_URI) {
    errors.push("Set MONGODB_URI in backend/.env (development) or in the host environment (production).");
  } else if (PLACEHOLDER.test(env.MONGODB_URI)) {
    errors.push(
      "MONGODB_URI still contains the .env.example placeholder. Paste your real connection string.",
    );
  }
  if (env.APP_ORIGIN && !isOrigin(env.APP_ORIGIN)) {
    errors.push(
      "APP_ORIGIN must be an origin only, for example https://app.example.com (no path or trailing slash).",
    );
  }
  for (const origin of parseOrigins(env.CORS_ORIGINS)) {
    if (!isOrigin(origin))
      errors.push("Every CORS_ORIGINS entry must be an origin such as https://app.example.com.");
  }

  if (production) {
    if (!env.APP_ORIGIN?.startsWith("https://") || !env.SMTP_HOST) {
      errors.push("Production requires an HTTPS APP_ORIGIN and SMTP_HOST.");
    }
    if (
      env.BILLING_ENFORCED !== "true" ||
      !env.STRIPE_SECRET_KEY ||
      !env.STRIPE_WEBHOOK_SECRET ||
      !env.STRIPE_PRICE_ID
    ) {
      errors.push("Production requires configured £0.99 billing and BILLING_ENFORCED=true.");
    }
    if (!env.RECEIPT_DIR) {
      errors.push("Production requires RECEIPT_DIR: a persistent, private, backed-up directory.");
    }
    if (parseOrigins(env.CORS_ORIGINS).some((origin) => !origin.startsWith("https://"))) {
      errors.push("CORS_ORIGINS must use HTTPS in production.");
    }
    if (env.DEV_SHOW_EMAIL_CODES === "true") {
      warnings.push(
        "DEV_SHOW_EMAIL_CODES is ignored in production. Remove it from the production environment.",
      );
    }
    if (!Number(env.TRUST_PROXY_HOPS)) {
      warnings.push(
        "TRUST_PROXY_HOPS is 0/unset. Behind a reverse proxy (Nginx, a managed host) set it to the number of trusted proxies, otherwise every client shares one IP for rate limiting.",
      );
    }
  }
  if (env.DEMO_SHOW_CODES === "true" && !env.SMTP_HOST) {
    warnings.push(
      "DEMO_SHOW_CODES is on: sign-in codes are shown on screen, so anyone can use any email address. Demos only.",
    );
  }
  if (env.OPERATOR_USER_IDS) {
    warnings.push(
      "OPERATOR_USER_IDS is deprecated. Use SUPERADMIN_USER_ID (exactly one verified user ID); lists are always refused.",
    );
  }
  return { errors, warnings };
}

/** Resolves RECEIPT_DIR to an absolute path and refuses locations inside the (public) frontend package. */
export function resolveReceiptDir(dir) {
  const resolved = path.resolve(dir);
  if (isInside(resolved, frontendRoot)) {
    throw new Error("RECEIPT_DIR must not be inside the frontend folder: built frontend files are public.");
  }
  return resolved;
}
