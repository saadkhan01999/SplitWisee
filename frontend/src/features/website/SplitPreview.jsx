import { useState } from "react";
import { Field } from "../../components/Field.jsx";
import { formatMoney } from "../../utils/format.js";
import { equalSplit, parsePounds } from "../../utils/split.js";

export function SplitPreview({ onStart }) {
  const [total, setTotal] = useState("90");
  const [people, setPeople] = useState(4);
  const pence = parsePounds(total);
  const split = pence && equalSplit(pence, people);

  return (
    <div className="marketing-preview hero-split">
      <div className="preview-label">
        A FAIR SHARE, IN SECONDS <span>TRY IT</span>
      </div>
      <h2>Try a simple split</h2>
      <p>A weekly shop or a shared bill. See what everyone pays.</p>
      <Field label="Total (£)">
        <input inputMode="decimal" value={total} onChange={(event) => setTotal(event.target.value)} />
      </Field>
      <Field label={`${people} people`}>
        <input
          type="range"
          min="2"
          max="12"
          value={people}
          onChange={(event) => setPeople(Number(event.target.value))}
        />
      </Field>
      <div className="try-result" aria-live="polite">
        {split ? formatMoney(split.share) : "—"}
        <small>starting share per person</small>
      </div>
      <div className="preview-line">
        <span>People sharing</span>
        <b>{people}</b>
      </div>
      <p className="caption">
        {split
          ? split.extraPennies
            ? `${split.extraPennies} ${split.extraPennies === 1 ? "person pays" : "people pay"} one extra penny so every penny is covered.`
            : "Splits evenly to the penny."
          : "Enter a total up to £1,000,000 with at most two decimal places."}
      </p>
      <button type="button" className="btn" onClick={onStart}>
        Start your shared household →
      </button>
    </div>
  );
}
