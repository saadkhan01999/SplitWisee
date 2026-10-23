import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TIMEZONES } from "../../backend/src/models/profile.js";
import { parseHash, routeHash } from "../src/app/navigationSlice.js";
import { takeLaunchParams } from "../src/app/launchParams.js";
import { journal, monthlyBook } from "../src/features/bookkeeping/bookkeeping.js";
import { accessCountdown, monthReminders } from "../src/features/notifications/reminders.js";
import { receiptPeople } from "../src/features/receipts/receiptRecord.js";
import { PROFILE_TIME_ZONES } from "../src/features/settings/ProfileSettings.jsx";
import { csvCell, csvText } from "../src/utils/csv.js";
import { equalSplit, parsePounds } from "../src/utils/split.js";
import { household } from "./helpers/fixtures.js";

describe("routes", () => {
  it("maps hashes to pages and back", () => {
    expect(parseHash("")).toEqual({ page: "website", tab: null });
    expect(parseHash("#signup")).toEqual({ page: "signup", tab: null });
    expect(parseHash("#app")).toEqual({ page: "app", tab: "home" });
    expect(parseHash("#app/settle")).toEqual({ page: "app", tab: "settle" });
    expect(parseHash("#app/unknown")).toEqual({ page: "app", tab: "home" });
    expect(routeHash({ page: "app", tab: "expenses" })).toBe("#app/expenses");
    expect(routeHash({ page: "app", tab: "home" })).toBe("#app");
    expect(routeHash({ page: "website" })).toBe("");
  });

  it("reads invitation, referral and return parameters once and removes them from the address bar", () => {
    window.history.replaceState(null, "", "/?invite=tok123&ref=SW-ABC&checkout=complete#app");
    expect(takeLaunchParams()).toMatchObject({
      invite: "tok123",
      referral: "SW-ABC",
      checkout: "complete",
      authError: false,
    });
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("#app");
  });
});

describe("month-end reminders", () => {
  const data = household();

  it("appear in the last three days of a month with unclosed expenses", () => {
    expect(monthReminders(data, new Date("2026-09-27T12:00:00Z"))).toEqual([]);
    const [reminder] = monthReminders(data, new Date("2026-09-28T12:00:00Z"));
    expect(reminder).toMatchObject({ month: "2026-09", start: "2026-09-01", end: "2026-09-30", due: false });
    expect(monthReminders(data, new Date("2026-10-02T12:00:00Z"))[0]).toMatchObject({
      month: "2026-09",
      due: true,
    });
  });

  it("start a partly closed month the day after the last closing", () => {
    const closed = {
      ...data,
      closings: [{ id: "c-1", start: "2026-09-01", end: "2026-09-07", payments: [] }],
    };
    expect(monthReminders(closed, new Date("2026-10-02T12:00:00Z"))[0]).toMatchObject({
      start: "2026-09-08",
      end: "2026-09-30",
    });
  });

  it("use the member's own time zone", () => {
    // 30 Sep 23:30 in London is already 1 Oct in Karachi.
    const now = new Date("2026-09-30T22:30:00Z");
    expect(monthReminders(data, now, "Europe/London")[0].title).toBe("Month-end is approaching");
    expect(monthReminders(data, now, "Asia/Karachi")[0].title).toBe("Month ready to review");
  });

  it("count down free access", () => {
    expect(accessCountdown("2026-10-03T12:30:00Z", Date.parse("2026-10-01T10:00:00Z"))).toEqual({
      active: true,
      days: 2,
      hours: 2,
      minutes: 30,
    });
    expect(accessCountdown("2026-10-01T00:00:00Z", Date.parse("2026-10-02T00:00:00Z")).active).toBe(false);
  });
});

describe("records and exports", () => {
  it("shows what each person paid, owes and should receive for one expense", () => {
    const expense = household().expenses[0];
    const people = receiptPeople(expense, (id) => id);
    expect(people.find((person) => person.id === "u-owner")).toMatchObject({
      paid: 9000,
      share: 3000,
      net: 6000,
    });
    expect(people.reduce((sum, person) => sum + person.net, 0)).toBe(0);
  });

  it("neutralises spreadsheet formulas in CSV cells", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(csvCell("-1+2|cmd")).toBe(`"'-1+2|cmd"`);
    expect(csvCell("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
    // Refunds and negative balances stay numeric.
    expect(csvCell("-36.79")).toBe(`"-36.79"`);
    expect(csvCell(-120)).toBe(`"-120"`);
    expect(csvCell('Say "hi"')).toBe(`"Say ""hi"""`);
    expect(
      csvText([
        ["a", 1],
        ["b", null],
      ]),
    ).toBe('"a","1"\r\n"b",""');
  });

  it("builds the monthly bookkeeping journal from approved expenses and manual entries", () => {
    const data = household({
      books: [
        { id: "b-1", date: "2026-09-20", type: "income", description: "Deposit returned", amountPence: 5000 },
      ],
    });
    expect(journal(data)).toHaveLength(3);
    expect(monthlyBook(data, "2026-09")).toMatchObject({
      opening: 0,
      income: 5000,
      expenses: 11400,
      closing: -6400,
    });
    expect(monthlyBook(data, "2026-10")).toMatchObject({ opening: -6400, closing: -6400 });
  });

  it("splits a total equally in whole pence", () => {
    expect(parsePounds("90")).toBe(9000);
    expect(parsePounds("1.234")).toBeNull();
    expect(equalSplit(1000, 3)).toEqual({ share: 333, extraPennies: 1 });
  });
});

describe("frontend and API stay in step", () => {
  it("offers exactly the time zones the API accepts", () => {
    expect(PROFILE_TIME_ZONES).toEqual(TIMEZONES);
  });

  it("imports only pure business modules from the backend (no server code in the browser bundle)", () => {
    const modules = path.resolve(import.meta.dirname, "../../backend/src/modules");
    const files = fs.readdirSync(modules, { recursive: true }).filter((file) => file.endsWith(".js"));
    for (const file of files) {
      const source = fs.readFileSync(path.join(modules, file), "utf8");
      const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
      expect(
        imports.every((specifier) => specifier.startsWith(".")),
        file,
      ).toBe(true);
      expect(source).not.toMatch(/process\.env|require\(/);
    }
  });
});
