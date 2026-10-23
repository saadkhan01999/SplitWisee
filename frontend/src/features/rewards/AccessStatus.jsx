import { useNow } from "../../app/useNow.js";
import { formatDateTime } from "../../utils/format.js";
import { accessCountdown } from "../notifications/reminders.js";

/** Free-access countdown, earned referral months and invoice-credit status. */
export function AccessStatus({ data }) {
  const now = useNow();
  if (!data) return null;

  const left = data.freeUntil ? accessCountdown(data.freeUntil, now) : null;
  const referrals = (data.rewards ?? []).filter((reward) => !reward.source);
  const credits = referrals.filter((reward) => reward.kind === "invoice");
  const paid = ["active", "trialing"].includes(data.subscription);

  return (
    <section className="access-status" aria-label="Free access and rewards">
      <span className="eyebrow">YOUR ACCESS &amp; REWARDS</span>
      <h3>
        {left?.active
          ? `${left.days}d ${left.hours}h ${left.minutes}m of free access left`
          : paid
            ? "Your paid plan is active"
            : "Earn your next month free"}
      </h3>
      {left?.active && (
        <p>Free access ends {formatDateTime(data.freeUntil)}. No automatic charge starts when it ends.</p>
      )}
      {data.freeMonths > 0 && (
        <p className="reward-earned">
          ✓ You’ve earned {data.freeMonths} referral {data.freeMonths === 1 ? "month" : "months"}
          {credits.length ? " as invoice rewards." : "."}
        </p>
      )}
      {credits.length > 0 && (
        <p>
          {credits.filter((credit) => credit.credited).length} invoice credits confirmed;{" "}
          {credits.filter((credit) => !credit.credited).length} pending. Credits reduce future invoices and
          cannot be withdrawn as cash.
        </p>
      )}
      {data.bonusMonths > 0 && (
        <p>
          {data.bonusMonths} welcome or granted {data.bonusMonths === 1 ? "month" : "months"} recorded.
        </p>
      )}
      <p className="caption">
        Each qualifying new verified account earns one month. Sharing a link alone earns nothing. Totals
        include months already used.
      </p>
    </section>
  );
}
