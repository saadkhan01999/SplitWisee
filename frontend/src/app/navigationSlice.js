import { createSlice } from "@reduxjs/toolkit";

// Hash-based routes keep the frontend deployable as static files and match the API's OAuth/checkout return
// addresses (/#app, /#signin). Examples: "" website, "#signin", "#signup", "#app", "#app/expenses".

export const APP_TABS = [
  "home",
  "expenses",
  "settle",
  "reports",
  "books",
  "rewards",
  "bank",
  "people",
  "settings",
];

export function parseHash(hash = "") {
  const [page, tab] = hash.replace(/^#\/?/, "").split("/");
  if (page === "signin" || page === "signup") return { page, tab: null };
  if (page === "app") return { page: "app", tab: APP_TABS.includes(tab) ? tab : "home" };
  return { page: "website", tab: null };
}

export function routeHash({ page, tab }) {
  if (page === "website") return "";
  if (page === "app" && tab && tab !== "home") return `#app/${tab}`;
  return `#${page}`;
}

const navigationSlice = createSlice({
  name: "navigation",
  initialState: () => parseHash(typeof window === "undefined" ? "" : window.location.hash),
  reducers: {
    navigated: {
      reducer: (_state, { payload }) => payload,
      prepare: (route, { replace = false, fromHistory = false } = {}) => ({
        payload: { page: route.page, tab: route.page === "app" ? route.tab || "home" : null },
        meta: { replace, fromHistory },
      }),
    },
  },
});

export const { navigated } = navigationSlice.actions;
export default navigationSlice.reducer;

export const selectRoute = (state) => state.navigation;

export const goToTab = (tab) => navigated({ page: "app", tab });
export const goToPage = (page, options) => navigated({ page }, options);
