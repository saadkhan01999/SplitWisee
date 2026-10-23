import { Avatar } from "../../components/Avatar.jsx";
import { Button } from "../../components/Button.jsx";
import { Icon } from "../../components/Icon.jsx";
import { formatMoney } from "../../utils/format.js";
import { SPLIT_METHODS } from "./expenseDraft.js";

function MemberShares({ method, members, selected, onSelectedChange, values, onValuesChange, allocations }) {
  const rooms = [...new Set(members.map((member) => member.room))];
  const placeholder = SPLIT_METHODS.find((option) => option.id === method)?.placeholder;
  const shareOf = (id) => allocations.find((row) => row.memberId === id)?.amountPence ?? 0;

  return (
    <>
      <div className="chips" role="group" aria-label="Quick select">
        <button type="button" onClick={() => onSelectedChange(members.map((member) => member.id))}>
          Everyone
        </button>
        {rooms.map((room) => (
          <button
            key={room}
            type="button"
            onClick={() =>
              onSelectedChange(members.filter((member) => member.room === room).map((member) => member.id))
            }
          >
            {room}
          </button>
        ))}
      </div>
      <div className="split-list">
        {members.map((member) => {
          const included = selected.includes(member.id);
          return (
            <div className="split-row" key={member.id}>
              <label>
                <input
                  type="checkbox"
                  checked={included}
                  onChange={(event) =>
                    onSelectedChange(
                      event.target.checked
                        ? [...selected, member.id]
                        : selected.filter((id) => id !== member.id),
                    )
                  }
                />
                <Avatar member={member} />
                <span>{member.name}</span>
              </label>
              {included && method !== "equal" && (
                <input
                  className="share-value"
                  aria-label={`${member.name} share (${placeholder})`}
                  inputMode="decimal"
                  placeholder={placeholder}
                  value={values[member.id] ?? ""}
                  onChange={(event) => onValuesChange({ ...values, [member.id]: event.target.value })}
                />
              )}
              <strong>{formatMoney(shareOf(member.id))}</strong>
            </div>
          );
        })}
      </div>
    </>
  );
}

function ItemShares({ items, onItemsChange, members, defaultMembers }) {
  const update = (index, changes) =>
    onItemsChange(items.map((item, i) => (i === index ? { ...item, ...changes } : item)));

  return (
    <>
      <p className="caption">
        Each line is shared equally by the people ticked under it. Discounts use a minus sign (-0.50).
      </p>
      {items.map((item, index) => (
        <div className="card item-entry" key={index}>
          <div className="row">
            <input
              aria-label={`Item ${index + 1} description`}
              placeholder="Item name"
              value={item.title}
              onChange={(event) => update(index, { title: event.target.value })}
            />
            <input
              aria-label={`Item ${index + 1} amount`}
              inputMode="decimal"
              placeholder="0.00"
              value={item.amount}
              onChange={(event) => update(index, { amount: event.target.value })}
            />
            <button
              type="button"
              className="icon-btn"
              aria-label={`Remove item ${index + 1}`}
              onClick={() => onItemsChange(items.filter((_, i) => i !== index))}
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="chips" role="group" aria-label={`Who shares item ${index + 1}`}>
            {members.map((member) => (
              <label key={member.id}>
                <input
                  type="checkbox"
                  checked={item.members.includes(member.id)}
                  onChange={(event) =>
                    update(index, {
                      members: event.target.checked
                        ? [...item.members, member.id]
                        : item.members.filter((id) => id !== member.id),
                    })
                  }
                />
                {member.name}
              </label>
            ))}
          </div>
        </div>
      ))}
      <Button
        variant="outline"
        icon="plus"
        onClick={() => onItemsChange([...items, { title: "", amount: "", members: defaultMembers }])}
      >
        Add receipt item
      </Button>
    </>
  );
}

/** "Who shares the cost?" Equal, fixed, percentage, weighted or item-by-item splits. */
export function SplitEditor({ method, onMethodChange, items, onItemsChange, selected, ...shareProps }) {
  return (
    <fieldset className="split-editor">
      <div className="row">
        <legend>
          <h3>Who shares the cost?</h3>
        </legend>
        <select
          aria-label="Split method"
          value={method}
          onChange={(event) => onMethodChange(event.target.value)}
        >
          {SPLIT_METHODS.map(({ id, label }) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {method === "items" ? (
        <ItemShares
          items={items}
          onItemsChange={onItemsChange}
          members={shareProps.members}
          defaultMembers={selected}
        />
      ) : (
        <MemberShares method={method} selected={selected} {...shareProps} />
      )}
    </fieldset>
  );
}
