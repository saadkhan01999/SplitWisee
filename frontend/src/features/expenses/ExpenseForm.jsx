import { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { money } from "@domain/calculation-engine/index.js";
import { cleanReceiptScan } from "@domain/receipts/metadata.js";
import { useHouseholdAction } from "../../app/hooks.js";
import { goToTab } from "../../app/navigationSlice.js";
import { dialogClosed } from "../../app/uiSlice.js";
import { Button } from "../../components/Button.jsx";
import { Checkbox, Field, FormError } from "../../components/Field.jsx";
import { Icon } from "../../components/Icon.jsx";
import { EXPENSE_CATEGORIES, formatLongDate, formatMoney, todayIso } from "../../utils/format.js";
import { selectHousehold, selectHouseholdSaving } from "../household/householdSlice.js";
import { ReceiptCapture } from "../receipts/ReceiptCapture.jsx";
import { useReceiptUpload } from "../receipts/useReceiptUpload.js";
import { selectUser } from "../session/sessionSlice.js";
import { computeAllocation, computeFunders, eligibleMembers, penceToInput } from "./expenseDraft.js";
import { FundersEditor } from "./FundersEditor.jsx";
import { SplitEditor } from "./SplitEditor.jsx";

/** New expense, optionally from a receipt. `room` pre-selects one room; `amount` comes from the calculator. */
export function ExpenseForm({ room, amount: initialAmount }) {
  const dispatch = useDispatch();
  const household = useSelector(selectHousehold);
  const user = useSelector(selectUser);
  const saving = useSelector(selectHouseholdSaving);
  const runAction = useHouseholdAction();

  const [details, setDetails] = useState({
    title: "",
    date: todayIso(),
    amount: initialAmount ?? "",
    category: EXPENSE_CATEGORIES[0],
    purchasedBy: user.id,
  });
  const [method, setMethod] = useState("equal");
  const [funders, setFunders] = useState([{ memberId: user.id, value: "" }]);
  const [selected, setSelected] = useState(() =>
    household.members
      .filter((member) => !member.left && (!room || member.room === room))
      .map((member) => member.id),
  );
  const [values, setValues] = useState({});
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState(false);
  const [scanReviewed, setScanReviewed] = useState(false);
  const [error, setError] = useState("");
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);
  const [dateNote, setDateNote] = useState("");

  // Members can only share costs from the day they joined, so the earliest usable date is the first join date.
  const earliestDate = household.members.map((member) => member.joined).sort()[0];

  const upload = useReceiptUpload(household.id, (scan) => {
    setScanReviewed(false);
    const usableDate = scan.date && eligibleMembers(household.members, scan.date).length > 0;
    setDateNote(
      scan.date && !usableDate
        ? `The receipt is dated ${formatLongDate(scan.date)}, before anyone had joined this household, so the expense date was not changed.`
        : "",
    );
    setDetails((current) => ({
      ...current,
      amount: scan.amountPence ? penceToInput(scan.amountPence) : current.amount,
      title: current.title || scan.merchant || "",
      date: usableDate ? scan.date : current.date,
    }));
    if (scan.items?.length) setItems(scan.items.map((item) => ({ ...item, members: selected })));
  });

  const members = useMemo(
    () => eligibleMembers(household.members, details.date),
    [household.members, details.date],
  );
  const memberIds = new Set(members.map((member) => member.id));
  const included = selected.filter((id) => memberIds.has(id));

  let allocations = [];
  let splitError = "";
  if (!members.length)
    splitError = `No one had joined this household by ${formatLongDate(details.date)}. Choose ${formatLongDate(earliestDate)} or later.`;
  else if (details.amount.trim()) {
    try {
      allocations = computeAllocation({
        amount: details.amount.trim(),
        method,
        selected: included,
        values,
        items,
      });
    } catch (failure) {
      splitError = failure.message;
    }
  }

  const amountPence = (() => {
    try {
      return money(details.amount.trim());
    } catch {
      return null;
    }
  })();
  const duplicate =
    amountPence &&
    household.expenses.some(
      (expense) =>
        expense.title.trim().toLowerCase() === details.title.trim().toLowerCase() &&
        expense.date === details.date &&
        expense.amountPence === amountPence,
    );

  const set = (key) => (event) => {
    setDetails((current) => ({ ...current, [key]: event.target.value }));
    if (key !== "category") setDuplicateAcknowledged(false);
  };

  function buildPayload() {
    if (upload.scanning) throw new Error("Wait for the receipt scan to finish.");
    if (upload.uploading) throw new Error("Wait for the receipt to finish saving.");
    if (upload.scan && !upload.scan.error && !scanReviewed)
      throw new Error("Tick the box to confirm you checked the scanned details against your receipt.");
    const total = money(details.amount.trim());
    if (splitError) throw new Error(splitError);
    if (household.settings.requireReceipts && !upload.attachment && !draft)
      throw new Error("This household requires a receipt for every expense. Attach one or save a draft.");
    if (duplicate && !duplicateAcknowledged)
      throw new Error(
        "This looks like an expense that is already recorded. Tick “Save anyway” if it is a new one.",
      );

    return {
      id: crypto.randomUUID(),
      title: details.title.trim(),
      date: details.date,
      category: details.category,
      amountPence: total,
      purchasedBy: details.purchasedBy,
      method,
      funders: computeFunders(funders, total),
      allocations,
      receipt: upload.attachment,
      receiptScan:
        upload.scan && !upload.scan.error
          ? cleanReceiptScan({
              ...upload.scan,
              items,
              reviewed: scanReviewed,
              reviewedAt: new Date().toISOString(),
            })
          : null,
      items: items.length ? items : undefined,
      status: draft ? "draft" : "submitted",
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    let payload;
    try {
      payload = buildPayload();
    } catch (failure) {
      setError(failure.message);
      return;
    }
    const saved = await runAction("expense", payload, draft ? "Draft saved" : "Expense saved");
    if (saved) {
      dispatch(dialogClosed());
      dispatch(goToTab("expenses"));
    }
  }

  return (
    <form className="expense-form" onSubmit={handleSubmit}>
      <ReceiptCapture upload={upload} reviewed={scanReviewed} onReviewedChange={setScanReviewed} />

      <div className="form-grid">
        <Field label="What was it for?">
          <input
            required
            maxLength={140}
            placeholder="e.g. Weekly groceries"
            value={details.title}
            onChange={set("title")}
          />
        </Field>
        <Field label="Total amount (£)">
          <input
            required
            inputMode="decimal"
            placeholder="0.00"
            value={details.amount}
            onChange={set("amount")}
          />
        </Field>
        <Field label="Date" hint={dateNote || undefined}>
          <input required type="date" min={earliestDate} value={details.date} onChange={set("date")} />
        </Field>
        <Field label="Category">
          <select value={details.category} onChange={set("category")}>
            {EXPENSE_CATEGORIES.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Who made the purchase?">
        <select value={details.purchasedBy} onChange={set("purchasedBy")}>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </Field>

      <FundersEditor
        funders={funders}
        onChange={setFunders}
        members={members}
        amount={details.amount}
        fallbackId={user.id}
      />

      <hr />

      <SplitEditor
        method={method}
        onMethodChange={setMethod}
        items={items}
        onItemsChange={setItems}
        members={members}
        selected={included}
        onSelectedChange={setSelected}
        values={values}
        onValuesChange={setValues}
        allocations={allocations}
      />

      {method !== "items" && items.length > 0 && (
        <details className="scan-items">
          <summary>Receipt items saved with this expense ({items.length})</summary>
          {items.map((item, index) => (
            <div className="row" key={index}>
              <span>{item.title || "Item"}</span>
              <strong>{item.amount}</strong>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove item ${index + 1}`}
                onClick={() => setItems(items.filter((_, i) => i !== index))}
              >
                <Icon name="close" />
              </button>
            </div>
          ))}
          <p className="caption">
            Choose “By receipt item” above to edit lines and decide who shares each one.
          </p>
        </details>
      )}

      <p className="caption">
        Leftover pennies go to the largest remainders (member ID breaks ties). Shares are saved as a snapshot,
        so later membership changes never rewrite this expense.
      </p>
      {allocations.length > 0 && amountPence && (
        <p className="caption green" role="status">
          ✓ {formatMoney(amountPence)} fully allocated between {allocations.length}{" "}
          {allocations.length === 1 ? "person" : "people"}.
        </p>
      )}
      <FormError>{error || splitError}</FormError>
      {duplicate && (
        <Checkbox checked={duplicateAcknowledged} onChange={setDuplicateAcknowledged}>
          Save anyway: an expense with the same title, date and amount already exists.
        </Checkbox>
      )}

      <div className="form-footer">
        <Checkbox checked={draft} onChange={setDraft}>
          Save as draft
        </Checkbox>
        <Button type="submit" disabled={saving || upload.scanning || upload.uploading}>
          {saving ? "Saving…" : draft ? "Save draft" : "Save expense"} <Icon name="check" size={18} />
        </Button>
      </div>
    </form>
  );
}
