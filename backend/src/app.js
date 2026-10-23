import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import { backendRoot, parseOrigins, resolveReceiptDir } from "./config/env.js";
import { corsForOrigins } from "./middleware/cors.js";
import { apiNotFound, endpoint, errorHandler } from "./middleware/errors.js";
import { createLimiters, createQuota } from "./middleware/rate-limit.js";
import {
  createSession,
  noIndex,
  noStore,
  requireAllowedOrigin,
  securityHeaders,
} from "./middleware/security.js";
import { createCodeSender } from "./providers/email.js";
import { installAccount } from "./routes/account.js";
import { installHealth } from "./routes/health.js";
import { createHouseholdLoader, installHouseholds, requireMember } from "./routes/households.js";
import { installInvitations } from "./routes/invitations.js";
import { installPasswordAuth } from "./routes/password-auth.js";
import { billingWebhook, installPlatform, isOperator } from "./routes/platform.js";
import { installReceipts, RECEIPT_UPLOAD_PATH } from "./routes/receipts.js";
import { installSessionRoutes } from "./routes/session.js";
import { createAuthThrottle } from "./services/auth-throttle.js";

const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const token = () => crypto.randomBytes(32).toString("hex");
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const normaliseEmail = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();
const safeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  operator: isOperator(user),
  phone: user.phone,
  profile: user.profile,
});

/**
 * Builds the REST API. It serves JSON only (the frontend is built and hosted separately) and opens no socket:
 * `src/server.js` listens.
 *
 * @param {import("mongodb").Db} db
 * @param {object} [options] overrides for tests and tools:
 *   origin, apiOrigin, corsOrigins, production, receiptDir, sendCode, now (clock for authentication locks)
 */
export async function createApp(db, options = {}) {
  const production = options.production ?? process.env.NODE_ENV === "production";
  const origin = options.origin || process.env.APP_ORIGIN || "http://localhost:5173";
  const apiOrigin = options.apiOrigin || process.env.API_ORIGIN || origin;
  const corsOrigins = options.corsOrigins ?? parseOrigins(process.env.CORS_ORIGINS);
  const receiptDir = resolveReceiptDir(
    options.receiptDir || process.env.RECEIPT_DIR || path.join(backendRoot, "private-receipts"),
  );
  await fs.mkdir(receiptDir, { recursive: true, mode: 0o700 });

  const users = db.collection("users");
  const sessions = db.collection("sessions");
  const households = db.collection("households");
  const tokens = db.collection("tokens");
  const throttles = db.collection("throttles");
  const limiters = createLimiters(throttles);
  const quota = createQuota(throttles);
  const throttle = createAuthThrottle(throttles, { now: options.now });

  const app = express();
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY_HOPS) app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS));
  app.use(securityHeaders(production));
  if (corsOrigins.length) app.use("/api", corsForOrigins(corsOrigins));

  // Stripe needs the raw body for signature verification, so its route is registered before JSON parsing.
  billingWebhook(app, db);
  const json = express.json({ limit: "2mb" });
  app.use((req, res, next) =>
    req.method === "POST" && RECEIPT_UPLOAD_PATH.test(req.path) ? next() : json(req, res, next),
  );
  app.use(
    "/api",
    (req, _res, next) => {
      req.body ??= {};
      next();
    },
    noStore,
    noIndex,
    limiters.api,
    requireAllowedOrigin([origin, ...corsOrigins]),
  );

  const cookieName = production ? "__Host-th_session" : "th_session";
  const session = createSession({ sessions, users, cookieName });
  const sendCode = createCodeSender({ production, override: options.sendCode });
  async function issueToken(userId, type) {
    const code = token();
    await tokens.insertOne({ id: hash(code), userId, type, expiresAt: new Date(Date.now() + 30 * 60_000) });
    return code;
  }

  installHealth(app, { db });
  const platform = installPlatform(app, {
    db,
    session,
    endpoint,
    sendCode,
    origin,
    apiOrigin,
    production,
    cookieName,
    safeUser,
    limiters,
    quota,
    throttle,
  });
  installAccount(app, { db, session, endpoint, safeUser });
  installPasswordAuth(app, {
    users,
    tokens,
    sessions,
    endpoint,
    email: normaliseEmail,
    fail,
    issueToken,
    sendCode,
    hash,
    platform,
    limiters,
    quota,
    throttle,
  });
  installSessionRoutes(app, { session, endpoint, sessions, cookieName, production, safeUser });
  const load = createHouseholdLoader(households);
  installHouseholds(app, { db, session, endpoint, load, requirePaid: platform.requirePaid, hash });
  installInvitations(app, {
    db,
    session,
    endpoint,
    load,
    requireMember,
    email: normaliseEmail,
    fail,
    token,
    hash,
    platform,
  });
  installReceipts(app, {
    db,
    session,
    endpoint,
    load,
    requirePaid: platform.requirePaid,
    receiptDir,
    hash,
    uploadLimiter: limiters.upload,
  });

  app.use(apiNotFound);
  app.use(errorHandler);
  return app;
}
