import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { selectToast, toastDismissed } from "../app/uiSlice.js";

const VISIBLE_MS = 5000;

export function Toast() {
  const dispatch = useDispatch();
  const toast = useSelector(selectToast);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => dispatch(toastDismissed(toast.id)), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [dispatch, toast]);

  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toast && (
        <div className="toast" key={toast.id}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
