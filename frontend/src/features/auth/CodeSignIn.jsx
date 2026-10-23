import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { api, apiUrl } from "../../api/client.js";
import { useAsyncTask } from "../../app/hooks.js";
import { readPreference, writePreference } from "../../app/storage.js";
import { Button } from "../../components/Button.jsx";
import { Field, FormError } from "../../components/Field.jsx";
import { selectPendingInvite } from "../session/sessionSlice.js";
import { loadPublicConfig, selectPublicConfig, selectPublicConfigStatus } from "../website/siteSlice.js";

// One-time-code sign-in by email, SMS or WhatsApp, plus Google. `intent`: "signin", "signup" or "operator".

const METHODS = [
  { id: "email", label: "Email" },
  { id: "sms", label: "Phone number" },
  { id: "whatsapp", label: "WhatsApp" },
];
const RESEND_SECONDS = 60;

function useCountdown(until) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until <= Date.now()) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  return Math.max(0, Math.ceil((until - now) / 1000));
}

export function CodeSignIn({ intent = "signin", onSignedIn, onUsePassword }) {
  const dispatch = useDispatch();
  const config = useSelector(selectPublicConfig);
  const configStatus = useSelector(selectPublicConfigStatus);
  const pendingInvite = useSelector(selectPendingInvite);
  const signup = intent === "signup";

  const [method, setMethod] = useState("email");
  const [form, setForm] = useState(() => ({
    name: "",
    identifier: "",
    referralCode: readPreference("referral", ""),
  }));
  const [challengeId, setChallengeId] = useState(null);
  const [code, setCode] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const secondsLeft = useCountdown(resendAt);
  const { busy, error, setError, run } = useAsyncTask();

  useEffect(() => {
    if (configStatus === "idle") dispatch(loadPublicConfig());
  }, [configStatus, dispatch]);

  const available = method === "email" ? config?.email : config?.phone;
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const requestCode = () =>
    run(async () => {
      if (!available) throw new Error("This sign-in method is not configured. Choose another method.");
      const { challengeId: id } = await api.post("/auth/quick/start", {
        method,
        identifier: form.identifier.trim(),
        name: signup ? form.name.trim() : undefined,
        referralCode: signup ? form.referralCode.trim() || undefined : undefined,
        intent: signup ? "signup" : "login",
      });
      setChallengeId(id);
      setCode("");
      setResendAt(Date.now() + RESEND_SECONDS * 1000);
    });

  const verifyCode = (event) => {
    event.preventDefault();
    run(async () => {
      const { user } = await api.post("/auth/quick/verify", { challengeId, code });
      await onSignedIn(user);
    });
  };

  function continueWithGoogle() {
    const params = new URLSearchParams({
      intent: signup ? "signup" : "login",
      returnTo: intent === "operator" ? "admin" : "app",
      ref: signup ? form.referralCode.trim() : "",
      invite: pendingInvite || "",
    });
    window.location.assign(apiUrl(`/auth/google/start?${params}`));
  }

  if (challengeId)
    return (
      <form className="code-verify" onSubmit={verifyCode} aria-busy={busy}>
        <h3>Check your {method === "email" ? "email" : "phone"}</h3>
        <p>
          Enter the six-digit code sent to <strong>{form.identifier}</strong>. It expires after 10 minutes.
        </p>
        <Field label="Verification code">
          <input
            required
            autoFocus
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          />
        </Field>
        <FormError>{error}</FormError>
        <Button type="submit" full disabled={busy || code.length !== 6}>
          {busy ? "Checking…" : "Verify & continue"}
        </Button>
        <div className="auth-help">
          <Button variant="text" disabled={busy || secondsLeft > 0} onClick={requestCode}>
            {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : "Resend code"}
          </Button>
          <Button variant="text" onClick={() => setChallengeId(null)}>
            Change details
          </Button>
        </div>
      </form>
    );

  return (
    <div className="code-signin">
      <p>
        {signup
          ? "Create an account with your email, phone number or Google."
          : "Sign in with your verified email, phone number or Google."}
      </p>
      <Button variant="outline" full disabled={!config?.google || busy} onClick={continueWithGoogle}>
        Continue with Google
      </Button>
      {config && !config.google && <p className="caption">Google sign-in is not enabled on this server.</p>}
      <div className="chips" role="group" aria-label="Verification method">
        {METHODS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={method === id ? "selected" : ""}
            aria-pressed={method === id}
            onClick={() => {
              setMethod(id);
              setError("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          requestCode();
        }}
        aria-busy={busy}
      >
        {signup && (
          <Field label="Your name">
            <input required maxLength={80} autoComplete="name" value={form.name} onChange={set("name")} />
          </Field>
        )}
        <Field label={method === "email" ? "Email address" : "Mobile number with country code"}>
          <input
            required
            type={method === "email" ? "email" : "tel"}
            autoComplete={method === "email" ? "email" : "tel"}
            placeholder={method === "email" ? "you@example.com" : "+447700900000"}
            value={form.identifier}
            onChange={set("identifier")}
          />
        </Field>
        {signup && (
          <>
            <Field label="Referral code (optional)">
              <input
                maxLength={80}
                autoCapitalize="characters"
                placeholder="A valid referral covers your first month"
                value={form.referralCode}
                onChange={set("referralCode")}
              />
            </Field>
            <div className="referral-promise">
              <strong>Your first month can be free.</strong>
              <p>
                Use a valid referral or household invitation. Refer another new verified person to earn the
                next month. Otherwise it is £0.99 per user per month.
              </p>
            </div>
          </>
        )}
        <FormError>{error}</FormError>
        <Button type="submit" full disabled={!available || busy}>
          {busy ? "Sending…" : "Send verification code"}
        </Button>
      </form>
      {configStatus === "error" && (
        <p className="notice">
          The account service is not reachable right now. Check your connection and try again.
        </p>
      )}
      {config && !available && (
        <p className="notice">
          This verification method is not configured on this server. Choose another method.
        </p>
      )}
      {onUsePassword && (
        <Button
          variant="text"
          onClick={() => {
            writePreference("referral", form.referralCode.trim() || null);
            onUsePassword();
          }}
        >
          Use email and password
        </Button>
      )}
    </div>
  );
}
