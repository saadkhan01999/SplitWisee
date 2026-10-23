import { installFinance } from "./finance.js";
import crypto from "node:crypto";
import { normaliseCoupon } from "../services/promotions.js";
const id = () => crypto.randomUUID(),
  bad = (m, status = 400) => {
    throw Object.assign(new Error(m), { status });
  };
import { defaultSettings, cleanWebsite } from "../modules/site-settings/index.js";
function installAdmin(app, { db, session, operator, unlocked, endpoint, stripe, encryptBank }) {
  const audit = db.collection("operatorAudit");
  const guard = [session, operator, unlocked];
  const reason = (req) => {
    const r = String(req.body.reason || "").trim();
    if (!r || r.length > 500) bad("Provide an audit reason of 1\u2013500 characters.");
    return r;
  };
  async function event(req, action, fn) {
    const record = {
      id: id(),
      actorId: req.user.id,
      action,
      reason: reason(req),
      at: /* @__PURE__ */ new Date(),
      status: "requested",
    };
    await audit.insertOne(record);
    try {
      const result = await fn();
      await audit.updateOne({ id: record.id }, { $set: { status: "completed" } });
      return result;
    } catch (e) {
      await audit.updateOne({ id: record.id }, { $set: { status: "failed" } });
      throw e;
    }
  }
  installFinance(app, { db, guard, endpoint, stripe, event, encryptBank });
  app.get(
    "/api/v1/public/settings",
    endpoint(async (_req, res) => {
      const s = await db.collection("platformSettings").findOne({ id: "public" });
      const safe = {};
      for (const key of Object.keys(defaultSettings)) safe[key] = s?.[key] ?? defaultSettings[key];
      res.json(safe);
    }),
  );
  app.post(
    "/api/v1/operator/coupons",
    ...guard,
    endpoint(async (req, res) => {
      const c = normaliseCoupon(req.body);
      await event(req, "Coupon created: " + c.code, async () => {
        try {
          await db
            .collection("coupons")
            .insertOne({ ...c, createdAt: /* @__PURE__ */ new Date(), createdBy: req.user.id });
        } catch (e) {
          if (e?.code === 11e3) bad("That coupon code already exists.", 409);
          throw e;
        }
      });
      res.status(201).json(c);
    }),
  );
  app.post(
    "/api/v1/operator/coupons/status",
    ...guard,
    endpoint(async (req, res) => {
      if (typeof req.body.active !== "boolean") bad("Choose an active status.");
      await event(req, "Coupon status: " + req.body.code, async () => {
        const r = await db
          .collection("coupons")
          .updateOne({ code: String(req.body.code) }, { $set: { active: req.body.active } });
        if (!r.matchedCount) bad("Coupon not found.", 404);
      });
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/v1/operator/grant",
    ...guard,
    endpoint(async (req, res) => {
      if (!/^[a-f0-9-]{36}$/i.test(String(req.body.requestId || "")))
        bad("Provide an idempotent request ID.");
      const user = await db
        .collection("users")
        .findOne({ id: String(req.body.userId || ""), verifiedAt: { $ne: null }, suspended: { $ne: true } });
      if (!user) bad("Verified user not found.", 404);
      if (user.subscription && ["active", "trialing"].includes(user.subscription.status))
        bad(
          "Use a billing credit in Stripe for an active subscriber. This grant is for access without a subscription.",
        );
      await event(req, "One access month granted: " + user.id, async () => {
        await db.collection("accessGrants").updateOne(
          { id: req.body.requestId },
          {
            $setOnInsert: {
              ownerId: user.id,
              kind: "access",
              at: /* @__PURE__ */ new Date(),
              amountPence: 99,
              reason: reason(req),
              actorId: req.user.id,
            },
          },
          { upsert: true },
        );
      });
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/v1/operator/payments/refund",
    ...guard,
    endpoint(async (req, res) => {
      if (!stripe) bad("Stripe is not configured.", 503);
      const payment = await db.collection("paymentRecords").findOne({ id: String(req.body.id || "") });
      if (!payment || payment.status !== "paid") bad("Paid invoice not found or already refunded.", 409);
      if (!payment.paymentIntent)
        bad("This invoice has no refundable payment reference. Review it in Stripe.", 409);
      await event(req, "Full refund requested: " + payment.id, async () => {
        const refund = await stripe.refunds.create(
          {
            payment_intent: payment.paymentIntent,
            amount: payment.amountPence,
            metadata: { operatorId: req.user.id, reason: reason(req) },
          },
          { idempotencyKey: "splitwisee-refund-" + payment.id },
        );
        await db.collection("paymentRecords").updateOne(
          { id: payment.id },
          {
            $set: {
              status: refund.status === "succeeded" ? "refunded" : "refund_pending",
              refundId: refund.id,
              refundStatus: refund.status,
            },
          },
        );
      });
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/v1/operator/settings",
    ...guard,
    endpoint(async (req, res) => {
      const settings = cleanWebsite(req.body);
      await event(req, "Public website settings changed", () =>
        db
          .collection("platformSettings")
          .updateOne({ id: "public" }, { $set: { ...settings, updatedAt: new Date() } }, { upsert: true }),
      );
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/v1/operator/campaigns",
    ...guard,
    endpoint(async (req, res) => {
      const title = String(req.body.title || "").trim(),
        message = String(req.body.message || "").trim(),
        audience = String(req.body.audience || "");
      if (
        !title ||
        title.length > 100 ||
        !message ||
        message.length > 1e3 ||
        !["Free month ending", "Inactive for 30 days", "Payment failed", "New household owners"].includes(
          audience,
        )
      )
        bad("Provide a title, supported audience and message.");
      await event(req, "Retention draft created", () =>
        db.collection("retentionCampaigns").insertOne({
          id: id(),
          title,
          message,
          audience,
          status: "draft",
          at: /* @__PURE__ */ new Date(),
          createdBy: req.user.id,
        }),
      );
      res.status(201).json({ ok: true });
    }),
  );
  app.post(
    "/api/v1/operator/support",
    ...guard,
    endpoint(async (req, res) => {
      const note = String(req.body.note || "");
      if (!["open", "resolved"].includes(req.body.status) || !note.trim() || note.length > 1e3)
        bad("Provide a status and resolution note.");
      const ticketId = String(req.body.id || "");
      await event(req, "Support request updated: " + ticketId, async () => {
        const r = await db
          .collection("supportTickets")
          .updateOne(
            { id: ticketId },
            { $set: { status: req.body.status, note, updatedAt: /* @__PURE__ */ new Date() } },
          );
        if (!r.matchedCount) bad("Support request not found.", 404);
      });
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/v1/account/support",
    session,
    endpoint(async (req, res) => {
      const subject = String(req.body.subject || "").trim(),
        message = String(req.body.message || "").trim();
      if (!subject || subject.length > 120 || !message || message.length > 2e3)
        bad("Provide a subject and message.");
      const ticket = {
        id: id(),
        userId: req.user.id,
        email: req.user.email || "",
        subject,
        message,
        status: "open",
        at: /* @__PURE__ */ new Date(),
      };
      await db.collection("supportTickets").insertOne(ticket);
      res.status(201).json({ id: ticket.id });
    }),
  );
}
export { defaultSettings, installAdmin };
