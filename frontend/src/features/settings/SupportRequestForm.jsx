import { useState } from "react";
import { useDispatch } from "react-redux";
import { api } from "../../api/client.js";
import { useAsyncTask } from "../../app/hooks.js";
import { dialogClosed, toastShown } from "../../app/uiSlice.js";
import { Button } from "../../components/Button.jsx";
import { Field, FormError } from "../../components/Field.jsx";

/** Sends a request to the platform operator's support queue. */
export function SupportRequestForm() {
  const dispatch = useDispatch();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const { busy, error, run } = useAsyncTask();

  function handleSubmit(event) {
    event.preventDefault();
    run(async () => {
      const { id } = await api.post("/account/support", { subject: subject.trim(), message: message.trim() });
      dispatch(dialogClosed());
      dispatch(toastShown(`Support request sent (reference ${id.slice(0, 8)}).`));
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <p>
        Tell us what you need, for example changing your verified email or phone number. Do not include
        passwords or full bank details.
      </p>
      <Field label="Subject">
        <input
          required
          maxLength={120}
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        />
      </Field>
      <Field label="Message" hint={`${message.length}/2000`}>
        <textarea
          required
          maxLength={2000}
          rows={5}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
      </Field>
      <FormError>{error}</FormError>
      <Button type="submit" disabled={busy || !subject.trim() || !message.trim()}>
        {busy ? "Sending…" : "Send request"}
      </Button>
    </form>
  );
}
