// In-app month-end reminders, computed from recorded expenses in the member's own timezone. They appear in the
// last three days of a month (and stay for earlier months) while expenses remain outside a locked closing.

const DAY_MS = 86_400_000;

const lastDayOf = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const shiftDate = (iso, days) =>
  new Date(Date.parse(`${iso}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

function calendarDate(now, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type) => Number(parts.find((part) => part.type === type).value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

export function monthReminders(household, now = new Date(), timeZone = "Europe/London") {
  const { year, month, day } = calendarDate(now, timeZone);
  const currentMonth = `${year}-${String(month).padStart(2, "0")}`;
  const monthEndNear = day >= lastDayOf(year, month) - 2;
  const isClosed = (date) =>
    household.closings.some((closing) => date >= closing.start && date <= closing.end);

  const months = [...new Set(household.expenses.map((expense) => expense.date.slice(0, 7)))]
    .filter((value) => value < currentMonth || (value === currentMonth && monthEndNear))
    .sort()
    .reverse();

  return months.flatMap((value) => {
    const [y, m] = value.split("-").map(Number);
    const start = `${value}-01`;
    const end = `${value}-${String(lastDayOf(y, m)).padStart(2, "0")}`;
    const open = household.expenses.filter(
      (expense) => expense.date >= start && expense.date <= end && !isClosed(expense.date),
    );
    if (!open.length) return [];

    // A partly closed month starts again the day after the last closing that ends before the first open expense.
    const firstOpen = open.map((expense) => expense.date).sort()[0];
    const closedBefore = household.closings
      .filter((closing) => closing.end < firstOpen && closing.end >= start)
      .map((closing) => closing.end)
      .sort()
      .at(-1);
    const closedAfter = household.closings
      .filter((closing) => closing.start > firstOpen && closing.start <= end)
      .map((closing) => closing.start)
      .sort()[0];

    return [
      {
        id: `month-close-${household.id}-${value}`,
        month: value,
        start: closedBefore ? shiftDate(closedBefore, 1) : start,
        end: closedAfter ? shiftDate(closedAfter, -1) : end,
        title: value === currentMonth ? "Month-end is approaching" : "Month ready to review",
        message: `${value}: ${open.length} unclosed expense ${open.length === 1 ? "record" : "records"}. Review receipts and resolve issues before closing.`,
        due: value < currentMonth || day === lastDayOf(year, month),
      },
    ];
  });
}

/** Remaining free-access time as whole days, hours and minutes. */
export function accessCountdown(until, now = Date.now()) {
  const ms = Math.max(0, new Date(until).getTime() - now);
  return {
    active: ms > 0,
    days: Math.floor(ms / DAY_MS),
    hours: Math.floor((ms % DAY_MS) / 3_600_000),
    minutes: Math.floor((ms % 3_600_000) / 60_000),
  };
}
