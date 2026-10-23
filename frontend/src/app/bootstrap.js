import { createAsyncThunk } from "@reduxjs/toolkit";
import { loadHouseholds, openHousehold } from "../features/household/householdSlice.js";
import {
  authErrorReceived,
  checkSession,
  inviteReceived,
  onboardingStarted,
  signedIn,
} from "../features/session/sessionSlice.js";
import { navigated } from "./navigationSlice.js";
import { readPreference, writePreference } from "./storage.js";
import { dialogOpened, toastShown } from "./uiSlice.js";

const CHECKOUT_MESSAGES = {
  complete: "Checkout complete. Your plan updates as soon as Stripe confirms the payment.",
  cancelled: "Checkout cancelled. You have not been charged.",
};

/**
 * Signed-in entry point: loads the user's households and opens the last one used, or starts onboarding when the
 * account has no household yet or arrived through an invitation.
 */
export const enterAccount = createAsyncThunk("app/enterAccount", async (user, { dispatch, getState }) => {
  dispatch(signedIn(user));
  const households = await dispatch(loadHouseholds()).unwrap();
  if (!households.length || getState().session.pendingInvite) {
    dispatch(onboardingStarted({ step: "household" }));
    return { onboarding: true };
  }
  const preferred = readPreference("household");
  const target = households.find((household) => household.id === preferred) ?? households[0];
  await dispatch(openHousehold(target.id)).unwrap();
  return { onboarding: false };
});

/** Checks for an existing session and, when signed in, enters the account. Resolves to enterAccount's result. */
export const resumeSession = createAsyncThunk("app/resume", async (_, { dispatch }) => {
  const user = await dispatch(checkSession()).unwrap();
  return user ? dispatch(enterAccount(user)).unwrap() : null;
});

/** Runs once when the app starts. `launch` comes from takeLaunchParams(). */
export const startApp = createAsyncThunk("app/start", async (launch, { dispatch, getState }) => {
  if (launch.referral) writePreference("referral", launch.referral);
  if (launch.invite) dispatch(inviteReceived(launch.invite));
  if (launch.authError) dispatch(authErrorReceived());
  if (CHECKOUT_MESSAGES[launch.checkout]) dispatch(toastShown(CHECKOUT_MESSAGES[launch.checkout]));

  const { page } = getState().navigation;
  if (page === "website" && (launch.invite || launch.referral))
    dispatch(navigated({ page: "signup" }, { replace: true }));
  if (launch.view === "settle") dispatch(navigated({ page: "app", tab: "settle" }, { replace: true }));

  const entered = await dispatch(resumeSession()).unwrap();
  if (entered && !entered.onboarding && launch.action === "add") {
    dispatch(navigated({ page: "app", tab: "expenses" }, { replace: true }));
    dispatch(dialogOpened("expense-new"));
  }
});
