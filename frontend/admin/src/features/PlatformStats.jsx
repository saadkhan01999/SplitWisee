import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { api } from "../../../src/api/client.js";
import { Button } from "../../../src/components/Button.jsx";
import { Field, FormError } from "../../../src/components/Field.jsx";
import { formatDateTime, formatMoney, todayIso } from "../../../src/utils/format.js";
import { operatorLocked } from "../operatorSlice.js";

const PRESETS = [
  ["7 days", 7],
  ["30 days", 30],
  ["90 days", 90],
  ["12 months", 365],
];
const minus = (iso, days) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days + 1);
  return date.toISOString().slice(0, 10);
};

/**
 * Live platform statistics for the owner. Aggregates only: the API never returns household names, members or
 * personal transactions here, and every request needs the authenticator unlock.
 */
export function PlatformStats() {
  const dispatch = useDispatch();
  const today = todayIso();
  const [range, setRange] = useState({ from: minus(today, 30), to: today });
  const initialRange = useRef(range);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async ({ from, to }) => {
      setLoading(true);
      setError("");
      try {
        setStats(await api.get(`/operator/stats?from=${from}&to=${to}`));
      } catch (failure) {
        if (failure.status === 403 && /unlock/i.test(failure.message)) dispatch(operatorLocked());
        setError(failure.message);
      } finally {
        setLoading(false);
      }
    },
    [dispatch],
  );

  // Loads once on open; later loads follow the presets, the date filter and Refresh.
  useEffect(() => {
    load(initialRange.current);
  }, [load]);

  const apply = (next) => {
    setRange(next);
    load(next);
  };

  const cards = stats
    ? [
        ["Active users", stats.users.active, `${stats.users.total} total · ${stats.users.new} new in range`],
        ["Active households", stats.households.active, `${stats.households.total} total · activity in range`],
        [
          "Pending payments",
          stats.settlements.pendingTransfers,
          `${formatMoney(stats.settlements.pendingPence)} awaiting recipient confirmation`,
        ],
        ["Coupon redemptions", stats.redemptions.coupons, "Welcome coupons in range"],
        [
          "Referral redemptions",
          stats.redemptions.referrals,
          `${stats.redemptions.referralsByInvitation} through household invitations`,
        ],
        ["Christmas offer claims", stats.redemptions.promotion, "£0 months claimed in range"],
        ["Invitations", stats.invitations.created, `${stats.invitations.accepted} accepted in range`],
        [
          "Subscription payments",
          formatMoney(stats.payments.paidPence),
          `${stats.payments.count} paid · ${formatMoney(stats.payments.refundedPence)} refunded`,
        ],
      ]
    : [];

  return (
    <section className="platform-stats">
      <div className="card stats-filter">
        <div className="chips" role="group" aria-label="Date range">
          {PRESETS.map(([label, days]) => {
            const next = { from: minus(today, days), to: today };
            const selected = range.from === next.from && range.to === next.to;
            return (
              <button
                key={label}
                type="button"
                className={selected ? "selected" : ""}
                aria-pressed={selected}
                onClick={() => apply(next)}
              >
                {label}
              </button>
            );
          })}
        </div>
        <form
          className="row wrap"
          onSubmit={(event) => {
            event.preventDefault();
            load(range);
          }}
        >
          <Field label="From">
            <input
              type="date"
              value={range.from}
              max={range.to}
              onChange={(event) => setRange({ ...range, from: event.target.value })}
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              value={range.to}
              min={range.from}
              onChange={(event) => setRange({ ...range, to: event.target.value })}
            />
          </Field>
          <Button type="submit" variant="outline" disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </form>
        {stats && (
          <p className="caption">
            Updated {formatDateTime(stats.range.generatedAt)} · {stats.range.from} to {stats.range.to} (UK
            dates)
          </p>
        )}
        <FormError>{error}</FormError>
      </div>

      {stats && (
        <>
          <div className="admin-stats">
            {cards.map(([label, value, note]) => (
              <div className="card admin-metric" key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
                <small>{note}</small>
              </div>
            ))}
          </div>
          <section className="card">
            <h3>Monthly trends</h3>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Month</th>
                    <th scope="col">Sign-ups</th>
                    <th scope="col">Closings</th>
                    <th scope="col">Referrals</th>
                    <th scope="col">Coupons</th>
                    <th scope="col">Offer claims</th>
                    <th scope="col">Payments</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.trend.map((row) => (
                    <tr key={row.month}>
                      <td>{row.month}</td>
                      <td>{row.signups}</td>
                      <td>{row.closings}</td>
                      <td>{row.referrals}</td>
                      <td>{row.couponRedemptions}</td>
                      <td>{row.promotionRedemptions}</td>
                      <td>{formatMoney(row.paymentsPence)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="caption">
              Aggregated figures only. Household spending and members’ transactions are not shown here; open a
              household record only with a lawful reason through the audited Households section.
            </p>
          </section>
        </>
      )}
    </section>
  );
}
