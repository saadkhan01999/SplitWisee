import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { api, clearCsrfToken } from "../../api/client.js";

/** GET /me: the signed-in user, or null when there is no session. */
export const checkSession = createAsyncThunk("session/check", async () => {
  try {
    const { user } = await api.get("/me");
    return user;
  } catch (error) {
    if (error.status === 401) return null;
    throw error;
  }
});

export const signOut = createAsyncThunk("session/signOut", async () => {
  try {
    await api.post("/auth/logout");
  } catch (error) {
    // An already-expired session is signed out as far as the user is concerned.
    if (error.status !== 401) throw error;
  } finally {
    clearCsrfToken();
  }
});

const sessionSlice = createSlice({
  name: "session",
  initialState: {
    // checking | authenticated | anonymous | unavailable (the API could not be reached)
    status: "checking",
    user: null,
    error: null,
    // Set after sign-in when the account still has to create or join a household: { step, householdId }.
    onboarding: null,
    // Invitation token from an invitation link, kept until it is accepted.
    pendingInvite: null,
    authError: false,
  },
  reducers: {
    signedIn(state, { payload: user }) {
      state.status = "authenticated";
      state.user = user;
      state.error = null;
    },
    userUpdated(state, { payload: user }) {
      state.user = user;
    },
    sessionExpired(state) {
      state.status = "anonymous";
      state.user = null;
      state.onboarding = null;
    },
    onboardingStarted(state, { payload }) {
      state.onboarding = { step: "household", householdId: null, ...payload };
    },
    onboardingAdvanced(state, { payload }) {
      state.onboarding = { ...state.onboarding, ...payload };
    },
    onboardingFinished(state) {
      state.onboarding = null;
    },
    inviteReceived(state, { payload: token }) {
      state.pendingInvite = token;
    },
    inviteCleared(state) {
      state.pendingInvite = null;
    },
    authErrorReceived(state) {
      state.authError = true;
    },
    authErrorCleared(state) {
      state.authError = false;
    },
  },
  extraReducers: (builder) =>
    builder
      .addCase(checkSession.pending, (state) => {
        state.status = "checking";
        state.error = null;
      })
      .addCase(checkSession.fulfilled, (state, { payload: user }) => {
        state.status = user ? "authenticated" : "anonymous";
        state.user = user;
      })
      .addCase(checkSession.rejected, (state, { error }) => {
        state.status = "unavailable";
        state.error = error.message;
      })
      .addCase(signOut.fulfilled, (state) => {
        state.status = "anonymous";
        state.user = null;
        state.onboarding = null;
      }),
});

export const {
  signedIn,
  userUpdated,
  sessionExpired,
  onboardingStarted,
  onboardingAdvanced,
  onboardingFinished,
  inviteReceived,
  inviteCleared,
  authErrorReceived,
  authErrorCleared,
} = sessionSlice.actions;
export default sessionSlice.reducer;

export const selectSession = (state) => state.session;
export const selectUser = (state) => state.session.user;
export const selectIsSignedIn = (state) => state.session.status === "authenticated";
export const selectOnboarding = (state) => state.session.onboarding;
export const selectPendingInvite = (state) => state.session.pendingInvite;

/** Resets per-account state everywhere when the user signs out or the session expires. */
export const isSignedOutAction = (action) => signOut.fulfilled.match(action) || sessionExpired.match(action);
