import { useState } from "react";
import { useSelector } from "react-redux";
import {
  currentPeriod,
  isIsoDate,
  monthRange,
  nextPeriodRange,
  overlaps,
  periodName,
} from "@domain/periods/index.js";
import { useHouseholdAction } from "../../app/hooks.js";
import { Button } from "../../components/Button.jsx";
import { Field, FormError } from "../../components/Field.jsx";
import { Icon } from "../../components/Icon.jsx";
import { formatMoney, formatShortDate, signedAmount, todayIso } from "../../utils/format.js";
import {
  selectHousehold,
  selectHouseholdSaving,
  selectIsHouseholdAdmin,
} from "../household/householdSlice.js";
import { ClosingForm } from "./ClosingForm.jsx";

// "Start new settlement": review and lock the open period, then confirm the next one (created automatically for
// the next calendar month) or choose custom dates. Owners and admins only; the API enforces the same rule.

/** Default dates for a new period: after the latest closing, otherwise the current month. */
export function suggestedPeriod(household) {
  const latest = [...household.closings].sort((a, b) => b.end.localeCompare(a.end))[0];
  return latest ? nextPeriodRange(latest.end) : monthRange(todayIso());
}

/** Create the open period, or change the open period's name and dates. */
export function PeriodForm({ period, submitLabel, onDone, onCancel }) {
  const household = useSelector(selectHousehold);
  const saving = useSelector(selectHouseholdSaving);
  const runAction = useHouseholdAction();
  const initial = period ?? suggestedPeriod(household);
  const [values, setValues] = useState({ name: period?.name ?? "", start: initial.start, end: initial.end });
  const set = (key) => (event) => setValues({ ...values, [key]: event.target.value });
  const datesValid = isIsoDate(values.start) && isIsoDate(values.end) && values.start <= values.end;
  const automaticName = datesValid ? periodName(values.start, values.end) : "";
  let problem = "";
  if (!datesValid) problem = "Choose a start date on or before the end date.";
  else if (household.closings.some((closing) => overlaps(closing, values)))
    problem = "These dates overlap a locked period. Choose dates after the last closing.";

  async function handleSubmit(event) {
    event.preventDefault();
    const name = values.name.trim() || automaticName;
    if (period && name === period.name && values.start === period.start && values.end === period.end)
      return onDone();
    const ok = await runAction(
      period ? "periodUpdate" : "periodCreate",
      { ...(period && { id: period.id }), name, start: values.start, end: values.end },
      period ? "Period updated" : "New period started",
    );
    if (ok) onDone();
  }

  const presets = [
    ["This month", monthRange(todayIso())],
    ["Next month", nextPeriodRange(monthRange(todayIso()).end)],
  ];

  return (
    <form className="period-form" onSubmit={handleSubmit}>
      <div className="chips" role="group" aria-label="Quick dates">
        {presets.map(([label, range]) => (
          <button
            key={label}
            type="button"
            aria-pressed={values.start === range.start && values.end === range.end}
            className={values.start === range.start && values.end === range.end ? "selected" : ""}
            onClick={() => setValues({ ...values, ...range })}
          >
            {label}
          </button>
        ))}
      </div>
      <Field label="Period name (optional)" hint={automaticName && `Leave blank to use “${automaticName}”.`}>
        <input maxLength={60} value={values.name} placeholder={automaticName} onChange={set("name")} />
      </Field>
      <div className="form-grid">
        <Field label="Start date">
          <input type="date" required value={values.start} onChange={set("start")} />
        </Field>
        <Field label="End date">
          <input type="date" required min={values.start} value={values.end} onChange={set("end")} />
        </Field>
      </div>
      <FormError>{problem}</FormError>
      <div className="actions wrap">
        <Button type="submit" disabled={saving || Boolean(problem)}>
          {saving ? "Saving…" : submitLabel}
        </Button>
        {onCancel && (
          <Button variant="text" onClick={onCancel}>
            Back
          </Button>
        )}
      </div>
    </form>
  );
}

function PeriodSummary({ period }) {
  const household = useSelector(selectHousehold);
  const inPeriod = household.expenses.filter((e) => e.date >= period.start && e.date <= period.end);
  const approved = inPeriod.filter((e) => e.status === "approved");
  const unresolved = inPeriod.length - approved.length;
  return (
    <div className="period-summary">
      <span className="eyebrow">OPEN PERIOD</span>
      <strong>{period.name}</strong>
      <small>
        {formatShortDate(period.start)} – {formatShortDate(period.end)} · {approved.length} approved{" "}
        {approved.length === 1 ? "expense" : "expenses"} ·{" "}
        {formatMoney(approved.reduce((sum, e) => sum + signedAmount(e), 0))}
        {unresolved > 0 && ` · ${unresolved} to resolve before closing`}
      </small>
    </div>
  );
}

export function StartSettlement({ start, end, onClose }) {
  const household = useSelector(selectHousehold);
  const admin = useSelector(selectIsHouseholdAdmin);
  const current = currentPeriod(household);
  const [step, setStep] = useState(start && end ? "close" : "choose");
  const [range, setRange] = useState(start && end ? { start, end } : null);

  if (!admin)
    return (
      <p>Only a household owner or admin can start a new settlement. You can view every closing here.</p>
    );

  if (step === "close")
    return (
      <ClosingForm
        start={range?.start ?? current?.start}
        end={range?.end ?? current?.end}
        onLocked={() => setStep("next")}
      />
    );

  if (step === "next") {
    return (
      <div className="next-period">
        <div className="notice ready" role="status">
          <Icon name="check" />
          <span>
            Period locked and its closing sheet saved. Payment requests are ready in Settlements.
            {current ? " Confirm the next period below, or choose your own dates." : ""}
          </span>
        </div>
        {current ? (
          <>
            <h3>Next period</h3>
            <PeriodForm period={current} submitLabel="Confirm next period" onDone={onClose} />
          </>
        ) : (
          <>
            <h3>Start the next period</h3>
            <PeriodForm submitLabel="Start this period" onDone={onClose} />
          </>
        )}
      </div>
    );
  }

  if (step === "period")
    return (
      <PeriodForm
        period={current}
        submitLabel={current ? "Save period" : "Start this period"}
        onDone={onClose}
        onCancel={() => setStep("choose")}
      />
    );

  return (
    <div className="start-settlement">
      {current ? (
        <>
          <PeriodSummary period={current} />
          <p>
            Review the period, then lock it: balances are frozen into a closing sheet, payment requests are
            created and the next period opens automatically.
          </p>
          <div className="actions wrap">
            <Button
              icon="lock"
              onClick={() => {
                setRange({ start: current.start, end: current.end });
                setStep("close");
              }}
            >
              Review &amp; close {current.name}
            </Button>
            <Button variant="outline" icon="calendar" onClick={() => setStep("period")}>
              Change name or dates
            </Button>
          </div>
        </>
      ) : (
        <>
          <p>No period is open. Start one to group this household’s expenses for the next settlement.</p>
          <Button icon="plus" onClick={() => setStep("period")}>
            Start a new period
          </Button>
        </>
      )}
      <Button
        variant="text"
        onClick={() => {
          setRange(null);
          setStep("close");
        }}
      >
        Close a custom date range instead
      </Button>
    </div>
  );
}
