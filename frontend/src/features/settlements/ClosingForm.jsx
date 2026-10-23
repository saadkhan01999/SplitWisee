import { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { balances, netTransfers } from "@domain/calculation-engine/index.js";
import { useHouseholdAction } from "../../app/hooks.js";
import { goToTab } from "../../app/navigationSlice.js";
import { dialogClosed } from "../../app/uiSlice.js";
import { Avatar } from "../../components/Avatar.jsx";
import { Button } from "../../components/Button.jsx";
import { Field } from "../../components/Field.jsx";
import { Icon } from "../../components/Icon.jsx";
import { firstDayOfMonth, formatMoney, lastDayOfMonth } from "../../utils/format.js";
import { selectHousehold, selectHouseholdSaving, selectMemberName } from "../household/householdSlice.js";

/** Preview a period's balances and lock it, which creates one payment request per proposed transfer. */
export function ClosingForm({ start: initialStart, end: initialEnd }) {
  const dispatch = useDispatch();
  const household = useSelector(selectHousehold);
  const memberName = useSelector(selectMemberName);
  const saving = useSelector(selectHouseholdSaving);
  const runAction = useHouseholdAction();
  const [start, setStart] = useState(initialStart ?? firstDayOfMonth());
  const [end, setEnd] = useState(initialEnd ?? lastDayOfMonth());

  const preview = useMemo(() => {
    const expenses = household.expenses.filter((expense) => expense.date >= start && expense.date <= end);
    const rows = balances(household, start, end).filter((row) => row.funded || row.share || row.net);
    let transfers = [];
    let ledgerError = "";
    try {
      transfers = netTransfers(rows);
    } catch (failure) {
      ledgerError = failure.message;
    }
    return {
      expenses,
      unresolved: expenses.filter((expense) => expense.status !== "approved").length,
      overlap: household.closings.some((closing) => start <= closing.end && end >= closing.start),
      rows,
      transfers,
      ledgerError,
    };
  }, [household, start, end]);

  let blocker = "";
  if (start > end) blocker = "The start date must be on or before the end date.";
  else if (preview.overlap) blocker = "This period overlaps a period that is already locked.";
  else if (!preview.expenses.length) blocker = "There are no expenses in this period.";
  else if (preview.unresolved)
    blocker = `Resolve ${preview.unresolved} draft, pending or disputed ${preview.unresolved === 1 ? "expense" : "expenses"} first.`;
  else if (preview.ledgerError) blocker = preview.ledgerError;

  async function lock() {
    if (await runAction("close", { start, end }, "Period locked. Payment requests created.")) {
      dispatch(dialogClosed());
      dispatch(goToTab("settle"));
    }
  }

  return (
    <div className="closing-form">
      <p>
        Review the period before locking it. Original expenses stay unchanged; later corrections are separate
        entries.
      </p>
      <div className="form-grid">
        <Field label="From">
          <input type="date" value={start} onChange={(event) => setStart(event.target.value)} />
        </Field>
        <Field label="To">
          <input type="date" min={start} value={end} onChange={(event) => setEnd(event.target.value)} />
        </Field>
      </div>
      <div className={`notice ${blocker ? "" : "ready"}`.trim()}>
        <Icon name="shield" />
        <span>
          {preview.expenses.length} {preview.expenses.length === 1 ? "record" : "records"} ·{" "}
          {preview.unresolved} unresolved
          <br />
          {blocker || "Ready to lock."}
        </span>
      </div>
      {preview.rows.map((row) => (
        <div className="member-row" key={row.id}>
          <Avatar member={row} />
          <span className="grow">{row.name}</span>
          <strong>
            {formatMoney(Math.abs(row.net))}{" "}
            <small>{row.net > 0 ? "to receive" : row.net < 0 ? "to pay" : "settled"}</small>
          </strong>
        </div>
      ))}
      <h3>
        {preview.transfers.length} proposed {preview.transfers.length === 1 ? "transfer" : "transfers"}
      </h3>
      {preview.transfers.map((transfer) => (
        <div className="row" key={`${transfer.from}-${transfer.to}`}>
          <span>
            {memberName(transfer.from)} → {memberName(transfer.to)}
          </span>
          <strong>{formatMoney(transfer.amountPence)}</strong>
        </div>
      ))}
      <div className="actions">
        <Button disabled={saving || Boolean(blocker)} onClick={lock}>
          {saving ? "Locking…" : "Lock & create payment requests"}
        </Button>
      </div>
    </div>
  );
}
