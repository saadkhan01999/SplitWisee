import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useHouseholdAction } from "../../app/hooks.js";
import { dialogOpened } from "../../app/uiSlice.js";
import { Button } from "../../components/Button.jsx";
import { Field } from "../../components/Field.jsx";
import { todayIso } from "../../utils/format.js";
import { selectHouseholdSaving } from "../household/householdSlice.js";

const COPY = {
  reverse: {
    text: "Creates a full, linked reversal dated in an open period. The original record stays unchanged. Add a corrected expense afterwards if needed.",
    submit: "Create full reversal",
    done: "Reversal recorded",
  },
  disputeExpense: {
    text: "Explain what is wrong. Your note is saved in the household audit trail and an admin can resolve it.",
    submit: "Report issue",
    done: "Issue reported",
  },
  resolveExpense: {
    text: "Explain how the issue was resolved. The expense is approved and your note is saved in the audit trail.",
    submit: "Resolve and approve",
    done: "Issue resolved",
  },
};

/** Reverse, dispute or resolve an expense. Every correction needs a written reason. */
export function ExpenseReviewForm({ expenseId, action }) {
  const dispatch = useDispatch();
  const saving = useSelector(selectHouseholdSaving);
  const runAction = useHouseholdAction();
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(todayIso());
  const copy = COPY[action];

  async function handleSubmit(event) {
    event.preventDefault();
    const payload = { id: expenseId, reason: reason.trim(), ...(action === "reverse" && { date }) };
    if (await runAction(action, payload, copy.done)) dispatch(dialogOpened("expense", { expenseId }));
  }

  return (
    <form onSubmit={handleSubmit}>
      <p>{copy.text}</p>
      {action === "reverse" && (
        <Field label="Correction date">
          <input type="date" required value={date} onChange={(event) => setDate(event.target.value)} />
        </Field>
      )}
      <Field label="Explanation">
        <textarea
          required
          maxLength={500}
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
      <Button type="submit" danger={action === "reverse"} disabled={saving || !reason.trim()}>
        {saving ? "Saving…" : copy.submit}
      </Button>
    </form>
  );
}
