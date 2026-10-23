import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { api } from "../../api/client.js";
import { isSignedOutAction } from "../session/sessionSlice.js";

/** Referral code/link, earned months, free-access window and subscription status. */
export const loadRewards = createAsyncThunk("rewards/load", () => api.get("/account/rewards"));

const initialState = { data: null, status: "idle", error: null };

const rewardsSlice = createSlice({
  name: "rewards",
  initialState,
  reducers: {},
  extraReducers: (builder) =>
    builder
      .addCase(loadRewards.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(loadRewards.fulfilled, (state, { payload }) => {
        state.data = payload;
        state.status = "ready";
      })
      .addCase(loadRewards.rejected, (state, { error }) => {
        state.status = "error";
        state.error = error.message;
      })
      .addMatcher(isSignedOutAction, () => initialState),
});

export default rewardsSlice.reducer;

export const selectRewards = (state) => state.rewards;
