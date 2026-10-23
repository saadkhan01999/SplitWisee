import { useCallback, useState } from "react";
import { useDispatch } from "react-redux";
import { runHouseholdAction } from "../features/household/householdSlice.js";
import { toastShown } from "./uiSlice.js";

/** Busy and error state for a form or button that calls the API. */
export function useAsyncTask() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = useCallback(async (task) => {
    setBusy(true);
    setError("");
    try {
      return await task();
    } catch (failure) {
      setError(failure?.message || String(failure) || "Something went wrong. Please try again.");
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, setError, run };
}

/**
 * Runs a household action and reports the outcome in a toast. Resolves to true when the API accepted it, so a
 * dialog can close only on success.
 */
export function useHouseholdAction() {
  const dispatch = useDispatch();
  return useCallback(
    async (type, payload, successMessage) => {
      try {
        await dispatch(runHouseholdAction({ type, payload })).unwrap();
        if (successMessage) dispatch(toastShown(successMessage));
        return true;
      } catch (message) {
        dispatch(
          toastShown(typeof message === "string" ? message : "The change was not saved. Please try again."),
        );
        return false;
      }
    },
    [dispatch],
  );
}
