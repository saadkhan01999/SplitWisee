import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { api } from "../../api/client.js";
import { useAsyncTask } from "../../app/hooks.js";
import { toastShown } from "../../app/uiSlice.js";
import { Button } from "../../components/Button.jsx";
import { FormError } from "../../components/Field.jsx";
import { Icon } from "../../components/Icon.jsx";
import { formatLongDate } from "../../utils/format.js";
import { loadCampaigns, selectPromotion } from "../website/siteSlice.js";
import { loadRewards } from "./rewardsSlice.js";

/** The running website offer, claimable in the app. The API checks the dates, limit and eligibility. */
export function PromotionClaim() {
  const dispatch = useDispatch();
  const promotion = useSelector(selectPromotion);
  const { busy, error, run } = useAsyncTask();

  useEffect(() => {
    dispatch(loadCampaigns());
  }, [dispatch]);

  if (!promotion?.active) return null;

  const claim = () =>
    run(async () => {
      await api.post("/account/promotion");
      dispatch(toastShown(`${promotion.title} claimed: your free month has started (£0.00).`));
      dispatch(loadRewards());
      dispatch(loadCampaigns());
    });

  return (
    <section className="card promotion-claim">
      <div className="row wrap">
        <Icon name="spark" />
        <div className="grow">
          <span className="eyebrow">{promotion.title.toUpperCase()}</span>
          <h2>100% off your first month</h2>
        </div>
        <span className="price-zero">£0.00</span>
      </div>
      <p>{promotion.banner}</p>
      <p className="caption">{promotion.details}</p>
      <FormError>{error}</FormError>
      {promotion.redeemable ? (
        <Button disabled={busy} onClick={claim}>
          {busy ? "Claiming…" : "Claim my free month"}
        </Button>
      ) : (
        <p className="notice">
          {promotion.soldOut
            ? "All claims for this offer have been taken."
            : `Claims open on ${formatLongDate(promotion.startsAt)} and close on ${formatLongDate(promotion.endsAt)}.`}
        </p>
      )}
    </section>
  );
}
