import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/app/App.jsx";
import { startApp } from "../src/app/bootstrap.js";
import { takeLaunchParams } from "../src/app/launchParams.js";
import { household, user } from "./helpers/fixtures.js";
import { mockApi, reply } from "./helpers/mockApi.js";
import { renderWithStore } from "./helpers/render.jsx";

const CONFIG = {
  email: true,
  phone: false,
  google: false,
  billing: false,
  bankEncryption: false,
  pricePence: 99,
};
const REWARDS = {
  code: "SW-TEST",
  url: "http://localhost/?ref=SW-TEST",
  freeMonths: 0,
  bonusMonths: 1,
  rewards: [],
  subscription: "Not subscribed",
};

function startAt(url) {
  window.history.replaceState(null, "", url);
  const rendered = renderWithStore(<App />);
  rendered.store.dispatch(startApp(takeLaunchParams()));
  return rendered;
}

describe("sign-up, sign-in and onboarding", () => {
  it("signs up with an email code, creates a household and opens it", async () => {
    let households = [];
    const created = household({ expenses: [], audit: [] });
    const api = mockApi({
      "GET /me": () => reply(401, { error: "Sign in to continue." }),
      "GET /public/config": () => CONFIG,
      "POST /auth/quick/start": () => ({ challengeId: "challenge-1" }),
      "POST /auth/quick/verify": () => ({ user, csrf: "csrf-1" }),
      "GET /households": () => households,
      "POST /households": () => {
        households = [{ id: created.id, name: created.name, type: "house" }];
        return created;
      },
      "GET /account/access": () => ({
        free: true,
        freeUntil: "2026-11-21T10:00:00.000Z",
        subscribed: false,
        billingConfigured: false,
      }),
      "GET /households/h-test": () => created,
      "GET /account/rewards": () => REWARDS,
    });
    const { user: person } = startAt("/?ref=SW-FRIEND#signup");

    await person.type(await screen.findByLabelText("Your name"), "Amira Shah");
    await person.type(screen.getByLabelText("Email address"), "amira@example.test");
    expect(screen.getByLabelText("Referral code (optional)")).toHaveValue("SW-FRIEND");
    await person.click(screen.getByRole("button", { name: "Send verification code" }));

    await person.type(await screen.findByLabelText("Verification code"), "123456");
    await person.click(screen.getByRole("button", { name: "Verify & continue" }));
    expect(api.called("POST", "/auth/quick/start")[0].body).toMatchObject({
      method: "email",
      identifier: "amira@example.test",
      name: "Amira Shah",
      referralCode: "SW-FRIEND",
      intent: "signup",
    });

    await person.type(await screen.findByLabelText("Household name"), "Maple House");
    await person.click(screen.getByRole("button", { name: "Continue to your plan" }));
    expect(api.called("POST", "/households")[0].body).toEqual({
      name: "Maple House",
      type: "house",
      room: "Room 1",
    });

    await person.click(await screen.findByRole("button", { name: "Start my free month" }));
    expect(await screen.findByRole("heading", { name: /Hello, Amira/ })).toBeInTheDocument();
    expect(window.location.hash).toBe("#app");
    // Writes after sign-in carry the CSRF token from the verify response.
    await waitFor(() => expect(api.called("POST", "/households")[0].headers["X-CSRF-Token"]).toBe("csrf-1"));
  });

  it("signs in with a password and opens the member's household", async () => {
    mockApi({
      "GET /me": () => reply(401, { error: "Sign in to continue." }),
      "GET /public/config": () => CONFIG,
      "POST /auth/login": ({ body }) =>
        body.password === "correct horse battery"
          ? { user, csrf: "csrf-2" }
          : reply(401, { error: "Email or password is incorrect." }),
      "GET /households": () => [{ id: "h-test", name: "Maple House", type: "house" }],
      "GET /households/h-test": () => household(),
      "GET /account/rewards": () => REWARDS,
    });
    const { user: person } = startAt("/#signin");

    await person.click(await screen.findByRole("button", { name: "Use email and password" }));
    await person.type(screen.getByLabelText("Email address"), "amira@example.test");
    await person.type(screen.getByLabelText("Password"), "wrong password!");
    await person.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is incorrect.");

    await person.clear(screen.getByLabelText("Password"));
    await person.type(screen.getByLabelText("Password"), "correct horse battery");
    await person.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("heading", { name: /Hello, Amira/ })).toBeInTheDocument();
    expect(screen.getByText("Maple House")).toBeInTheDocument();
  });

  it("registers with a password and moves on to email verification", async () => {
    const api = mockApi({
      "GET /me": () => reply(401, { error: "Sign in to continue." }),
      "GET /public/config": () => CONFIG,
      "POST /auth/register": () =>
        reply(202, { message: "If this is a new account, a verification code has been sent." }),
      "POST /auth/verify": () => ({ message: "Email verified. You can now sign in." }),
    });
    const { user: person } = startAt("/#signup");

    await person.click(await screen.findByRole("button", { name: "Use email and password" }));
    await person.type(screen.getByLabelText("Your name"), "Ben Carter");
    await person.type(screen.getByLabelText("Email address"), "ben@example.test");
    await person.type(screen.getByLabelText("Password (12–128 characters)"), "a long passphrase");
    await person.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("heading", { name: "Verify your email" })).toBeInTheDocument();
    expect(screen.getByText(/verification code has been sent/)).toBeInTheDocument();
    await person.type(screen.getByLabelText("Verification code"), "token-from-email");
    await person.click(screen.getByRole("button", { name: "Verify email" }));
    expect(await screen.findByRole("heading", { name: "Sign in with your password" })).toBeInTheDocument();
    expect(api.called("POST", "/auth/verify")[0].body).toEqual({ token: "token-from-email" });
  });

  it("joins a household from an invitation link", async () => {
    let households = [];
    const api = mockApi({
      "GET /me": () => ({ user, csrf: "csrf-3" }),
      "GET /households": () => households,
      "POST /invites/accept": () => {
        households = [{ id: "h-test", name: "Maple House", type: "house" }];
        return { ok: true, householdId: "h-test" };
      },
      "GET /account/access": () => ({ free: false, subscribed: true }),
      "GET /households/h-test": () => household(),
      "GET /account/rewards": () => REWARDS,
    });
    const { user: person } = startAt("/?invite=invite-token-1");

    expect(await screen.findByLabelText("Invitation code")).toHaveValue("invite-token-1");
    await person.click(screen.getByRole("button", { name: "Continue to your plan" }));
    await person.click(await screen.findByRole("button", { name: "Open my household" }));
    expect(await screen.findByRole("heading", { name: /Hello, Amira/ })).toBeInTheDocument();
    expect(api.called("POST", "/invites/accept")[0].body).toEqual({ token: "invite-token-1" });
  });

  it("signs out back to the sign-in page", async () => {
    mockApi({
      "GET /me": () => ({ user, csrf: "csrf-4" }),
      "GET /households": () => [{ id: "h-test", name: "Maple House", type: "house" }],
      "GET /households/h-test": () => household(),
      "GET /account/rewards": () => REWARDS,
      "POST /auth/logout": () => ({ ok: true }),
      "GET /public/config": () => CONFIG,
    });
    const { user: person } = startAt("/#app");

    await person.click(await screen.findByRole("button", { name: "Open account menu" }));
    await person.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("heading", { name: "Welcome back." })).toBeInTheDocument();
    expect(window.location.hash).toBe("#signin");
  });
});
