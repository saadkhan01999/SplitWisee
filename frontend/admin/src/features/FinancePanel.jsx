import { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { accountSheets, validateEntry } from "@domain/platform-accounting/index.js";
import { api } from "../../../src/api/client.js";
import { toastShown } from "../../../src/app/uiSlice.js";
import { Button } from "../../../src/components/Button.jsx";
import { Checkbox, Field, FormError } from "../../../src/components/Field.jsx";
import { csvText } from "../../../src/utils/csv.js";
import { saveBlob } from "../../../src/utils/downloads.js";
import { formatMoney, todayIso } from "../../../src/utils/format.js";
import { workbook, zipFiles } from "../../../src/utils/workbook.js";
import { loadFinance, loadOverview, selectFinance } from "../operatorSlice.js";
import { StatementPanel } from "./StatementPanel.jsx";

const FORM_TITLES = {
  entry: "Record a bank transaction",
  void: "Void bank entry",
  bank: "Private owner bank details",
  payout: "Request a payout",
};

const blankForm = () => ({
  kind: "expense",
  date: todayIso(),
  amount: "",
  description: "",
  reference: "",
  name: "",
  sortCode: "",
  accountNumber: "",
  reason: "",
  consent: false,
  confirm: false,
});

function toPence(amount) {
  if (!/^\d+(\.\d{1,2})?$/.test(amount.trim()))
    throw new Error("Enter a positive amount with at most two decimal places.");
  return Math.round(Number(amount) * 100);
}

function FinanceForm({ form: kind, voidId, onClose, onSaved }) {
  const dispatch = useDispatch();
  const [values, setValues] = useState(blankForm);
  const [requestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (event) => setValues({ ...values, [key]: event.target.value });

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const reason = values.reason.trim();
      if (!reason) throw new Error("Add a reason for the audit trail.");
      if (kind === "entry") {
        const entry = validateEntry({ ...values, amountPence: toPence(values.amount) });
        await api.post("/operator/finance/entries", { ...entry, reason, requestId });
      } else if (kind === "void") {
        await api.post("/operator/finance/entries/void", { id: voidId, reason });
      } else if (kind === "bank") {
        await api.post("/operator/finance/bank", {
          name: values.name.trim(),
          sortCode: values.sortCode.replace(/[\s-]/g, ""),
          accountNumber: values.accountNumber.trim(),
          consent: values.consent,
          reason,
        });
      } else if (kind === "payout") {
        const payout = await api.post("/operator/finance/payout", {
          amountPence: toPence(values.amount),
          requestId,
          confirm: values.confirm,
          reason,
        });
        dispatch(
          toastShown(`Payout ${payout.id}: ${payout.status}${payout.livemode ? "" : " (Stripe test mode)"}`),
        );
      }
      dispatch(loadOverview());
      onSaved();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card finance-form">
      <div className="section-heading">
        <h2>{FORM_TITLES[kind]}</h2>
        <Button variant="text" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
      </div>
      <form onSubmit={handleSubmit}>
        {kind === "entry" && (
          <>
            <Field label="Entry type">
              <select value={values.kind} onChange={set("kind")}>
                <option value="expense">Operating cost paid</option>
                <option value="income">Platform income received</option>
              </select>
            </Field>
            <Field label="Date">
              <input required type="date" value={values.date} onChange={set("date")} />
            </Field>
            <Field label="Description">
              <input required maxLength={140} value={values.description} onChange={set("description")} />
            </Field>
            <Field label="Bank statement reference">
              <input required maxLength={80} value={values.reference} onChange={set("reference")} />
            </Field>
          </>
        )}
        {(kind === "entry" || kind === "payout") && (
          <Field label="Amount (£)">
            <input required inputMode="decimal" value={values.amount} onChange={set("amount")} />
          </Field>
        )}
        {kind === "bank" && (
          <>
            <Field label="Account holder">
              <input required autoComplete="off" maxLength={80} value={values.name} onChange={set("name")} />
            </Field>
            <Field label="Sort code (6 digits)">
              <input
                required
                autoComplete="off"
                inputMode="numeric"
                maxLength={8}
                value={values.sortCode}
                onChange={set("sortCode")}
              />
            </Field>
            <Field label="Account number (8 digits)">
              <input
                required
                autoComplete="off"
                inputMode="numeric"
                maxLength={8}
                value={values.accountNumber}
                onChange={set("accountNumber")}
              />
            </Field>
            <Checkbox
              required
              checked={values.consent}
              onChange={(consent) => setValues({ ...values, consent })}
            >
              Store these details encrypted for platform record-keeping. This does not change the Stripe
              payout bank.
            </Checkbox>
          </>
        )}
        {kind === "payout" && (
          <Checkbox
            required
            checked={values.confirm}
            onChange={(confirm) => setValues({ ...values, confirm })}
          >
            I checked the default GBP bank account in Stripe and confirm this payout request.
          </Checkbox>
        )}
        {kind === "void" && <p>The entry stays on record, marked void, and no longer counts in reports.</p>}
        <Field label="Audit reason">
          <input required maxLength={500} value={values.reason} onChange={set("reason")} />
        </Field>
        <FormError>{error}</FormError>
        <Button type="submit" disabled={busy}>
          {busy ? "Submitting…" : "Confirm & save"}
        </Button>
      </form>
    </section>
  );
}

/** Platform money (subscriptions, Stripe balance, bank entries) — separate from any household ledger. */
export function FinancePanel({ accounting }) {
  const dispatch = useDispatch();
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const { data: finance, report, status, error: loadError } = useSelector(selectFinance);
  const [error, setError] = useState("");
  const [form, setForm] = useState(null);
  const loading = status === "loading";
  const load = useCallback(() => dispatch(loadFinance(month)), [dispatch, month]);

  useEffect(() => {
    load();
  }, [load]);

  function downloadPack(format) {
    const sheets = accountSheets(report);
    const prefix = `SplitWisee-${month}`;
    if (format === "xlsx") saveBlob(workbook(sheets), `${prefix}-Accountant-Pack.xlsx`);
    else
      saveBlob(
        zipFiles(
          Object.fromEntries(Object.entries(sheets).map(([name, rows]) => [`${name}.csv`, csvText(rows)])),
        ),
        `${prefix}-CSV-Pack.zip`,
      );
    dispatch(toastShown("Accountant pack downloaded."));
  }

  const removeBank = async () => {
    setError("");
    try {
      await api.post("/operator/finance/bank/remove", { reason: "Owner removed the private bank record" });
      load();
    } catch (failure) {
      setError(failure.message);
    }
  };

  return (
    <section className="finance-panel">
      <div className="card">
        <div className="section-heading wrap">
          <div>
            <h2>{accounting ? "Monthly accountant pack" : "Platform finance"}</h2>
            <p>Platform income and costs · GBP · Stripe and bank records</p>
          </div>
          <div className="actions wrap">
            <Field label="Reporting month (UTC)">
              <input
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value || todayIso().slice(0, 7))}
              />
            </Field>
            <Button variant="outline" disabled={loading} onClick={load}>
              {loading ? "Loading…" : "Refresh"}
            </Button>
          </div>
        </div>
        <FormError>{error || loadError}</FormError>
        {report && (
          <>
            <div className="finance-stats">
              {report.summary.slice(0, 5).map((row) => (
                <div key={row.metric}>
                  <strong>{formatMoney(row.pence)}</strong>
                  <small>{row.metric}</small>
                </div>
              ))}
            </div>
            <p className="caption">
              Provisional cash-based surplus. Excludes unrecorded costs, tax, VAT and accruals.
              {!report.connected && " Stripe is not connected, so totals cover bank entries only."}
            </p>
            <div className="actions wrap">
              <Button onClick={() => downloadPack("xlsx")}>Accountant workbook (.xlsx)</Button>
              <Button variant="outline" onClick={() => downloadPack("csv")}>
                All sheets as CSV (.zip)
              </Button>
              <Button variant="outline" onClick={() => setForm({ kind: "entry" })}>
                Record bank income / cost
              </Button>
            </div>
          </>
        )}
      </div>

      {form && (
        <FinanceForm
          key={form.kind + (form.voidId ?? "")}
          form={form.kind}
          voidId={form.voidId}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            load();
          }}
        />
      )}

      {!accounting && finance && (
        <div className="admin-panels">
          <section className="card">
            <h2>Payment methods</h2>
            <div className="admin-record">
              <div className="grow">
                <strong>Stripe checkout</strong>
                <small>Cards and other methods enabled in your Stripe account.</small>
              </div>
              <span className="pill">
                {finance.connected ? (finance.livemode ? "Live" : "Test mode") : "Not connected"}
              </span>
            </div>
            <div className="admin-record">
              <div className="grow">
                <strong>Bank transfer record</strong>
                <small>Record income received and costs paid against a bank statement reference.</small>
              </div>
              <Button variant="outline" size="small" onClick={() => setForm({ kind: "entry" })}>
                Add bank entry
              </Button>
            </div>
            <h3>Owner bank record</h3>
            <p>
              {finance.bank
                ? `${finance.bank.name} · account ending ${finance.bank.last4}`
                : "No private bank record saved."}
            </p>
            <p className="caption">
              Encrypted record-keeping only. The Stripe payout bank is managed in Stripe.
            </p>
            <div className="actions wrap">
              <Button variant="outline" onClick={() => setForm({ kind: "bank" })}>
                {finance.bank ? "Replace bank details" : "Add bank details"}
              </Button>
              {finance.bank && (
                <Button variant="text" danger onClick={removeBank}>
                  Remove saved bank record
                </Button>
              )}
            </div>
          </section>
          <section className="card">
            <h2>Withdraw earnings</h2>
            <div className="finance-stats">
              <div>
                <strong>{formatMoney(finance.available)}</strong>
                <small>Available Stripe balance</small>
              </div>
              <div>
                <strong>{formatMoney(finance.pending)}</strong>
                <small>Pending settlement</small>
              </div>
            </div>
            <p>
              {finance.destination
                ? `${finance.destination.name} · ending ${finance.destination.last4}`
                : "Payouts go to the default verified GBP bank account in Stripe."}
            </p>
            <a
              className="btn outline"
              href="https://dashboard.stripe.com/settings/payouts"
              target="_blank"
              rel="noopener noreferrer"
            >
              Payout settings in Stripe ↗
            </a>
            <p className="caption">
              A payout can stay pending or fail; only Stripe confirms it. Available balance is not profit.
            </p>
            <Button disabled={!finance.connected} onClick={() => setForm({ kind: "payout" })}>
              Request payout to bank
            </Button>
            <h3>Recent payouts</h3>
            {finance.payouts.length ? (
              finance.payouts.map((payout) => (
                <div className="admin-record" key={payout.id}>
                  <div className="grow">
                    <strong>
                      {formatMoney(payout.amountPence)} {payout.currency?.toUpperCase()}
                    </strong>
                    <small>
                      {payout.id} · expected {payout.arrival}
                    </small>
                  </div>
                  <span className="pill">{payout.status}</span>
                </div>
              ))
            ) : (
              <p>No payouts yet.</p>
            )}
          </section>
        </div>
      )}

      {accounting && report && (
        <div className="card">
          <h2>Monthly reconciliation</h2>
          <p>
            {report.balanced ? "Debits and credits balance." : "The journal is out of balance."}{" "}
            {report.exceptions.length} classification{" "}
            {report.exceptions.length === 1 ? "exception" : "exceptions"}.
          </p>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col">Debit</th>
                  <th scope="col">Credit</th>
                  <th scope="col">Movement</th>
                </tr>
              </thead>
              <tbody>
                {report.trial.map((row) => (
                  <tr key={row.account}>
                    <td>{row.account}</td>
                    <td>{formatMoney(row.debitPence)}</td>
                    <td>{formatMoney(row.creditPence)}</td>
                    <td>{formatMoney(row.balancePence)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Recorded bank entries</h3>
          {report.entries.length ? (
            report.entries.map((entry) => (
              <div className="admin-record" key={entry.id}>
                <div className="grow">
                  <strong>
                    {entry.description} · {formatMoney(entry.amountPence)}
                  </strong>
                  <small>
                    {entry.date} · {entry.reference} · {entry.voided ? "Voided" : entry.kind}
                  </small>
                </div>
                {!entry.voided && (
                  <Button
                    variant="outline"
                    size="small"
                    onClick={() => setForm({ kind: "void", voidId: entry.id })}
                  >
                    Void entry
                  </Button>
                )}
              </div>
            ))
          ) : (
            <p>No bank entries this month.</p>
          )}
          <details>
            <summary>Report scope and month-end checklist</summary>
            <ul>
              {report.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <ol>
              <li>Record every platform cost and bank receipt with its statement reference.</li>
              <li>Match Stripe payout clearing to the bank statement.</li>
              <li>Resolve unclassified movements and duplicate bank entries.</li>
              <li>
                Give the workbook and original statements to your accountant for tax, VAT and accrual
                adjustments.
              </li>
            </ol>
          </details>
        </div>
      )}

      {report && <StatementPanel report={report} />}
    </section>
  );
}
