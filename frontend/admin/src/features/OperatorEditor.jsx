import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useAsyncTask } from "../../../src/app/hooks.js";
import { toastShown } from "../../../src/app/uiSlice.js";
import { Button } from "../../../src/components/Button.jsx";
import { Checkbox, Field, FormError } from "../../../src/components/Field.jsx";
import { formatMoney } from "../../../src/utils/format.js";
import { operatorRequest, selectOperator } from "../operatorSlice.js";
import {
  ACTIONS,
  actionTitle,
  CAMPAIGN_AUDIENCES,
  WEBSITE_SWITCHES,
  WEBSITE_TEXT_FIELDS,
} from "./operatorActions.js";

function WebsiteFields({ form, set, setForm }) {
  return (
    <>
      {WEBSITE_TEXT_FIELDS.map(([key, label, max]) => (
        <Field key={key} label={label}>
          {max > 120 && key !== "privacyUrl" && key !== "termsUrl" ? (
            <textarea rows={2} maxLength={max} value={form[key] ?? ""} onChange={set(key)} />
          ) : (
            <input
              type={key === "supportEmail" ? "email" : "text"}
              maxLength={max}
              value={form[key] ?? ""}
              onChange={set(key)}
            />
          )}
        </Field>
      ))}
      <Field label="Announcement slides (one per line, up to five)">
        <textarea
          rows={5}
          value={(form.announcements ?? []).join("\n")}
          onChange={(event) => setForm({ ...form, announcements: event.target.value.split("\n") })}
        />
      </Field>
      <Field label="Seconds per slide (5–30)">
        <input
          type="number"
          min="5"
          max="30"
          value={form.announcementSeconds}
          onChange={(event) => setForm({ ...form, announcementSeconds: Number(event.target.value) })}
        />
      </Field>
      {WEBSITE_SWITCHES.map(([key, label]) => (
        <Checkbox
          key={key}
          checked={Boolean(form[key])}
          onChange={(checked) => setForm({ ...form, [key]: checked })}
        >
          {label}
        </Checkbox>
      ))}
    </>
  );
}

/** Confirmation form for one operator action. Requires an audit reason; reloads the overview afterwards. */
export function OperatorEditor({ kind, record, onClose }) {
  const dispatch = useDispatch();
  const { overview } = useSelector(selectOperator);
  const action = ACTIONS[kind];
  const [form, setForm] = useState(() => ({ ...(action.initial?.(record, overview) ?? {}), reason: "" }));
  const [requestId] = useState(() => crypto.randomUUID());
  const { busy, error, run } = useAsyncTask();
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  function handleSubmit(event) {
    event.preventDefault();
    run(async () => {
      const reason = form.reason.trim();
      if (!reason) throw new Error("Add a reason for the audit trail.");
      const request = action.request({ ...form, reason }, record, requestId);
      // A rejection carries { message, locked }; useAsyncTask shows the message.
      await dispatch(operatorRequest(request)).unwrap();
      dispatch(toastShown("Saved and recorded in the audit log."));
      onClose();
    });
  }

  return (
    <section className="card admin-editor">
      <div className="section-heading">
        <h3>{actionTitle(kind, record)}</h3>
        <Button variant="text" onClick={onClose}>
          Cancel
        </Button>
      </div>
      <form onSubmit={handleSubmit}>
        {kind === "coupon" && (
          <div className="form-grid">
            <Field label="Coupon code">
              <input
                required
                autoCapitalize="characters"
                maxLength={30}
                value={form.code}
                onChange={set("code")}
              />
            </Field>
            <Field label="Maximum redemptions">
              <input required type="number" min="1" max="10000" value={form.limit} onChange={set("limit")} />
            </Field>
            <Field label="Expires on">
              <input required type="date" value={form.expires} onChange={set("expires")} />
            </Field>
            <p>Each coupon gives one free month. An account can receive only one welcome benefit.</p>
          </div>
        )}
        {kind === "campaign" && (
          <>
            <Field label="Campaign title">
              <input required maxLength={100} value={form.title} onChange={set("title")} />
            </Field>
            <Field label="Audience">
              <select value={form.audience} onChange={set("audience")}>
                {CAMPAIGN_AUDIENCES.map((audience) => (
                  <option key={audience}>{audience}</option>
                ))}
              </select>
            </Field>
            <Field label="Draft message">
              <textarea required maxLength={1000} rows={4} value={form.message} onChange={set("message")} />
            </Field>
            <p className="caption">
              Drafts are not sent. Connect a delivery provider before scheduling campaigns.
            </p>
          </>
        )}
        {kind === "website" && <WebsiteFields form={form} set={set} setForm={setForm} />}
        {kind === "ticket" && (
          <Field label="Internal resolution note">
            <textarea required maxLength={1000} rows={3} value={form.note} onChange={set("note")} />
          </Field>
        )}
        {kind === "refund" && (
          <p>
            Refund the full {formatMoney(record.amountPence)} payment {record.id} through Stripe. Check the
            customer and reason before continuing.
          </p>
        )}
        {kind === "grant" && (
          <p>Give {record.name || record.email} one month of free access. This cannot be undone.</p>
        )}
        {kind === "toggle" && (
          <p>
            {record.suspended ? "Restore" : "Suspend"}{" "}
            {record.entity === "users" ? "the account" : "the household"}{" "}
            <strong>{record.name || record.email || record.id}</strong>.
          </p>
        )}
        <Field label="Reason for the audit trail">
          <textarea required maxLength={500} rows={2} value={form.reason} onChange={set("reason")} />
        </Field>
        <FormError>{error}</FormError>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Confirm & save"}
        </Button>
      </form>
    </section>
  );
}
