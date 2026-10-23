import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { describe, expect, it } from "vitest";
import { AdminApp } from "../admin/src/AdminApp.jsx";
import { loadOverview } from "../admin/src/operatorSlice.js";
import { createAdminStore } from "../admin/src/store.js";
import { checkSession } from "../src/features/session/sessionSlice.js";
import { mockApi, reply } from "./helpers/mockApi.js";

const owner = { id: "u-owner", name: "Platform Owner", email: "owner@example.test", operator: true };

const OVERVIEW = {
  metrics: {
    users: { total: 42, new: 5, active: 30, suspended: 1 },
    households: { total: 12, active: 11, suspended: 1 },
  },
  users: [{ id: "u-1", name: "Amira Shah", email: "amira@example.test", plan: "active" }],
  households: [{ id: "h-1", name: "Maple House", count: 3 }],
  payments: [{ id: "in_1", userId: "u-1", amountPence: 99, status: "paid", at: "2026-10-01T10:00:00.000Z" }],
  referralEvents: [],
  coupons: [],
  campaigns: [],
  tickets: [
    {
      id: "t-1",
      subject: "Change my email",
      email: "amira@example.test",
      message: "New address please",
      status: "open",
    },
  ],
  audit: [{ id: "a-1", action: "operator unlocked", actorId: "u-owner", at: "2026-10-21T10:00:00.000Z" }],
  settings: { headline: "Share a home." },
  providers: { email: true, google: false, phone: false, billing: false, bankEncryption: true },
};

function renderAdmin(routes) {
  const api = mockApi(routes);
  const store = createAdminStore();
  store.dispatch(checkSession());
  render(
    <Provider store={store}>
      <AdminApp />
    </Provider>,
  );
  return { api, store, user: userEvent.setup() };
}

describe("operator console", () => {
  it("refuses accounts that are not the platform owner", async () => {
    renderAdmin({ "GET /me": () => ({ user: { ...owner, operator: false }, csrf: "c" }) });
    expect(await screen.findByRole("heading", { name: "Operator access required" })).toBeInTheDocument();
  });

  it("unlocks with an authenticator code, shows platform metrics and validates coupons", async () => {
    let coupons = [];
    const { api, user } = renderAdmin({
      "GET /me": () => ({ user: owner, csrf: "c" }),
      "POST /operator/unlock": ({ body }) =>
        body.code === "123456" ? { ok: true } : reply(400, { error: "Invalid authenticator code." }),
      "GET /operator/overview": () => ({ ...OVERVIEW, coupons }),
      "POST /operator/coupons": ({ body }) => {
        coupons = [{ ...body, used: 0 }];
        return { ok: true };
      },
    });

    const code = await screen.findByLabelText("Authenticator code");
    await user.type(code, "654321");
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid authenticator code.");

    await user.clear(code);
    await user.type(code, "123456");
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /42\s*Total users/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /£0.99\s*Revenue received/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Create coupon$/ }));
    const editor = screen.getByRole("heading", { name: "Create a promotional coupon" }).closest("section");
    await user.type(within(editor).getByLabelText("Coupon code"), "x!");
    await user.type(within(editor).getByLabelText("Reason for the audit trail"), "Launch promotion");
    await user.click(within(editor).getByRole("button", { name: "Confirm & save" }));
    expect(within(editor).getByRole("alert")).toHaveTextContent("Use 4–30 letters");
    expect(api.called("POST", "/operator/coupons")).toHaveLength(0);

    await user.clear(within(editor).getByLabelText("Coupon code"));
    await user.type(within(editor).getByLabelText("Coupon code"), "launch-2026");
    await user.click(within(editor).getByRole("button", { name: "Confirm & save" }));
    await waitFor(() => expect(api.called("POST", "/operator/coupons")).toHaveLength(1));
    expect(api.called("POST", "/operator/coupons")[0].body).toMatchObject({
      code: "LAUNCH-2026",
      months: 1,
      limit: 100,
      reason: "Launch promotion",
    });
    expect(await screen.findByText("LAUNCH-2026")).toBeInTheDocument();
  });

  it("asks for a new code when the 15-minute unlock expires", async () => {
    let expired = false;
    const { store, user } = renderAdmin({
      "GET /me": () => ({ user: owner, csrf: "c" }),
      "POST /operator/unlock": () => ({ ok: true }),
      "GET /operator/overview": () =>
        expired ? reply(403, { error: "Enter an authenticator code to unlock operator access." }) : OVERVIEW,
    });
    await user.type(await screen.findByLabelText("Authenticator code"), "123456");
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    await screen.findByRole("heading", { name: "Dashboard" });

    expired = true;
    await store.dispatch(loadOverview());
    expect(await screen.findByText(/unlock has expired/)).toBeInTheDocument();
    expect(screen.getByLabelText("Authenticator code")).toBeInTheDocument();
  });
});
