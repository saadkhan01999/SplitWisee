import { useDispatch, useSelector } from "react-redux";
import { useHouseholdAction } from "../../app/hooks.js";
import { dialogOpened } from "../../app/uiSlice.js";
import { Button } from "../../components/Button.jsx";
import {
  selectHousehold,
  selectHouseholdSaving,
  selectIsHouseholdAdmin,
} from "../household/householdSlice.js";
import { ReceiptDownloads } from "../receipts/ReceiptDownloads.jsx";
import { ReceiptEvidence } from "../receipts/ReceiptEvidence.jsx";
import { ReceiptRecordView } from "../receipts/ReceiptRecordView.jsx";
import { selectUser } from "../session/sessionSlice.js";

export function ExpenseDetails({ expenseId }) {
  const dispatch = useDispatch();
  const household = useSelector(selectHousehold);
  const user = useSelector(selectUser);
  const admin = useSelector(selectIsHouseholdAdmin);
  const saving = useSelector(selectHouseholdSaving);
  const runAction = useHouseholdAction();
  const expense = household.expenses.find((item) => item.id === expenseId);

  if (!expense) return <p>This expense is no longer available.</p>;

  const review = (action) => dispatch(dialogOpened("expense-review", { expenseId, action }));
  const canSubmit = expense.status === "draft" && (expense.createdBy === user.id || admin);

  return (
    <>
      <ReceiptRecordView expense={expense} />
      <ReceiptEvidence expense={expense} householdId={household.id} />
      <ReceiptDownloads expense={expense} />
      <div className="actions wrap">
        {canSubmit && (
          <Button
            disabled={saving}
            onClick={() => runAction("submit", { id: expense.id }, "Draft submitted")}
          >
            Submit draft
          </Button>
        )}
        {expense.status === "pending" && admin && (
          <Button
            disabled={saving}
            onClick={() => runAction("approve", { id: expense.id }, "Expense approved")}
          >
            Approve
          </Button>
        )}
        {["pending", "approved"].includes(expense.status) && (
          <Button variant="text" onClick={() => review("disputeExpense")}>
            Report an issue
          </Button>
        )}
        {expense.status === "disputed" && admin && (
          <Button onClick={() => review("resolveExpense")}>Resolve issue</Button>
        )}
        {expense.status === "approved" && admin && !expense.reversalOf && (
          <Button variant="text" danger onClick={() => review("reverse")}>
            Reverse / refund
          </Button>
        )}
      </div>
    </>
  );
}
