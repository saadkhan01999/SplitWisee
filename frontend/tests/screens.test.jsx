import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { dialogOpened } from "../src/app/uiSlice.js";
import { Toast } from "../src/components/Toast.jsx";
import { AppShell } from "../src/features/layout/AppShell.jsx";
import { LandingPage } from "../src/features/website/LandingPage.jsx";
import { household, members, user } from "./helpers/fixtures.js";
import { mockApi } from "./helpers/mockApi.js";
import { renderWithStore, signedInState } from "./helpers/render.jsx";

const REWARDS = { code: "SW-TEST", url: "", freeMonths: 0, rewards: [], subscription: "Not subscribed" };

function renderApp({ tab = "home", data = household(), signedInAs = user, routes = {} } = {}) {
  const api = mockApi({ "GET /account/rewards": () => REWARDS, ...routes });
  const rendered = renderWithStore(
    <>
      <AppShell />
      <Toast />
    </>,
    { preloadedState: signedInState({ tab, household: data, user: signedInAs }) },
  );
  return { api, ...rendered };
}

describe("calculator", () => {
  it("calculates with buttons and the keyboard, splits the result and turns it into an expense", async () => {
    const { store, user: person } = renderApp();
    await person.click(screen.getByRole("button", { name: "Open calculator" }));
    const dialog = await screen.findByRole("dialog", { name: "Calculator" });
    const key = (name) => person.click(within(dialog).getByRole("button", { name }));

    await key("1");
    await key("2");
    await key("Add");
    await key("3");
    await key("Multiply");
    await key("4");
    expect(within(dialog).getByText("= 24")).toBeInTheDocument();
    await key("Equals");
    expect(dialog.querySelector(".calc-value")).toHaveTextContent("24");

    fireEvent.keyDown(window, { key: "c" });
    for (const keyName of ["1", "0", "/", "3", "Enter"]) fireEvent.keyDown(window, { key: keyName });
    expect(dialog.querySelector(".calc-value")).toHaveTextContent("3.33333333333");
    fireEvent.keyDown(window, { key: "Delete" });
    for (const keyName of ["1", "0", "Enter"]) fireEvent.keyDown(window, { key: keyName });

    await person.click(within(dialog).getByRole("button", { name: "More people" }));
    expect(within(dialog).getByText("3 people")).toBeInTheDocument();
    expect(within(dialog).getByText("£3.33")).toBeInTheDocument();
    expect(within(dialog).getByText(/1 person pays £3.34/)).toBeInTheDocument();

    await person.click(within(dialog).getByRole("button", { name: /Add £10.00 as an expense/ }));
    expect(store.getState().ui.dialog).toEqual({ name: "expense-new", params: { amount: "10.00" } });
    expect(await screen.findByLabelText("Total amount (£)")).toHaveValue("10.00");
  });

  it("keeps a history of results", async () => {
    const { user: person } = renderApp();
    await person.click(screen.getByRole("button", { name: "Open calculator" }));
    const dialog = await screen.findByRole("dialog", { name: "Calculator" });
    for (const keyName of ["7", "*", "6", "Enter"]) fireEvent.keyDown(window, { key: keyName });
    await person.click(within(dialog).getByText(/History \(1\)/));
    expect(within(dialog).getByRole("button", { name: "7 × 6 = 42" })).toBeInTheDocument();
  });
});

describe("settlements", () => {
  const closing = {
    id: "c-1",
    start: "2026-09-01",
    end: "2026-09-30",
    payments: [
      {
        id: "p-1",
        from: "u-member",
        to: "u-owner",
        amountPence: 3000,
        status: "requested",
        reference: "SW-SEP-1",
      },
    ],
  };

  it("lets only the payer mark a transfer as sent", async () => {
    const data = household({ closings: [closing] });
    const asPayer = renderApp({
      tab: "settle",
      data,
      signedInAs: { ...user, id: "u-member", name: "Chloe Diaz" },
      routes: {
        "POST /households/h-test/actions": ({ body }) => ({
          ...data,
          version: 5,
          closings: [{ ...closing, payments: [{ ...closing.payments[0], status: body.payload.status }] }],
        }),
      },
    });
    await asPayer.user.click(screen.getByRole("button", { name: "I sent it" }));
    const dialog = await screen.findByRole("dialog", { name: "Confirm your transfer" });
    expect(dialog).toHaveTextContent("Reference: SW-SEP-1");
    await asPayer.user.click(within(dialog).getByRole("button", { name: "Mark transfer sent" }));
    await waitFor(() => expect(asPayer.api.called("POST", "/households/h-test/actions")).toHaveLength(1));
    expect(asPayer.api.called("POST", "/households/h-test/actions")[0].body.payload).toEqual({
      closingId: "c-1",
      id: "p-1",
      status: "sent",
    });
    expect(await screen.findByText("Sent · awaiting recipient")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm received" })).not.toBeInTheDocument();
  });

  it("shows the recipient a confirm button once the transfer is sent", () => {
    const sent = { ...closing, payments: [{ ...closing.payments[0], status: "sent" }] };
    renderApp({ tab: "settle", data: household({ closings: [sent] }) });
    expect(screen.getByRole("button", { name: "Confirm received" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "I sent it" })).not.toBeInTheDocument();
  });

  it("previews a closing with exact transfers before locking it", async () => {
    const { user: person } = renderApp({ tab: "settle" });
    await person.click(screen.getByRole("button", { name: "Close a period" }));
    const dialog = await screen.findByRole("dialog", { name: "Close a period" });
    fireEvent.change(within(dialog).getByLabelText("From"), { target: { value: "2026-09-01" } });
    fireEvent.change(within(dialog).getByLabelText("To"), { target: { value: "2026-09-30" } });
    // £90 paid by Amira and £24 by Ben, each shared by three: Amira +£52, Ben −£14, Chloe −£38.
    expect(within(dialog).getByText("2 proposed transfers")).toBeInTheDocument();
    expect(within(dialog).getByText("Chloe Diaz → Amira Shah").closest(".row")).toHaveTextContent("£38.00");
    expect(within(dialog).getByText("Ben Carter → Amira Shah").closest(".row")).toHaveTextContent("£14.00");
    expect(within(dialog).getByRole("button", { name: "Lock & create payment requests" })).toBeEnabled();
  });
});

describe("household roles", () => {
  it("gives owners room and member management", () => {
    renderApp({ tab: "people" });
    expect(screen.getByRole("button", { name: "Add room" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Change role" })).toHaveLength(2);
  });

  it("lets ordinary members invite but not manage", () => {
    renderApp({ tab: "people", signedInAs: { ...user, id: "u-member", name: "Chloe Diaz" } });
    expect(screen.getAllByRole("button", { name: "Invite member" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Add room" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change role" })).not.toBeInTheDocument();
  });

  it("does not offer admins changes to other admins", () => {
    const data = household({
      members: [
        ...members,
        { id: "u-admin-2", name: "Dev Patel", role: "admin", room: "Room 1", joined: "2026-01-01" },
      ],
    });
    renderApp({ tab: "people", data, signedInAs: { ...user, id: "u-admin", name: "Ben Carter" } });
    // Only Chloe (an ordinary member) can be changed by an admin.
    expect(screen.getAllByRole("button", { name: "Change role" })).toHaveLength(1);
  });

  it("creates a recipient-bound invitation link", async () => {
    const {
      api,
      store,
      user: person,
    } = renderApp({
      tab: "people",
      routes: { "POST /households/h-test/invites": () => ({ token: "tok-abc" }) },
    });
    store.dispatch(dialogOpened("invite", { room: "Room 2" }));
    const dialog = await screen.findByRole("dialog", { name: "Invite a housemate" });
    await person.type(within(dialog).getByLabelText("Their name"), "Dev Patel");
    await person.type(within(dialog).getByLabelText(/Email, or mobile number/), "dev@example.test");
    await person.click(within(dialog).getByRole("button", { name: "Create invitation link" }));
    expect(await within(dialog).findByLabelText("Invitation link")).toHaveValue(
      "http://localhost:3000/?invite=tok-abc",
    );
    expect(api.called("POST", "/households/h-test/invites")[0].body).toEqual({
      name: "Dev Patel",
      email: "dev@example.test",
      room: "Room 2",
    });
  });
});

describe("website", () => {
  it("shows operator-managed copy and an accessible announcement carousel", async () => {
    mockApi({
      "GET /public/settings": () => ({
        headline: "Live together, owe nothing.",
        announcements: ["First news", "Second news"],
        announcementAutoplay: false,
      }),
    });
    const { user: person } = renderWithStore(<LandingPage />);
    expect(await screen.findByRole("heading", { name: /Live together, owe nothing/ })).toBeInTheDocument();
    expect(screen.getByText("First news")).toBeInTheDocument();
    await person.click(screen.getByRole("button", { name: "Next announcement" }));
    expect(screen.getByText("Second news")).toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
  });

  it("previews a fair split in whole pence", async () => {
    mockApi({ "GET /public/settings": () => ({}) });
    const { user: person } = renderWithStore(<LandingPage />);
    const total = screen.getByLabelText("Total (£)");
    await person.clear(total);
    await person.type(total, "10");
    fireEvent.change(screen.getByLabelText("4 people"), { target: { value: "3" } });
    expect(screen.getByText("£3.33")).toBeInTheDocument();
    expect(screen.getByText(/1 person pays one extra penny/)).toBeInTheDocument();
  });
});
