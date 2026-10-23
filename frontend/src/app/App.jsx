import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button } from "../components/Button.jsx";
import { StatusScreen } from "../components/StatusScreen.jsx";
import { Toast } from "../components/Toast.jsx";
import { AuthPage } from "../features/auth/AuthPage.jsx";
import { selectHousehold } from "../features/household/householdSlice.js";
import { AppShell } from "../features/layout/AppShell.jsx";
import { selectSession } from "../features/session/sessionSlice.js";
import { LandingPage } from "../features/website/LandingPage.jsx";
import { enterAccount, resumeSession } from "./bootstrap.js";
import { navigated, parseHash, selectRoute } from "./navigationSlice.js";
import { useDocumentPreferences } from "./useDocumentPreferences.js";

/** Back/Forward buttons and manual hash edits update the route in the store. */
function useHistoryNavigation() {
  const dispatch = useDispatch();
  useEffect(() => {
    const sync = () => dispatch(navigated(parseHash(window.location.hash), { fromHistory: true }));
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, [dispatch]);
}

function SignedInApp() {
  const dispatch = useDispatch();
  const route = useSelector(selectRoute);
  const user = useSelector(selectSession).user;
  const household = useSelector(selectHousehold);
  const { currentStatus, listStatus, error } = useSelector((state) => state.household);

  useEffect(() => {
    if (route.page !== "app") dispatch(navigated({ page: "app", tab: "home" }, { replace: true }));
  }, [dispatch, route.page]);

  if (household) return <AppShell />;
  if (currentStatus === "error" || listStatus === "error")
    return (
      <StatusScreen
        title="Your household could not be opened"
        message={error || "Please try again."}
        action={<Button onClick={() => dispatch(enterAccount(user))}>Try again</Button>}
      />
    );
  return <StatusScreen message="Opening your household…" />;
}

function Routes() {
  const dispatch = useDispatch();
  const route = useSelector(selectRoute);
  const session = useSelector(selectSession);

  if (route.page === "website") return <LandingPage />;
  if (session.status === "checking") return <StatusScreen message="Checking your session…" />;
  if (session.status === "unavailable")
    return (
      <StatusScreen
        title="SplitWisee is unreachable"
        message={session.error || "The service did not respond. Check your connection and try again."}
        action={<Button onClick={() => dispatch(resumeSession())}>Try again</Button>}
      />
    );
  if (session.status !== "authenticated" || session.onboarding) return <AuthPage />;
  return <SignedInApp />;
}

export function App() {
  useDocumentPreferences();
  useHistoryNavigation();
  return (
    <>
      <Routes />
      <Toast />
    </>
  );
}
