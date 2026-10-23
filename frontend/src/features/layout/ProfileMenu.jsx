import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { goToTab } from "../../app/navigationSlice.js";
import { dialogOpened, toastShown } from "../../app/uiSlice.js";
import { initials } from "../../utils/format.js";
import { selectUser, signOut } from "../session/sessionSlice.js";

const LINKS = [
  ["settings", "Account & settings"],
  ["people", "My household"],
  ["rewards", "Subscription & referrals"],
];

export function ProfileMenu() {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const choose = (action) => {
    setOpen(false);
    dispatch(action);
  };

  async function handleSignOut() {
    setOpen(false);
    try {
      await dispatch(signOut()).unwrap();
    } catch (error) {
      dispatch(toastShown(error.message || "Sign-out failed. Please try again."));
    }
  }

  return (
    <div className="profile-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="profile-trigger"
        aria-label="Open account menu"
        aria-expanded={open}
        aria-controls="account-menu"
        onClick={() => setOpen(!open)}
      >
        <span className="avatar">{initials(user?.name)}</span>
        <span>{user?.name}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div id="account-menu" className="profile-popover">
          <strong>{user?.name}</strong>
          <small>{user?.email || user?.phone || "Signed in"}</small>
          {LINKS.map(([tab, label]) => (
            <button key={tab} type="button" onClick={() => choose(goToTab(tab))}>
              {label}
            </button>
          ))}
          <button type="button" onClick={() => choose(dialogOpened("install"))}>
            Install mobile app
          </button>
          <button type="button" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
