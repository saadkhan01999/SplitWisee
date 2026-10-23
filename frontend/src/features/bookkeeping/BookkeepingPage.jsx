import { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { money } from "@domain/calculation-engine/index.js";
import { useHouseholdAction } from "../../app/hooks.js";
import { Button } from "../../components/Button.jsx";
import { Field, FormError } from "../../components/Field.jsx";
import { saveBlob } from "../../utils/downloads.js";
import { EXPENSE_CATEGORIES, formatMoney, todayIso } from "../../utils/format.js";
import {
  selectHousehold,
  selectHouseholdSaving,
  selectIsHouseholdAdmin,
} from "../household/householdSlice.js";
import { bookCsv, monthlyBook } from "./bookkeeping.js";

const emptyEntry = () => ({
  date: todayIso(),
  type: "expense",
  description: "",
  amount: "",
  category: "Other",
});

function EntryForm({ onSaved }) {
  const runAction = useHouseholdAction();
  const saving = useSelector(selectHouseholdSaving);
  const [entry, setEntry] = useState(emptyEntry);
  const [error, setError] = useState("");
  const set = (key) => (event) => setEntry({ ...entry, [key]: event.target.value });

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    let amountPence;
    try {
      amountPence = money(entry.amount.trim());
    } catch (failure) {
      setError(failure.message);
      return;
    }
    const { amount: _amount, ...fields } = entry;
    const payload = {
      ...fields,
      description: entry.description.trim(),
      id: crypto.randomUUID(),
      amountPence,
    };
    if (await runAction("book", payload, "Journal entry recorded")) {
      setEntry(emptyEntry());
      onSaved();
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>New journal entry</h2>
      <div className="form-grid">
        <Field label="Date">
          <input required type="date" value={entry.date} onChange={set("date")} />
        </Field>
        <Field label="Type">
          <select value={entry.type} onChange={set("type")}>
            <option value="expense">Money out</option>
            <option value="income">Money in</option>
          </select>
        </Field>
        <Field label="Description">
          <input required maxLength={140} value={entry.description} onChange={set("description")} />
        </Field>
        <Field label="Amount (£)">
          <input
            required
            inputMode="decimal"
            placeholder="0.00"
            value={entry.amount}
            onChange={set("amount")}
          />
        </Field>
        <Field label="Category">
          <select value={entry.category} onChange={set("category")}>
            {EXPENSE_CATEGORIES.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </Field>
      </div>
      <FormError>{error}</FormError>
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save journal entry"}
      </Button>
    </form>
  );
}

export function BookkeepingPage() {
  const household = useSelector(selectHousehold);
  const admin = useSelector(selectIsHouseholdAdmin);
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const [adding, setAdding] = useState(false);
  const book = useMemo(() => monthlyBook(household, month), [household, month]);

  return (
    <>
      <div className="card row wrap">
        <Field label="Month">
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value || todayIso().slice(0, 7))}
          />
        </Field>
        <div className="grow" />
        <Button
          variant="outline"
          icon="download"
          onClick={() => saveBlob(bookCsv(household, month, book), `SplitWisee-Books-${month}.csv`)}
        >
          Export month CSV
        </Button>
        {admin && (
          <Button icon={adding ? undefined : "plus"} onClick={() => setAdding(!adding)}>
            {adding ? "Close entry form" : "Add entry"}
          </Button>
        )}
      </div>
      <p className="caption">
        Approved shared expenses appear automatically. Add only other income or costs here to avoid double
        counting. This is an income and expense journal, not a bank balance. Member repayments stay in
        Settlements.
      </p>
      <div className="book-stats">
        {[
          ["Opening balance", book.opening],
          ["Money in / refunds", book.income],
          ["Money out", book.expenses],
          ["Closing balance", book.closing],
        ].map(([label, pence]) => (
          <div className="card" key={label}>
            <small>{label}</small>
            <h2>{formatMoney(pence)}</h2>
          </div>
        ))}
      </div>
      {adding && <EntryForm onSaved={() => setAdding(false)} />}
      <section className="card journal-table">
        <h2>{month} journal</h2>
        {book.entries.length ? (
          book.entries.map((entry) => (
            <div className="member-row" key={`${entry.source}-${entry.id}`}>
              <span className="grow">
                <strong>{entry.description}</strong>
                <small>
                  {entry.date} · {entry.source}
                  {entry.category ? ` · ${entry.category}` : ""}
                </small>
              </span>
              <strong className={entry.direction > 0 ? "green" : "orange"}>
                {entry.direction > 0 ? "+" : "−"}
                {formatMoney(entry.amountPence)}
              </strong>
            </div>
          ))
        ) : (
          <p className="empty">
            No entries in this month. Choose another month{admin ? " or add an entry" : ""}.
          </p>
        )}
      </section>
    </>
  );
}
