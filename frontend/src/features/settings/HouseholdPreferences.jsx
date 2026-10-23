import { useState } from "react";
import { useSelector } from "react-redux";
import { useHouseholdAction } from "../../app/hooks.js";
import { Button } from "../../components/Button.jsx";
import { Checkbox, Field } from "../../components/Field.jsx";
import {
  selectHousehold,
  selectHouseholdSaving,
  selectIsHouseholdAdmin,
} from "../household/householdSlice.js";

export function HouseholdPreferences() {
  const household = useSelector(selectHousehold);
  const admin = useSelector(selectIsHouseholdAdmin);
  const saving = useSelector(selectHouseholdSaving);
  const runAction = useHouseholdAction();
  const [values, setValues] = useState({ name: household.name, ...household.settings });

  if (!admin) return <p>Only household owners and admins can change these preferences.</p>;

  function handleSubmit(event) {
    event.preventDefault();
    runAction(
      "settings",
      { name: values.name.trim(), approvals: values.approvals, requireReceipts: values.requireReceipts },
      "Household preferences saved",
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <Field label="Household name">
        <input
          required
          maxLength={100}
          value={values.name}
          onChange={(event) => setValues({ ...values, name: event.target.value })}
        />
      </Field>
      <Checkbox checked={values.approvals} onChange={(approvals) => setValues({ ...values, approvals })}>
        New expenses need approval from an owner or admin
      </Checkbox>
      <Checkbox
        checked={values.requireReceipts}
        onChange={(requireReceipts) => setValues({ ...values, requireReceipts })}
      >
        Every expense needs a receipt (drafts excepted)
      </Checkbox>
      <Button type="submit" variant="outline" disabled={saving}>
        {saving ? "Saving…" : "Save preferences"}
      </Button>
    </form>
  );
}
