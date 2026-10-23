import { formatDate, formatMoney, todayIso } from "../../../src/utils/format.js";
import { AdminIcon } from "../components/AdminIcon.jsx";

const SHADES = ["#147d64", "#7fbaa2", "#d6ad76", "#47695d", "#b9d8c9"];
const PROVIDER_LABELS = {
  email: "Email",
  google: "Google sign-in",
  phone: "Phone verification",
  billing: "Stripe billing",
  bankEncryption: "Bank encryption",
};

function lastSixMonths() {
  const [year, month] = todayIso().split("-").map(Number);
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 6 + index, 1));
    return {
      key: date.toISOString().slice(0, 7),
      label: date.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
    };
  });
}

function RevenueChart({ payments }) {
  const months = lastSixMonths().map((month) => ({
    ...month,
    pence: payments
      .filter((payment) => payment.at?.startsWith(month.key))
      .reduce((sum, payment) => sum + payment.amountPence, 0),
  }));
  const peak = Math.max(100, ...months.map((month) => month.pence));
  const x = (index) => 45 + index * 88;
  const y = (pence) => 188 - (pence / peak) * 150;
  const points = months.map((month, index) => `${x(index)},${y(month.pence)}`).join(" ");

  return (
    <svg
      viewBox="0 0 520 225"
      role="img"
      aria-label={months.map((month) => `${month.label} ${formatMoney(month.pence)}`).join(", ")}
    >
      <defs>
        <linearGradient id="admin-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#147d64" stopOpacity=".23" />
          <stop offset="100%" stopColor="#147d64" stopOpacity=".01" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map((line) => (
        <g key={line}>
          <line x1="45" x2="485" y1={38 + line * 50} y2={38 + line * 50} stroke="var(--line)" />
          <text x="0" y={42 + line * 50}>
            {formatMoney((peak * (3 - line)) / 3)}
          </text>
        </g>
      ))}
      <polygon points={`45,188 ${points} 485,188`} fill="url(#admin-area)" />
      <polyline points={points} fill="none" stroke="#147d64" strokeWidth="2.5" strokeLinejoin="round" />
      {months.map((month, index) => (
        <g key={month.key}>
          <circle cx={x(index)} cy={y(month.pence)} r="3.5" fill="#147d64" />
          <text x={x(index)} y="216" textAnchor="middle">
            {month.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function PlanDonut({ users }) {
  const counts = Object.entries(
    users.reduce((totals, user) => {
      const plan = user.suspended ? "Suspended" : user.plan || "No plan";
      return { ...totals, [plan]: (totals[plan] ?? 0) + 1 };
    }, {}),
  );
  let cursor = 0;
  const segments = counts.map(([, count], index) => {
    const start = cursor;
    cursor += (count / Math.max(users.length, 1)) * 100;
    return `${SHADES[index % SHADES.length]} ${start}% ${cursor}%`;
  });

  return (
    <>
      <div
        className="admin-donut"
        role="img"
        aria-label={counts.map(([plan, count]) => `${plan}: ${count}`).join(", ") || "No users"}
        style={{ background: segments.length ? `conic-gradient(${segments.join(",")})` : "var(--line)" }}
      >
        <div>
          <strong>{users.length}</strong>
          <span>Users shown</span>
        </div>
      </div>
      <div className="admin-legend">
        {counts.map(([plan, count], index) => (
          <span key={plan}>
            <i style={{ background: SHADES[index % SHADES.length] }} />
            {plan}
            <b>{count}</b>
          </span>
        ))}
      </div>
    </>
  );
}

export function OverviewSection({ data, onNavigate }) {
  const paid = data.payments.filter((payment) => payment.status === "paid");
  const openTickets = data.tickets.filter((ticket) => ticket.status === "open").length;
  const metrics = [
    ["Total users", data.metrics?.users.total ?? data.users.length, "users", "Users"],
    ["Households", data.metrics?.households.total ?? data.households.length, "home", "Households"],
    [
      "Revenue received",
      formatMoney(paid.reduce((sum, payment) => sum + payment.amountPence, 0)),
      "wallet",
      "Payments",
    ],
    [
      "Failed payments",
      data.payments.filter((payment) => payment.status === "failed").length,
      "chart",
      "Payments",
    ],
    ["Open support requests", openTickets, "help", "Support"],
    ["Active coupons", data.coupons.filter((coupon) => coupon.active).length, "tag", "Coupons"],
  ];
  const attention = [
    ["Support requests", `${openTickets} open`, "Support", "help"],
    [
      "Payment follow-up",
      `${data.users.filter((user) => user.plan === "past_due").length} overdue plans`,
      "Payments",
      "wallet",
    ],
    [
      "Retention drafts",
      `${data.campaigns.filter((campaign) => campaign.status === "draft").length} ready to review`,
      "Retention",
      "chart",
    ],
  ];

  return (
    <>
      <div className="admin-stats">
        {metrics.map(([label, value, icon, destination]) => (
          <button
            type="button"
            className="card admin-metric"
            key={label}
            onClick={() => onNavigate(destination)}
          >
            <span className="admin-metric-icon">
              <AdminIcon name={icon} />
            </span>
            <strong>{value}</strong>
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="admin-panels">
        <section className="card admin-chart">
          <div className="admin-panel-heading">
            <h2>Revenue overview</h2>
            <span className="pill">Last 6 months</span>
          </div>
          <p>Paid subscription invoices · GBP</p>
          <RevenueChart payments={paid} />
          <small>From recorded Stripe invoices; failed and refunded payments are excluded.</small>
        </section>
        <section className="card admin-chart">
          <div className="admin-panel-heading">
            <h2>Account distribution</h2>
            <button type="button" className="btn text small" onClick={() => onNavigate("Users")}>
              View users →
            </button>
          </div>
          <p>Plan status of the users listed</p>
          <PlanDonut users={data.users} />
        </section>
        <section className="card">
          <div className="admin-panel-heading">
            <h2>Recent activity</h2>
            <button type="button" className="btn text small" onClick={() => onNavigate("Audit")}>
              View audit →
            </button>
          </div>
          {data.audit.slice(0, 4).map((event, index) => (
            <div className="admin-activity" key={event.id ?? index}>
              <span className="admin-metric-icon">
                <AdminIcon name="list" />
              </span>
              <div>
                <strong>{event.action}</strong>
                <small>{event.reason || event.actorId}</small>
              </div>
              <time dateTime={event.at}>{formatDate(event.at)}</time>
            </div>
          ))}
          {!data.audit.length && <p>No activity recorded yet.</p>}
        </section>
        <section className="card">
          <div className="admin-panel-heading">
            <h2>Needs your attention</h2>
          </div>
          {attention.map(([title, detail, destination, icon]) => (
            <button
              type="button"
              className="admin-priority"
              key={title}
              onClick={() => onNavigate(destination)}
            >
              <span className="admin-metric-icon">
                <AdminIcon name={icon} />
              </span>
              <span>
                <strong>{title}</strong>
                <small>{detail}</small>
              </span>
              <span aria-hidden="true">→</span>
            </button>
          ))}
        </section>
        <section className="card admin-connections">
          <div className="admin-panel-heading">
            <h2>Service connections</h2>
            <span className="caption">Server configuration</span>
          </div>
          <div>
            {Object.entries(data.providers ?? {}).map(([key, configured]) => (
              <div key={key}>
                <span>{PROVIDER_LABELS[key] ?? key}</span>
                <span className={`pill ${configured ? "mint" : ""}`.trim()}>
                  {configured ? "Configured" : "Not connected"}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
