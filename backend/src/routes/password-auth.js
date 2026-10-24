import argon2 from "argon2";
import crypto from "node:crypto";
import { uid } from "../modules/calculation-engine/index.js";
import { lockedError, LOCK_MS } from "../services/auth-throttle.js";
const pass = (_req, _res, next) => next();
const MAIL_PER_HOUR = 3;
const LOCKED =
  "Too many failed sign-in attempts. Sign-in is paused for 15 minutes. You can reset your password or use an email code instead.";
export function installPasswordAuth(
  app,
  {
    users,
    tokens,
    sessions,
    endpoint,
    email,
    fail,
    issueToken,
    sendCode,
    hash,
    platform,
    limiters,
    quota,
    throttle,
  },
) {
  const limit = (name) => limiters?.[name] || pass;
  // Per-address cap on outgoing codes (anti mail-bombing). Responses stay generic, so nothing is revealed.
  const mayEmail = async (kind, address) => !quota || (await quota(kind, address, MAIL_PER_HOUR, 36e5));
  const argonOptions = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3 };
  app.post(
    "/api/v1/auth/register",
    limit("register"),
    endpoint(async (req, res) => {
      const e = email(req.body.email),
        name = String(req.body.name || "").trim(),
        password = String(req.body.password || "");
      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ||
        e.length > 254 ||
        !name ||
        name.length > 80 ||
        password.length < 12 ||
        password.length > 128
      )
        fail("Enter a name, valid email and a 12–128 character password.");
      // Validate the referral and hash the password before checking existence, so new and existing addresses
      // produce the same response and similar timing (no account enumeration).
      const referredBy = await platform.referrer(req.body.referralCode);
      const passwordHash = await argon2.hash(password, argonOptions);
      const existing = await users.findOne({ email: e });
      let demoCode;
      if (!existing) {
        const id = uid();
        try {
          await users.insertOne({
            id,
            referralCode: "SW-" + crypto.randomBytes(6).toString("hex").toUpperCase(),
            email: e,
            name,
            passwordHash,
            createdAt: new Date(),
            verifiedAt: null,
            referredBy,
          });
          if (await mayEmail("verify-mail", e))
            demoCode = (await sendCode(e, "Verify email", await issueToken(id, "verify")))?.demoCode;
        } catch (err) {
          if (err.code !== 11e3) throw err;
        }
      }
      res.status(202).json({
        message:
          "If this is a new account, a verification code has been sent. Existing users can sign in or reset their password.",
        ...(demoCode && { demoCode }),
      });
    }),
  );
  // Email verification and reset codes are single-use 256-bit tokens (30-minute expiry): not guessable, so they are
  // protected by per-IP limits rather than per-challenge attempt counters.
  app.post(
    "/api/v1/auth/verify",
    limit("verify"),
    endpoint(async (req, res) => {
      const t = await tokens.findOneAndDelete({
        id: hash(String(req.body.token || "")),
        type: "verify",
        expiresAt: { $gt: new Date() },
      });
      if (!t) fail("Invalid or expired verification code.");
      await users.updateOne({ id: t.userId }, { $set: { verifiedAt: new Date() } });
      res.json({ message: "Email verified. You can now sign in." });
    }),
  );
  app.post(
    "/api/v1/auth/resend",
    limit("resend"),
    endpoint(async (req, res) => {
      const u = await users.findOne({ email: email(req.body.email) });
      let demoCode;
      if (u && !u.verifiedAt && (await mayEmail("verify-mail", u.email))) {
        demoCode = (await sendCode(u.email, "Verify email", await issueToken(u.id, "verify")))?.demoCode;
      }
      res.status(202).json({
        message: "If verification is needed, a new code has been sent.",
        ...(demoCode && { demoCode }),
      });
    }),
  );
  const dummyHash = argon2.hash(crypto.randomBytes(32).toString("hex"), { type: argon2.argon2id });
  app.post(
    "/api/v1/auth/login",
    limit("login"),
    endpoint(async (req, res) => {
      const address = email(req.body.email);
      const password = String(req.body.password || "").slice(0, 128);
      // Reserve the attempt before the Argon2 check: parallel requests cannot test more than four passwords.
      const reservation = throttle ? await throttle.reserve("login", address) : null;
      if (reservation && !reservation.allowed) throw lockedError(reservation.retryAfter, LOCKED);
      const u = await users.findOne({ email: address });
      const valid = await argon2.verify(u?.passwordHash || (await dummyHash), password);
      if (!u || !valid) {
        const left = reservation ? await throttle.failed(reservation) : null;
        if (left === 0) throw lockedError(Math.ceil(LOCK_MS / 1000), LOCKED);
        fail(
          "Email or password is incorrect." +
            (left ? ` ${left} ${left === 1 ? "attempt" : "attempts"} left before a 15-minute pause.` : ""),
          401,
        );
      }
      if (!u.verifiedAt) {
        if (reservation) await throttle.release(reservation);
        fail("Verify your email before signing in.", 403);
      }
      res.json(await platform.login(u, res));
    }),
  );
  app.post(
    "/api/v1/auth/reset-request",
    limit("resetRequest"),
    endpoint(async (req, res) => {
      const address = email(req.body.email);
      const u = await users.findOne({ email: address });
      let demoCode;
      if (u && (await mayEmail("reset-mail", address)))
        demoCode = (await sendCode(u.email, "Reset password", await issueToken(u.id, "reset")))?.demoCode;
      res.status(202).json({
        message: "If the account exists, a reset code has been sent.",
        ...(demoCode && { demoCode }),
      });
    }),
  );
  app.post(
    "/api/v1/auth/reset",
    limit("reset"),
    endpoint(async (req, res) => {
      const password = String(req.body.password || "");
      if (password.length < 12 || password.length > 128) fail("Use 12–128 characters.");
      const t = await tokens.findOneAndDelete({
        id: hash(String(req.body.token || "")),
        type: "reset",
        expiresAt: { $gt: new Date() },
      });
      if (!t) fail("Invalid or expired reset code.");
      await users.updateOne(
        { id: t.userId },
        {
          $set: {
            passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
            verifiedAt: new Date(),
          },
        },
      );
      await sessions.deleteMany({ userId: t.userId });
      // Controlled recovery ends any active password lock for this account.
      const u = await users.findOne({ id: t.userId });
      await throttle?.clear("login", u?.email);
      res.json({ message: "Password changed and all sessions signed out. You can now sign in." });
    }),
  );
}
