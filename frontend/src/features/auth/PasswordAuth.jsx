import { useState } from "react";
import { api } from "../../api/client.js";
import { useAsyncTask } from "../../app/hooks.js";
import { readPreference } from "../../app/storage.js";
import { Button } from "../../components/Button.jsx";
import { Field, FormError, FormNotice } from "../../components/Field.jsx";

// Email + password sign-in, registration, email verification and password reset.

const STEPS = {
  login: { title: "Sign in with your password", submit: "Sign in", fields: ["email", "password"] },
  register: {
    title: "Create your account",
    submit: "Create account",
    fields: ["name", "email", "password", "referralCode"],
  },
  verify: { title: "Verify your email", submit: "Verify email", fields: ["token"] },
  resend: { title: "Resend verification", submit: "Send new code", fields: ["email"] },
  "reset-request": { title: "Reset your password", submit: "Send reset code", fields: ["email"] },
  reset: { title: "Choose a new password", submit: "Save new password", fields: ["token", "password"] },
};

/** Where each step goes after the API accepts it (login signs in instead). */
const NEXT_STEP = {
  register: "verify",
  verify: "login",
  resend: "verify",
  "reset-request": "reset",
  reset: "login",
};

export function PasswordAuth({ initialStep = "login", allowRegistration = true, title, onSignedIn }) {
  const [step, setStep] = useState(initialStep);
  const [values, setValues] = useState(() => ({
    name: "",
    email: "",
    password: "",
    token: "",
    referralCode: readPreference("referral", ""),
  }));
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const { busy, error, setError, run } = useAsyncTask();
  const { fields, submit } = STEPS[step];

  const set = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const goTo = (next) => {
    setStep(next);
    setMessage("");
    setError("");
  };

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    await run(async () => {
      const body = Object.fromEntries(fields.map((key) => [key, values[key].trim?.() ?? values[key]]));
      if (fields.includes("password")) body.password = values.password;
      const result = await api.post(`/auth/${step}`, body);
      if (result.user) return onSignedIn(result.user);
      setStep(NEXT_STEP[step]);
      setMessage(result.message || "Done.");
      if (step === "verify" || step === "reset")
        setValues((current) => ({ ...current, password: "", token: "" }));
    });
  }

  const passwordLabel = step === "login" ? "Password" : "Password (12–128 characters)";

  return (
    <form className="password-auth" onSubmit={handleSubmit} aria-busy={busy}>
      <h3>{step === "login" && title ? title : STEPS[step].title}</h3>
      {fields.includes("name") && (
        <Field label="Your name">
          <input required autoComplete="name" maxLength={80} value={values.name} onChange={set("name")} />
        </Field>
      )}
      {fields.includes("email") && (
        <Field label="Email address">
          <input
            required
            type="email"
            autoComplete="email"
            maxLength={254}
            value={values.email}
            onChange={set("email")}
          />
        </Field>
      )}
      {fields.includes("token") && (
        <Field
          label={step === "reset" ? "Reset code" : "Verification code"}
          hint="Paste the full code from your email. It expires after 30 minutes."
        >
          <input
            required
            autoComplete="one-time-code"
            spellCheck={false}
            value={values.token}
            onChange={set("token")}
          />
        </Field>
      )}
      {fields.includes("password") && (
        <>
          <Field label={passwordLabel}>
            <input
              required
              type={showPassword ? "text" : "password"}
              minLength={step === "login" ? undefined : 12}
              maxLength={128}
              autoComplete={step === "login" ? "current-password" : "new-password"}
              value={values.password}
              onChange={set("password")}
            />
          </Field>
          <Button
            variant="text"
            size="small"
            aria-pressed={showPassword}
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? "Hide password" : "Show password"}
          </Button>
        </>
      )}
      {fields.includes("referralCode") && (
        <Field label="Referral code (optional)">
          <input
            maxLength={80}
            autoCapitalize="characters"
            value={values.referralCode}
            onChange={set("referralCode")}
          />
        </Field>
      )}
      <FormNotice>{message}</FormNotice>
      <FormError>{error}</FormError>
      <Button type="submit" full disabled={busy}>
        {busy ? "Please wait…" : submit}
      </Button>
      <div className="auth-help">
        {step === "login" ? (
          <>
            <Button variant="text" onClick={() => goTo("reset-request")}>
              Forgot password?
            </Button>
            {allowRegistration && (
              <Button variant="text" onClick={() => goTo("verify")}>
                Verify an existing account
              </Button>
            )}
          </>
        ) : (
          <Button variant="text" onClick={() => goTo("login")}>
            Back to sign in
          </Button>
        )}
        {step === "verify" && (
          <Button variant="text" onClick={() => goTo("resend")}>
            Resend verification code
          </Button>
        )}
        {step === "resend" && (
          <Button variant="text" onClick={() => goTo("verify")}>
            I have a verification code
          </Button>
        )}
      </div>
    </form>
  );
}
