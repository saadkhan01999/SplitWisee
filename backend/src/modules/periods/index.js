// Settlement periods and retention dates, shared by the API and the web app. Dates are ISO calendar dates
// (YYYY-MM-DD) handled in UTC, so month lengths, February and leap years never depend on the device time zone.

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MAX_PERIOD_DAYS = 366;

const toDate = (iso) => new Date(`${iso}T00:00:00Z`);
const toIso = (date) => date.toISOString().slice(0, 10);

export const isIsoDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(toDate(value).getTime()) &&
  toIso(toDate(value)) === value;

export function addDays(iso, days) {
  const date = toDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

export const monthEnd = (iso) => {
  const date = toDate(iso);
  return toIso(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
};

/** The same day `months` later, clamped to that month's length (31 January + 1 month = 28 or 29 February). */
export function addMonths(iso, months = 1) {
  const date = toDate(iso);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), last));
  return toIso(target);
}

export const daysBetween = (start, end) => Math.round((toDate(end) - toDate(start)) / 864e5);

/** The period after one that ends on `end`: the next calendar month after a month end, otherwise one month long. */
export function nextPeriodRange(end) {
  const start = addDays(end, 1);
  return { start, end: start.endsWith("-01") ? monthEnd(start) : addDays(addMonths(start, 1), -1) };
}

/** The calendar month containing `today`. */
export const monthRange = (today) => ({ start: `${today.slice(0, 7)}-01`, end: monthEnd(today) });

/** "November 2026" for a whole calendar month, otherwise "16 Oct – 15 Nov 2026". */
export function periodName(start, end) {
  const year = (iso) => iso.slice(0, 4);
  const month = (iso) => MONTHS[Number(iso.slice(5, 7)) - 1];
  if (start.endsWith("-01") && end === monthEnd(start)) return `${month(start)} ${year(start)}`;
  const day = (iso) => `${Number(iso.slice(8, 10))} ${month(iso).slice(0, 3)}`;
  return year(start) === year(end)
    ? `${day(start)} – ${day(end)} ${year(end)}`
    : `${day(start)} ${year(start)} – ${day(end)} ${year(end)}`;
}

export const overlaps = (a, b) => a.start <= b.end && a.end >= b.start;

/** The household's open (draft) period, if any. A household has at most one. */
export const currentPeriod = (household) =>
  (household.periods || []).find((period) => period.status === "draft") ?? null;

/** Checks a period's dates and name against the locked closings. Throws a user-facing message. */
export function cleanPeriod({ name, start, end }, closings = []) {
  if (!isIsoDate(start) || !isIsoDate(end) || start > end) throw Error("Choose a valid start and end date.");
  if (daysBetween(start, end) >= MAX_PERIOD_DAYS) throw Error("A period can be at most one year long.");
  if (closings.some((closing) => overlaps(closing, { start, end })))
    throw Error("These dates overlap a locked period. Choose dates after the last closing.");
  const label = typeof name === "string" && name.trim() ? name.trim() : periodName(start, end);
  if (label.length > 60) throw Error("Use a period name of at most 60 characters.");
  return { name: label, start, end };
}

/** Original receipt files are kept for one extra month after their period is locked. */
export const RETENTION_MONTHS = 1;
export const retentionDate = (lockedAt) => addMonths(String(lockedAt).slice(0, 10), RETENTION_MONTHS);

/** Today's calendar date in the UK, where households and the retention clock are based. */
export const londonToday = (at = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(at);
