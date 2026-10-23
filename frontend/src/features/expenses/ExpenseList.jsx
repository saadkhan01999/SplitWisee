import { useDispatch, useSelector } from "react-redux";
import { dialogOpened } from "../../app/uiSlice.js";
import { Button } from "../../components/Button.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import { Icon } from "../../components/Icon.jsx";
import { formatMoney, formatShortDate } from "../../utils/format.js";
import { selectMemberName } from "../household/householdSlice.js";

function statusLabel(expense) {
  if (expense.status !== "approved") return expense.status;
  return expense.receipt ? "Receipt attached" : "Recorded";
}

export function ExpenseList({ expenses }) {
  const dispatch = useDispatch();
  const memberName = useSelector(selectMemberName);

  if (!expenses.length)
    return (
      <EmptyState
        title="No expenses here yet"
        action={<Button onClick={() => dispatch(dialogOpened("expense-new"))}>Add expense</Button>}
      >
        Add an expense or try another filter.
      </EmptyState>
    );

  return (
    <ul className="expense-list">
      {expenses.map((expense) => {
        const bill = expense.category === "Bills";
        return (
          <li key={expense.id}>
            <button
              type="button"
              className="expense-row"
              onClick={() => dispatch(dialogOpened("expense", { expenseId: expense.id }))}
            >
              <span className={`expense-icon ${bill ? "amber" : ""}`.trim()}>
                <Icon name={bill ? "wallet" : "expenses"} />
              </span>
              <span className="grow">
                <strong>{expense.title}</strong>
                <small>
                  {formatShortDate(expense.date)} · {expense.category} · {memberName(expense.purchasedBy)}
                </small>
              </span>
              <span className="align-right">
                <strong>
                  {expense.reversalOf ? "−" : ""}
                  {formatMoney(expense.amountPence)}
                </strong>
                <small className={expense.status === "approved" ? "green" : "orange"}>
                  {statusLabel(expense)}
                </small>
              </span>
              <Icon name="chevron" size={16} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
