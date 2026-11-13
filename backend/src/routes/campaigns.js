import { londonToday } from "../modules/periods/index.js";
import {
  CHARITY_ID,
  charityStatement,
  cleanCharity,
  cleanPromotion,
  loadCharity,
  loadPromotion,
  PROMOTION_DEFAULTS,
  PROMOTION_ID,
  promotionKey,
  promotionState,
  publicCharity,
} from "../services/campaigns.js";

const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};

// Public campaign content, the member's promotion claim and the platform owner's audited campaign settings.
export function installCampaigns(app, { db, session, endpoint, guard, event, rewardWindow, accessEvents }) {
  const settings = db.collection("platformSettings");

  app.get(
    "/api/v1/public/promotion",
    endpoint(async (_req, res) => res.json(promotionState(await loadPromotion(db)))),
  );
  app.get(
    "/api/v1/public/charity",
    endpoint(async (_req, res) => res.json(publicCharity(await loadCharity(db)))),
  );

  // Claiming grants free access months (£0, nothing is charged). The server checks the schedule, the claim limit,
  // one claim per account and that no other free month is already running.
  app.post(
    "/api/v1/account/promotion",
    session,
    endpoint(async (req, res) => {
      const promotion = await loadPromotion(db);
      const state = promotionState(promotion);
      if (!state.active) fail("There is no offer running right now.", 409);
      if (state.upcoming) fail(`This offer opens on ${promotion.startsAt}.`, 409);
      if (!state.redeemable) fail("This offer has reached its claim limit.", 409);
      const user = req.user;
      if (user.subscription && ["active", "trialing"].includes(user.subscription.status))
        fail("You already have a subscription. This offer is for accounts without one.", 409);
      const key = promotion.key;
      const redemptions = db.collection("promotionRedemptions");
      if (await redemptions.findOne({ id: `${key}:${user.id}` }))
        fail("You have already claimed this offer.", 409);
      if (rewardWindow(await accessEvents(db, user.id)))
        fail(
          `A free month is already running on your account. The offer cannot be combined with it; claim it after that month ends (by ${promotion.endsAt}).`,
          409,
        );

      await settings.updateOne(
        { id: PROMOTION_ID },
        { $setOnInsert: { ...PROMOTION_DEFAULTS, key, used: 0 } },
        { upsert: true },
      );
      const counted = await settings.findOneAndUpdate(
        { id: PROMOTION_ID, key, enabled: true, $expr: { $lt: ["$used", "$maxRedemptions"] } },
        { $inc: { used: 1 } },
        { returnDocument: "after" },
      );
      if (!counted) fail("This offer has reached its claim limit.", 409);
      const now = new Date();
      try {
        await redemptions.insertOne({
          id: `${key}:${user.id}`,
          key,
          userId: user.id,
          freeMonths: promotion.freeMonths,
          at: now,
        });
      } catch (error) {
        await settings.updateOne({ id: PROMOTION_ID, key }, { $inc: { used: -1 } });
        if (error?.code === 11000) fail("You have already claimed this offer.", 409);
        throw error;
      }
      for (let month = 1; month <= promotion.freeMonths; month++)
        await db.collection("accessGrants").updateOne(
          { id: `${key}:${user.id}:${month}` },
          {
            $setOnInsert: {
              ownerId: user.id,
              kind: "access",
              source: `promotion:${key}`,
              at: now,
              amountPence: 0,
            },
          },
          { upsert: true },
        );
      res.status(201).json({
        claimed: true,
        freeMonths: promotion.freeMonths,
        pricePence: 0,
        freeUntil: rewardWindow(await accessEvents(db, user.id)),
      });
    }),
  );

  app.post(
    "/api/v1/operator/promotion",
    ...guard,
    endpoint(async (req, res) => {
      const next = cleanPromotion(req.body);
      const current = await loadPromotion(db);
      const key = promotionKey(next);
      await event(req, `Promotion ${next.enabled ? "scheduled" : "switched off"}: ${next.title}`, () =>
        settings.updateOne(
          { id: PROMOTION_ID },
          {
            $set: {
              ...next,
              key,
              ...(key !== current.key ? { used: 0 } : {}),
              updatedAt: new Date(),
              updatedBy: req.user.id,
            },
            ...(key === current.key ? { $setOnInsert: { used: 0 } } : {}),
          },
          { upsert: true },
        ),
      );
      const saved = await loadPromotion(db);
      res.json({ promotion: saved, state: promotionState(saved, londonToday()) });
    }),
  );

  // Charity wording is versioned: each save keeps the previous text in its history.
  app.post(
    "/api/v1/operator/charity",
    ...guard,
    endpoint(async (req, res) => {
      const next = cleanCharity(req.body);
      const current = await loadCharity(db);
      const version = (current.version || 0) + 1;
      const now = new Date();
      const entry = {
        version,
        at: now,
        by: req.user.id,
        published: next.published,
        statement: next.beneficiary ? charityStatement(next) : `${next.percent}% of our ${next.basis}`,
      };
      await event(
        req,
        `Charity commitment ${next.published ? "published" : "saved as draft"} (v${version})`,
        () =>
          settings.updateOne(
            { id: CHARITY_ID },
            {
              $set: {
                ...next,
                version,
                updatedAt: now,
                updatedBy: req.user.id,
                publishedAt: next.published ? (current.published ? current.publishedAt : now) : null,
                history: [entry, ...(current.history || [])].slice(0, 20),
              },
            },
            { upsert: true },
          ),
      );
      res.json({ charity: await loadCharity(db) });
    }),
  );
}
