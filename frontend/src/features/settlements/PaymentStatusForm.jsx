import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useHouseholdAction } from "../../app/hooks.js";
import { dialogClosed } from "../../app/uiSlice.js";
import { Button } from "../../components/Button.jsx";
import { Field } from "../../components/Field.jsx";
import { formatMoney } from "../../utils/format.js";
import { selectHousehold, selectHouseholdSaving, selectMemberName } from "../household/householdSlice.js";

const SUBMIT = { sent: "Mark transfer sent", received: "Confirm received", disputed: "Submit issue" };
const DONE = { sent: "Marked as sent", received: "Receipt confirmed", disputed: "Issue reported" };

/** Payer declares "sent"; only the recipient can confirm "received"; either can raise an issue. */
export function PaymentStatusForm({ closingId, paymentId, status }) {
  const dispatch = useDispatch();
  const household = useSelector(selectHousehold);
  const memberName = useSelector(selectMemberName);
  const saving = useSelector(selectHouseholdSaving);
  const runAction = useHouseholdAction();
  const [reason, setReason] = useState("");
  const payment = household.closings
    .find((closing) => closing.id === closingId)
    ?.payments.find((item) => item.id === paymentId);

  if (!payment) return <p>This payment request is no longer available.</p>;

  const amount = formatMoney(payment.amountPence);
  const text = {
    sent: `Only continue after sending ${amount} to ${memberName(payment.to)} from your bank. Reference: ${payment.reference}. SplitWisee does not move money.`,
    received: `Confirm only after checking that ${amount} from ${memberName(payment.from)} has arrived in your account. This is your confirmation, not bank verification.`,
    disputed: "Describe what went wrong. The payment stays outstanding until it is resolved.",
  }[status];

  async function handleSubmit(event) {
    event.preventDefault();
    const payload = {
      closingId,
      id: paymentId,
      status,
      ...(status === "disputed" && { reason: reason.trim() }),
    };
    if (await runAction("payment", payload, DONE[status])) dispatch(dialogClosed());
  }

  return (
    <form onSubmit={handleSubmit}>
      <p>{text}</p>
      {status === "disputed" && (
        <Field label="Explanation">
          <textarea
            required
            maxLength={500}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      )}
      <Button type="submit" disabled={saving || (status === "disputed" && !reason.trim())}>
        {saving ? "Saving…" : SUBMIT[status]}
      </Button>
    </form>
  );
}
