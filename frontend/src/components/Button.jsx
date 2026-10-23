import { Icon } from "./Icon.jsx";

/**
 * Standard button. `variant`: "" (primary), "outline", "text"; `size`: "small"; plus optional "full" / "danger".
 * Defaults to type="button" so it never submits a form by accident; pass type="submit" explicitly.
 */
export function Button({
  children,
  icon,
  variant = "",
  size = "",
  full = false,
  danger = false,
  type = "button",
  className = "",
  ...props
}) {
  const classes = ["btn", variant, size, full && "full", danger && "danger", className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={classes} {...props}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}
