import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { api } from "../../api/client.js";
import { useAsyncTask } from "../../app/hooks.js";
import { navigated } from "../../app/navigationSlice.js";
import { Button } from "../../components/Button.jsx";
import { Field, FormError } from "../../components/Field.jsx";
import { formatDate } from "../../utils/format.js";
import { acceptInvitation, createHousehold, openHousehold } from "../household/householdSlice.js";
import {
  inviteCleared,
  onboardingAdvanced,
  onboardingFinished,
  selectOnboarding,
  selectPendingInvite,
  signOut,
} from "../session/sessionSlice.js";

const SPACE_TYPES = ["house", "flat", "hostel", "room", "family"];
const STEPS = ["Your account", "Your household", "Your plan"];

function HouseholdStep() {
  const dispatch = useDispatch();
  const pendingInvite = useSelector(selectPendingInvite);
  const [choice, setChoice] = useState(pendingInvite ? "join" : "create");
  const [form, setForm] = useState({ name: "", type: "house", room: "Room 1", invite: pendingInvite || "" });
  const { busy, error, run } = useAsyncTask();
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  function handleSubmit(event) {
    event.preventDefault();
    run(async () => {
      let householdId;
      if (choice === "join") {
        householdId = await dispatch(acceptInvitation(form.invite.trim())).unwrap();
        dispatch(inviteCleared());
      } else {
        const household = await dispatch(
          createHousehold({ name: form.name.trim(), type: form.type, room: form.room.trim() }),
        ).unwrap();
        householdId = household.id;
      }
      dispatch(onboardingAdvanced({ step: "plan", householdId }));
    });
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={busy}>
      <h3>Where will you share expenses?</h3>
      <div className="choice-grid">
        {[
          ["create", "Create a new household", "Set up a house, flat, hostel, family or room."],
          ["join", "Join an existing household", "Use the invitation from your housemate."],
        ].map(([id, title, body]) => (
          <button
            key={id}
            type="button"
            className={`choice-card ${choice === id ? "selected" : ""}`}
            aria-pressed={choice === id}
            onClick={() => setChoice(id)}
          >
            <strong>{title}</strong>
            <span>{body}</span>
          </button>
        ))}
      </div>
      {choice === "create" ? (
        <>
          <Field label="Household name">
            <input
              required
              maxLength={100}
              placeholder="e.g. The Green House"
              value={form.name}
              onChange={set("name")}
            />
          </Field>
          <div className="form-grid">
            <Field label="Space type">
              <select value={form.type} onChange={set("type")}>
                {SPACE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type[0].toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Your room">
              <input required maxLength={60} value={form.room} onChange={set("room")} />
            </Field>
          </div>
        </>
      ) : (
        <Field label="Invitation code" hint="Sign in with the email or phone the invitation was sent to.">
          <input required spellCheck={false} value={form.invite} onChange={set("invite")} />
        </Field>
      )}
      <FormError>{error}</FormError>
      <Button type="submit" full disabled={busy}>
        {busy ? "Saving…" : "Continue to your plan"}
      </Button>
    </form>
  );
}

function PlanStep({ householdId }) {
  const dispatch = useDispatch();
  const [access, setAccess] = useState(null);
  const [coupon, setCoupon] = useState("");
  const { busy, error, run } = useAsyncTask();

  const loadAccess = () => run(async () => setAccess(await api.get("/account/access")));
  useEffect(() => {
    loadAccess();
    // Load once when the step opens; retries are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = () =>
    run(async () => {
      await dispatch(openHousehold(householdId)).unwrap();
      dispatch(onboardingFinished());
      dispatch(navigated({ page: "app", tab: "home" }, { replace: true }));
    });

  const subscribe = () =>
    run(async () => {
      const { url } = await api.post("/billing/checkout");
      window.location.assign(url);
    });

  if (!access)
    return (
      <div>
        <p>{busy ? "Checking your plan…" : "Your household is saved. Load your plan to continue."}</p>
        <FormError>{error}</FormError>
        {!busy && <Button onClick={loadAccess}>Retry plan check</Button>}
      </div>
    );

  const covered = access.free || access.subscribed;
  return (
    <div className="plan-step">
      <h3>
        {access.free
          ? "Your free month is ready"
          : access.subscribed
            ? "Your plan is active"
            : "One simple monthly plan"}
      </h3>
      <div className="plan-summary">
        <span>SplitWisee Everyday</span>
        <strong>
          {access.free ? "£0.00" : "£0.99"}
          <small>{access.free ? "due today" : "per user / month"}</small>
        </strong>
        <p>
          {access.free
            ? `No card needed. Free access until ${formatDate(access.freeUntil)}. Refer a new verified user to earn another month.`
            : "Shared expenses, receipt scanning and exports, bookkeeping and the installable mobile app."}
        </p>
      </div>
      {!covered && (
        <form
          className="coupon-form"
          onSubmit={(event) => {
            event.preventDefault();
            run(async () => setAccess(await api.post("/account/coupon", { code: coupon.trim() })));
          }}
        >
          <p>No referral or invitation benefit applies to this account.</p>
          <Field label="Have a coupon?">
            <input
              maxLength={30}
              autoCapitalize="characters"
              value={coupon}
              onChange={(event) => setCoupon(event.target.value)}
            />
          </Field>
          <Button type="submit" variant="outline" disabled={!coupon.trim() || busy}>
            Apply coupon
          </Button>
        </form>
      )}
      <p className="caption">
        Free access never starts an automatic charge. Subscribe or earn another month when it ends. Paid plans
        are managed in the secure Stripe billing portal.
      </p>
      <FormError>{error}</FormError>
      {covered ? (
        <Button full disabled={busy} onClick={finish}>
          {busy ? "Opening…" : access.free ? "Start my free month" : "Open my household"}
        </Button>
      ) : (
        <>
          <Button full disabled={busy || !access.billingConfigured} onClick={subscribe}>
            {busy ? "Please wait…" : "Continue to secure payment"}
          </Button>
          {!access.billingConfigured && (
            <p className="caption">Online payments are not enabled on this server yet.</p>
          )}
          <Button variant="text" disabled={busy} onClick={finish}>
            View my household without subscribing
          </Button>
        </>
      )}
    </div>
  );
}

export function Onboarding() {
  const dispatch = useDispatch();
  const { step, householdId } = useSelector(selectOnboarding);
  const current = step === "plan" ? 2 : 1;

  return (
    <div className="signup-flow">
      <ol className="onboarding-steps">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={index <= current ? "current" : ""}
            aria-current={index === current ? "step" : undefined}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>
      {step === "plan" ? <PlanStep householdId={householdId} /> : <HouseholdStep />}
      <Button variant="text" onClick={() => dispatch(signOut())}>
        Sign out and use another account
      </Button>
    </div>
  );
}
