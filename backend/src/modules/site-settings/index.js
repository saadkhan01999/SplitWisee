export const defaultSettings = {
  headline: "Share a home.",
  announcement: "",
  announcements: [],
  announcementAutoplay: true,
  announcementSeconds: 8,
  supportEmail: "",
  maintenance: false,
  maintenanceMessage: "Some services may be temporarily unavailable.",
  heroAccent: "Not the money stress.",
  heroDescription:
    "From the weekly shop to the monthly bills, keep every receipt, fair share and repayment in one calm place.",
  ctaLabel: "Start sharing better",
  footerText: "Split simply. Live freely.",
  eyebrow: "A LITTLE CLARITY. A HAPPIER HOME.",
  featuresHeading: "A quick shop. A perfectly clear split.",
  pricingHeading: "Small price. One less thing to worry about.",
  showInstall: true,
  showPricing: true,
  privacyUrl: "",
  termsUrl: "",
  seoTitle: "SplitWisee — Shared living. Clear spending.",
  seoDescription: "Shared household expenses, receipt scanning and fair monthly settlements.",
};
export function cleanWebsite(input) {
  const out = {};
  for (const [key, max] of Object.entries({
    headline: 100,
    announcement: 240,
    supportEmail: 100,
    maintenanceMessage: 240,
    heroAccent: 100,
    heroDescription: 300,
    ctaLabel: 40,
    footerText: 100,
    eyebrow: 100,
    featuresHeading: 120,
    pricingHeading: 120,
    seoTitle: 70,
    seoDescription: 160,
  })) {
    out[key] = String(input[key] ?? defaultSettings[key]).trim();
    if (out[key].length > max || (!["announcement", "supportEmail"].includes(key) && !out[key]))
      throw Error("Check website field: " + key);
  }
  if (out.supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.supportEmail))
    throw Error("Enter a valid support email.");
  for (const key of ["privacyUrl", "termsUrl"]) {
    out[key] = String(input[key] || "").trim();
    if (out[key]) {
      let u;
      try {
        u = new URL(out[key]);
      } catch {}
      if (!u || u.protocol !== "https:" || u.username || u.password || out[key].length > 500)
        throw Error("Legal links must use a valid HTTPS address.");
    }
  }
  if (input.announcements !== undefined && !Array.isArray(input.announcements))
    throw Error("Announcements must be a list.");
  out.announcements = (input.announcements || []).map((x) => String(x).trim()).filter(Boolean);
  if (out.announcements.length > 5 || out.announcements.some((x) => x.length > 240))
    throw Error("Use up to five announcements, each at most 240 characters.");
  for (const key of ["maintenance", "announcementAutoplay", "showInstall", "showPricing"])
    out[key] = input[key] === undefined ? defaultSettings[key] : input[key] === true;
  out.announcementSeconds = Number(input.announcementSeconds ?? 8);
  if (
    !Number.isInteger(out.announcementSeconds) ||
    out.announcementSeconds < 5 ||
    out.announcementSeconds > 30
  )
    throw Error("Announcement delay must be 5–30 seconds.");
  return out;
}
