import { cloneElement, useId } from "react";

/** Labelled form control: <Field label="Email"><input …/></Field>. A hint is linked with aria-describedby. */
export function Field({ label, hint, children }) {
  const hintId = useId();
  return (
    <>
      <label className="field">
        <span>{label}</span>
        {hint ? cloneElement(children, { "aria-describedby": hintId }) : children}
      </label>
      {hint && (
        <small id={hintId} className="field-hint">
          {hint}
        </small>
      )}
    </>
  );
}

export function Checkbox({ checked, onChange, children, ...props }) {
  return (
    <label className="check-line">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        {...props}
      />{" "}
      {children}
    </label>
  );
}

export function FormError({ children }) {
  return children ? (
    <p className="error" role="alert">
      {children}
    </p>
  ) : null;
}

export function FormNotice({ children }) {
  return children ? (
    <p className="notice" role="status">
      {children}
    </p>
  ) : null;
}
