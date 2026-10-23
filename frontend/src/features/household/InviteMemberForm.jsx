import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { roomNames } from "@domain/households/index.js";
import { api } from "../../api/client.js";
import { useAsyncTask } from "../../app/hooks.js";
import { toastShown } from "../../app/uiSlice.js";
import { Button } from "../../components/Button.jsx";
import { Field, FormError } from "../../components/Field.jsx";
import { copyText } from "../../utils/downloads.js";
import { selectHousehold } from "./householdSlice.js";

/** Creates an invitation bound to one verified email or phone number. Valid for 7 days. */
export function InviteMemberForm({ room }) {
  const dispatch = useDispatch();
  const household = useSelector(selectHousehold);
  const rooms = roomNames(household);
  const [form, setForm] = useState({ name: "", email: "", room: room ?? rooms[0] ?? "Room 1" });
  const [link, setLink] = useState("");
  const { busy, error, run } = useAsyncTask();
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  function handleSubmit(event) {
    event.preventDefault();
    run(async () => {
      const { token } = await api.post(`/households/${encodeURIComponent(household.id)}/invites`, {
        name: form.name.trim(),
        email: form.email.trim(),
        room: form.room,
      });
      setLink(`${window.location.origin}/?invite=${encodeURIComponent(token)}`);
    });
  }

  async function copy() {
    try {
      await copyText(link);
      dispatch(toastShown("Invitation link copied"));
    } catch {
      dispatch(toastShown("Select the link and copy it from your device menu."));
    }
  }

  async function share() {
    try {
      if (navigator.share)
        await navigator.share({ title: `Join ${household.name} on SplitWisee`, url: link });
      else await copy();
    } catch (failure) {
      if (failure?.name !== "AbortError")
        dispatch(toastShown("Sharing is unavailable here. Copy the link instead."));
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <p>Invite a housemate to {household.name}. Choose their room and send them their personal link.</p>
      <div className="notice">
        New verified users who accept a valid invitation get their first month free. The link only works for
        the email or phone number you enter here.
      </div>
      <Field label="Their name">
        <input required maxLength={80} value={form.name} onChange={set("name")} />
      </Field>
      <Field label="Email, or mobile number with country code">
        <input
          required
          placeholder="friend@example.com or +447700900000"
          value={form.email}
          onChange={set("email")}
        />
      </Field>
      <Field label="Room">
        <select value={form.room} onChange={set("room")}>
          {rooms.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </Field>
      <FormError>{error}</FormError>
      <Button type="submit" disabled={busy}>
        {busy ? "Creating…" : link ? "Create another invitation" : "Create invitation link"}
      </Button>
      {link && (
        <div className="invite-result" role="status">
          <strong>Invitation ready</strong>
          <input
            aria-label="Invitation link"
            readOnly
            value={link}
            onFocus={(event) => event.target.select()}
          />
          <p>Valid for 7 days. SplitWisee does not send it for you: share it by message or email.</p>
          <div className="actions wrap">
            <Button variant="outline" icon="copy" onClick={copy}>
              Copy link
            </Button>
            <Button variant="text" icon="share" onClick={share}>
              Share
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
