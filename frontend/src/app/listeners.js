import { createListenerMiddleware, isAnyOf } from "@reduxjs/toolkit";
import { sessionExpired, signOut } from "../features/session/sessionSlice.js";
import { navigated, routeHash } from "./navigationSlice.js";
import { persistPreferences } from "./persistPreferences.js";
import { dialogClosed, toastShown } from "./uiSlice.js";

export const listenerMiddleware = createListenerMiddleware();

persistPreferences(listenerMiddleware);

// Keep the address bar in step with in-app navigation so Back/Forward and reloads work.
listenerMiddleware.startListening({
  actionCreator: navigated,
  effect: ({ payload, meta }) => {
    if (meta.fromHistory) return;
    const url = `${window.location.pathname}${window.location.search}${routeHash(payload)}`;
    if (meta.replace) window.history.replaceState(null, "", url);
    else if (window.location.hash !== routeHash(payload)) window.history.pushState(null, "", url);
    window.scrollTo?.({ top: 0 });
  },
});

// Signing out (or an expired session) returns to the sign-in page from wherever the member was.
listenerMiddleware.startListening({
  matcher: isAnyOf(signOut.fulfilled, sessionExpired),
  effect: (action, api) => {
    api.dispatch(dialogClosed());
    if (sessionExpired.match(action))
      api.dispatch(toastShown("Your session has ended. Please sign in again."));
    if (api.getState().navigation.page !== "website")
      api.dispatch(navigated({ page: "signin" }, { replace: true }));
  },
});
