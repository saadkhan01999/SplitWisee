import { brand } from "../config/brand.js";

export function BrandMark() {
  return (
    <svg className="brand-symbol" aria-hidden="true" viewBox="0 0 48 48">
      <rect width="48" height="48" rx="14" fill="#087F68" />
      <path d="M12 22 24 12l12 10v13H12Z" fill="none" stroke="#fff" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="19" cy="24" r="2.5" fill="#ADF3D2" />
      <circle cx="29" cy="24" r="2.5" fill="#ADF3D2" />
      <path
        d="M15.5 32v-1a3.5 3.5 0 0 1 7 0v1m3 0v-1a3.5 3.5 0 0 1 7 0v1"
        fill="none"
        stroke="#ADF3D2"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="brand">
      <BrandMark />
      <div>
        {brand.name}
        <small>{brand.tagline.toUpperCase()}</small>
      </div>
    </div>
  );
}
