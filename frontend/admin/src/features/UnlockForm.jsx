import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useAsyncTask } from "../../../src/app/hooks.js";
import { Button } from "../../../src/components/Button.jsx";
import { Field, FormError } from "../../../src/components/Field.jsx";
import { selectOperator, unlockOperator } from "../operatorSlice.js";

/** Second factor: a current code from the owner's authenticator app unlocks the console for 15 minutes. */
export function UnlockForm() {
  const dispatch = useDispatch();
  const { error: lockReason } = useSelector(selectOperator);
  const [code, setCode] = useState("");
  const { busy, error, run } = useAsyncTask();

  function handleSubmit(event) {
    event.preventDefault();
    run(() => dispatch(unlockOperator(code)).unwrap());
  }

  return (
    <section className="card unlock-card">
      <h2>Unlock the control centre</h2>
      <p>
        Enter the 6-digit code from your authenticator app. Access lasts 15 minutes; four wrong codes pause
        unlocking for 15 minutes.
      </p>
      {lockReason && <p className="notice">{lockReason}</p>}
      <form onSubmit={handleSubmit}>
        <Field label="Authenticator code">
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
        <Button type="submit" disabled={busy || code.length !== 6}>
          {busy ? "Checking…" : "Unlock"}
        </Button>
      </form>
    </section>
  );
}
