import { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { balances, sum } from "@domain/calculation-engine/index.js";
import { toastShown } from "../../app/uiSlice.js";
import { Avatar } from "../../components/Avatar.jsx";
import { Button } from "../../components/Button.jsx";
import { Field } from "../../components/Field.jsx";
import { saveBlob, shareBlob } from "../../utils/downloads.js";
import {
  EXPENSE_CATEGORIES,
  firstDayOfMonth,
  formatMoney,
  signedAmount,
  todayIso,
} from "../../utils/format.js";
import { selectHousehold, selectMemberName } from "../household/householdSlice.js";
import { expensesCsv, statementPdf } from "./householdStatement.js";

export function ReportsPage() {
  const dispatch = useDispatch();
  const household = useSelector(selectHousehold);
  const memberName = useSelector(selectMemberName);
  const [period, setPeriod] = useState({ start: firstDayOfMonth(), end: todayIso() });
  const [exporting, setExporting] = useState(false);
  const { start, end } = period;

  const byCategory = useMemo(() => {
    const approved = household.expenses.filter(
      (expense) => expense.status === "approved" && expense.date >= start && expense.date <= end,
    );
    return EXPENSE_CATEGORIES.map((category) => ({
      category,
      pence: sum(approved.filter((expense) => expense.category === category).map(signedAmount)),
    }));
  }, [household, start, end]);
  const peak = Math.max(1, ...byCategory.map((row) => row.pence));
  const members = useMemo(
    () => balances(household, start, end).filter((row) => row.funded || row.share || row.net),
    [household, start, end],
  );

  async function exportPdf() {
    setExporting(true);
    try {
      await shareBlob(
        await statementPdf(household, start, end),
        `SplitWisee-statement-${start}-to-${end}.pdf`,
        "Household statement",
      );
    } catch (failure) {
      if (failure?.name !== "AbortError")
        dispatch(toastShown(failure.message || "The statement could not be created."));
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <div className="card row wrap date-filter">
        <Field label="From">
          <input
            type="date"
            value={start}
            onChange={(event) => setPeriod({ ...period, start: event.target.value })}
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            value={end}
            min={start}
            onChange={(event) => setPeriod({ ...period, end: event.target.value })}
          />
        </Field>
        <div className="grow" />
        <Button
          variant="outline"
          icon="download"
          onClick={() =>
            saveBlob(
              expensesCsv(household, start, end, memberName),
              `SplitWisee-expenses-${start}-to-${end}.csv`,
            )
          }
        >
          CSV
        </Button>
        <Button icon="share" disabled={exporting} onClick={exportPdf}>
          {exporting ? "Preparing…" : "Statement PDF"}
        </Button>
      </div>
      <div className="content-grid">
        <section className="card">
          <h2>Spending by category</h2>
          {byCategory.map(({ category, pence }) => (
            <div className="category" key={category}>
              <div className="row">
                <span>{category}</span>
                <strong>{formatMoney(pence)}</strong>
              </div>
              <div className="bar" aria-hidden="true">
                <i style={{ width: `${Math.max(0, (pence / peak) * 100)}%` }} />
              </div>
            </div>
          ))}
        </section>
        <section className="card">
          <h2>Member breakdown</h2>
          {members.length ? (
            members.map((row) => (
              <div className="member-row" key={row.id}>
                <Avatar member={row} />
                <span className="grow">
                  <strong>{row.name}</strong>
                  <small>
                    Funded {formatMoney(row.funded)} · share {formatMoney(row.share)}
                  </small>
                </span>
                <span className={row.net >= 0 ? "green" : "orange"}>
                  {formatMoney(Math.abs(row.net))}
                  <small>{row.net > 0 ? "to receive" : row.net < 0 ? "to pay" : "settled"}</small>
                </span>
              </div>
            ))
          ) : (
            <p className="caption">No approved expenses in this period.</p>
          )}
        </section>
      </div>
    </>
  );
}
