import { configureStore } from "@reduxjs/toolkit";
import calculator from "../features/calculator/calculatorSlice.js";
import household from "../features/household/householdSlice.js";
import rewards from "../features/rewards/rewardsSlice.js";
import session from "../features/session/sessionSlice.js";
import site from "../features/website/siteSlice.js";
import { listenerMiddleware } from "./listeners.js";
import navigation from "./navigationSlice.js";
import ui from "./uiSlice.js";

export function createStore(preloadedState) {
  return configureStore({
    reducer: { session, household, rewards, navigation, ui, site, calculator },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().prepend(listenerMiddleware.middleware),
    preloadedState,
  });
}
