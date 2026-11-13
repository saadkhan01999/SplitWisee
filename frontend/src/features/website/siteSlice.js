import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { defaultSettings } from "@domain/site-settings/index.js";
import { api } from "../../api/client.js";

/** Public website copy and announcements managed by the operator. */
export const loadSiteSettings = createAsyncThunk("site/loadSettings", () => api.get("/public/settings"));

/** Website campaigns: the scheduled offer banner and the published charity commitment (both may be off). */
export const loadCampaigns = createAsyncThunk("site/loadCampaigns", async () => {
  const [promotion, charity] = await Promise.all([
    api.get("/public/promotion").catch(() => ({ active: false })),
    api.get("/public/charity").catch(() => ({ published: false })),
  ]);
  return { promotion, charity };
});

/** Which sign-in providers and features this deployment has configured. Contains no secrets. */
export const loadPublicConfig = createAsyncThunk("site/loadConfig", () => api.get("/public/config"));

const siteSlice = createSlice({
  name: "site",
  initialState: {
    settings: defaultSettings,
    config: null,
    configStatus: "idle",
    promotion: { active: false },
    charity: { published: false },
  },
  reducers: {},
  extraReducers: (builder) =>
    builder
      .addCase(loadSiteSettings.fulfilled, (state, { payload }) => {
        state.settings = { ...defaultSettings, ...payload };
      })
      .addCase(loadCampaigns.fulfilled, (state, { payload }) => {
        state.promotion = payload.promotion;
        state.charity = payload.charity;
      })
      .addCase(loadPublicConfig.pending, (state) => {
        state.configStatus = "loading";
      })
      .addCase(loadPublicConfig.fulfilled, (state, { payload }) => {
        state.config = payload;
        state.configStatus = "ready";
      })
      .addCase(loadPublicConfig.rejected, (state) => {
        state.configStatus = "error";
      }),
});

export default siteSlice.reducer;

export const selectSiteSettings = (state) => state.site.settings;
export const selectPublicConfig = (state) => state.site.config;
export const selectPublicConfigStatus = (state) => state.site.configStatus;
export const selectPromotion = (state) => state.site.promotion;
export const selectCharity = (state) => state.site.charity;
