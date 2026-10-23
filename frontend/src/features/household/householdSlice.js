import { createAsyncThunk, createSelector, createSlice } from "@reduxjs/toolkit";
import { balances } from "@domain/calculation-engine/index.js";
import { api } from "../../api/client.js";
import { writePreference } from "../../app/storage.js";
import { isSignedOutAction, selectUser } from "../session/sessionSlice.js";

const householdPath = (id) => `/households/${encodeURIComponent(id)}`;

export const loadHouseholds = createAsyncThunk("household/loadList", () => api.get("/households"));

export const openHousehold = createAsyncThunk("household/open", async (id) => {
  const household = await api.get(householdPath(id));
  writePreference("household", household.id);
  return household;
});

export const refreshHousehold = createAsyncThunk("household/refresh", (_, { getState }) =>
  api.get(householdPath(getState().household.current.id)),
);

/**
 * Applies one audited household action (expense, approval, closing, payment, room/member change…). The API
 * checks permissions, the household version (optimistic concurrency) and the idempotency key.
 */
export const runHouseholdAction = createAsyncThunk(
  "household/action",
  async ({ type, payload }, { getState, dispatch, rejectWithValue }) => {
    const { id, version } = getState().household.current;
    try {
      return await api.post(`${householdPath(id)}/actions`, {
        type,
        payload,
        version,
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (error) {
      // Someone else may have changed the household: load the latest version before the user retries.
      dispatch(refreshHousehold());
      return rejectWithValue(error.message);
    }
  },
);

export const createHousehold = createAsyncThunk("household/create", async (details, { dispatch }) => {
  const household = await api.post("/households", details);
  await dispatch(loadHouseholds());
  return household;
});

export const acceptInvitation = createAsyncThunk(
  "household/acceptInvitation",
  async (token, { dispatch }) => {
    const { householdId } = await api.post("/invites/accept", { token });
    await dispatch(loadHouseholds());
    return householdId;
  },
);

const initialState = {
  list: [],
  listStatus: "idle",
  current: null,
  currentStatus: "idle",
  error: null,
  saving: false,
};

const householdSlice = createSlice({
  name: "household",
  initialState,
  reducers: {},
  extraReducers: (builder) =>
    builder
      .addCase(loadHouseholds.pending, (state) => {
        state.listStatus = "loading";
      })
      .addCase(loadHouseholds.fulfilled, (state, { payload }) => {
        state.list = payload;
        state.listStatus = "ready";
      })
      .addCase(loadHouseholds.rejected, (state, { error }) => {
        state.listStatus = "error";
        state.error = error.message;
      })
      .addCase(openHousehold.pending, (state) => {
        state.currentStatus = "loading";
        state.error = null;
      })
      .addCase(openHousehold.fulfilled, (state, { payload }) => {
        state.current = payload;
        state.currentStatus = "ready";
      })
      .addCase(openHousehold.rejected, (state, { error }) => {
        state.currentStatus = "error";
        state.error = error.message;
      })
      .addCase(refreshHousehold.fulfilled, (state, { payload }) => {
        state.current = payload;
      })
      .addCase(runHouseholdAction.pending, (state) => {
        state.saving = true;
      })
      .addCase(runHouseholdAction.fulfilled, (state, { payload }) => {
        state.current = payload;
        state.saving = false;
      })
      .addCase(runHouseholdAction.rejected, (state) => {
        state.saving = false;
      })
      .addMatcher(isSignedOutAction, () => initialState),
});

export default householdSlice.reducer;

export const selectHousehold = (state) => state.household.current;
export const selectHouseholdList = (state) => state.household.list;
export const selectHouseholdSaving = (state) => state.household.saving;

export const selectCurrentMember = createSelector([selectHousehold, selectUser], (household, user) =>
  household?.members.find((member) => member.id === user?.id),
);

export const selectIsHouseholdAdmin = createSelector([selectCurrentMember], (member) =>
  ["owner", "admin"].includes(member?.role),
);

export const selectActiveMembers = createSelector([selectHousehold], (household) =>
  (household?.members ?? []).filter((member) => !member.left),
);

/** id → display name, including people who have since left the household. */
export const selectMemberName = createSelector([selectHousehold], (household) => {
  const names = new Map((household?.members ?? []).map((member) => [member.id, member.name]));
  return (id) => (id ? names.get(id) || "Former member" : "Not recorded");
});

export const selectBalances = createSelector([selectHousehold], (household) =>
  household ? balances(household) : [],
);
