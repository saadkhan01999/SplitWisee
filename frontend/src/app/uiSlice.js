import { createSlice, nanoid } from "@reduxjs/toolkit";
import { readPreference } from "./storage.js";

const clampScale = (value) => Math.min(1.4, Math.max(0.85, Number(value) || 1));

/** The member's saved choice, otherwise the device's light/dark setting. */
function initialTheme() {
  const saved = readPreference("theme");
  if (saved === "dark" || saved === "light") return saved;
  return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const uiSlice = createSlice({
  name: "ui",
  initialState: () => ({
    theme: initialTheme(),
    fontScale: clampScale(readPreference("fontScale", 1)),
    // "auto" follows the screen size; "mobile" forces the compact app layout on a larger screen.
    appView: readPreference("appView") === "mobile" ? "mobile" : "auto",
    toast: null,
    dialog: null,
  }),
  reducers: {
    themeToggled(state) {
      state.theme = state.theme === "dark" ? "light" : "dark";
    },
    fontScaleChanged(state, { payload }) {
      state.fontScale = clampScale(payload);
    },
    appViewChanged(state, { payload }) {
      state.appView = payload === "mobile" ? "mobile" : "auto";
    },
    toastShown: {
      reducer(state, { payload }) {
        state.toast = payload;
      },
      prepare: (message) => ({ payload: { id: nanoid(), message } }),
    },
    toastDismissed(state, { payload: id }) {
      if (state.toast?.id === id) state.toast = null;
    },
    /** Opens one of the app dialogs; `params` must be serialisable (ids, not objects). */
    dialogOpened: {
      reducer(state, { payload }) {
        state.dialog = payload;
      },
      prepare: (name, params = {}) => ({ payload: { name, params } }),
    },
    dialogClosed(state) {
      state.dialog = null;
    },
  },
});

export const {
  themeToggled,
  fontScaleChanged,
  appViewChanged,
  toastShown,
  toastDismissed,
  dialogOpened,
  dialogClosed,
} = uiSlice.actions;
export default uiSlice.reducer;

export const notify = toastShown;
export const selectTheme = (state) => state.ui.theme;
export const selectFontScale = (state) => state.ui.fontScale;
export const selectAppView = (state) => state.ui.appView;
export const selectToast = (state) => state.ui.toast;
export const selectDialog = (state) => state.ui.dialog;
