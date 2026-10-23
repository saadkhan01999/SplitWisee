import { cleanWebsite, defaultSettings } from "@domain/site-settings/index.js";
import { todayIso } from "../../../src/utils/format.js";

// Every operator write: its dialog title, starting form values and the audited API request it sends.
// A written reason is required for all of them and is stored in the operator audit log.

const nextYear = () => `${Number(todayIso().slice(0, 4)) + 1}-12-31`;

export const CAMPAIGN_AUDIENCES = [
  "Free month ending",
  "Inactive for 30 days",
  "Payment failed",
  "New household owners",
];

export const WEBSITE_TEXT_FIELDS = [
  ["eyebrow", "Hero eyebrow", 100],
  ["headline", "Headline", 100],
  ["heroAccent", "Headline second line", 100],
  ["heroDescription", "Hero description", 300],
  ["ctaLabel", "Main button label", 40],
  ["featuresHeading", "Features heading", 120],
  ["pricingHeading", "Pricing heading", 120],
  ["footerText", "Footer tagline", 100],
  ["seoTitle", "Browser and search title", 70],
  ["seoDescription", "Search description", 160],
  ["announcement", "Single announcement (used when there are no slides)", 240],
  ["maintenanceMessage", "Maintenance message", 240],
  ["supportEmail", "Support email", 100],
  ["privacyUrl", "Privacy policy URL (HTTPS)", 500],
  ["termsUrl", "Terms URL (HTTPS)", 500],
];

export const WEBSITE_SWITCHES = [
  ["announcementAutoplay", "Auto-play announcement slides"],
  ["showInstall", "Show the mobile install button"],
  ["showPricing", "Show the pricing section"],
  ["maintenance", "Show the maintenance notice (does not lock anyone out)"],
];

export const ACTIONS = {
  coupon: {
    title: "Create a promotional coupon",
    initial: () => ({ code: "", limit: "100", expires: nextYear() }),
    request: ({ code, limit, expires, reason }) => {
      const coupon = {
        code: code.trim().toUpperCase(),
        months: 1,
        limit: Number(limit),
        used: 0,
        expires,
        active: true,
      };
      if (!/^[A-Z0-9-]{4,30}$/.test(coupon.code))
        throw new Error("Use 4–30 letters, numbers or hyphens for the code.");
      if (!Number.isInteger(coupon.limit) || coupon.limit < 1 || coupon.limit > 10_000)
        throw new Error("Set a redemption limit between 1 and 10,000.");
      if (expires < todayIso()) throw new Error("Choose an expiry date in the future.");
      return { path: "/operator/coupons", body: { ...coupon, reason } };
    },
  },
  couponToggle: {
    title: (coupon) => (coupon.active ? "Disable coupon" : "Enable coupon"),
    request: ({ reason }, coupon) => ({
      path: "/operator/coupons/status",
      body: { code: coupon.code, active: !coupon.active, reason },
    }),
  },
  toggle: {
    title: (record) => (record.suspended ? "Restore access" : "Suspend access"),
    request: ({ reason }, record) => ({
      path: "/operator/action",
      body: { entity: record.entity, id: record.id, suspended: !record.suspended, reason },
    }),
  },
  grant: {
    title: "Grant one free month",
    request: ({ reason }, user, requestId) => ({
      path: "/operator/grant",
      body: { userId: user.id, reason, requestId },
    }),
  },
  refund: {
    title: "Refund this payment",
    request: ({ reason }, payment) => ({
      path: "/operator/payments/refund",
      body: { id: payment.id, reason },
    }),
  },
  campaign: {
    title: "Retention campaign draft",
    initial: () => ({
      title: "",
      audience: CAMPAIGN_AUDIENCES[0],
      message: "Your shared expenses are ready. Invite a friend to earn another month.",
    }),
    request: ({ title, audience, message, reason }) => ({
      path: "/operator/campaigns",
      body: { title: title.trim(), audience, message: message.trim(), reason },
    }),
  },
  ticket: {
    title: (ticket) => (ticket.status === "open" ? "Resolve support request" : "Reopen support request"),
    initial: (ticket) => ({ note: ticket.note ?? "" }),
    request: ({ note, reason }, ticket) => ({
      path: "/operator/support",
      body: {
        id: ticket.id,
        note: note.trim(),
        status: ticket.status === "open" ? "resolved" : "open",
        reason,
      },
    }),
  },
  website: {
    title: "Edit website content",
    initial: (_record, overview) => ({ ...defaultSettings, ...overview.settings }),
    request: (form) => ({ path: "/operator/settings", body: { ...cleanWebsite(form), reason: form.reason } }),
  },
};

export function actionTitle(kind, record) {
  const { title } = ACTIONS[kind];
  return typeof title === "function" ? title(record) : title;
}
