import { brand } from "../config/brand.js";
import { MARK_PATH, MARK_VIEWBOX, WORDMARK_PATH, WORDMARK_VIEWBOX } from "./logoPaths.js";

// The KoinSplit logo as inline vectors: transparent, sharp at every size and coloured by CSS (`--logo`), so it suits
// light and dark themes. The same artwork is published as files in public/brand/.

export function BrandMark({ className = "brand-symbol" }) {
  return (
    <svg className={className} viewBox={MARK_VIEWBOX} aria-hidden="true" focusable="false">
      <path d={MARK_PATH} fill="currentColor" />
    </svg>
  );
}

export function Logo({ tagline = true }) {
  return (
    <div className="brand">
      <BrandMark />
      <div>
        <svg className="brand-wordmark" viewBox={WORDMARK_VIEWBOX} aria-hidden="true" focusable="false">
          <path d={WORDMARK_PATH} fill="currentColor" />
        </svg>
        <span className="visually-hidden">{brand.name}</span>
        {tagline && <small>{brand.tagline.toUpperCase()}</small>}
      </div>
    </div>
  );
}
