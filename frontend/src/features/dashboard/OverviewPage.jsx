import { useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { sum } from "@domain/calculation-engine/index.js";
import { goToTab } from "../../app/navigationSlice.js";
import { dialogOpened } from "../../app/uiSlice.js";
import { Avatar } from "../../components/Avatar.jsx";
import { Button } from "../../components/Button.jsx";
import { Icon } from "../../components/Icon.jsx";
import { formatMoney, signedAmount, todayIso } from "../../utils/format.js";
import { ExpenseList } from "../expenses/ExpenseList.jsx";
import { selectBalances, selectHousehold } from "../household/householdSlice.js";
import { AccessStatus } from "../rewards/AccessStatus.jsx";
import { loadRewards, selectRewards } from "../rewards/rewardsSlice.js";
import { selectUser } from "../session/sessionSlice.js";

const MONTHS_SHOWN = 12;

/** Approved spending per month for the last twelve months, oldest first. */
function monthlySpending(expenses) {
  const [year, month] = todayIso().split("-").map(Number);
  const months = Array.from({ length: MONTHS_SHOWN }, (_, index) => {
    const date = new Date(Date.UTC(year, month - MONTHS_SHOWN + index, 1));
    return {
      key: date.toISOString().slice(0, 7),
      label: date.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
    };
  });
  return months.map(({ key, label }) => ({
    label,
    pence: sum(expenses.filter((expense) => expense.date.startsWith(key)).map(signedAmount)),
  }));
}

function SpendingBars({ months }) {
  const peak = Math.max(1, ...months.map((month) => month.pence));
  const summary = months.map((month) => `${month.label} ${formatMoney(month.pence)}`).join(", ");
  return (
    <div className="mini-bars" role="img" aria-label={`Spending in the last 12 months: ${summary}`}>
      {months.map((month) => (
        <i
          key={month.label}
          title={`${month.label}: ${formatMoney(month.pence)}`}
          style={{ height: `${Math.max(4, (Math.max(0, month.pence) / peak) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function AccessOverview() {
  const dispatch = useDispatch();
  const { data, status } = useSelector(selectRewards);

  useEffect(() => {
    dispatch(loadRewards());
  }, [dispatch]);

  return (
    <div className="access-overview">
      <AccessStatus data={data} />
      {status === "error" && (
        <p className="caption" role="status">
          Plan status unavailable.{" "}
          <Button variant="text" onClick={() => dispatch(loadRewards())}>
            Retry
          </Button>
        </p>
      )}
      <Button variant="outline" onClick={() => dispatch(goToTab("rewards"))}>
        View my referral &amp; plan
      </Button>
    </div>
  );
}

export function OverviewPage() {
  const dispatch = useDispatch();
  const household = useSelector(selectHousehold);
  const balances = useSelector(selectBalances);
  const user = useSelector(selectUser);
  const me = balances.find((row) => row.id === user.id);
  const approved = useMemo(
    () => household.expenses.filter((expense) => expense.status === "approved"),
    [household],
  );
  const months = useMemo(() => monthlySpending(approved), [approved]);
  const recent = useMemo(
    () => [...household.expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    [household],
  );
  const activeMembers = household.members.filter((member) => !member.left);

  return (
    <>
      <AccessOverview />
      <div className="dashboard-grid">
        <section className="balance-hero">
          <div className="row">
            <span className="hero-label">YOUR OUTSTANDING BALANCE</span>
            <span className="hero-icon">
              <Icon name="wallet" />
            </span>
          </div>
          <h2>{formatMoney(Math.abs(me?.net ?? 0))}</h2>
          <p>
            {me?.net > 0
              ? "You are owed this amount"
              : me?.net < 0
                ? "Your share to pay back"
                : "All square. You’re settled up."}
          </p>
          <div className="hero-bottom">
            <span>
              <span className="dot" /> All recorded dates
            </span>
            <button type="button" onClick={() => dispatch(goToTab("settle"))}>
              View settlements <Icon name="arrow" size={18} />
            </button>
          </div>
          <div className="hero-ring" />
        </section>
        <section className="stat card">
          <span className="stat-icon">
            <Icon name="expenses" />
          </span>
          <span className="muted">Household spending</span>
          <h2>{formatMoney(sum(approved.map(signedAmount)))}</h2>
          <small>
            {approved.length} approved {approved.length === 1 ? "record" : "records"} · all dates
          </small>
          <SpendingBars months={months} />
        </section>
        <section className="stat card">
          <span className="stat-icon amber">
            <Icon name="people" />
          </span>
          <span className="muted">Your cost share</span>
          <h2>{formatMoney(me?.share ?? 0)}</h2>
          <small>You funded {formatMoney(me?.funded ?? 0)}</small>
          <div className="avatars">
            {activeMembers.slice(0, 6).map((member) => (
              <Avatar key={member.id} member={member} />
            ))}
            {activeMembers.length > 6 && <span>+{activeMembers.length - 6}</span>}
          </div>
        </section>
      </div>

      <div className="content-grid">
        <section className="card list-card">
          <div className="section-heading">
            <h2>
              Recent expenses <span className="count">{household.expenses.length}</span>
            </h2>
            <button type="button" className="link" onClick={() => dispatch(goToTab("expenses"))}>
              View all <Icon name="arrow" size={16} />
            </button>
          </div>
          <ExpenseList expenses={recent} />
          <div className="card-foot">
            <Icon name="shield" size={16} /> Funding follows the person who actually paid.
          </div>
        </section>
        <div className="right-stack">
          <section className="card">
            <div className="section-heading">
              <h2>At a glance</h2>
              <span className="pill mint">Together</span>
            </div>
            {balances
              .filter((row) => !row.left || row.net !== 0)
              .slice(0, 4)
              .map((row) => (
                <div className="member-row" key={row.id}>
                  <Avatar member={row} />
                  <span className="grow">
                    <strong>
                      {row.name}
                      {row.id === user.id ? " (you)" : ""}
                    </strong>
                    <small>{row.net > 0 ? "To receive" : row.net < 0 ? "To pay" : "Settled"}</small>
                  </span>
                  <strong className={row.net >= 0 ? "green" : "orange"}>
                    {formatMoney(Math.abs(row.net))}
                  </strong>
                </div>
              ))}
            <Button variant="outline" full onClick={() => dispatch(goToTab("settle"))}>
              See everyone’s balance <Icon name="arrow" size={16} />
            </Button>
          </section>
          <section className="tip">
            <span className="eyebrow">LESS MATHS. MORE LIVING.</span>
            <h3>
              Big shop?
              <br />
              Split it your way.
            </h3>
            <p>Choose your people, add the actual payers, and we’ll handle the pennies.</p>
            <button type="button" className="link" onClick={() => dispatch(dialogOpened("expense-new"))}>
              Record an expense <Icon name="arrow" size={17} />
            </button>
            <Icon name="leaf" size={60} />
          </section>
        </div>
      </div>
    </>
  );
}
