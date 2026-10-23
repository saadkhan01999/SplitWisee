export function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch ${checked ? "on" : ""}`.trim()}
      onClick={() => onChange(!checked)}
    >
      <i />
    </button>
  );
}
