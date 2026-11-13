import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { describe, expect, it } from "vitest";
import { AdminApp } from "../admin/src/AdminApp.jsx";
import { createAdminStore } from "../admin/src/store.js";
import { Toast } from "../src/components/Toast.jsx";
import { Logo } from "../src/components/Logo.jsx";
import { AppShell } from "../src/features/layout/AppShell.jsx";
import { checkSession } from "../src/features/session/sessionSlice.js";
import { closingSheetCsv, closingSheetJson } from "../src/features/settlements/closingSheet.js";
import { LandingPage } from "../src/features/website/LandingPage.jsx";
import { household, user } from "./helpers/fixtures.js";
import { mockApi } from "./helpers/mockApi.js";
import { renderWithStore, signedInState } from "./helpers/render.jsx";

// CoinSplit Update Round 02: settlement periods and history, mobile navigation, exports, campaigns and statistics.

const REWARDS = { code: "CS-TEST", url: "", freeMonths: 0, rewards: [], subscription: "Not subscribed" };
const member = { ...user, id: "u-member", name: "Chloe Diaz" };

const october = {
  id: "c-oct",
  name: "October 2026",
  start: "2026-10-01",
  end: "2026-10-31",
  createdAt: "2026-11-01T10:00:00.000Z",
  createdBy: "u-owner",
  engine: "1.2.0",
  expenseIds: ["e-1", "e-2"],
  lines: [
    { id: "u-owner", name: "Amira Shah", funded: 9000, share: 3800, net: 5200 },
    { id: "u-admin", name: "Ben Carter", funded: 2400, share: 3800, net: -1400 },
    { id: "u-member", name: "Chloe Diaz", funded: 0, share: 3800, net: -3800 },
  ],
  payments: [
    { id: "p-1", from: "u-member", to: "u-owner", amountPence: 3800, status: "received", reference: "TH-1" },
    { id: "p-2", from: "u-admin", to: "u-owner", amountPence: 1400, status: "requested", reference: "TH-2" },
  ],
  summary: {
    totalPence: 11400,
    expenseCount: 2,
    expenses: [
      {
        id: "e-1",
        title: "Weekly shop",
        date: "2026-10-05",
        category: "Groceries",
        amountPence: 9000,
        purchasedBy: "u-owner",
        receipt: { id: "r-1", name: "shop.png" },
      },
      {
        id: "e-2",
        title: "Cleaning supplies",
        date: "2026-10-12",
        category: "Household",
        amountPence: 2400,
        purchasedBy: "u-admin",
      },
    ],
  },
  retentionUntil: "2026-12-01",
};

function withHistory() {
  const data = household({ closings: [october] });
  // Renamed after closing: the frozen sheet must still show the original title and amount.
  data.expenses[0] = { ...data.expenses[0], title: "Renamed later", amountPence: 1 };
  return data;
}

function renderApp({ tab = "home", data = household(), signedInAs = user, routes = {} } = {}) {
  const api = mockApi({
    "GET /account/rewards": () => REWARDS,
    "GET /public/promotion": () => ({ active: false }),
    "GET /public/charity": () => ({ published: false }),
    "GET /households/h-test/receipts": () => ({ receipts: [] }),
    ...routes,
  });
  const rendered = renderWithStore(
    <>
      <AppShell />
      <Toast />
    </>,
    { preloadedState: signedInState({ tab, household: data, user: signedInAs }) },
  );
  return { api, ...rendered };
}

const headingActions = () => document.querySelector(".heading-actions");
// jsdom's Blob has no text(); FileReader reads it.
const readBlob = (blob) =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsText(blob);
  });

describe("brand", () => {
  it("renders the CoinSplit vector logo with an accessible name", () => {
    render(<Logo />);
    expect(screen.getByText("CoinSplit")).toBeInTheDocument();
    expect(document.querySelectorAll(".brand svg path")).toHaveLength(2);
    expect(screen.getByText("SHARE EXPENSES. SETTLE EASILY.")).toBeInTheDocument();
  });
});

describe("settlement page actions", () => {
  it("replaces Add expense / Invite member with one Start new settlement action for owners", () => {
    renderApp({ tab: "settle" });
    const actions = within(headingActions());
    expect(actions.getByRole("button", { name: "Start new settlement" })).toBeInTheDocument();
    expect(actions.queryByRole("button", { name: "Add expense" })).not.toBeInTheDocument();
    expect(actions.queryByRole("button", { name: "Invite member" })).not.toBeInTheDocument();
  });

  it("shows members no settlement action, and other tabs keep their actions", () => {
    renderApp({ tab: "settle", signedInAs: member });
    expect(headingActions()).toBeEmptyDOMElement();
  });

  it("keeps Add expense and Invite member on the Expenses tab", () => {
    renderApp({ tab: "expenses" });
    const actions = within(headingActions());
    expect(actions.getByRole("button", { name: "Add expense" })).toBeInTheDocument();
    expect(actions.getByRole("button", { name: "Invite member" })).toBeInTheDocument();
  });
});

describe("next settlement period", () => {
  it("reviews and closes the open period, then confirms the next one", async () => {
    let data = household({
      periods: [
        { id: "p-nov", name: "November 2026", start: "2026-11-01", end: "2026-11-30", status: "draft" },
      ],
    });
    data.expenses = data.expenses.map((expense) => ({
      ...expense,
      date: expense.date.replace("-09-", "-11-"),
    }));
    const { api, user: person } = renderApp({
      tab: "settle",
      data,
      routes: {
        "POST /households/h-test/actions": ({ body }) => {
          if (body.type === "close")
            data = {
              ...data,
              version: data.version + 1,
              closings: [
                { ...october, id: "c-nov", name: "November 2026", start: "2026-11-01", end: "2026-11-30" },
              ],
              periods: [
                {
                  id: "p-dec",
                  name: "December 2026",
                  start: "2026-12-01",
                  end: "2026-12-31",
                  status: "draft",
                },
                { ...data.periods[0], status: "closed", closingId: "c-nov" },
              ],
            };
          if (body.type === "periodUpdate")
            data = {
              ...data,
              version: data.version + 1,
              periods: data.periods.map((p) => (p.id === body.payload.id ? { ...p, ...body.payload } : p)),
            };
          return data;
        },
      },
    });

    expect(screen.getByText("CURRENT PERIOD")).toBeInTheDocument();
    await person.click(within(headingActions()).getByRole("button", { name: "Start new settlement" }));
    const dialog = await screen.findByRole("dialog", { name: "Start new settlement" });
    expect(within(dialog).getByText("November 2026")).toBeInTheDocument();
    await person.click(within(dialog).getByRole("button", { name: "Review & close November 2026" }));
    expect(within(dialog).getByLabelText("From")).toHaveValue("2026-11-01");
    expect(within(dialog).getByLabelText("To")).toHaveValue("2026-11-30");
    await person.click(within(dialog).getByRole("button", { name: "Lock & create payment requests" }));

    expect(await within(dialog).findByRole("heading", { name: "Next period" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Start date")).toHaveValue("2026-12-01");
    expect(within(dialog).getByLabelText("End date")).toHaveValue("2026-12-31");
    await person.clear(within(dialog).getByLabelText(/Period name/));
    await person.type(within(dialog).getByLabelText(/Period name/), "Christmas month");
    await person.click(within(dialog).getByRole("button", { name: "Confirm next period" }));
    await waitFor(() =>
      expect(api.called("POST", "/households/h-test/actions").map((call) => call.body.type)).toEqual([
        "close",
        "periodUpdate",
      ]),
    );
    expect(api.called("POST", "/households/h-test/actions")[1].body.payload).toEqual({
      id: "p-dec",
      name: "Christmas month",
      start: "2026-12-01",
      end: "2026-12-31",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("blocks next-period dates that overlap a locked closing", async () => {
    const data = household({
      closings: [october],
      periods: [
        { id: "p-nov", name: "November 2026", start: "2026-11-01", end: "2026-11-30", status: "draft" },
      ],
    });
    const { user: person } = renderApp({ tab: "settle", data });
    await person.click(within(headingActions()).getByRole("button", { name: "Start new settlement" }));
    const dialog = await screen.findByRole("dialog", { name: "Start new settlement" });
    await person.click(within(dialog).getByRole("button", { name: "Change name or dates" }));
    await person.clear(within(dialog).getByLabelText("Start date"));
    await person.type(within(dialog).getByLabelText("Start date"), "2026-10-20");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("overlap a locked period");
    expect(within(dialog).getByRole("button", { name: "Save period" })).toBeDisabled();
  });
});

describe("settlement history and closing sheets", () => {
  it("shows the frozen closing sheet with receipt retention status", async () => {
    const { user: person } = renderApp({
      tab: "settle",
      data: withHistory(),
      routes: {
        "GET /households/h-test/receipts": () => ({
          receipts: [{ id: "r-1", purgedAt: "2026-12-02T03:00:00.000Z", retentionUntil: "2026-12-01" }],
        }),
      },
    });
    expect(screen.getByText("1 pending transfer")).toBeInTheDocument();
    await person.click(screen.getByRole("button", { name: "View closing sheet" }));
    const dialog = await screen.findByRole("dialog", { name: "October 2026" });
    expect(dialog).toHaveTextContent("£114.00");
    expect(dialog).toHaveTextContent("Weekly shop");
    expect(dialog).not.toHaveTextContent("Renamed later");
    expect(dialog).toHaveTextContent("1 of 2");
    expect(await within(dialog).findByText("Original removed 02/12/2026")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Original receipt files are kept until 1 December 2026");
  });

  it("lists closed periods newest first in Reports with filters and exports", async () => {
    const september = {
      ...october,
      id: "c-sep",
      name: "September 2026",
      start: "2026-09-01",
      end: "2026-09-30",
      payments: october.payments.map((p) => ({ ...p, status: "received" })),
    };
    const { user: person } = renderApp({
      tab: "reports",
      data: household({ closings: [september, october] }),
    });
    const history = screen.getByRole("heading", { name: "Previous closing sheets" }).closest("section");
    const rows = within(history).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("October 2026");
    expect(rows[0]).toHaveTextContent("Locked · 1 pending");
    expect(rows[1]).toHaveTextContent("September 2026");
    expect(rows[1]).toHaveTextContent("Settled");
    expect(within(history).getByText("£228.00")).toBeInTheDocument();
    await person.selectOptions(within(history).getByLabelText("Filter by status"), "settled");
    expect(within(history).getAllByRole("row")).toHaveLength(2);
    expect(within(history).getByRole("button", { name: "Download PDF for September 2026" })).toBeEnabled();
  });

  it("exports machine-readable sheets with a stable schema and frozen names", async () => {
    const data = withHistory();
    const json = JSON.parse(await readBlob(closingSheetJson(data, october)));
    expect(json.schema).toBe("coinsplit-closing-sheet-v1");
    expect(json.closing.totalPence).toBe(11400);
    expect(json.closing.originalReceiptsKeptUntil).toBe("2026-12-01");
    expect(json.expenses.map((e) => e.title)).toEqual(["Weekly shop", "Cleaning supplies"]);
    expect(json.transfers[0]).toMatchObject({ from: "Chloe Diaz", to: "Amira Shah", amountPence: 3800 });
    const csv = await readBlob(closingSheetCsv(data, october));
    expect(csv).toContain('"CoinSplit","Closing sheet","coinsplit-closing-sheet-v1"');
    expect(csv).toContain('"Total recorded","","","","114.00"');
  });
});

describe("mobile navigation and household", () => {
  it("reaches Household and every other section from the phone navigation", async () => {
    const { store, user: person } = renderApp({ signedInAs: { ...user, operator: true } });
    const nav = within(screen.getByRole("navigation", { name: "Main" }));
    await person.click(nav.getByRole("button", { name: "Household" }));
    expect(store.getState().navigation.tab).toBe("people");
    await person.click(nav.getByRole("button", { name: "More sections" }));
    const dialog = await screen.findByRole("dialog", { name: "All sections" });
    expect(within(dialog).getByRole("link", { name: /Superadmin/ })).toHaveAttribute("href", "/admin/");
    await person.click(within(dialog).getByRole("button", { name: /Reports/ }));
    expect(store.getState().navigation.tab).toBe("reports");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("lets the owner add a new room with a trimmed name", async () => {
    const { api, user: person } = renderApp({
      tab: "people",
      routes: {
        "POST /households/h-test/actions": () => household({ rooms: ["Room 1", "Room 2", "Room 3"] }),
      },
    });
    await person.click(screen.getByRole("button", { name: "Add new room" }));
    await person.type(screen.getByLabelText("Room name"), "  Room 3  ");
    await person.click(screen.getByRole("button", { name: "Save change" }));
    await waitFor(() => expect(api.called("POST", "/households/h-test/actions")).toHaveLength(1));
    expect(api.called("POST", "/households/h-test/actions")[0].body).toMatchObject({
      type: "roomCreate",
      payload: { name: "Room 3" },
    });
    expect(await screen.findByRole("heading", { name: "Room 3" })).toBeInTheDocument();
  });
});

describe("campaigns", () => {
  const promotion = {
    active: true,
    redeemable: true,
    upcoming: false,
    title: "Christmas offer",
    banner: "Christmas offer: your first month of CoinSplit is free (100% off).",
    details: "One free month per account.",
    startsAt: "2026-12-01",
    endsAt: "2026-12-31",
    freeMonths: 1,
    pricePence: 0,
  };

  it("shows the offer ribbon and pricing note, and the charity section only once published", async () => {
    mockApi({
      "GET /public/settings": () => ({}),
      "GET /me": () => ({}),
      "GET /public/promotion": () => promotion,
      "GET /public/charity": () => ({ published: false }),
    });
    const first = renderWithStore(<LandingPage />);
    expect(await screen.findByText(promotion.banner)).toBeInTheDocument();
    expect(screen.getByText(/£0 for your first month/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "25% to charity." })).not.toBeInTheDocument();
    first.unmount();

    mockApi({
      "GET /public/settings": () => ({}),
      "GET /public/promotion": () => ({ active: false }),
      "GET /public/charity": () => ({
        published: true,
        percent: 25,
        basis: "net profit from CoinSplit subscriptions",
        period: "each calendar year",
        beneficiary: "Example Foundation",
        conditions: "Before tax.",
        reporting: "Reported yearly.",
        effectiveFrom: "2027-01-01",
        statement:
          "25% of our net profit from CoinSplit subscriptions goes to Example Foundation, each calendar year.",
      }),
    });
    renderWithStore(<LandingPage />);
    expect(await screen.findByRole("heading", { name: "25% to charity." })).toBeInTheDocument();
    expect(screen.getByText(/goes to Example Foundation/)).toBeInTheDocument();
    expect(screen.queryByText(promotion.banner)).not.toBeInTheDocument();
  });

  it("claims the offer in the app for £0", async () => {
    const { api, user: person } = renderApp({
      tab: "rewards",
      routes: {
        "GET /public/promotion": () => promotion,
        "POST /account/promotion": () => ({ claimed: true, pricePence: 0, freeMonths: 1 }),
      },
    });
    await person.click(await screen.findByRole("button", { name: "Claim my free month" }));
    await waitFor(() => expect(api.called("POST", "/account/promotion")).toHaveLength(1));
    expect(await screen.findByText(/claimed: your free month has started/)).toBeInTheDocument();
  });
});

describe("superadmin statistics", () => {
  it("shows aggregate statistics with date filters and refresh", async () => {
    const owner = { id: "u-owner", name: "Platform Owner", email: "owner@example.test", operator: true };
    const stats = (from, to) => ({
      range: { from, to, generatedAt: "2026-11-13T10:00:00.000Z" },
      users: { total: 40, verified: 38, new: 6, active: 25, suspended: 1, subscribed: 9 },
      households: { total: 12, active: 9, suspended: 0, memberships: 31 },
      settlements: { pendingTransfers: 4, pendingPence: 12345, closings: 3 },
      redemptions: { coupons: 2, referrals: 5, referralsByInvitation: 3, promotion: 7 },
      invitations: { created: 8, accepted: 6 },
      payments: { paidPence: 891, refundedPence: 0, count: 9 },
      trend: [
        {
          month: "2026-11",
          signups: 6,
          closings: 3,
          referrals: 5,
          couponRedemptions: 2,
          promotionRedemptions: 7,
          paymentsPence: 891,
        },
      ],
    });
    const api = mockApi({
      "GET /me": () => ({ user: owner, csrf: "c" }),
      "GET /operator/overview": () => ({
        metrics: {
          users: { total: 40, new: 6, active: 25, suspended: 1 },
          households: { total: 12, active: 12, suspended: 0 },
        },
        users: [],
        households: [],
        payments: [],
        referralEvents: [],
        coupons: [],
        campaigns: [],
        tickets: [],
        audit: [],
        settings: { headline: "Share a home." },
        providers: {},
      }),
      "GET /operator/stats": ({ url }) => stats(url.searchParams.get("from"), url.searchParams.get("to")),
    });
    const store = createAdminStore();
    store.dispatch(checkSession());
    render(
      <Provider store={store}>
        <AdminApp />
      </Provider>,
    );
    const person = userEvent.setup();
    const { loadOverview } = await import("../admin/src/operatorSlice.js");
    await screen.findByRole("heading", { name: "Unlock operator access" }).catch(() => null);
    await store.dispatch(loadOverview());
    await person.click(await screen.findByRole("button", { name: /Statistics/ }));
    expect(await screen.findByText("Pending payments")).toBeInTheDocument();
    expect(screen.getByText("£123.45 awaiting recipient confirmation")).toBeInTheDocument();
    expect(screen.getByText("3 through household invitations")).toBeInTheDocument();
    expect(screen.getByText("Christmas offer claims")).toBeInTheDocument();
    await person.click(screen.getByRole("button", { name: "90 days" }));
    await waitFor(() => expect(api.called("GET", "/operator/stats")).toHaveLength(2));
    await person.click(
      within(document.querySelector(".stats-filter")).getByRole("button", { name: "Refresh" }),
    );
    await waitFor(() => expect(api.called("GET", "/operator/stats")).toHaveLength(3));
  });
});

describe("website navigation and favicon", () => {
  it("scrolls smoothly to sections, offers a full footer and shows active-section links", async () => {
    mockApi({
      "GET /public/settings": () => ({}),
      "GET /public/promotion": () => ({ active: false }),
      "GET /public/charity": () => ({ published: false }),
    });
    const { user: person } = renderWithStore(<LandingPage />);
    const header = document.querySelector(".site-header");
    expect(header).toBeInTheDocument();
    const nav = within(header.querySelector(".desktop-menu"));
    await person.click(nav.getByRole("link", { name: "Pricing" }));
    expect(window.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
    expect(window.location.hash).toBe("#pricing");
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("navigation", { name: "Product" })).toHaveTextContent("How it works");
    expect(footer).toHaveTextContent(`© ${new Date().getFullYear()} CoinSplit`);
    expect(document.querySelector(".scroll-progress")).toBeInTheDocument();
  });

  it("links the new favicon set from the website and the control centre", async () => {
    const fs = await import("node:fs");
    for (const page of ["index.html", "admin/index.html"]) {
      const html = fs.readFileSync(page, "utf8"); // vitest runs from the frontend folder
      expect(html).toContain('href="/favicon.ico"');
      expect(html).toContain('href="/favicon.svg"');
    }
    const svg = fs.readFileSync("public/favicon.svg", "utf8");
    expect(svg).toContain("prefers-color-scheme:dark");
    expect(fs.statSync("public/favicon.ico").size).toBeGreaterThan(1000);
  });
});
