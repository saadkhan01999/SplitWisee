import { useDispatch, useSelector } from "react-redux";
import { sum } from "@domain/calculation-engine/index.js";
import { currentPeriod, monthRange } from "@domain/periods/index.js";
import { dialogOpened } from "../../app/uiSlice.js";
import { Avatar } from "../../components/Avatar.jsx";
import { Button } from "../../components/Button.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import { Icon } from "../../components/Icon.jsx";
import { formatDate, formatMoney, formatShortDate, signedAmount, todayIso } from "../../utils/format.js";
import {
  selectBalances,
  selectHousehold,
  selectHouseholdSaving,
  selectIsHouseholdAdmin,
  selectMemberName,
} from "../household/householdSlice.js";
import { selectUser } from "../session/sessionSlice.js";
import { closingName, closingStatus, closingTotal, PAYMENT_LABEL } from "./closingSheet.js";
import { useClosingDownloads } from "./useClosingDownloads.js";

function PaymentCard({ closing, payment }) {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const household = useSelector(selectHousehold);
  const memberName = useSelector(selectMemberName);
  const saving = useSelector(selectHouseholdSaving);
  const open = (status) =>
    dispatch(dialogOpened("payment", { closingId: closing.id, paymentId: payment.id, status }));
  const payer = household.members.find((member) => member.id === payment.from);
  const isPayer = payment.from === user.id;
  const isRecipient = payment.to === user.id;

  return (
    <div className="payment card">
      <div className="row">
        <Avatar member={payer} />
        <div className="grow">
          <strong>
            {memberName(payment.from)} <span className="muted">→</span> {memberName(payment.to)}
          </strong>
          <small>{payment.reference}</small>
        </div>
        <strong>{formatMoney(payment.amountPence)}</strong>
      </div>
      <div className="row wrap">
        <span className={`pill ${payment.status === "received" ? "mint" : ""}`.trim()}>
          {PAYMENT_LABEL[payment.status]}
        </span>
        <div className="grow" />
        {isPayer && ["requested", "disputed"].includes(payment.status) && (
          <Button size="small" disabled={saving} onClick={() => open("sent")}>
            I sent it
          </Button>
        )}
        {isRecipient && payment.status === "sent" && (
          <Button size="small" disabled={saving} onClick={() => open("received")}>
            Confirm received
          </Button>
        )}
        {(isPayer || isRecipient) && payment.status !== "received" && (
          <Button variant="text" size="small" onClick={() => open("disputed")}>
            Report a problem
          </Button>
        )}
      </div>
      {payment.reason && <p className="muted">Review note: {payment.reason}</p>}
    </div>
  );
}

function PeriodOverview() {
  const household = useSelector(selectHousehold);
  const admin = useSelector(selectIsHouseholdAdmin);
  const period = currentPeriod(household);
  const range = period ?? monthRange(todayIso());
  const approved = household.expenses.filter(
    (expense) => expense.status === "approved" && expense.date >= range.start && expense.date <= range.end,
  );
  const pending = household.closings.flatMap((closing) =>
    closing.payments.filter((payment) => payment.status !== "received"),
  );
  const oldest = household.closings.find((closing) => closing.payments.some((p) => p.status !== "received"));

  return (
    <div className="period-overview">
      <section className="card period-card">
        <span className="eyebrow">{period ? "CURRENT PERIOD" : "NO OPEN PERIOD"}</span>
        <strong>{period ? period.name : "Start a period"}</strong>
        <small>
          {period
            ? `${formatShortDate(period.start)} – ${formatShortDate(period.end)} · `
            : "Group the next expenses for settlement. "}
          {admin ? "Closing review is available to you." : "An owner or admin closes each period."}
        </small>
      </section>
      <section className="card">
        <small>Household spending</small>
        <strong>{formatMoney(sum(approved.map(signedAmount)))}</strong>
        <small>
          {approved.length} approved {approved.length === 1 ? "expense" : "expenses"}
          {period ? " this period" : " this month"}
        </small>
      </section>
      <section className="card">
        <small>Transfers awaiting confirmation</small>
        <strong>{pending.length}</strong>
        <small>
          {pending.length
            ? `Outstanding from ${oldest ? closingName(oldest) : "locked periods"}`
            : "Nothing outstanding"}
        </small>
      </section>
    </div>
  );
}

function ClosingCard({ closing }) {
  const dispatch = useDispatch();
  const household = useSelector(selectHousehold);
  const { download } = useClosingDownloads();
  const status = closingStatus(closing);
  const members = (closing.lines ?? []).filter((line) => line.funded || line.share || line.net).length;

  return (
    <section className="closing card">
      <div className="row wrap">
        <div className="grow">
          <h3>{closingName(closing)}</h3>
          <small>
            {formatShortDate(closing.start)} – {formatShortDate(closing.end)} · locked{" "}
            {formatDate(closing.createdAt)}
          </small>
        </div>
        <span className={`pill ${status.settled ? "mint" : "warning"}`}>
          {status.settled
            ? "Settled"
            : `${status.pending} pending ${status.pending === 1 ? "transfer" : "transfers"}`}
        </span>
      </div>
      <div className="closing-stats">
        <div>
          <small>Total expenses</small>
          <strong>{formatMoney(closingTotal(household, closing))}</strong>
        </div>
        <div>
          <small>Members</small>
          <strong>{members}</strong>
        </div>
        <div>
          <small>Confirmed</small>
          <strong>
            {status.confirmed} of {status.total}
          </strong>
        </div>
      </div>
      <div className="actions wrap">
        <Button
          variant="outline"
          size="small"
          onClick={() =>
            dispatch(dialogOpened("closing-sheet", { closingId: closing.id, name: closingName(closing) }))
          }
        >
          View closing sheet
        </Button>
        <Button variant="text" size="small" icon="download" onClick={() => download("csv", closing)}>
          CSV
        </Button>
      </div>
      {closing.payments.length ? (
        closing.payments.map((payment) => (
          <PaymentCard key={payment.id} closing={closing} payment={payment} />
        ))
      ) : (
        <EmptyState icon="check" title="Everyone is balanced">
          No transfers were needed for this period.
        </EmptyState>
      )}
    </section>
  );
}

export function SettlementsPage() {
  const dispatch = useDispatch();
  const household = useSelector(selectHousehold);
  const balances = useSelector(selectBalances);
  const admin = useSelector(selectIsHouseholdAdmin);
  const startSettlement = () => dispatch(dialogOpened("closing"));
  const closings = [...household.closings].sort((a, b) => b.end.localeCompare(a.end));

  return (
    <>
      <div className="notice">
        <Icon name="shield" />
        <span>
          Transfers happen in your own banking app. “Sent” is the payer’s declaration; only the recipient can
          confirm receipt. Locked closing records stay unchanged. KoinSplit never moves money.
        </span>
      </div>
      <PeriodOverview />
      <div className="content-grid">
        <section>
          <div className="section-heading">
            <h2>Closing periods</h2>
            {closings.length > 0 && <span className="pill mint">History preserved</span>}
          </div>
          {closings.length ? (
            closings.map((closing) => <ClosingCard key={closing.id} closing={closing} />)
          ) : (
            <section className="card">
              <EmptyState
                icon="settle"
                title="A fresh start to settling up"
                action={admin && <Button onClick={startSettlement}>Start new settlement</Button>}
              >
                Review the open period, then lock its figures to create payment requests. The next period
                opens automatically.
                {!admin && " A household owner or admin locks each period."}
              </EmptyState>
            </section>
          )}
        </section>
        <section className="card">
          <h2>Outstanding balances</h2>
          {balances
            .filter((row) => !row.left || row.net !== 0)
            .map((row) => (
              <div className="member-row" key={row.id}>
                <Avatar member={row} />
                <span className="grow">
                  <strong>{row.name}</strong>
                  <small>{row.net > 0 ? "To receive" : row.net < 0 ? "To pay" : "Settled"}</small>
                </span>
                <strong className={row.net >= 0 ? "green" : "orange"}>
                  {formatMoney(Math.abs(row.net))}
                </strong>
              </div>
            ))}
          <p className="caption">
            All dates, including confirmed repayments. Amounts are exact pence from the household ledger.
            <br />
            Combined net balance: {formatMoney(sum(balances.map((row) => row.net)))}
          </p>
        </section>
      </div>
    </>
  );
}
