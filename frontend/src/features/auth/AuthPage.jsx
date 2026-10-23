import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { enterAccount } from "../../app/bootstrap.js";
import { goToPage, selectRoute } from "../../app/navigationSlice.js";
import { Button } from "../../components/Button.jsx";
import { Logo } from "../../components/Logo.jsx";
import { brand } from "../../config/brand.js";
import { authErrorCleared, selectSession } from "../session/sessionSlice.js";
import { CodeSignIn } from "./CodeSignIn.jsx";
import { Onboarding } from "./Onboarding.jsx";
import { PasswordAuth } from "./PasswordAuth.jsx";

const MODES = [
  ["signin", "Sign in"],
  ["signup", "Sign up"],
];

export function AuthPage() {
  const dispatch = useDispatch();
  const route = useSelector(selectRoute);
  const session = useSelector(selectSession);
  const [usePassword, setUsePassword] = useState(false);
  const mode = route.page === "signup" ? "signup" : "signin";

  const handleSignedIn = (user) => dispatch(enterAccount(user)).unwrap();

  const switchMode = (next) => {
    setUsePassword(false);
    dispatch(authErrorCleared());
    dispatch(goToPage(next, { replace: true }));
  };

  return (
    <main className="auth-page">
      <header>
        <Logo />
        <Button variant="text" onClick={() => dispatch(goToPage("website"))}>
          Back to website
        </Button>
      </header>
      <div className="auth-layout">
        <section className="auth-card card">
          <span className="eyebrow">YOUR SHARED HOME, CONNECTED</span>
          {session.onboarding ? (
            <>
              <h1>Set up your household.</h1>
              <p>Signed in as {session.user?.email || session.user?.phone || session.user?.name}.</p>
              <Onboarding />
            </>
          ) : (
            <>
              <h1>{mode === "signin" ? "Welcome back." : "Create your account."}</h1>
              <p>Your receipts, household and balances in one place.</p>
              <div className="auth-tabs" role="tablist" aria-label="Account access">
                {MODES.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={mode === id}
                    onClick={() => switchMode(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {session.authError && (
                <p className="error" role="alert">
                  Google sign-in did not complete. Try again, use an email code, or choose Sign up if you do
                  not have an account yet.
                </p>
              )}
              {usePassword ? (
                <>
                  <PasswordAuth
                    key={mode}
                    initialStep={mode === "signup" ? "register" : "login"}
                    onSignedIn={handleSignedIn}
                  />
                  <Button variant="text" onClick={() => setUsePassword(false)}>
                    Use an email code, phone or Google instead
                  </Button>
                </>
              ) : (
                <CodeSignIn
                  key={mode}
                  intent={mode === "signup" ? "signup" : "signin"}
                  onSignedIn={handleSignedIn}
                  onUsePassword={() => setUsePassword(true)}
                />
              )}
            </>
          )}
        </section>
      </div>
      <p className="caption auth-note">
        Version {brand.version} · Verification is required for every account. A referral code is not a
        password.
      </p>
    </main>
  );
}
