import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { api } from "../../api/client.js";
import { useAsyncTask } from "../../app/hooks.js";
import { toastShown } from "../../app/uiSlice.js";
import { Button } from "../../components/Button.jsx";
import { Checkbox, Field, FormError } from "../../components/Field.jsx";
import { jsonBlob, saveBlob } from "../../utils/downloads.js";
import { userUpdated } from "../session/sessionSlice.js";

/** Time zones the API accepts (backend/src/models/profile.js; a test keeps the two lists identical). */
export const PROFILE_TIME_ZONES = [
  "Europe/London",
  "Asia/Karachi",
  "Asia/Dubai",
  "Europe/Paris",
  "America/New_York",
  "UTC",
];

/** Personal profile: name, short bio, time zone and month-end reminders. Separate from household display names. */
export function ProfileSettings() {
  const dispatch = useDispatch();
  const [profile, setProfile] = useState(null);
  const load = useAsyncTask();
  const save = useAsyncTask();

  useEffect(() => {
    load.run(async () => setProfile(await api.get("/account/profile")));
    // Runs once on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (key) => (event) => setProfile({ ...profile, [key]: event.target.value });

  function handleSubmit(event) {
    event.preventDefault();
    save.run(async () => {
      const { profile: saved, user } = await api.post("/account/profile", {
        name: profile.name.trim(),
        bio: profile.bio.trim(),
        timeZone: profile.timeZone,
        monthEndReminders: profile.monthEndReminders,
      });
      setProfile(saved);
      dispatch(userUpdated(user));
      dispatch(toastShown("Profile saved"));
    });
  }

  const exportData = () =>
    save.run(async () => saveBlob(jsonBlob(await api.get("/account/export")), "SplitWisee-My-Profile.json"));

  if (!profile)
    return (
      <section className="profile-settings">
        <h3>Your profile</h3>
        {load.error ? <FormError>{load.error}</FormError> : <p role="status">Loading your profile…</p>}
      </section>
    );

  return (
    <section className="profile-settings">
      <h3>Your profile</h3>
      <p className="caption">
        Your profile is separate from the name and room shown in each household. To change your verified email
        or phone number, contact support.
      </p>
      <form onSubmit={handleSubmit}>
        <Field label="Profile name">
          <input required maxLength={80} autoComplete="name" value={profile.name} onChange={set("name")} />
        </Field>
        <Field label="About you (optional)" hint={`${profile.bio.length}/240`}>
          <textarea maxLength={240} rows={2} value={profile.bio} onChange={set("bio")} />
        </Field>
        <Field label="Your time zone">
          <select value={profile.timeZone} onChange={set("timeZone")}>
            {PROFILE_TIME_ZONES.map((zone) => (
              <option key={zone}>{zone}</option>
            ))}
          </select>
        </Field>
        <Checkbox
          checked={profile.monthEndReminders}
          onChange={(monthEndReminders) => setProfile({ ...profile, monthEndReminders })}
        >
          Show month-end closing reminders
        </Checkbox>
        <p className="caption">
          Reminders appear in the app in the last three days of each month. No emails are sent.
        </p>
        <FormError>{save.error}</FormError>
        <div className="actions wrap">
          <Button type="submit" disabled={save.busy}>
            {save.busy ? "Saving…" : "Save my profile"}
          </Button>
          <Button variant="outline" icon="download" disabled={save.busy} onClick={exportData}>
            Export my data
          </Button>
        </div>
      </form>
    </section>
  );
}
