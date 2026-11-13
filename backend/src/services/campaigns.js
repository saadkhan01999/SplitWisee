import { isIsoDate, londonToday } from "../modules/periods/index.js";

// Website campaigns managed by the platform owner: a scheduled promotion (Christmas 2026 by default) and the public
// charity commitment. Both are plain-text settings documents in `platformSettings`; every change is audited.

const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const text = (value, label, max, { required = true } = {}) => {
  const out = String(value ?? "").trim();
  if ((required && !out) || out.length > max) fail(`Enter ${label} (at most ${max} characters).`);
  return out;
};

export const PROMOTION_ID = "promotion";
export const PROMOTION_DEFAULTS = Object.freeze({
  enabled: true,
  title: "Christmas offer",
  banner:
    "Christmas offer: your first month of CoinSplit is free (100% off). Claim it from 1 to 31 December 2026.",
  details:
    "One free month (£0) per account for anyone without a subscription. Claim between 1 and 31 December 2026, up to 1,000 claims. It cannot be combined with a referral or welcome month that is already running.",
  announceFrom: "2026-11-01",
  startsAt: "2026-12-01",
  endsAt: "2026-12-31",
  freeMonths: 1,
  maxRedemptions: 1000,
});
/** Redemptions are counted per campaign; a new start date starts a new campaign with a fresh count. */
export const promotionKey = (promotion) => `promo-${promotion.startsAt}`;

export function cleanPromotion(input) {
  const out = {
    enabled: input.enabled === true,
    title: text(input.title, "an offer title", 60),
    banner: text(input.banner, "the banner text", 180),
    details: text(input.details, "the offer terms", 500),
    announceFrom: String(input.announceFrom || ""),
    startsAt: String(input.startsAt || ""),
    endsAt: String(input.endsAt || ""),
    freeMonths: Number(input.freeMonths),
    maxRedemptions: Number(input.maxRedemptions),
  };
  if (![out.announceFrom, out.startsAt, out.endsAt].every(isIsoDate))
    fail("Choose valid banner, start and end dates.");
  if (!(out.announceFrom <= out.startsAt && out.startsAt <= out.endsAt))
    fail(
      "The banner date must be on or before the start date, and the start date on or before the end date.",
    );
  if (!Number.isInteger(out.freeMonths) || out.freeMonths < 1 || out.freeMonths > 3)
    fail("Free months must be a whole number from 1 to 3.");
  if (!Number.isInteger(out.maxRedemptions) || out.maxRedemptions < 1 || out.maxRedemptions > 100000)
    fail("The claim limit must be a whole number from 1 to 100,000.");
  return out;
}

export async function loadPromotion(db) {
  const saved = await db
    .collection("platformSettings")
    .findOne({ id: PROMOTION_ID }, { projection: { _id: 0 } });
  const promotion = { ...PROMOTION_DEFAULTS, used: 0, ...saved, id: PROMOTION_ID };
  promotion.key = promotionKey(promotion);
  if (saved?.key && saved.key !== promotion.key) promotion.used = 0;
  return promotion;
}

/** What visitors see: the banner shows from `announceFrom` to `endsAt`; claims are open from `startsAt` to `endsAt`. */
export function promotionState(promotion, today = londonToday()) {
  const visible = promotion.enabled && today >= promotion.announceFrom && today <= promotion.endsAt;
  const remaining = Math.max(0, promotion.maxRedemptions - (promotion.used || 0));
  return {
    active: visible,
    redeemable: visible && today >= promotion.startsAt && remaining > 0,
    upcoming: visible && today < promotion.startsAt,
    soldOut: visible && remaining === 0,
    ...(visible
      ? {
          key: promotion.key,
          title: promotion.title,
          banner: promotion.banner,
          details: promotion.details,
          startsAt: promotion.startsAt,
          endsAt: promotion.endsAt,
          freeMonths: promotion.freeMonths,
          percentOff: 100,
          pricePence: 0,
        }
      : {}),
  };
}

export const CHARITY_ID = "charity";
export const CHARITY_DEFAULTS = Object.freeze({
  published: false,
  percent: 25,
  basis: "net profit from CoinSplit subscriptions",
  period: "each calendar year (1 January to 31 December)",
  beneficiary: "",
  conditions:
    "Net profit means subscription income after refunds, payment fees and operating costs, before tax. If a year makes no profit, no contribution is due for that year.",
  reporting:
    "Each year, once our accounts are finalised, we publish the amount given, the charity that received it and proof of payment.",
  effectiveFrom: "2027-01-01",
  version: 0,
});

export const charityStatement = (c) =>
  `${c.percent}% of our ${c.basis} goes to ${c.beneficiary}, ${c.period}.`;

export function cleanCharity(input) {
  const out = {
    published: input.published === true,
    percent: Number(input.percent),
    basis: text(input.basis, "what the percentage is of", 120),
    period: text(input.period, "the calculation period", 120),
    beneficiary: text(input.beneficiary, "the charity", 120, { required: false }),
    conditions: text(input.conditions, "the conditions", 600),
    reporting: text(input.reporting, "how it is reported", 400),
    effectiveFrom: String(input.effectiveFrom || ""),
  };
  if (!Number.isInteger(out.percent) || out.percent < 1 || out.percent > 100)
    fail("The percentage must be a whole number from 1 to 100.");
  if (!isIsoDate(out.effectiveFrom)) fail("Choose the date the commitment starts.");
  if (out.published && !out.beneficiary)
    fail("Name the charity before publishing. An unnamed charity claim cannot go on the website.");
  return out;
}

export async function loadCharity(db) {
  const saved = await db
    .collection("platformSettings")
    .findOne({ id: CHARITY_ID }, { projection: { _id: 0 } });
  return { ...CHARITY_DEFAULTS, history: [], ...saved, id: CHARITY_ID };
}

export function publicCharity(charity) {
  if (!charity.published || !charity.beneficiary) return { published: false };
  const { percent, basis, period, beneficiary, conditions, reporting, effectiveFrom, version, publishedAt } =
    charity;
  return {
    published: true,
    percent,
    basis,
    period,
    beneficiary,
    conditions,
    reporting,
    effectiveFrom,
    version,
    publishedAt,
    statement: charityStatement(charity),
  };
}
