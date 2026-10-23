// Additive MongoDB model registry. See models/ for individual collection validators.
import users from "./models/users.js";
import households from "./models/households.js";
import sessions from "./models/sessions.js";
import tokens from "./models/tokens.js";
import receipts from "./models/receipts.js";
import referrals from "./models/referrals.js";
import welcomeBenefits from "./models/welcomeBenefits.js";
import accessGrants from "./models/accessGrants.js";
import coupons from "./models/coupons.js";
import couponRedemptions from "./models/couponRedemptions.js";
import billingEvents from "./models/billingEvents.js";
import paymentRecords from "./models/paymentRecords.js";
import operatorAudit from "./models/operatorAudit.js";
import platformBankEntries from "./models/platformBankEntries.js";
import platformSettings from "./models/platformSettings.js";
import retentionCampaigns from "./models/retentionCampaigns.js";
import supportTickets from "./models/supportTickets.js";
import throttles from "./models/throttles.js";
export const validators = {
  users,
  households,
  sessions,
  tokens,
  receipts,
  referrals,
  welcomeBenefits,
  accessGrants,
  coupons,
  couponRedemptions,
  billingEvents,
  paymentRecords,
  operatorAudit,
  platformBankEntries,
  platformSettings,
  retentionCampaigns,
  supportTickets,
  throttles,
};
