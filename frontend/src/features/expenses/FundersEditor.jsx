import { Button } from "../../components/Button.jsx";
import { Icon } from "../../components/Icon.jsx";

/** "Who actually paid?" Credit goes to the people whose money was used, even if someone else did the shopping. */
export function FundersEditor({ funders, onChange, members, amount, fallbackId }) {
  const update = (index, changes) =>
    onChange(funders.map((funder, i) => (i === index ? { ...funder, ...changes } : funder)));
  const nextMember =
    members.find((member) => !funders.some((funder) => funder.memberId === member.id))?.id ?? fallbackId;

  return (
    <fieldset className="funders">
      <legend>
        <h3>Who actually paid?</h3>
      </legend>
      <p className="caption">Credit the people who supplied the money, even if someone else shopped.</p>
      {funders.map((funder, index) => (
        <div className="funder-row" key={index}>
          <select
            aria-label={`Funder ${index + 1}`}
            value={funder.memberId}
            onChange={(event) => update(index, { memberId: event.target.value })}
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
          <input
            aria-label={`Amount paid by funder ${index + 1}`}
            inputMode="decimal"
            placeholder={funders.length === 1 ? amount || "Full amount" : "0.00"}
            value={funder.value}
            onChange={(event) => update(index, { value: event.target.value })}
          />
          {funders.length > 1 && (
            <button
              type="button"
              className="icon-btn"
              aria-label={`Remove funder ${index + 1}`}
              onClick={() => onChange(funders.filter((_, i) => i !== index))}
            >
              <Icon name="close" />
            </button>
          )}
        </div>
      ))}
      <Button
        variant="text"
        icon="plus"
        disabled={funders.length >= members.length}
        onClick={() => onChange([...funders, { memberId: nextMember, value: "" }])}
      >
        Add another funder
      </Button>
    </fieldset>
  );
}
