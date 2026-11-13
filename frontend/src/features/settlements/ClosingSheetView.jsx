import { useSelector } from "react-redux";
import { Button } from "../../components/Button.jsx";
import { formatDate, formatLongDate, formatMoney, formatShortDate } from "../../utils/format.js";
import { selectHousehold } from "../household/householdSlice.js";
import { useReceiptRecords } from "../receipts/receiptRetention.js";
import { closingSheet, PAYMENT_LABEL } from "./closingSheet.js";
import { useClosingDownloads } from "./useClosingDownloads.js";

/** The frozen closing sheet of one locked period, with PDF, CSV and JSON downloads. */
export function ClosingSheetView({ closingId }) {
  const household = useSelector(selectHousehold);
  const records = useReceiptRecords(household);
  const { download, busy } = useClosingDownloads();
  const closing = household.closings.find((item) => item.id === closingId);
  if (!closing) return <p>This closing sheet is not available.</p>;
  const sheet = closingSheet(household, closing);

  const receiptState = (expense) => {
    if (!expense.receipt) return "No receipt";
    const record = records?.get(expense.receipt.id);
    if (record?.purgedAt) return `Original removed ${formatDate(record.purgedAt)}`;
    return `Original kept until ${formatShortDate(sheet.retentionUntil)}`;
  };

  return (
    <div className="closing-sheet">
      <div className="closing-sheet-head">
        <div>
          <span className="eyebrow">CLOSING SHEET · {household.name.toUpperCase()}</span>
          <p>
            {formatLongDate(closing.start)} – {formatLongDate(closing.end)} · locked{" "}
            {formatDate(sheet.lockedAt)} by {sheet.lockedBy}
          </p>
        </div>
        <span className={`pill ${sheet.status.settled ? "mint" : "warning"}`}>{sheet.status.label}</span>
      </div>
      <div className="sheet-stats">
        <div>
          <small>Total recorded</small>
          <strong>{formatMoney(sheet.totalPence)}</strong>
        </div>
        <div>
          <small>Members</small>
          <strong>{sheet.members.length}</strong>
        </div>
        <div>
          <small>Transfers confirmed</small>
          <strong>
            {sheet.status.confirmed} of {sheet.status.total}
          </strong>
        </div>
      </div>

      <h3>Member balances</h3>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Member</th>
              <th scope="col">Funded</th>
              <th scope="col">Share</th>
              <th scope="col">Balance</th>
            </tr>
          </thead>
          <tbody>
            {sheet.members.map((member) => (
              <tr key={member.id}>
                <td>{member.name}</td>
                <td>{formatMoney(member.funded)}</td>
                <td>{formatMoney(member.share)}</td>
                <td className={member.net >= 0 ? "green" : "orange"}>
                  {formatMoney(Math.abs(member.net))}{" "}
                  <small>{member.net > 0 ? "to receive" : member.net < 0 ? "to pay" : "settled"}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Settlement transfers</h3>
      {sheet.transfers.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">From → to</th>
                <th scope="col">Reference</th>
                <th scope="col">Amount</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {sheet.transfers.map((transfer) => (
                <tr key={transfer.reference}>
                  <td>
                    {transfer.from} → {transfer.to}
                  </td>
                  <td>{transfer.reference}</td>
                  <td>{formatMoney(transfer.amountPence)}</td>
                  <td>{PAYMENT_LABEL[transfer.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="caption">Everyone was balanced: no transfers were needed.</p>
      )}

      <h3>Expenses in this period</h3>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Expense</th>
              <th scope="col">Date</th>
              <th scope="col">Paid by</th>
              <th scope="col">Amount</th>
              <th scope="col">Receipt</th>
            </tr>
          </thead>
          <tbody>
            {sheet.expenses.map((expense) => (
              <tr key={expense.id}>
                <td>{expense.title}</td>
                <td>{formatShortDate(expense.date)}</td>
                <td>{expense.purchasedByName}</td>
                <td>{formatMoney(expense.signedPence)}</td>
                <td>{receiptState(expense)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="caption">
        These figures were frozen when the period was locked. Corrections are separate entries in a later
        period. Original receipt files are kept until {formatLongDate(sheet.retentionUntil)} (one month after
        locking); download any you need before then. The records above are kept.
      </p>
      <div className="actions wrap">
        <Button icon="download" disabled={busy(closing, "pdf")} onClick={() => download("pdf", closing)}>
          {busy(closing, "pdf") ? "Preparing…" : "PDF"}
        </Button>
        <Button variant="outline" onClick={() => download("csv", closing)}>
          CSV
        </Button>
        <Button variant="outline" onClick={() => download("json", closing)}>
          JSON
        </Button>
      </div>
    </div>
  );
}
