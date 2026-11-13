import { useCallback, useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { api } from "../../../src/api/client.js";
import { Button } from "../../../src/components/Button.jsx";
import { Checkbox, Field, FormError } from "../../../src/components/Field.jsx";
import { formatDateTime, formatMoney, todayIso } from "../../../src/utils/format.js";
import { loadOverview, operatorLocked } from "../operatorSlice.js";

// Owner editors for website campaigns and receipt retention. Every save is permission-checked by the API and
// recorded in the audit log with the reason given here.

function useContent() {
  const dispatch = useDispatch();
  const [content, setContent] = useState(null);
  const [error, setError] = useState("");
  const failed = useCallback(
    (failure) => {
      if (failure.status === 403 && /unlock/i.test(failure.message)) dispatch(operatorLocked());
      setError(failure.message);
    },
    [dispatch],
  );
  const reload = useCallback(() => api.get("/operator/content").then(setContent, failed), [failed]);
  useEffect(() => {
    let live = true;
    api.get("/operator/content").then(
      (data) => live && setContent(data),
      (failure) => live && failed(failure),
    );
    return () => {
      live = false;
    };
  }, [failed]);
  return { content, error, reload };
}

function useSave(reload) {
  const dispatch = useDispatch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async (path, body, done) => {
    setBusy(true);
    setError("");
    try {
      const result = await api.post(path, body);
      await reload();
      dispatch(loadOverview());
      done?.(result);
      return result;
    } catch (failure) {
      if (failure.status === 403 && /unlock/i.test(failure.message)) dispatch(operatorLocked());
      setError(failure.message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, save };
}

function ReasonField({ value, onChange }) {
  return (
    <Field label="Audit reason (required)">
      <input required maxLength={500} value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

const PROMOTION_FIELDS = [
  ["title", "Offer title", 60],
  ["banner", "Website banner text", 180],
  ["details", "Terms shown to members", 500],
];

function PromotionEditor({ promotion, state, reload }) {
  const { busy, error, save } = useSave(reload);
  const [form, setForm] = useState(() => ({ ...promotion }));
  const [reason, setReason] = useState("");
  const [saved, setSaved] = useState("");
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  return (
    <form
      className="card admin-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        const result = await save("/operator/promotion", {
          ...form,
          freeMonths: Number(form.freeMonths),
          maxRedemptions: Number(form.maxRedemptions),
          reason,
        });
        if (result) {
          setReason("");
          setSaved("Saved and recorded in the audit log.");
        }
      }}
    >
      <div className="section-heading wrap">
        <h3>Website offer</h3>
        <span className={`pill ${state.active ? "mint" : "warning"}`}>
          {!promotion.enabled
            ? "Switched off"
            : state.redeemable
              ? "Live · claims open"
              : state.upcoming
                ? "Banner live · claims not open yet"
                : state.soldOut
                  ? "Claim limit reached"
                  : "Not in schedule"}
        </span>
      </div>
      <p className="caption">
        {promotion.used ?? 0} of {promotion.maxRedemptions} claims used. Each claim is one free month (£0),
        one per account, validated by the server; it never becomes a permanent free plan.
      </p>
      {PROMOTION_FIELDS.map(([key, label, max]) => (
        <Field key={key} label={label}>
          {max > 100 ? (
            <textarea rows={2} maxLength={max} value={form[key]} onChange={set(key)} />
          ) : (
            <input maxLength={max} value={form[key]} onChange={set(key)} />
          )}
        </Field>
      ))}
      <div className="form-grid">
        <Field label="Banner shows from">
          <input type="date" value={form.announceFrom} onChange={set("announceFrom")} />
        </Field>
        <Field label="Claims open">
          <input type="date" value={form.startsAt} onChange={set("startsAt")} />
        </Field>
        <Field label="Claims close (and banner ends)">
          <input type="date" value={form.endsAt} onChange={set("endsAt")} />
        </Field>
        <Field label="Free months per claim">
          <input type="number" min="1" max="3" value={form.freeMonths} onChange={set("freeMonths")} />
        </Field>
        <Field label="Maximum claims">
          <input
            type="number"
            min="1"
            max="100000"
            value={form.maxRedemptions}
            onChange={set("maxRedemptions")}
          />
        </Field>
      </div>
      <Checkbox checked={form.enabled} onChange={(enabled) => setForm({ ...form, enabled })}>
        Offer switched on (shown only between the dates above)
      </Checkbox>
      <ReasonField value={reason} onChange={setReason} />
      <FormError>{error}</FormError>
      {saved && <p className="notice ready">{saved}</p>}
      <div className="actions wrap">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save offer"}
        </Button>
        <a className="btn outline" href="/" target="_blank" rel="noopener noreferrer">
          Preview website ↗
        </a>
      </div>
    </form>
  );
}

function PledgeCalculator({ percent }) {
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const calculate = async () => {
    setError("");
    try {
      const report = await api.get(`/operator/accounting?month=${encodeURIComponent(month)}`);
      const surplus = report.summary.find((row) => /surplus/i.test(row.metric))?.pence ?? 0;
      setResult({
        surplus,
        pledge: Math.floor((Math.max(0, surplus) * percent) / 100),
        connected: report.connected,
      });
    } catch (failure) {
      setError(failure.message);
    }
  };
  return (
    <div className="pledge-calculator">
      <h4>Reconcile with the accounts</h4>
      <div className="row wrap">
        <Field label="Month">
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </Field>
        <Button variant="outline" onClick={calculate}>
          Calculate {percent}%
        </Button>
      </div>
      {result && (
        <p>
          Provisional surplus {formatMoney(result.surplus)} → {percent}% ={" "}
          <strong>{formatMoney(result.pledge)}</strong>
          {!result.connected && " (Stripe not connected: bank entries only)"}. Confirm against the finalised
          annual accounts before paying.
        </p>
      )}
      <FormError>{error}</FormError>
    </div>
  );
}

const CHARITY_FIELDS = [
  ["basis", "What the percentage is of", 120],
  ["period", "Calculation period", 120],
  ["beneficiary", "Charity (name and registration number)", 120],
  ["conditions", "Conditions", 600],
  ["reporting", "How it is reported", 400],
];

function CharityEditor({ charity, reload }) {
  const { busy, error, save } = useSave(reload);
  const [form, setForm] = useState(() => ({ ...charity }));
  const [reason, setReason] = useState("");
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  const submit = (published) => async () => {
    const result = await save("/operator/charity", {
      ...form,
      percent: Number(form.percent),
      published,
      reason,
    });
    if (result) setReason("");
  };

  return (
    <form className="card admin-editor" onSubmit={(event) => event.preventDefault()}>
      <div className="section-heading wrap">
        <h3>Charity commitment</h3>
        <span className={`pill ${charity.published ? "mint" : "warning"}`}>
          {charity.published ? `Published · v${charity.version}` : `Draft · v${charity.version}`}
        </span>
      </div>
      <p className="caption">
        It appears on the website only when published, and publishing needs a named charity. Each save is kept
        as a new version.
      </p>
      <div className="form-grid">
        <Field label="Percentage">
          <input type="number" min="1" max="100" value={form.percent} onChange={set("percent")} />
        </Field>
        <Field label="Starts from">
          <input type="date" value={form.effectiveFrom} onChange={set("effectiveFrom")} />
        </Field>
      </div>
      {CHARITY_FIELDS.map(([key, label, max]) => (
        <Field key={key} label={label}>
          {max > 150 ? (
            <textarea rows={3} maxLength={max} value={form[key]} onChange={set(key)} />
          ) : (
            <input maxLength={max} value={form[key]} onChange={set(key)} />
          )}
        </Field>
      ))}
      {form.beneficiary && (
        <p className="notice">
          Website text: “{form.percent}% of our {form.basis} goes to {form.beneficiary}, {form.period}.”
        </p>
      )}
      <ReasonField value={reason} onChange={setReason} />
      <FormError>{error}</FormError>
      <div className="actions wrap">
        <Button disabled={busy || !reason.trim()} onClick={submit(true)}>
          Publish on website
        </Button>
        <Button variant="outline" disabled={busy || !reason.trim()} onClick={submit(false)}>
          {charity.published ? "Unpublish (save as draft)" : "Save draft"}
        </Button>
      </div>
      <PledgeCalculator percent={Number(form.percent) || 0} />
      {charity.history?.length > 0 && (
        <details>
          <summary>Version history ({charity.history.length})</summary>
          {charity.history.map((entry) => (
            <p key={entry.version}>
              v{entry.version} · {formatDateTime(entry.at)} · {entry.published ? "published" : "draft"} ·{" "}
              {entry.statement}
            </p>
          ))}
        </details>
      )}
    </form>
  );
}

/** Admin > Campaigns: the scheduled website offer and the charity commitment. */
export function CampaignsPanel() {
  const { content, error, reload } = useContent();
  if (!content) return error ? <FormError>{error}</FormError> : <p role="status">Loading campaigns…</p>;
  return (
    <div className="content-panels">
      <PromotionEditor
        key={`${content.promotion.key}-${content.promotion.updatedAt ?? ""}`}
        promotion={content.promotion}
        state={content.promotionState}
        reload={reload}
      />
      <CharityEditor key={content.charity.version} charity={content.charity} reload={reload} />
    </div>
  );
}

/** Admin > Retention: approve the receipt retention policy, legal holds and the removal run. */
export function RetentionPanel({ households }) {
  const { content, error: loadError, reload } = useContent();
  const { busy, error, save } = useSave(reload);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState(null);
  const [holdId, setHoldId] = useState("");
  if (!content) return loadError ? <FormError>{loadError}</FormError> : <p role="status">Loading…</p>;
  const { retention } = content;
  const held = new Set(retention.holds.map((hold) => hold.id));

  return (
    <div className="content-panels">
      <section className="card admin-editor">
        <div className="section-heading wrap">
          <h3>Receipt retention policy</h3>
          <span className={`pill ${retention.approved ? "mint" : "warning"}`}>
            {retention.approved ? "Approved" : "Not approved · nothing is removed"}
          </span>
        </div>
        <p>
          Original receipt files are kept while their period is open and for {retention.months} more month
          after the period is locked. Members see the exact date on each receipt and closing sheet. After that
          date — and only once this policy is approved — the original file is removed; the expense, receipt
          details, closing sheet and audit history stay. Households on legal hold are never purged.
        </p>
        {retention.approved && (
          <p className="caption">
            Approved {formatDateTime(retention.approvedAt)}
            {retention.lastRunAt
              ? ` · last run ${formatDateTime(retention.lastRunAt)}: ${retention.lastRunRemoved} removed`
              : " · not run yet"}
            . On a server the run is daily; on Vercel use “Run removal now”.
          </p>
        )}
        <ReasonField value={reason} onChange={setReason} />
        <FormError>{error}</FormError>
        {result && (
          <p className="notice ready">
            {result.removed} original {result.removed === 1 ? "file" : "files"} removed · {result.held} kept
            under legal hold.
          </p>
        )}
        <div className="actions wrap">
          <Button
            disabled={busy || !reason.trim()}
            variant={retention.approved ? "outline" : ""}
            onClick={() =>
              save("/operator/retention", { approved: !retention.approved, reason }, () => setReason(""))
            }
          >
            {retention.approved ? "Withdraw approval" : "Approve policy"}
          </Button>
          <Button
            disabled={busy || !retention.approved || !reason.trim()}
            onClick={() =>
              save("/operator/retention/run", { reason }, (r) => {
                setResult(r);
                setReason("");
              })
            }
          >
            Run removal now
          </Button>
        </div>
      </section>
      <section className="card admin-editor">
        <h3>Legal holds</h3>
        <p className="caption">A hold stops any receipt removal for that household until it is lifted.</p>
        {retention.holds.length ? (
          retention.holds.map((hold) => (
            <div className="row wrap" key={hold.id}>
              <span className="grow">
                <strong>{hold.name}</strong> · since {formatDateTime(hold.legalHold.at)}
              </span>
              <Button
                variant="text"
                disabled={busy || !reason.trim()}
                onClick={() =>
                  save("/operator/retention/hold", { householdId: hold.id, active: false, reason })
                }
              >
                Lift hold
              </Button>
            </div>
          ))
        ) : (
          <p>No household is on legal hold.</p>
        )}
        <div className="row wrap">
          <Field label="Household">
            <select value={holdId} onChange={(event) => setHoldId(event.target.value)}>
              <option value="">Choose a household</option>
              {households
                .filter((household) => !held.has(household.id))
                .map((household) => (
                  <option key={household.id} value={household.id}>
                    {household.name}
                  </option>
                ))}
            </select>
          </Field>
          <Button
            variant="outline"
            disabled={busy || !holdId || !reason.trim()}
            onClick={() =>
              save("/operator/retention/hold", { householdId: holdId, active: true, reason }, () =>
                setHoldId(""),
              )
            }
          >
            Place legal hold
          </Button>
        </div>
      </section>
    </div>
  );
}
