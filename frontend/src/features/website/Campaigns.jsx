import { formatLongDate } from "../../utils/format.js";
import { Icon } from "../../components/Icon.jsx";

// Website campaign content from the platform owner's settings: shown only while scheduled / once published.

/** The offer ribbon at the very top of the website. */
export function PromoRibbon({ promotion, onClaim }) {
  if (!promotion?.active) return null;
  return (
    <aside className="promo-ribbon" aria-label={promotion.title}>
      <Icon name="spark" size={18} />
      <span>
        <strong>{promotion.banner}</strong>
        {promotion.upcoming && <small> Claims open {formatLongDate(promotion.startsAt)}.</small>}
        {promotion.soldOut && <small> All claims have been taken.</small>}
      </span>
      {promotion.redeemable && onClaim && (
        <button type="button" className="btn small" onClick={onClaim}>
          Claim free month
        </button>
      )}
    </aside>
  );
}

/** "Giving back": the published charity commitment with its basis, period and reporting. */
export function CharitySection({ charity }) {
  if (!charity?.published) return null;
  return (
    <section id="giving-back" className="marketing-section charity-section">
      <div>
        <span className="eyebrow">GIVING BACK</span>
        <h2>{charity.percent}% to charity.</h2>
        <p className="charity-statement">{charity.statement}</p>
      </div>
      <article className="card">
        <Icon name="heart" />
        <dl>
          <div>
            <dt>What the {charity.percent}% is of</dt>
            <dd>Our {charity.basis}</dd>
          </div>
          <div>
            <dt>Charity</dt>
            <dd>{charity.beneficiary}</dd>
          </div>
          <div>
            <dt>Calculated</dt>
            <dd>{charity.period}</dd>
          </div>
          <div>
            <dt>From</dt>
            <dd>{formatLongDate(charity.effectiveFrom)}</dd>
          </div>
        </dl>
        <p>{charity.conditions}</p>
        <p className="caption">{charity.reporting}</p>
      </article>
    </section>
  );
}
