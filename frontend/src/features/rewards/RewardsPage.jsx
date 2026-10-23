import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { api } from "../../api/client.js";
import { useAsyncTask } from "../../app/hooks.js";
import { toastShown } from "../../app/uiSlice.js";
import { Button } from "../../components/Button.jsx";
import { Field, FormError } from "../../components/Field.jsx";
import { copyText } from "../../utils/downloads.js";
import { formatDate } from "../../utils/format.js";
import { AccessStatus } from "./AccessStatus.jsx";
import { loadRewards, selectRewards } from "./rewardsSlice.js";

const SUBSCRIPTION_LABELS = {
  active: "Active",
  trialing: "Trial",
  past_due: "Payment overdue",
  canceled: "Cancelled",
  unpaid: "Unpaid",
  incomplete: "Payment incomplete",
};

export function RewardsPage() {
  const dispatch = useDispatch();
  const { data, status, error: loadError } = useSelector(selectRewards);
  const { busy, error, run } = useAsyncTask();

  useEffect(() => {
    dispatch(loadRewards());
  }, [dispatch]);

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Try SplitWisee",
          text: "Split simply. Live freely. Join with my referral link.",
          url: data.url,
        });
      } else {
        await copyText(data.url);
        dispatch(toastShown("Referral link copied"));
      }
    } catch (failure) {
      if (failure?.name !== "AbortError")
        dispatch(toastShown("Copy the referral link from the field above."));
    }
  }

  const openBilling = (route) =>
    run(async () => {
      const { url } = await api.post(`/billing/${route}`);
      window.location.assign(url);
    });

  return (
    <>
      <AccessStatus data={data} />
      <div className="reward-hero">
        <span className="eyebrow">GOOD THINGS ARE BETTER SHARED</span>
        <h2>
          Invite someone.
          <br />
          Enjoy a month on us.
        </h2>
        <p>
          £0.99 per user / month. Every qualifying new account earns you one free month after it is verified.
        </p>
        <strong>{data?.freeMonths ?? 0} earned months</strong>
      </div>
      {status === "error" && (
        <p className="error" role="alert">
          {loadError}{" "}
          <Button variant="text" onClick={() => dispatch(loadRewards())}>
            Retry
          </Button>
        </p>
      )}
      <div className="content-grid">
        <section className="card">
          <h2>Your personal referral</h2>
          <Field label="Referral code">
            <input readOnly value={data?.code ?? "Loading…"} />
          </Field>
          <Field label="Shareable link">
            <input readOnly value={data?.url ?? ""} onFocus={(event) => event.target.select()} />
          </Field>
          <Button disabled={!data} onClick={share}>
            Share invitation
          </Button>
          <p className="caption">
            A referral introduces SplitWisee to someone new. To give someone access to your household, use a
            member invitation instead. A referral code is never a password.
          </p>
        </section>
        <section className="card">
          <h2>Your plan</h2>
          <div className="price-inline">
            £0.99<small>per user / month</small>
          </div>
          <p>{SUBSCRIPTION_LABELS[data?.subscription] ?? data?.subscription ?? "Not subscribed"}</p>
          {data?.freeUntil && new Date(data.freeUntil) > new Date() && (
            <p className="green">Free access until {formatDate(data.freeUntil)}</p>
          )}
          <div className="actions wrap">
            <Button disabled={busy || !data} onClick={() => openBilling("checkout")}>
              Subscribe securely
            </Button>
            <Button
              variant="outline"
              disabled={busy || !data?.hasCustomer}
              onClick={() => openBilling("portal")}
            >
              Manage or cancel plan
            </Button>
          </div>
          <FormError>{error}</FormError>
          <p className="caption">
            Payments are handled by Stripe. Existing subscribers receive referral rewards as invoice credits
            instead of free months.
          </p>
          <h3>Reward history</h3>
          {data?.rewards?.length ? (
            data.rewards.map((reward) => (
              <div className="member-row" key={reward.id}>
                <span className="grow">
                  {reward.source ? "Welcome or granted month" : "Qualified referral"}
                  <small>
                    {formatDate(reward.at)}
                    {reward.kind === "invoice" &&
                      (reward.credited ? " · invoice credit applied" : " · invoice credit pending")}
                  </small>
                </span>
                <strong>1 month</strong>
              </div>
            ))
          ) : (
            <p>No rewards yet.</p>
          )}
        </section>
      </div>
    </>
  );
}
