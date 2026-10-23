import { isAnyOf } from "@reduxjs/toolkit";
import { writePreference } from "./storage.js";
import { appViewChanged, fontScaleChanged, themeToggled } from "./uiSlice.js";

/** Saves display preferences on this device whenever they change (member app and operator console). */
export function persistPreferences(listenerMiddleware) {
  listenerMiddleware.startListening({
    matcher: isAnyOf(themeToggled, fontScaleChanged, appViewChanged),
    effect: (_action, api) => {
      const { theme, fontScale, appView } = api.getState().ui;
      writePreference("theme", theme);
      writePreference("fontScale", fontScale);
      writePreference("appView", appView === "auto" ? null : appView);
    },
  });
}
