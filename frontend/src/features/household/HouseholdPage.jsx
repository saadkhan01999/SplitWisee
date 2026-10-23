import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { roomNames } from "@domain/households/index.js";
import { useHouseholdAction } from "../../app/hooks.js";
import { dialogOpened, toastShown } from "../../app/uiSlice.js";
import { Avatar } from "../../components/Avatar.jsx";
import { Button } from "../../components/Button.jsx";
import { Checkbox, Field } from "../../components/Field.jsx";
import {
  openHousehold,
  selectCurrentMember,
  selectHousehold,
  selectHouseholdList,
  selectHouseholdSaving,
} from "./householdSlice.js";

const EDITOR_TITLES = {
  roomCreate: "Create a room",
  roomRename: "Rename room",
  roomDelete: "Delete empty room",
  memberUpdate: "Edit household member",
  memberRole: "Change household role",
  memberRemove: "Remove from household",
};

const SUCCESS = {
  roomCreate: "Room created",
  roomRename: "Room renamed",
  roomDelete: "Room deleted",
  memberUpdate: "Member updated",
  memberRole: "Role updated",
  memberRemove: "Member removed",
};

/** Inline form for one room or member change. Every change is permission-checked and audited by the API. */
function HouseholdEditor({ edit, rooms, onClose }) {
  const runAction = useHouseholdAction();
  const saving = useSelector(selectHouseholdSaving);
  const [values, setValues] = useState(edit.values);
  const set = (key) => (event) => setValues({ ...values, [key]: event.target.value });
  const { type } = edit;

  async function handleSubmit(event) {
    event.preventDefault();
    const payload = { ...values };
    if ("name" in payload) payload.name = payload.name.trim();
    delete payload.displayName;
    if (await runAction(type, payload, SUCCESS[type])) onClose();
  }

  return (
    <form className="card household-editor" onSubmit={handleSubmit}>
      <div className="section-heading">
        <h3>{EDITOR_TITLES[type]}</h3>
        <Button variant="text" onClick={onClose}>
          Cancel
        </Button>
      </div>
      {["roomCreate", "roomRename", "memberUpdate"].includes(type) && (
        <Field label={type === "memberUpdate" ? "Name shown in this household" : "Room name"}>
          <input
            required
            autoFocus
            maxLength={type === "memberUpdate" ? 80 : 60}
            value={values.name}
            onChange={set("name")}
          />
        </Field>
      )}
      {type === "memberUpdate" && (
        <Field label="Room">
          <select value={values.room} onChange={set("room")}>
            {rooms.map((room) => (
              <option key={room}>{room}</option>
            ))}
          </select>
        </Field>
      )}
      {type === "memberRole" && (
        <>
          <p>Choose what {values.displayName} can do in this household.</p>
          <Field label="Household role">
            <select value={values.role} onChange={set("role")}>
              <option value="member">Member: invite, record and view</option>
              <option value="admin">Admin: also manage rooms, members and closings</option>
            </select>
          </Field>
        </>
      )}
      {type === "roomDelete" && (
        <p>Delete the empty room “{values.room}”? Financial history is not affected.</p>
      )}
      {type === "memberRemove" && (
        <>
          <p>
            Remove {values.displayName} from this household? They lose access straight away. Their receipts,
            shares and outstanding balances stay on record for settlement. Their personal account is not
            deleted.
          </p>
          <Checkbox
            required
            checked={values.confirm}
            onChange={(confirm) => setValues({ ...values, confirm })}
          >
            I confirm removing household access.
          </Checkbox>
        </>
      )}
      <Button type="submit" danger={["roomDelete", "memberRemove"].includes(type)} disabled={saving}>
        {saving ? "Saving…" : "Save change"}
      </Button>
    </form>
  );
}

function YourHouseholds() {
  const dispatch = useDispatch();
  const household = useSelector(selectHousehold);
  const list = useSelector(selectHouseholdList);

  async function switchTo(id) {
    try {
      await dispatch(openHousehold(id)).unwrap();
    } catch (failure) {
      dispatch(toastShown(failure.message));
    }
  }

  return (
    <section className="card space-list">
      <h2>Your households</h2>
      <div className="actions wrap">
        {list.map((item) => (
          <Button
            key={item.id}
            variant={item.id === household.id ? "" : "outline"}
            aria-pressed={item.id === household.id}
            onClick={() => item.id !== household.id && switchTo(item.id)}
          >
            {item.name}
          </Button>
        ))}
      </div>
      <Button variant="text" icon="plus" onClick={() => dispatch(dialogOpened("household-new"))}>
        Create or join another household
      </Button>
    </section>
  );
}

export function HouseholdPage() {
  const dispatch = useDispatch();
  const household = useSelector(selectHousehold);
  const me = useSelector(selectCurrentMember);
  const [edit, setEdit] = useState(null);
  const admin = ["owner", "admin"].includes(me?.role);
  const rooms = roomNames(household);
  const active = household.members.filter((member) => !member.left);
  const former = household.members.filter((member) => member.left);
  const open = (type, values) => setEdit({ type, values, key: crypto.randomUUID() });
  // Mirrors modules/households: the owner may edit anyone, admins only ordinary members; nobody changes their own
  // role or removes themselves, and the owner can never be demoted or removed.
  const canEdit = (member) => admin && (me.role === "owner" || member.role === "member");
  const canChangeAccess = (member) => canEdit(member) && member.id !== me.id && member.role !== "owner";

  return (
    <>
      <div className="section-heading wrap">
        <div>
          <h2>{household.name}</h2>
          <p>
            {active.length} active {active.length === 1 ? "member" : "members"} · {rooms.length}{" "}
            {rooms.length === 1 ? "room" : "rooms"}
          </p>
        </div>
        <div className="actions wrap">
          <Button onClick={() => dispatch(dialogOpened("invite"))}>Invite member</Button>
          {admin && (
            <Button variant="outline" onClick={() => open("roomCreate", { name: "" })}>
              Add room
            </Button>
          )}
        </div>
      </div>
      <p className="caption">
        Everyone can invite a housemate. Owners and admins manage rooms and members. Household roles never
        give platform operator access.
      </p>

      {edit && <HouseholdEditor key={edit.key} edit={edit} rooms={rooms} onClose={() => setEdit(null)} />}

      <div className="room-grid">
        {rooms.map((room) => {
          const people = active.filter((member) => member.room === room);
          return (
            <section className="card" key={room}>
              <div className="section-heading wrap">
                <h3>{room}</h3>
                {admin && (
                  <div className="actions">
                    <Button
                      variant="text"
                      size="small"
                      onClick={() => open("roomRename", { room, name: room })}
                    >
                      Rename
                    </Button>
                    <Button
                      variant="text"
                      size="small"
                      danger
                      disabled={people.length > 0}
                      onClick={() => open("roomDelete", { room })}
                    >
                      Delete room
                    </Button>
                  </div>
                )}
              </div>
              {people.map((member) => (
                <div className="household-person" key={member.id}>
                  <div className="member-row">
                    <Avatar member={member} />
                    <div className="grow">
                      <strong>
                        {member.name}
                        {member.id === me?.id ? " (you)" : ""}
                      </strong>
                      <small>
                        {member.role} · joined {member.joined}
                      </small>
                    </div>
                  </div>
                  {canEdit(member) && (
                    <div className="actions wrap">
                      <Button
                        variant="outline"
                        size="small"
                        onClick={() =>
                          open("memberUpdate", { id: member.id, name: member.name, room: member.room })
                        }
                      >
                        Edit
                      </Button>
                      {canChangeAccess(member) && (
                        <>
                          <Button
                            variant="outline"
                            size="small"
                            onClick={() =>
                              open("memberRole", {
                                id: member.id,
                                role: member.role,
                                displayName: member.name,
                              })
                            }
                          >
                            Change role
                          </Button>
                          <Button
                            variant="text"
                            size="small"
                            danger
                            onClick={() =>
                              open("memberRemove", {
                                id: member.id,
                                confirm: false,
                                displayName: member.name,
                              })
                            }
                          >
                            Remove
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {!people.length && <p className="caption">Empty room · ready for a housemate</p>}
              <div className="actions wrap">
                <Button variant="text" onClick={() => dispatch(dialogOpened("invite", { room }))}>
                  Invite to this room
                </Button>
                <Button
                  variant="outline"
                  disabled={!people.length}
                  onClick={() => dispatch(dialogOpened("expense-new", { room }))}
                >
                  Split a room expense
                </Button>
              </div>
            </section>
          );
        })}
      </div>

      {former.length > 0 && (
        <details className="card">
          <summary>Former members · history kept</summary>
          {former.map((member) => (
            <p key={member.id}>
              {member.name} · access removed {member.left}
            </p>
          ))}
        </details>
      )}

      <YourHouseholds />
    </>
  );
}
