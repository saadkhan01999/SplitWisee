import { useDispatch, useSelector } from "react-redux";
import { goToTab } from "../../app/navigationSlice.js";
import { dialogOpened, dialogClosed } from "../../app/uiSlice.js";
import { Button } from "../../components/Button.jsx";
import { formatDateTime } from "../../utils/format.js";
import { selectHousehold, selectIsHouseholdAdmin, selectMemberName } from "../household/householdSlice.js";
import { useMonthReminders } from "./useMonthReminders.js";

/** Month-end reminders followed by the household audit trail (newest first). */
export function ActivityPanel() {
  const dispatch = useDispatch();
  const household = useSelector(selectHousehold);
  const memberName = useSelector(selectMemberName);
  const admin = useSelector(selectIsHouseholdAdmin);
  const reminders = useMonthReminders();
  const audit = [...household.audit].sort((a, b) => b.at.localeCompare(a.at));
  const pending = household.expenses.filter((expense) => expense.status !== "approved");

  function review(reminder) {
    dispatch(goToTab("settle"));
    dispatch(admin ? dialogOpened("closing", { start: reminder.start, end: reminder.end }) : dialogClosed());
  }

  return (
    <div className="audit-list">
      {reminders.map((reminder) => (
        <div key={reminder.id} className="reminder">
          <strong>{reminder.title}</strong>
          <p>{reminder.message}</p>
          <Button variant="outline" size="small" onClick={() => review(reminder)}>
            Review {reminder.month}
          </Button>
        </div>
      ))}
      {pending.length > 0 && (
        <div className="reminder">
          <strong>
            {pending.length} {pending.length === 1 ? "expense needs" : "expenses need"} attention
          </strong>
          <p>Drafts, approvals or reported issues are waiting.</p>
          <Button
            variant="outline"
            size="small"
            onClick={() => {
              dispatch(goToTab("expenses"));
              dispatch(dialogClosed());
            }}
          >
            View expenses
          </Button>
        </div>
      )}
      {audit.map((entry) => (
        <div key={entry.id}>
          <span className="timeline-dot" />
          <strong>
            {memberName(entry.actorId)} · {entry.action}
          </strong>
          {entry.detail && <p>{entry.detail}</p>}
          <small>{formatDateTime(entry.at)}</small>
        </div>
      ))}
      {!audit.length && <p>No activity yet.</p>}
    </div>
  );
}
