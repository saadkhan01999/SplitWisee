import { grantWelcome, accessEvents, redeemCoupon } from "../services/promotions.js";
import { installAdmin, defaultSettings } from "./admin.js";
import crypto from "node:crypto";
import express from "express";
import { stripeClient } from "../providers/stripe.js";
import { twilioConfigured, twilioVerify } from "../providers/twilio.js";
import { googleConfigured, googleClient } from "../providers/google.js";
import { lockedError } from "../services/auth-throttle.js";
import { version } from "../config/env.js";
const QUICK_MAX_ATTEMPTS = 4;
const hash = (x) => crypto.createHash("sha256").update(x).digest("hex"),
  tok = () => crypto.randomBytes(32).toString("hex"),
  id = () => crypto.randomUUID();
const bad = (m, status = 400) => {
  throw Object.assign(new Error(m), { status });
};
function isOperator(u) {
  const configured = (process.env.SUPERADMIN_USER_ID || process.env.OPERATOR_USER_IDS || "").trim();
  // Fail closed for legacy multi-owner lists. Exactly one immutable verified user ID.
  return !!u?.id && !!configured && !configured.includes(",") && u.id === configured;
}
function nextMonth(value) {
  const d = new Date(value),
    day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
  return d;
}
function rewardWindow(events, at = /* @__PURE__ */ new Date()) {
  let end = null;
  for (const e of [...events]
    .filter((e2) => e2.kind === "access")
    .sort((a, b) => new Date(a.at) - new Date(b.at))) {
    const start = new Date(Math.max(end ? +end : 0, +new Date(e.at)));
    end = nextMonth(start);
  }
  return end && end > at ? end : null;
}
function encryptBank(data, keyHex) {
  if (!/^[a-f0-9]{64}$/i.test(keyHex || "")) bad("Private bank storage is not configured.", 503);
  const iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  const bytes = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return {
    iv: iv.toString("hex"),
    ciphertext: bytes.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
  };
}
function totp(secret, at = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.toUpperCase().replace(/=|\s/g, "")) {
    const n2 = alphabet.indexOf(c);
    if (n2 < 0) throw Error("Invalid TOTP key");
    bits += n2.toString(2).padStart(5, "0");
  }
  const bytes = Buffer.from((bits.match(/.{8}/g) || []).map((b2) => parseInt(b2, 2))),
    counter = BigInt(Math.floor(at / 3e4)),
    b = Buffer.alloc(8);
  b.writeBigUInt64BE(counter);
  const h = crypto.createHmac("sha1", bytes).update(b).digest(),
    off = h.at(-1) & 15,
    n = (h.readUInt32BE(off) & 2147483647) % 1e6;
  return String(n).padStart(6, "0");
}
function billingWebhook(app, db) {
  app.post(
    "/api/v1/billing/webhook",
    express.raw({ type: "application/json", limit: "1mb" }),
    async (req, res) => {
      const stripe = stripeClient();
      if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET)
        return res.status(503).json({ error: "Billing not configured." });
      let event;
      try {
        event = stripe.webhooks.constructEvent(
          req.body,
          req.headers["stripe-signature"],
          process.env.STRIPE_WEBHOOK_SECRET,
        );
      } catch {
        return res.status(400).json({ error: "Invalid webhook signature." });
      }
      try {
        const events = db.collection("billingEvents");
        if (await events.findOne({ id: event.id, status: "done" })) return res.json({ received: true });
        const obj = event.data.object;
        let customer = typeof obj.customer === "string" ? obj.customer : obj.customer?.id;
        if (customer) {
          const stripeSubs = await stripe.subscriptions.list({ customer, status: "all", limit: 100 });
          const sub = stripeSubs.data.find((x) =>
            ["active", "trialing", "past_due", "unpaid"].includes(x.status),
          );
          await db.collection("users").updateOne(
            { stripeCustomer: customer },
            {
              $set: {
                subscription: sub
                  ? { id: sub.id, status: sub.status, cancelAtPeriodEnd: sub.cancel_at_period_end }
                  : null,
              },
            },
          );
        }
        if (["invoice.paid", "invoice.payment_failed"].includes(event.type)) {
          // Retrieve current invoice state: Stripe may deliver webhook events out of order.
          const invoice = await stripe.invoices.retrieve(obj.id, { expand: ["payments"] });
          const paid = invoice.status === "paid";
          let intent = invoice.payment_intent;
          if (!intent && paid && invoice.amount_paid > 0) {
            const matches = await stripe.invoicePayments.list({
              invoice: obj.id,
              status: "paid",
              limit: 100,
            });
            // Multi-payment invoices require manual review; never refund an arbitrary part.
            if (matches.data.length === 1 && !matches.has_more)
              intent = matches.data[0].payment?.payment_intent;
          }
          const paymentIntent = typeof intent === "string" ? intent : intent?.id;
          const user = await db.collection("users").findOne({ stripeCustomer: customer });
          const prior = await db.collection("paymentRecords").findOne({ id: obj.id });
          const refundState = prior?.status?.startsWith("refund");
          await db.collection("paymentRecords").updateOne(
            { id: obj.id },
            {
              $set: {
                userId: user?.id,
                customer: user?.name || invoice.customer_email || customer,
                amountPence: paid ? invoice.amount_paid : invoice.amount_due,
                currency: String(invoice.currency).toUpperCase(),
                status: refundState ? prior.status : paid ? "paid" : "failed",
                at: new Date((invoice.status_transitions?.paid_at || invoice.created) * 1000),
                provider: "Stripe",
                ...(paymentIntent ? { paymentIntent } : {}),
              },
            },
            { upsert: true },
          );
        }
        if (event.type === "refund.updated") {
          await db.collection("paymentRecords").updateOne(
            { refundId: obj.id },
            {
              $set: {
                status:
                  obj.status === "succeeded"
                    ? "refunded"
                    : obj.status === "failed"
                      ? "refund_failed"
                      : "refund_pending",
                refundStatus: obj.status,
              },
            },
          );
        }
        await events.updateOne(
          { id: event.id },
          { $set: { status: "done", type: event.type, at: /* @__PURE__ */ new Date() } },
          { upsert: true },
        );
        res.json({ received: true });
      } catch {
        res.status(503).json({ error: "Retry webhook later." });
      }
    },
  );
}
function installPlatform(
  app,
  {
    db,
    session,
    endpoint,
    sendCode,
    origin,
    apiOrigin = origin,
    production,
    cookieName,
    safeUser,
    limiters,
    quota,
    throttle,
  },
) {
  const limit = (name) => limiters?.[name] || ((_req, _res, next) => next());
  const users = db.collection("users"),
    sessions = db.collection("sessions"),
    tokens = db.collection("tokens"),
    rewards = db.collection("referrals"),
    audit = db.collection("operatorAudit"),
    households = db.collection("households"),
    stripe = stripeClient();
  const providers = () => ({
    email: !!process.env.SMTP_HOST || (!production && process.env.DEV_SHOW_EMAIL_CODES === "true"),
    google: googleConfigured(),
    phone: twilioConfigured(),
    billing: !!(stripe && process.env.STRIPE_PRICE_ID && process.env.STRIPE_WEBHOOK_SECRET),
    bankEncryption: /^[a-f0-9]{64}$/i.test(process.env.BANK_ENCRYPTION_KEY || ""),
  });
  async function referrer(code) {
    if (!code) return null;
    const u = await users.findOne({ referralCode: String(code).toUpperCase(), suspended: { $ne: true } });
    if (!u) bad("Referral code not recognised. Check it or continue without a referral.");
    return u.id;
  }
  async function qualify(u) {
    if (!u.referredBy || u.referredBy === u.id || !u.verifiedAt) return;
    const owner = await users.findOne({ id: u.referredBy, suspended: { $ne: true } });
    if (!owner) return;
    await grantWelcome(db, u, "referral");
    const event = {
      id: "ref-" + u.id,
      referredUserId: u.id,
      ownerId: owner.id,
      at: /* @__PURE__ */ new Date(),
      kind:
        owner.subscription && ["active", "trialing"].includes(owner.subscription.status)
          ? "invoice"
          : "access",
      status: "qualified",
      amountPence: 99,
    };
    try {
      await rewards.insertOne(event);
    } catch (e) {
      if (e.code !== 11e3) throw e;
    }
    if (event.kind === "invoice")
      try {
        await syncInvoiceCredits(db, stripe, owner);
      } catch {
        console.error("Referral invoice credit queued for retry");
      }
  }
  async function applyInvoiceCredits(u) {
    return syncInvoiceCredits(db, stripe, u);
  }
  async function login(u, res) {
    if (u.suspended) bad("This account is suspended. Contact the platform operator.", 403);
    if (!u.verifiedAt) bad("Verify your identity first.", 403);
    await qualify(u);
    await users.updateOne({ id: u.id }, { $set: { lastLoginAt: /* @__PURE__ */ new Date() } });
    // A verified sign-in by any method ends a password lock for this account (controlled recovery).
    await throttle?.clear("login", u.email);
    const raw = tok(),
      csrf = tok();

    await sessions.insertOne({
      id: hash(raw),
      userId: u.id,
      csrf,
      createdAt: /* @__PURE__ */ new Date(),
      expiresAt: new Date(Date.now() + 12 * 36e5),
    });
    res.cookie(cookieName, raw, {
      httpOnly: true,
      secure: production,
      sameSite: "strict",
      path: "/",
      maxAge: 12 * 36e5,
    });
    return { user: safeUser(u), csrf };
  }
  async function hasAccess(u) {
    if (process.env.BILLING_ENFORCED !== "true") return true;
    if (u.subscription && ["active", "trialing"].includes(u.subscription.status)) return true;
    const events = await accessEvents(db, u.id);
    return !!rewardWindow(events);
  }
  async function requirePaid(req, _res, next) {
    try {
      if (!(await hasAccess(req.user)))
        bad(
          "Subscribe for \xA30.99/month or earn a referral month to continue. Your records remain available to view and export.",
          402,
        );
      next();
    } catch (e) {
      next(e);
    }
  }
  app.get("/api/v1/public/config", (_req, res) =>
    res.json({ ...providers(), pricePence: 99, currency: "GBP", interval: "month", version }),
  );
  app.use("/api/v1/auth/quick", limit("quick"));
  app.use("/api/v1/auth/google", limit("google"));
  app.post(
    "/api/v1/auth/quick/start",
    endpoint(async (req, res) => {
      const { method } = req.body;
      if (req.body.intent === "signup" && !String(req.body.name || "").trim())
        bad("Enter your name to create an account.");
      const identifier = String(req.body.identifier || "")
          .trim()
          .toLowerCase(),
        name =
          String(req.body.name || "Housemate")
            .trim()
            .slice(0, 80) || "Housemate";
      if (!["email", "sms", "whatsapp"].includes(method)) bad("Choose a sign-in method.");
      if (
        method === "email"
          ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier) || identifier.length > 254
          : !/^\+[1-9]\d{7,14}$/.test(identifier)
      )
        bad("Enter a valid email or international mobile number.");
      const existing = await users.findOne(
        method === "email" ? { email: identifier } : { phone: identifier },
      );
      const referredBy = existing ? null : await referrer(req.body.referralCode);
      const challengeId = tok(),
        code = String(crypto.randomInt(0, 1e6)).padStart(6, "0");
      const recent = await tokens.findOne({
        type: "quick",
        identifier,
        createdAt: { $gt: new Date(Date.now() - 6e4) },
      });
      if (recent) bad("Please wait one minute before requesting another code.", 429);
      if (quota && !(await quota("quick-code", identifier, 5, 36e5)))
        bad("Too many codes were requested for this address. Try again in an hour.", 429);
      let providerSid;
      if (method === "email") await sendCode(identifier, "Sign-in verification (10 minute expiry)", code);
      else {
        const v = await twilioVerify("Verifications", { To: identifier, Channel: method });
        providerSid = v.sid;
      }
      await tokens.insertOne({
        id: hash(challengeId),
        type: "quick",
        method,
        identifier,
        name,
        referredBy,
        intent: req.body.intent === "login" ? "login" : "signup",
        codeHash: hash(challengeId + code),
        providerSid,
        attempts: 0,
        createdAt: /* @__PURE__ */ new Date(),
        expiresAt: new Date(Date.now() + 10 * 6e4),
      });
      res.json({ challengeId });
    }),
  );
  app.post(
    "/api/v1/auth/quick/verify",
    endpoint(async (req, res) => {
      const raw = String(req.body.challengeId || ""),
        code = String(req.body.code || "");
      if (!/^\d{6}$/.test(code)) bad("Enter the six-digit code.");
      const t = await tokens.findOneAndUpdate(
        {
          id: hash(raw),
          type: "quick",
          expiresAt: { $gt: /* @__PURE__ */ new Date() },
          attempts: { $lt: QUICK_MAX_ATTEMPTS },
        },
        { $inc: { attempts: 1 } },
        { returnDocument: "after" },
      );
      if (!t) bad("Code expired or too many attempts. Request another code.");
      const valid =
        t.method === "email"
          ? crypto.timingSafeEqual(Buffer.from(t.codeHash, "hex"), Buffer.from(hash(raw + code), "hex"))
          : (await twilioVerify("VerificationCheck", { VerificationSid: t.providerSid, Code: code }))
              .status === "approved";
      if (!valid) {
        // The 4th wrong code consumes the challenge; the user must request a new one.
        const left = QUICK_MAX_ATTEMPTS - (t.attempts || 0);
        if (left <= 0) {
          await tokens.deleteOne({ id: t.id });
          bad("Incorrect verification code. This code can no longer be used; request a new code.");
        }
        bad(`Incorrect verification code. ${left} ${left === 1 ? "attempt" : "attempts"} left.`);
      }
      const consumed = await tokens.findOneAndDelete({ id: t.id });
      if (!consumed) bad("Code already used.");
      const query = t.method === "email" ? { email: t.identifier } : { phone: t.identifier };
      let u = await users.findOne(query);
      if (!u && t.intent === "login")
        bad("No account exists for this verified identity. Choose Sign up to create one.", 404);
      if (!u) {
        u = {
          id: id(),
          ...query,
          name: t.name,
          createdAt: /* @__PURE__ */ new Date(),
          verifiedAt: /* @__PURE__ */ new Date(),
          referredBy: t.referredBy,
          referralCode: "SW-" + crypto.randomBytes(6).toString("hex").toUpperCase(),
        };
        try {
          await users.insertOne(u);
        } catch (e) {
          if (e.code !== 11e3) throw e;
          u = await users.findOne(query);
        }
      } else if (!u.verifiedAt) {
        await users.updateOne(
          { id: u.id },
          { $set: { verifiedAt: new Date() }, $unset: { passwordHash: "" } },
        );
        u.verifiedAt = /* @__PURE__ */ new Date();
      }
      res.json(await login(u, res));
    }),
  );
  // The OAuth callback is an API route, so it is built from the API origin (equal to APP_ORIGIN behind one domain).
  const google = () => googleClient(apiOrigin);
  app.get(
    "/api/v1/auth/google/start",
    endpoint(async (req, res) => {
      const client = google(),
        state = tok(),
        nonce = tok(),
        { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync(),
        referredBy = await referrer(req.query.ref);
      await tokens.insertOne({
        id: hash(state),
        type: "google",
        nonce,
        codeVerifier,
        referredBy,
        returnTo: req.query.returnTo === "admin" ? "admin" : "app",
        intent: req.query.intent === "signup" ? "signup" : "login",
        invite: String(req.query.invite || "").slice(0, 128),
        expiresAt: new Date(Date.now() + 10 * 6e4),
      });
      res.cookie("th_oauth", state, {
        httpOnly: true,
        secure: production,
        sameSite: "lax",
        path: "/api/v1/auth/google",
        maxAge: 6e5,
      });
      res.redirect(
        client.generateAuthUrl({
          scope: ["openid", "email", "profile"],
          state,
          nonce,
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
        }),
      );
    }),
  );
  app.get(
    "/api/v1/auth/google/callback",
    endpoint(async (req, res) => {
      try {
        const state = String(req.query.state || ""),
          cookie = (req.headers.cookie || "")
            .split(";")
            .map((x) => x.trim())
            .find((x) => x.startsWith("th_oauth="))
            ?.slice(9);
        if (!state || cookie !== state) bad("Invalid sign-in state.", 403);
        const t = await tokens.findOneAndDelete({
          id: hash(state),
          type: "google",
          expiresAt: { $gt: /* @__PURE__ */ new Date() },
        });
        if (!t) bad("Sign-in expired.");
        const client = google(),
          result = await client.getToken({
            code: String(req.query.code || ""),
            codeVerifier: t.codeVerifier,
          });
        const ticket = await client.verifyIdToken({
            idToken: result.tokens.id_token,
            audience: process.env.GOOGLE_CLIENT_ID,
          }),
          p = ticket.getPayload();
        if (!p?.email_verified || p.nonce !== t.nonce) bad("Identity could not be verified.", 403);
        let u = await users.findOne({ googleSub: p.sub });
        if (!u) {
          const e = p.email.toLowerCase();
          u = await users.findOne({ email: e });
          if (u) {
            if (!u.verifiedAt || (!e.endsWith("@gmail.com") && !p.hd))
              bad("Use your existing email sign-in to access this account.", 403);
            await users.updateOne({ id: u.id }, { $set: { googleSub: p.sub } });
          } else {
            if (t.intent !== "signup") bad("No account exists. Choose Sign up first.", 404);
            u = {
              id: id(),
              email: e,
              name: p.name || "Housemate",
              googleSub: p.sub,
              verifiedAt: /* @__PURE__ */ new Date(),
              createdAt: /* @__PURE__ */ new Date(),
              referredBy: t.referredBy,
              referralCode: "SW-" + crypto.randomBytes(6).toString("hex").toUpperCase(),
            };
            await users.insertOne(u);
          }
        }
        await login(u, res);
        res.clearCookie("th_oauth", { path: "/api/v1/auth/google" });
        res.redirect(
          t.returnTo === "admin"
            ? origin + "/admin/"
            : origin + "/?" + new URLSearchParams(t.invite ? { invite: t.invite } : {}).toString() + "#app",
        );
      } catch {
        res.redirect(origin + "/?auth_error=1#app");
      }
    }),
  );
  app.get(
    "/api/v1/account/rewards",
    session,
    endpoint(async (req, res) => {
      let u = req.user;
      if (!u.referralCode) {
        const code = "SW-" + crypto.randomBytes(6).toString("hex").toUpperCase();
        await users.updateOne(
          { id: u.id, referralCode: { $exists: false } },
          { $set: { referralCode: code } },
        );
        u = await users.findOne({ id: u.id });
      }
      await applyInvoiceCredits(u);
      const events = await accessEvents(db, u.id);
      res.json({
        code: u.referralCode,
        url: origin + "/?ref=" + u.referralCode,
        freeMonths: events.filter((e) => e.referredUserId).length,
        bonusMonths: events.filter((e) => !e.referredUserId).length,
        freeUntil: rewardWindow(events),
        subscription: u.subscription?.status || "Not subscribed",
        hasCustomer: !!u.stripeCustomer,
        rewards: events.map((e) => ({
          id: e.id,
          at: e.at,
          status: e.status,
          kind: e.kind,
          credited: !!e.stripeCreditId,
          source: e.source,
        })),
      });
    }),
  );
  async function customer(u) {
    if (u.stripeCustomer) return u.stripeCustomer;
    const c = await stripe.customers.create(
      { email: u.email, name: u.name, metadata: { userId: u.id } },
      { idempotencyKey: "th-customer-" + u.id },
    );
    await users.updateOne({ id: u.id }, { $set: { stripeCustomer: c.id } });
    return c.id;
  }
  app.post(
    "/api/v1/billing/checkout",
    session,
    endpoint(async (req, res) => {
      if (!providers().billing) bad("Subscription checkout is not configured.", 503);
      const price = await stripe.prices.retrieve(process.env.STRIPE_PRICE_ID);
      if (
        price.currency !== "gbp" ||
        price.unit_amount !== 99 ||
        price.recurring?.interval !== "month" ||
        price.recurring.interval_count !== 1
      )
        bad("Billing price configuration does not match \xA30.99/month.", 503);
      const c = await customer(req.user);
      const active = await stripe.subscriptions.list({ customer: c, status: "all", limit: 100 });
      if (active.data.some((s) => ["active", "trialing", "past_due", "unpaid"].includes(s.status)))
        bad("You already have a subscription. Use Manage / cancel plan.");
      const freeUntil = rewardWindow(await accessEvents(db, req.user.id));
      if (freeUntil) bad("Your referral month is active. Subscribe when it ends; no payment is needed now.");
      const open = await stripe.checkout.sessions.list({ customer: c, status: "open", limit: 10 });
      const existing = open.data.find((s) => s.mode === "subscription");
      if (existing) return res.json({ url: existing.url });
      const checkout = await stripe.checkout.sessions.create(
        {
          customer: c,
          mode: "subscription",
          line_items: [{ price: price.id, quantity: 1 }],
          client_reference_id: req.user.id,
          subscription_data: { metadata: { userId: req.user.id } },
          success_url: origin + "/?checkout=complete#app",
          cancel_url: origin + "/?checkout=cancelled#app",
        },
        { idempotencyKey: "checkout-" + req.user.id + "-" + Math.floor(Date.now() / 18e5) },
      );
      res.json({ url: checkout.url });
    }),
  );
  app.post(
    "/api/v1/billing/portal",
    session,
    endpoint(async (req, res) => {
      if (!stripe || !req.user.stripeCustomer) bad("No subscription customer exists.");
      await applyInvoiceCredits(req.user);
      const portal = await stripe.billingPortal.sessions.create({
        customer: req.user.stripeCustomer,
        return_url: origin + "/#app",
      });
      res.json({ url: portal.url });
    }),
  );
  async function accessState(u) {
    const freeUntil = rewardWindow(await accessEvents(db, u.id));
    return {
      free: !!freeUntil,
      freeUntil,
      subscribed: !!(u.subscription && ["active", "trialing"].includes(u.subscription.status)),
      billingConfigured: providers().billing,
      pricePence: 99,
    };
  }
  app.get(
    "/api/v1/account/access",
    session,
    endpoint(async (req, res) => res.json(await accessState(req.user))),
  );
  app.post(
    "/api/v1/account/coupon",
    session,
    endpoint(async (req, res) => {
      await redeemCoupon(db, req.user, req.body.code);
      res.json(await accessState(req.user));
    }),
  );
  app.get("/api/v1/account/bank", session, (req, res) =>
    res.json(req.user.bank ? { name: req.user.bank.name, last4: req.user.bank.last4 } : {}),
  );
  app.post(
    "/api/v1/account/bank",
    session,
    endpoint(async (req, res) => {
      const name = String(req.body.name || "").trim(),
        sortCode = String(req.body.sortCode || "").replaceAll("-", ""),
        accountNumber = String(req.body.accountNumber || "");
      if (
        req.body.consent !== true ||
        !name ||
        name.length > 80 ||
        !/^\d{6}$/.test(sortCode) ||
        !/^\d{8}$/.test(accountNumber)
      )
        bad("Provide consent, account holder, 6-digit sort code and 8-digit account number.");
      const encrypted = encryptBank({ sortCode, accountNumber }, process.env.BANK_ENCRYPTION_KEY);
      await users.updateOne(
        { id: req.user.id },
        {
          $set: {
            bank: {
              name,
              last4: accountNumber.slice(-4),
              encrypted,
              savedAt: /* @__PURE__ */ new Date(),
              consentAt: /* @__PURE__ */ new Date(),
            },
          },
        },
      );
      res.json({ name, last4: accountNumber.slice(-4) });
    }),
  );
  app.post(
    "/api/v1/account/bank/remove",
    session,
    endpoint(async (req, res) => {
      await users.updateOne({ id: req.user.id }, { $unset: { bank: "" } });
      res.json({ ok: true });
    }),
  );
  const operator = (req, _res, next) => {
    if (!isOperator(req.user))
      return next(Object.assign(new Error("Operator access denied."), { status: 403 }));
    next();
  };
  const unlocked = (req, _res, next) => {
    if (!req.session.operatorUntil || new Date(req.session.operatorUntil) < /* @__PURE__ */ new Date())
      return next(
        Object.assign(new Error("Enter an authenticator code to unlock operator access."), { status: 403 }),
      );
    next();
  };
  app.use("/api/v1/operator", limit("operator"));
  app.post(
    "/api/v1/operator/unlock",
    session,
    operator,
    endpoint(async (req, res) => {
      let keys = {};
      try {
        keys = JSON.parse(process.env.OPERATOR_TOTP_SECRETS || "{}");
      } catch {}
      const secret = keys[req.user.id];
      if (!secret) bad("Operator authenticator is not configured.", 503);
      const code = String(req.body.code || "");
      if (!/^\d{6}$/.test(code)) bad("Invalid authenticator code.");
      const timestamp = Date.now();
      // Four consecutive invalid codes lock operator unlock for this account for 15 minutes.
      const reservation = throttle ? await throttle.reserve("totp", req.user.id) : null;
      if (reservation && !reservation.allowed)
        throw lockedError(
          reservation.retryAfter,
          "Too many invalid authenticator codes. Wait 15 minutes and try again.",
        );
      const offset = [-1, 0, 1].find((n) =>
        crypto.timingSafeEqual(Buffer.from(totp(secret, timestamp + n * 3e4)), Buffer.from(code)),
      );
      if (offset === void 0) {
        if (reservation && !(await throttle.failed(reservation)))
          throw lockedError(
            15 * 60,
            "Too many invalid authenticator codes. Operator unlock is paused for 15 minutes.",
          );
        bad("Invalid authenticator code.");
      }
      const counter = Math.floor(timestamp / 3e4) + offset;
      const changed = await users.updateOne(
        {
          id: req.user.id,
          $or: [{ lastOperatorCounter: { $lt: counter } }, { lastOperatorCounter: { $exists: false } }],
        },
        { $set: { lastOperatorCounter: counter } },
      );
      if (!changed.matchedCount) bad("Authenticator code already used. Wait for the next code.");
      await throttle?.clear("totp", req.user.id);
      await sessions.updateOne(
        { id: req.session.id },
        { $set: { operatorUntil: new Date(Date.now() + 15 * 6e4) } },
      );
      await audit.insertOne({
        id: id(),
        actorId: req.user.id,
        action: "operator unlocked",
        at: /* @__PURE__ */ new Date(),
      });
      res.json({ ok: true });
    }),
  );
  installAdmin(app, { db, session, operator, unlocked, endpoint, stripe, encryptBank });
  app.get(
    "/api/v1/operator/overview",
    session,
    operator,
    unlocked,
    endpoint(async (_req, res) => {
      const us = await users
          .find(
            {},
            {
              projection: {
                _id: 0,
                id: 1,
                name: 1,
                email: 1,
                phone: 1,
                suspended: 1,
                subscription: 1,
                createdAt: 1,
                lastLoginAt: 1,
              },
            },
          )
          .sort({ createdAt: -1 })
          .limit(200)
          .toArray(),
        hs = await households
          .find({}, { projection: { _id: 0, id: 1, name: 1, suspended: 1, members: 1 } })
          .limit(200)
          .toArray();
      const since = new Date(Date.now() - 30 * 86400000);
      const [totalUsers, newUsers, activeUsers, suspendedUsers, totalHouseholds, activeHouseholds] =
        await Promise.all([
          users.countDocuments({}),
          users.countDocuments({ createdAt: { $gte: since } }),
          users.countDocuments({ lastLoginAt: { $gte: since }, suspended: { $ne: true } }),
          users.countDocuments({ suspended: true }),
          households.countDocuments({}),
          households.countDocuments({ suspended: { $ne: true } }),
        ]);
      const metrics = {
        users: { total: totalUsers, new: newUsers, active: activeUsers, suspended: suspendedUsers },
        households: {
          total: totalHouseholds,
          active: activeHouseholds,
          suspended: totalHouseholds - activeHouseholds,
        },
      };
      const list = async (name) =>
        db
          .collection(name)
          .find({}, { projection: { _id: 0 } })
          .limit(500)
          .toArray();
      res.json({
        metrics,
        users: us.map((u) => ({ ...u, plan: u.subscription?.status || "No active subscription" })),
        households: hs.map((h) => ({
          id: h.id,
          name: h.name,
          suspended: h.suspended,
          count: h.members.length,
        })),
        payments: await list("paymentRecords"),
        referralEvents: await list("referrals"),
        coupons: await list("coupons"),
        campaigns: await list("retentionCampaigns"),
        tickets: await list("supportTickets"),
        settings:
          (await db.collection("platformSettings").findOne({ id: "public" }, { projection: { _id: 0 } })) ||
          defaultSettings,
        providers: providers(),
        audit: await audit
          .find({}, { projection: { _id: 0 } })
          .sort({ at: -1 })
          .limit(100)
          .toArray(),
        limits: { users: 200, households: 200, other: 500, audit: 100 },
      });
    }),
  );
  app.post(
    "/api/v1/operator/action",
    session,
    operator,
    unlocked,
    endpoint(async (req, res) => {
      const { entity, suspended } = req.body,
        target = String(req.body.id || ""),
        reason = String(req.body.reason || "").trim();
      if (
        !["users", "households"].includes(entity) ||
        typeof suspended !== "boolean" ||
        !reason ||
        reason.length > 500
      )
        bad("Choose an entity and provide a reason.");
      if (entity === "users" && target === req.user.id) bad("You cannot suspend your own operator account.");
      const collection = entity === "users" ? users : households;
      const found = await collection.findOne({ id: target });
      if (!found) bad("Record not found.", 404);
      const event = {
        id: id(),
        actorId: req.user.id,
        action: (suspended ? "Suspend " : "Restore ") + entity,
        entityId: target,
        reason,
        at: /* @__PURE__ */ new Date(),
        status: "requested",
      };
      await audit.insertOne(event);
      await collection.updateOne(
        { id: target },
        { $set: { suspended }, ...(entity === "households" ? { $inc: { version: 1 } } : {}) },
      );
      if (entity === "users" && suspended) await sessions.deleteMany({ userId: target });
      await audit.updateOne({ id: event.id }, { $set: { status: "completed" } });
      res.json({ ok: true });
    }),
  );
  return { login, referrer, hasAccess, requirePaid, qualify };
}
async function syncInvoiceCredits(db, stripe, u) {
  if (!stripe || !u.stripeCustomer) return;
  const rewards = db.collection("referrals");
  const events = await rewards
    .find({ ownerId: u.id, kind: "invoice", stripeCreditId: { $exists: false } })
    .toArray();
  for (const e of events) {
    let credit;
    for await (const t of stripe.customers.listBalanceTransactions(u.stripeCustomer, { limit: 100 })) {
      if (t.metadata?.referralId === e.id) {
        credit = t;
        break;
      }
    }
    if (!credit)
      credit = await stripe.customers.createBalanceTransaction(
        u.stripeCustomer,
        {
          amount: -99,
          currency: "gbp",
          description: "SplitWisee referral: one monthly fee",
          metadata: { referralId: e.id },
        },
        { idempotencyKey: e.id },
      );
    await rewards.updateOne(
      { id: e.id },
      { $set: { stripeCreditId: credit.id, status: "invoice credit applied" } },
    );
  }
}
async function retryReferralCredits(db) {
  const stripe = stripeClient();
  if (!stripe) return;
  const rows = await db
    .collection("referrals")
    .find({ kind: "invoice", stripeCreditId: { $exists: false } })
    .limit(100)
    .toArray();
  for (const ownerId of new Set(rows.map((x) => x.ownerId))) {
    const u = await db.collection("users").findOne({ id: ownerId });
    if (u) await syncInvoiceCredits(db, stripe, u);
  }
}
export {
  billingWebhook,
  encryptBank,
  installPlatform,
  isOperator,
  nextMonth,
  retryReferralCredits,
  rewardWindow,
  syncInvoiceCredits,
  totp,
};
