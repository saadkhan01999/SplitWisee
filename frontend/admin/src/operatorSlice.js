import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { api } from "../../src/api/client.js";
import { isSignedOutAction } from "../../src/features/session/sessionSlice.js";

// Operator console state. Platform endpoints need the single configured owner account plus a fresh authenticator
// unlock (15 minutes); household roles never grant access.

const isLockedError = (error) => error?.status === 403 && /authenticator code to unlock/i.test(error.message);

export const unlockOperator = createAsyncThunk("operator/unlock", async (code, { dispatch }) => {
  await api.post("/operator/unlock", { code });
  await dispatch(loadOverview()).unwrap();
});

export const loadOverview = createAsyncThunk("operator/loadOverview", async (_, { rejectWithValue }) => {
  try {
    return await api.get("/operator/overview");
  } catch (error) {
    return rejectWithValue({ message: error.message, locked: isLockedError(error) });
  }
});

/** Stripe/bank status plus the month's accounting report (journal, trial balance, statement, exceptions). */
export const loadFinance = createAsyncThunk("operator/loadFinance", async (month, { rejectWithValue }) => {
  try {
    const [status, report] = await Promise.all([
      api.get("/operator/finance"),
      api.get(`/operator/accounting?month=${encodeURIComponent(month)}`),
    ]);
    return { month, status, report };
  } catch (error) {
    return rejectWithValue({ message: error.message, locked: isLockedError(error) });
  }
});

/** Runs one audited operator write and reloads the overview. Rejects with { message, locked }. */
export const operatorRequest = createAsyncThunk(
  "operator/request",
  async ({ path, body }, { dispatch, rejectWithValue }) => {
    try {
      const result = await api.post(path, body);
      await dispatch(loadOverview()).unwrap();
      return result;
    } catch (error) {
      return rejectWithValue(
        error.locked !== undefined ? error : { message: error.message, locked: isLockedError(error) },
      );
    }
  },
);

const initialState = {
  unlocked: false,
  overview: null,
  status: "idle",
  error: null,
  finance: { month: null, status: "idle", data: null, report: null, error: null },
};

const lock = (state, { payload }) => {
  if (payload?.locked) {
    state.unlocked = false;
    state.error = "Your operator unlock has expired. Enter a new authenticator code.";
  }
};

const operatorSlice = createSlice({
  name: "operator",
  initialState,
  reducers: {
    operatorLocked: () => initialState,
  },
  extraReducers: (builder) =>
    builder
      .addCase(unlockOperator.fulfilled, (state) => {
        state.unlocked = true;
        state.error = null;
      })
      .addCase(loadOverview.pending, (state) => {
        state.status = "loading";
      })
      .addCase(loadOverview.fulfilled, (state, { payload }) => {
        state.overview = payload;
        state.status = "ready";
        state.unlocked = true;
      })
      .addCase(loadOverview.rejected, (state, action) => {
        state.status = "error";
        lock(state, action);
      })
      .addCase(loadFinance.pending, (state, { meta }) => {
        state.finance.status = "loading";
        state.finance.error = null;
        state.finance.month = meta.arg;
      })
      .addCase(loadFinance.fulfilled, (state, { payload }) => {
        if (payload.month !== state.finance.month) return; // a newer month was requested meanwhile
        state.finance = {
          month: payload.month,
          status: "ready",
          data: payload.status,
          report: payload.report,
          error: null,
        };
      })
      .addCase(loadFinance.rejected, (state, action) => {
        state.finance.status = "error";
        state.finance.error = action.payload?.message ?? action.error.message;
        lock(state, action);
      })
      .addCase(operatorRequest.rejected, lock)
      .addMatcher(isSignedOutAction, () => initialState),
});

export const { operatorLocked } = operatorSlice.actions;
export default operatorSlice.reducer;

export const selectOperator = (state) => state.operator;
export const selectFinance = (state) => state.operator.finance;
