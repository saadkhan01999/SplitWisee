import { useDispatch, useSelector } from "react-redux";
import { sum } from "@domain/calculation-engine/index.js";
import { dialogOpened } from "../../app/uiSlice.js";
import { Avatar } from "../../components/Avatar.jsx";
import { Button } from "../../components/Button.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import { Icon } from "../../components/Icon.jsx";
import { formatMoney, formatShortDate } from "../../utils/format.js";
import {
  selectBalances,
  selectHousehold,
  selectHouseholdSaving,
  selectIsHouseholdAdmin,
  selectMemberName,
} from "../household/householdSlice.js";
import { selectUser } from "../session/sessionSlice.js";

const PAYMENT_STATUS = {
  received: "Recipient confirmed",
  sent: "Sent · awaiting recipient",
  disputed: "Needs review",
  requested: "Awaiting transfer",
};

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
          {PAYMENT_STATUS[payment.status]}
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

export function SettlementsPage() {
  const dispatch = useDispatch();
  const household = useSelector(selectHousehold);
  const balances = useSelector(selectBalances);
  const admin = useSelector(selectIsHouseholdAdmin);
  const openClosing = () => dispatch(dialogOpened("closing"));

  return (
    <>
      <div className="notice">
        <Icon name="shield" />
        <span>
          Transfers happen in your own banking app. “Sent” is the payer’s declaration; only the recipient can
          confirm receipt. SplitWisee never moves money.
        </span>
      </div>
      <div className="content-grid">
        <section>
          <div className="section-heading">
            <h2>Closing periods</h2>
            {admin && (
              <Button size="small" onClick={openClosing}>
                Close a period
              </Button>
            )}
          </div>
          {household.closings.length ? (
            household.closings.map((closing) => (
              <section key={closing.id} className="closing">
                <div className="row">
                  <h3>
                    {formatShortDate(closing.start)} – {formatShortDate(closing.end)}
                  </h3>
                  <span className="pill mint">
                    {closing.payments.every((payment) => payment.status === "received")
                      ? "Settled"
                      : "Locked"}
                  </span>
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
            ))
          ) : (
            <section className="card">
              <EmptyState
                icon="settle"
                title="A fresh start to settling up"
                action={admin && <Button onClick={openClosing}>Preview a closing</Button>}
              >
                Review a weekly, monthly or custom period, then lock the figures to create payment requests.
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
            All dates, including confirmed repayments.
            <br />
            Combined net balance: {formatMoney(sum(balances.map((row) => row.net)))}
          </p>
        </section>
      </div>
    </>
  );
}
