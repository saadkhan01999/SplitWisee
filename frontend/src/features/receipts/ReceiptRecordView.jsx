import { useSelector } from "react-redux";
import { formatLongDate, formatMoney } from "../../utils/format.js";
import { selectHousehold, selectMemberName } from "../household/householdSlice.js";
import { differenceLabel, formatItemAmount, receiptPeople } from "./receiptRecord.js";

const total = (rows) => formatMoney(rows.reduce((sum, row) => sum + row.amountPence, 0));

/** On-screen expense record: total, who paid, each person's share and any purchased items. */
export function ReceiptRecordView({ expense }) {
  const household = useSelector(selectHousehold);
  const memberName = useSelector(selectMemberName);
  const people = receiptPeople(expense, memberName);

  return (
    <section className="receipt-paper professional-receipt">
      <div className="receipt-heading">
        <span className="eyebrow">HOUSEHOLD EXPENSE RECORD</span>
        <span className="pill mint">{expense.status}</span>
      </div>
      <h2>{expense.title}</h2>
      <p>
        {household.name} · {formatLongDate(expense.date)}
      </p>
      <div className="receipt-amount">
        <span>
          {expense.reversalOf ? "Refund / reversal" : "Total expense"}
          <small>GBP · {expense.category}</small>
        </span>
        <strong>
          {expense.reversalOf ? "−" : ""}
          {formatMoney(expense.amountPence)}
        </strong>
      </div>
      <dl className="receipt-meta">
        <div>
          <dt>Reference</dt>
          <dd>{expense.id}</dd>
        </div>
        <div>
          <dt>Purchase made by</dt>
          <dd>{memberName(expense.purchasedBy)}</dd>
        </div>
        <div>
          <dt>Recorded by</dt>
          <dd>{memberName(expense.createdBy)}</dd>
        </div>
        <div>
          <dt>Supporting receipt</dt>
          <dd>{expense.receipt ? "Attached" : "Not attached"}</dd>
        </div>
      </dl>

      <h3>How this expense is shared</h3>
      <p className="caption">
        Paid = money contributed. Share = personal cost. Difference = what to receive or contribute for this
        expense only.
      </p>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Member</th>
              <th scope="col">Paid</th>
              <th scope="col">Share</th>
              <th scope="col">Difference</th>
            </tr>
          </thead>
          <tbody>
            {people.map((person) => (
              <tr key={person.id}>
                <td>{person.name}</td>
                <td>{formatMoney(person.paid)}</td>
                <td>{formatMoney(person.share)}</td>
                <td>
                  <strong>{formatMoney(Math.abs(person.net))}</strong>
                  <small>{differenceLabel(person.net)}</small>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <th>{total(expense.funders)}</th>
              <th>{total(expense.allocations)}</th>
              <th>Fully allocated</th>
            </tr>
          </tfoot>
        </table>
      </div>

      {expense.items?.length > 0 && (
        <>
          <h3>Purchased items</h3>
          {expense.items.map((item, index) => (
            <div className="row" key={`${item.title}-${index}`}>
              <span>{item.title}</span>
              <strong>{formatItemAmount(item.amount)}</strong>
            </div>
          ))}
        </>
      )}
      {expense.reason && (
        <p>
          <strong>Correction note:</strong> {expense.reason}
        </p>
      )}
      <p className="receipt-footnote">
        This records a shared expense. It is not a merchant tax invoice or proof of a bank transfer. Overall
        balances and repayments are shown in Settlements.
      </p>
    </section>
  );
}
