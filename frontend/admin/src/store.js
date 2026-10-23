import { configureStore, createListenerMiddleware } from "@reduxjs/toolkit";
import { persistPreferences } from "../../src/app/persistPreferences.js";
import ui from "../../src/app/uiSlice.js";
import session from "../../src/features/session/sessionSlice.js";
import site from "../../src/features/website/siteSlice.js";
import operator from "./operatorSlice.js";

export function createAdminStore(preloadedState) {
  const listener = createListenerMiddleware();
  persistPreferences(listener);
  return configureStore({
    reducer: { session, ui, site, operator },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().prepend(listener.middleware),
    preloadedState,
  });
}
