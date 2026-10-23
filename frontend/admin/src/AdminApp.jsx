import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { selectTheme, themeToggled } from "../../src/app/uiSlice.js";
import { useDocumentPreferences } from "../../src/app/useDocumentPreferences.js";
import { Button } from "../../src/components/Button.jsx";
import { Logo } from "../../src/components/Logo.jsx";
import { StatusScreen } from "../../src/components/StatusScreen.jsx";
import { Toast } from "../../src/components/Toast.jsx";
import { brand } from "../../src/config/brand.js";
import { CodeSignIn } from "../../src/features/auth/CodeSignIn.jsx";
import { PasswordAuth } from "../../src/features/auth/PasswordAuth.jsx";
import { checkSession, selectSession, signedIn, signOut } from "../../src/features/session/sessionSlice.js";
import { AdminDashboard } from "./features/AdminDashboard.jsx";
import { UnlockForm } from "./features/UnlockForm.jsx";
import { selectOperator } from "./operatorSlice.js";

function ThemeButton() {
  const dispatch = useDispatch();
  const dark = useSelector(selectTheme) === "dark";
  return (
    <Button variant="outline" aria-pressed={dark} onClick={() => dispatch(themeToggled())}>
      {dark ? "Light mode" : "Dark mode"}
    </Button>
  );
}

function OperatorSignIn() {
  const dispatch = useDispatch();
  const [usePassword, setUsePassword] = useState(true);
  const onSignedIn = (user) => dispatch(signedIn(user));

  return (
    <main className="auth-page owner-auth">
      <header>
        <Logo />
        <div className="actions">
          <ThemeButton />
          <a className="btn text" href="/">
            Member website
          </a>
        </div>
      </header>
      <div className="auth-layout">
        <aside className="auth-intro">
          <span className="eyebrow">SPLITWISEE CONTROL CENTRE</span>
          <h2>
            One owner.
            <br />A clear view of everything.
          </h2>
          <p>
            Manage the website, members, subscriptions, promotions and platform finances in one secure
            workspace.
          </p>
          <ul>
            <li>Single authorised owner account</li>
            <li>Authenticator verification</li>
            <li>Every action recorded</li>
          </ul>
        </aside>
        <section className="auth-card card">
          <span className="eyebrow">PLATFORM OPERATOR ACCESS</span>
          <h1>Operator sign in</h1>
          <p>Sign in with the designated owner account. There is no public operator registration.</p>
          {usePassword ? (
            <>
              <PasswordAuth allowRegistration={false} title="Owner account" onSignedIn={onSignedIn} />
              <Button variant="text" onClick={() => setUsePassword(false)}>
                Use an email code, phone or Google instead
              </Button>
            </>
          ) : (
            <CodeSignIn
              intent="operator"
              onSignedIn={onSignedIn}
              onUsePassword={() => setUsePassword(true)}
            />
          )}
        </section>
      </div>
      <p className="caption auth-note">Version {brand.version}</p>
    </main>
  );
}

function OperatorConsole() {
  const dispatch = useDispatch();
  const { user } = useSelector(selectSession);
  const { unlocked } = useSelector(selectOperator);

  return (
    <div className="operator-shell">
      <header className="operator-topbar">
        <Logo />
        <span>Platform control centre</span>
        <ThemeButton />
        <a className="btn text" href="/">
          Member website
        </a>
        <Button variant="outline" onClick={() => dispatch(signOut())}>
          Sign out
        </Button>
      </header>
      <main className="operator-main">
        {!user.operator ? (
          <section className="card">
            <h1>Operator access required</h1>
            <p>
              This account is not the platform owner. Owning or managing a household does not give access to
              the control centre.
            </p>
          </section>
        ) : unlocked ? (
          <AdminDashboard />
        ) : (
          <UnlockForm />
        )}
      </main>
    </div>
  );
}

export function AdminApp() {
  const dispatch = useDispatch();
  const session = useSelector(selectSession);
  useDocumentPreferences();

  let content;
  if (session.status === "checking") content = <StatusScreen message="Checking operator session…" />;
  else if (session.status === "unavailable")
    content = (
      <StatusScreen
        title="SplitWisee is unreachable"
        message={session.error}
        action={<Button onClick={() => dispatch(checkSession())}>Try again</Button>}
      />
    );
  else if (session.status !== "authenticated") content = <OperatorSignIn />;
  else content = <OperatorConsole />;

  return (
    <>
      {content}
      <Toast />
    </>
  );
}
