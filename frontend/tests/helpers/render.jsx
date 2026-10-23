import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { createStore } from "../../src/app/store.js";
import { household as householdFixture, user as userFixture } from "./fixtures.js";

/** Renders `ui` with a real store. Returns the store and a userEvent instance as well. */
export function renderWithStore(ui, { preloadedState, store = createStore(preloadedState) } = {}) {
  return { store, user: userEvent.setup(), ...render(<Provider store={store}>{ui}</Provider>) };
}

/** Store state for a signed-in member with an open household. */
export function signedInState({ household = householdFixture(), user = userFixture, tab = "home" } = {}) {
  return {
    session: {
      status: "authenticated",
      user,
      error: null,
      onboarding: null,
      pendingInvite: null,
      authError: false,
    },
    household: {
      list: [{ id: household.id, name: household.name, type: household.type }],
      listStatus: "ready",
      current: household,
      currentStatus: "ready",
      error: null,
      saving: false,
    },
    navigation: { page: "app", tab },
  };
}
