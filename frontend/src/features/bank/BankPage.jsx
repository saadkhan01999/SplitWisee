import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { api } from "../../api/client.js";
import { useAsyncTask } from "../../app/hooks.js";
import { toastShown } from "../../app/uiSlice.js";
import { Button } from "../../components/Button.jsx";
import { Checkbox, Field, FormError } from "../../components/Field.jsx";

const EMPTY = { name: "", sortCode: "", accountNumber: "", consent: false };

/** Optional private payee details (encrypted by the API). No bank login or payment is ever connected. */
export function BankPage() {
  const dispatch = useDispatch();
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const load = useAsyncTask();
  const save = useAsyncTask();

  useEffect(() => {
    load.run(async () => setSaved(await api.get("/account/bank")));
    // Runs once on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  function handleSubmit(event) {
    event.preventDefault();
    save.run(async () => {
      const sortCode = form.sortCode.replace(/[\s-]/g, "");
      const accountNumber = form.accountNumber.replace(/\s/g, "");
      if (!/^\d{6}$/.test(sortCode) || !/^\d{8}$/.test(accountNumber))
        throw new Error("Use a 6-digit sort code and an 8-digit account number.");
      setSaved(await api.post("/account/bank", { ...form, name: form.name.trim(), sortCode, accountNumber }));
      setForm(EMPTY);
      dispatch(toastShown("Private payee details saved."));
    });
  }

  const remove = () =>
    save.run(async () => {
      await api.post("/account/bank/remove");
      setSaved({});
      dispatch(toastShown("Saved payee details removed."));
    });

  return (
    <div className="content-grid">
      <section className="card">
        <h2>Your bank. Your choice.</h2>
        <p>
          Every expense and bookkeeping tool works without a bank connection. Optional payee details keep your
          own transfer information handy when housemates repay you.
        </p>
        <div className="notice">
          No bank login, transaction feed or payment is connected. Only payee details are saved.
        </div>
        <FormError>{load.error}</FormError>
        {saved?.last4 && (
          <div className="card saved-payee">
            <strong>{saved.name}</strong>
            <p>Account ending •••• {saved.last4}</p>
            <Button variant="text" danger disabled={save.busy} onClick={remove}>
              Remove details
            </Button>
          </div>
        )}
      </section>
      <form className="card" onSubmit={handleSubmit}>
        <h2>{saved?.last4 ? "Replace payee details" : "Optional payee details"}</h2>
        <Field label="Account holder">
          <input required maxLength={80} autoComplete="off" value={form.name} onChange={set("name")} />
        </Field>
        <Field label="Sort code">
          <input
            required
            inputMode="numeric"
            autoComplete="off"
            placeholder="12-34-56"
            maxLength={8}
            value={form.sortCode}
            onChange={set("sortCode")}
          />
        </Field>
        <Field label="Account number">
          <input
            required
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            value={form.accountNumber}
            onChange={set("accountNumber")}
          />
        </Field>
        <Checkbox required checked={form.consent} onChange={(consent) => setForm({ ...form, consent })}>
          Save these details privately for my account.
        </Checkbox>
        <FormError>{save.error}</FormError>
        <Button type="submit" disabled={save.busy}>
          {save.busy ? "Saving…" : "Save payee details"}
        </Button>
        <p className="caption">
          Full details are encrypted on the server and are never shared with housemates or shown in the
          operator dashboard.
        </p>
      </form>
    </div>
  );
}
