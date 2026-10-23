import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button } from "../../../src/components/Button.jsx";
import { Logo } from "../../../src/components/Logo.jsx";
import { brand } from "../../../src/config/brand.js";
import { formatMoney } from "../../../src/utils/format.js";
import { AdminIcon } from "../components/AdminIcon.jsx";
import { loadOverview, selectOperator } from "../operatorSlice.js";
import { FinancePanel } from "./FinancePanel.jsx";
import { OperatorEditor } from "./OperatorEditor.jsx";
import { OverviewSection } from "./OverviewSection.jsx";
import { hasRecordsSection, RecordsSection } from "./RecordsSection.jsx";

const GROUPS = [
  ["Workspace", ["Overview", "Users", "Households"]],
  ["Billing & growth", ["Payments", "Referrals", "Coupons", "Retention"]],
  ["Management", ["Website", "Support", "Accounting", "Audit"]],
];
const ICONS = {
  Overview: "grid",
  Users: "users",
  Households: "home",
  Payments: "wallet",
  Referrals: "share",
  Coupons: "tag",
  Retention: "chart",
  Website: "globe",
  Support: "help",
  Accounting: "books",
  Audit: "list",
};

function PeopleMetrics({ section, data }) {
  const metrics =
    section === "Users"
      ? [
          ["Total users", data.metrics.users.total],
          ["New in 30 days", data.metrics.users.new],
          ["Signed in within 30 days", data.metrics.users.active],
          ["Suspended", data.metrics.users.suspended],
        ]
      : [
          ["Total households", data.metrics.households.total],
          ["Active households", data.metrics.households.active],
          ["Suspended", data.metrics.households.suspended],
          ["Memberships listed", data.households.reduce((sum, household) => sum + household.count, 0)],
        ];
  return (
    <>
      <div className="admin-stats section-metrics">
        {metrics.map(([label, value]) => (
          <div className="card admin-metric" key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <p className="caption">Totals cover the whole database; lists show up to 200 records.</p>
    </>
  );
}

function WebsiteSection({ data, onEdit }) {
  const { settings } = data;
  return (
    <section className="card">
      <h3>Website &amp; announcements</h3>
      <p>
        Homepage copy, call to action, footer, public notices and search details. Content is shown as plain
        text.
      </p>
      <dl className="receipt-meta">
        <div>
          <dt>Headline</dt>
          <dd>{settings.headline}</dd>
        </div>
        <div>
          <dt>Announcement slides</dt>
          <dd>{settings.announcements?.length || (settings.announcement ? 1 : 0)}</dd>
        </div>
        <div>
          <dt>Support email</dt>
          <dd>{settings.supportEmail || "Not set"}</dd>
        </div>
        <div>
          <dt>Maintenance notice</dt>
          <dd>{settings.maintenance ? "Visible" : "Hidden"}</dd>
        </div>
      </dl>
      <p className="caption">
        The £0.99 monthly price is fixed by the API and Stripe; it is not a website setting.
      </p>
      <div className="actions wrap">
        <Button onClick={onEdit}>Edit website content</Button>
        <a className="btn outline" href="/" target="_blank" rel="noopener noreferrer">
          Preview website ↗
        </a>
      </div>
    </section>
  );
}

export function AdminDashboard() {
  const dispatch = useDispatch();
  const { overview: data, status } = useSelector(selectOperator);
  const [section, setSection] = useState("Overview");
  const [editing, setEditing] = useState(null);

  if (!data) return <p role="status">Loading platform records…</p>;

  const go = (next) => {
    setSection(next);
    setEditing(null);
  };
  const edit = (kind, record = {}) => setEditing({ kind, record, key: crypto.randomUUID() });
  const openTickets = data.tickets.filter((ticket) => ticket.status === "open").length;
  const refunded = data.payments
    .filter((payment) => payment.status === "refunded")
    .reduce((sum, payment) => sum + payment.amountPence, 0);
  const received = data.payments
    .filter((payment) => payment.status === "paid")
    .reduce((sum, payment) => sum + payment.amountPence, 0);

  return (
    <div className="admin-dashboard">
      <aside className="admin-side">
        <a className="admin-brand" href="/admin/">
          <Logo />
        </a>
        <div className="admin-side-caption">CONTROL CENTRE</div>
        <nav aria-label="Control centre sections">
          {GROUPS.map(([title, items]) => (
            <div className="admin-nav-group" key={title}>
              <span>{title}</span>
              {items.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={section === item ? "selected" : ""}
                  aria-current={section === item ? "page" : undefined}
                  onClick={() => go(item)}
                >
                  <AdminIcon name={ICONS[item]} />
                  {item === "Overview" ? "Dashboard" : item}
                  {item === "Support" && openTickets > 0 && <b>{openTickets}</b>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="admin-owner">
          <span className="admin-owner-avatar">
            <AdminIcon name="shield" />
          </span>
          <div>
            <strong>Platform owner</strong>
            <small>Unlocked session</small>
          </div>
          <span className="admin-version">v{brand.version}</span>
        </div>
      </aside>

      <div className="admin-workspace">
        <div className="admin-context">
          <span>
            <AdminIcon name={ICONS[section]} /> Control centre <span className="admin-slash">/</span>{" "}
            <strong>{section === "Overview" ? "Dashboard" : section}</strong>
          </span>
          <Button
            variant="text"
            size="small"
            disabled={status === "loading"}
            onClick={() => dispatch(loadOverview())}
          >
            {status === "loading" ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
        <div className="admin-page">
          <div className="admin-page-title">
            <div>
              <h1>{section === "Overview" ? "Dashboard" : section}</h1>
              <p>
                {section === "Overview"
                  ? "What’s happening across SplitWisee."
                  : "Every change is permission-checked and recorded in the audit log."}
              </p>
            </div>
            <div className="actions wrap">
              <Button
                onClick={() => {
                  go("Coupons");
                  edit("coupon");
                }}
              >
                <AdminIcon name="plus" />
                Create coupon
              </Button>
              <Button variant="outline" onClick={() => go("Website")}>
                <AdminIcon name="globe" />
                Website settings
              </Button>
            </div>
          </div>

          {editing && (
            <OperatorEditor
              key={editing.key}
              kind={editing.kind}
              record={editing.record}
              onClose={() => setEditing(null)}
            />
          )}

          {section === "Overview" && <OverviewSection data={data} onNavigate={go} />}
          {(section === "Users" || section === "Households") && (
            <PeopleMetrics section={section} data={data} />
          )}
          {(section === "Payments" || section === "Accounting") && (
            <FinancePanel accounting={section === "Accounting"} />
          )}
          {section === "Website" && <WebsiteSection data={data} onEdit={() => edit("website")} />}
          {hasRecordsSection(section) && (
            <RecordsSection
              section={section}
              data={data}
              onAction={edit}
              intro={
                section === "Payments" ? (
                  <p className="caption">
                    Verified Stripe invoices. Received {formatMoney(received)} · refunded{" "}
                    {formatMoney(refunded)}. Refunds go back to the original payment; bank payouts are
                    reconciled in Stripe.
                  </p>
                ) : section === "Referrals" ? (
                  <p className="notice">
                    A new verified user gets one welcome month with a valid referral or invitation, and the
                    referrer earns one month. Repeat sign-ins never create new rewards.
                  </p>
                ) : null
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
