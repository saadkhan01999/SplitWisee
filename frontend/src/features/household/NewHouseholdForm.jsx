import { useState } from "react";
import { useDispatch } from "react-redux";
import { useAsyncTask } from "../../app/hooks.js";
import { goToTab } from "../../app/navigationSlice.js";
import { dialogClosed, toastShown } from "../../app/uiSlice.js";
import { Button } from "../../components/Button.jsx";
import { Field, FormError } from "../../components/Field.jsx";
import { acceptInvitation, createHousehold, openHousehold } from "./householdSlice.js";

const SPACE_TYPES = ["house", "flat", "room", "family", "hostel"];

/** Create another household, or join one with an invitation code. */
export function NewHouseholdForm() {
  const dispatch = useDispatch();
  const [details, setDetails] = useState({ name: "", type: "house", room: "Room 1" });
  const [code, setCode] = useState("");
  const create = useAsyncTask();
  const join = useAsyncTask();

  const enter = async (id, message) => {
    await dispatch(openHousehold(id)).unwrap();
    dispatch(dialogClosed());
    dispatch(goToTab("home"));
    dispatch(toastShown(message));
  };

  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          create.run(async () => {
            const household = await dispatch(
              createHousehold({ name: details.name.trim(), type: details.type, room: details.room.trim() }),
            ).unwrap();
            await enter(household.id, "Household created");
          });
        }}
      >
        <h3>Create a household</h3>
        <Field label="Household name">
          <input
            required
            maxLength={100}
            value={details.name}
            onChange={(event) => setDetails({ ...details, name: event.target.value })}
          />
        </Field>
        <div className="form-grid">
          <Field label="Space type">
            <select
              value={details.type}
              onChange={(event) => setDetails({ ...details, type: event.target.value })}
            >
              {SPACE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type[0].toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Your room">
            <input
              required
              maxLength={60}
              value={details.room}
              onChange={(event) => setDetails({ ...details, room: event.target.value })}
            />
          </Field>
        </div>
        <p className="caption">Currency: GBP · Time zone: Europe/London</p>
        <FormError>{create.error}</FormError>
        <Button type="submit" disabled={create.busy}>
          {create.busy ? "Creating…" : "Create household"}
        </Button>
      </form>
      <hr />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          join.run(async () => {
            const householdId = await dispatch(acceptInvitation(code.trim())).unwrap();
            await enter(householdId, "You joined the household");
          });
        }}
      >
        <h3>Join with an invitation</h3>
        <Field label="Invitation code" hint="Use the account the invitation was addressed to.">
          <input required spellCheck={false} value={code} onChange={(event) => setCode(event.target.value)} />
        </Field>
        <FormError>{join.error}</FormError>
        <Button type="submit" variant="outline" disabled={join.busy}>
          {join.busy ? "Joining…" : "Join household"}
        </Button>
      </form>
    </>
  );
}
