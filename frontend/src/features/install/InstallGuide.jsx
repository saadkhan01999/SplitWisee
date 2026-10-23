import { useEffect, useState } from "react";
import { Button } from "../../components/Button.jsx";
import { Field } from "../../components/Field.jsx";
import { copyText } from "../../utils/downloads.js";
import { installEnvironment, promptInstall, useInstallPrompt } from "./installPrompt.js";
import { serviceWorkerStatus } from "./serviceWorker.js";

/** Primary install action. Opens the browser prompt when available, otherwise the step-by-step guide. */
export function InstallAppButton({ onShowGuide, onOpenApp, className = "btn outline" }) {
  const { canPrompt, installing } = useInstallPrompt();
  const { standalone } = installEnvironment();

  function handleClick() {
    if (standalone && onOpenApp) return onOpenApp();
    // Call the browser prompt synchronously within the click, before showing our own dialog.
    if (canPrompt) promptInstall();
    onShowGuide?.();
  }

  return (
    <button type="button" className={className} disabled={installing} onClick={handleClick}>
      {installing ? "Opening installer…" : standalone ? "Open the app" : "Install mobile app"}
    </button>
  );
}

function Steps({ ios }) {
  return ios ? (
    <ol className="install-steps">
      <li>
        Open this website in <strong>Safari</strong>.
      </li>
      <li>
        Tap <strong>Share</strong> (open the page menu first if needed).
      </li>
      <li>
        Choose <strong>Add to Home Screen</strong>. If it is missing, use <strong>Edit Actions</strong> to add
        it.
      </li>
      <li>
        Turn on <strong>Open as Web App</strong> if shown, then tap <strong>Add</strong>.
      </li>
      <li>Open the SplitWisee icon and sign in.</li>
    </ol>
  ) : (
    <ol className="install-steps">
      <li>
        Open this website directly in <strong>Chrome</strong> or <strong>Edge</strong> (not an in-app or
        private browser).
      </li>
      <li>
        Tap <strong>Install mobile app</strong> and accept the browser’s prompt.
      </li>
      <li>
        No prompt? Open the browser menu and choose <strong>Install app</strong> or{" "}
        <strong>Add to home screen</strong>.
      </li>
      <li>Open the SplitWisee icon and sign in.</li>
    </ol>
  );
}

export function InstallGuide() {
  const { canPrompt, installing, installed, message } = useInstallPrompt();
  const env = installEnvironment();
  const [worker, setWorker] = useState("checking");
  const [copyState, setCopyState] = useState("");
  const url = `${window.location.origin}/`;

  useEffect(() => {
    serviceWorkerStatus().then(setWorker);
  }, []);

  let notice;
  if (env.standalone) notice = "You are using the installed app.";
  else if (installed) notice = "Open the SplitWisee icon on your home screen. This tab can stay open.";
  else if (env.embedded)
    notice = "Open this link in Safari or Chrome, outside this in-app browser, to install.";
  else if (env.ios) notice = "On iPhone and iPad, install from Safari’s Share menu.";
  else if (!canPrompt) notice = "If your browser offers installation, use its menu as shown below.";

  return (
    <section className="install-guide">
      <h3>
        {env.standalone
          ? "Your mobile app is open"
          : installed
            ? "Installed on this device"
            : "Install SplitWisee on your phone"}
      </h3>
      <div className="install-summary">
        <strong>One app. All your household tools.</strong>
        <p>Expenses, receipt scanning, settlements and reports, with the same account as the website.</p>
      </div>
      {canPrompt && !env.standalone ? (
        <Button full disabled={installing} onClick={promptInstall}>
          Install now
        </Button>
      ) : (
        notice && <p className="notice">{notice}</p>
      )}
      {message && <p role="status">{message}</p>}
      {!env.standalone && <Steps ios={env.ios} />}
      <Field label="Website link">
        <input readOnly value={url} onFocus={(event) => event.target.select()} />
      </Field>
      <div className="install-link-actions">
        <Button
          variant="outline"
          onClick={() =>
            copyText(url).then(
              () => setCopyState("Link copied"),
              () => setCopyState("Select the link above and copy it from your device menu."),
            )
          }
        >
          {copyState === "Link copied" ? "Link copied" : "Copy website link"}
        </Button>
      </div>
      {copyState && copyState !== "Link copied" && <p role="status">{copyState}</p>}
      <p className="caption">
        SplitWisee is an installable web app (PWA), not an app-store download. An internet connection is
        needed for your account, uploads and payments.
      </p>
      <details>
        <summary>Installation checks</summary>
        <ul>
          <li>Secure connection: {env.secure ? "yes" : "no"}</li>
          <li>Service worker: {worker}</li>
          <li>Browser install prompt: {canPrompt ? "available" : "not offered"}</li>
          <li>Running as installed app: {env.standalone ? "yes" : "no"}</li>
        </ul>
      </details>
    </section>
  );
}
