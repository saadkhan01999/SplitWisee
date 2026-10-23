import { useDispatch, useSelector } from "react-redux";
import { goToTab, selectRoute } from "../../app/navigationSlice.js";
import { dialogOpened } from "../../app/uiSlice.js";
import { Button } from "../../components/Button.jsx";
import { Logo } from "../../components/Logo.jsx";
import { BankPage } from "../bank/BankPage.jsx";
import { BookkeepingPage } from "../bookkeeping/BookkeepingPage.jsx";
import { OverviewPage } from "../dashboard/OverviewPage.jsx";
import { ExpensesPage } from "../expenses/ExpensesPage.jsx";
import { HouseholdPage } from "../household/HouseholdPage.jsx";
import { selectCurrentMember, selectHousehold, selectIsHouseholdAdmin } from "../household/householdSlice.js";
import { useMonthReminders } from "../notifications/useMonthReminders.js";
import { ReportsPage } from "../reports/ReportsPage.jsx";
import { RewardsPage } from "../rewards/RewardsPage.jsx";
import { SettingsPage } from "../settings/SettingsPage.jsx";
import { SettlementsPage } from "../settlements/SettlementsPage.jsx";
import { BottomNav } from "./BottomNav.jsx";
import { DialogHost } from "./DialogHost.jsx";
import { Sidebar } from "./Sidebar.jsx";
import { tabById } from "./tabs.js";
import { TopBar } from "./TopBar.jsx";

const PAGES = {
  home: OverviewPage,
  expenses: ExpensesPage,
  settle: SettlementsPage,
  reports: ReportsPage,
  books: BookkeepingPage,
  rewards: RewardsPage,
  bank: BankPage,
  people: HouseholdPage,
  settings: SettingsPage,
};

function PageHeading({ tab }) {
  const dispatch = useDispatch();
  const household = useSelector(selectHousehold);
  const member = useSelector(selectCurrentMember);
  const { eyebrow, title, intro } = tabById(tab);
  const firstName = member?.name.split(" ")[0];

  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow ?? household.name.toUpperCase()}</span>
        <h1>{title ?? `Hello, ${firstName} 👋`}</h1>
        <p>{intro}</p>
      </div>
      <div className="heading-actions" data-no-capture>
        <Button variant="outline" icon="people" onClick={() => dispatch(dialogOpened("invite"))}>
          Invite member
        </Button>
        <Button icon="plus" onClick={() => dispatch(dialogOpened("expense-new"))}>
          Add expense
        </Button>
      </div>
    </div>
  );
}

function MonthReminderBanner() {
  const dispatch = useDispatch();
  const reminders = useMonthReminders();
  const admin = useSelector(selectIsHouseholdAdmin);
  if (!reminders.length) return null;
  const [first] = reminders;

  return (
    <section className="month-reminder" role="status">
      <div>
        <span className="eyebrow">MONTH-END REMINDER</span>
        <strong>{first.title}</strong>
        <p>
          {first.message}
          {reminders.length > 1 &&
            ` Plus ${reminders.length - 1} earlier ${reminders.length === 2 ? "period" : "periods"} to review.`}
        </p>
      </div>
      <Button
        variant="outline"
        onClick={() => {
          dispatch(goToTab("settle"));
          if (admin) dispatch(dialogOpened("closing", { start: first.start, end: first.end }));
        }}
      >
        {admin ? "Review closing" : "View settlements"}
      </Button>
    </section>
  );
}

export function AppShell() {
  const { tab } = useSelector(selectRoute);
  const Page = PAGES[tab] ?? OverviewPage;

  return (
    <>
      <Sidebar />
      <div className="shell">
        <TopBar />
        <main id="capture">
          <PageHeading tab={tab} />
          <MonthReminderBanner />
          <Page />
          <footer className="page-footer">
            <Logo />
            <span>Good homes start with clear conversations.</span>
          </footer>
        </main>
      </div>
      <BottomNav />
      <DialogHost />
    </>
  );
}
