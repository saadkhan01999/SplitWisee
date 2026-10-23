import { useState } from "react";
import { Button } from "../../../src/components/Button.jsx";
import { csvBlob } from "../../../src/utils/csv.js";
import { saveBlob } from "../../../src/utils/downloads.js";
import { formatDate, formatDateTime, formatMoney } from "../../../src/utils/format.js";

// How each operator list is shown: record title, detail line, status badge and available actions.
const SECTIONS = {
  Users: {
    records: (data) => data.users,
    title: (user) => user.name || user.email || user.id,
    detail: (user) => `${user.email || user.phone || user.id} · ${user.plan}`,
    badge: (user) => (user.suspended ? "suspended" : "active"),
    actions: (user) => [
      { label: user.suspended ? "Restore" : "Suspend", kind: "toggle", record: { ...user, entity: "users" } },
      { label: "Grant free month", kind: "grant", record: user, variant: "text" },
    ],
  },
  Households: {
    records: (data) => data.households,
    title: (household) => household.name,
    detail: (household) =>
      `${household.count} ${household.count === 1 ? "member" : "members"} · ${household.id}`,
    badge: (household) => (household.suspended ? "suspended" : "active"),
    actions: (household) => [
      {
        label: household.suspended ? "Restore" : "Suspend",
        kind: "toggle",
        record: { ...household, entity: "households" },
      },
    ],
  },
  Payments: {
    records: (data) => data.payments,
    title: (payment) => payment.customer || payment.userId || payment.id,
    detail: (payment) => `${payment.id} · ${formatDate(payment.at)}`,
    badge: (payment) => `${formatMoney(payment.amountPence)} · ${payment.status}`,
    actions: (payment) =>
      payment.status === "paid" ? [{ label: "Refund", kind: "refund", record: payment }] : [],
  },
  Referrals: {
    records: (data) => data.referralEvents,
    title: (event) => event.referredUserId || event.id,
    detail: (event) =>
      `Beneficiary ${event.ownerId} · ${event.kind}${event.at ? ` · ${formatDate(event.at)}` : ""}`,
    badge: (event) => event.status || "qualified",
    actions: () => [],
  },
  Coupons: {
    records: (data) => data.coupons,
    title: (coupon) => coupon.code,
    detail: (coupon) => `1 free month · ${coupon.used}/${coupon.limit} used · expires ${coupon.expires}`,
    badge: (coupon) => (coupon.active ? "active" : "disabled"),
    actions: (coupon) => [
      { label: coupon.active ? "Disable" : "Enable", kind: "couponToggle", record: coupon },
    ],
  },
  Retention: {
    records: (data) => data.campaigns,
    title: (campaign) => campaign.title,
    detail: (campaign) => `${campaign.audience} · ${campaign.message}`,
    badge: (campaign) => campaign.status || "draft",
    actions: () => [],
  },
  Support: {
    records: (data) => data.tickets,
    title: (ticket) => ticket.subject,
    detail: (ticket) =>
      `${ticket.email || ticket.userId} · ${ticket.message ?? ""}${ticket.note ? ` · Note: ${ticket.note}` : ""}`,
    badge: (ticket) => ticket.status,
    actions: (ticket) => [
      { label: ticket.status === "open" ? "Resolve" : "Reopen", kind: "ticket", record: ticket },
    ],
  },
  Audit: {
    records: (data) => data.audit,
    title: (event) => event.action,
    detail: (event) =>
      `${formatDateTime(event.at)} · ${event.actorId}${event.reason ? ` · ${event.reason}` : ""}`,
    badge: (event) => event.status || "recorded",
    actions: () => [],
  },
};

const HIDDEN_EXPORT_FIELDS = ["encrypted", "passwordHash"];

function exportCsv(records, section) {
  const keys = [...new Set(records.flatMap((record) => Object.keys(record)))].filter(
    (key) => !HIDDEN_EXPORT_FIELDS.includes(key),
  );
  saveBlob(
    csvBlob([keys, ...records.map((record) => keys.map((key) => record[key]))]),
    `SplitWisee-${section.toLowerCase()}.csv`,
  );
}

export const hasRecordsSection = (section) => section in SECTIONS;

export function RecordsSection({ section, data, onAction, intro }) {
  const [query, setQuery] = useState("");
  const config = SECTIONS[section];
  const needle = query.trim().toLowerCase();
  const records = config
    .records(data)
    .filter((record) => !needle || JSON.stringify(record).toLowerCase().includes(needle));

  return (
    <section className="card">
      <div className="section-heading wrap">
        <h3>{section}</h3>
        <div className="actions wrap">
          <input
            type="search"
            aria-label={`Search ${section.toLowerCase()}`}
            placeholder={`Search ${section.toLowerCase()}`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button
            variant="outline"
            size="small"
            icon="download"
            disabled={!records.length}
            onClick={() => exportCsv(records, section)}
          >
            Export CSV
          </Button>
          {section === "Coupons" && (
            <Button size="small" onClick={() => onAction("coupon")}>
              Create coupon
            </Button>
          )}
          {section === "Retention" && (
            <Button size="small" onClick={() => onAction("campaign")}>
              New campaign draft
            </Button>
          )}
        </div>
      </div>
      {intro}
      <div className="admin-records">
        {records.map((record, index) => (
          <article className="admin-record" key={record.id || record.code || index}>
            <div className="grow">
              <strong>{config.title(record)}</strong>
              <small>{config.detail(record)}</small>
            </div>
            <span className="pill">{config.badge(record)}</span>
            <div className="actions wrap">
              {config.actions(record).map((action) => (
                <Button
                  key={action.label}
                  variant={action.variant ?? "outline"}
                  size="small"
                  onClick={() => onAction(action.kind, action.record)}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          </article>
        ))}
      </div>
      {!records.length && (
        <p className="empty">{needle ? "No matching records." : "Nothing recorded yet."}</p>
      )}
    </section>
  );
}
