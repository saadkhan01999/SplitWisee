import { initials } from "../utils/format.js";

const TINTS = ["#e4eee7", "#fbe8d8", "#e8e5f5", "#fbe9ed"];

function tint(id = "") {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length];
}

export function Avatar({ member, size = "" }) {
  return (
    <span className={`avatar ${size}`.trim()} style={{ "--av": tint(member?.id) }} aria-hidden="true">
      {initials(member?.name)}
    </span>
  );
}
