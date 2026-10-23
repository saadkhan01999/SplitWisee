const check = (ok, message) => {
  if (!ok) throw Error(message);
};
export const roomNames = (s) => [
  ...new Set([...(s.rooms || []), ...s.members.filter((m) => !m.left).map((m) => m.room)].filter(Boolean)),
];
const label = (v, max = 60) => {
  check(
    typeof v === "string" && v.trim().length > 0 && v.trim().length <= max,
    "Enter a valid name (maximum " + max + " characters).",
  );
  return v.trim();
};
// Mutates the cloned aggregate only. applyAction supplies versioning and audit.
export function manageHousehold(s, type, p, actor, now) {
  const admin = ["owner", "admin"].includes(actor.role);
  check(admin, "Admin permission required.");
  s.rooms = roomNames(s);
  if (type === "roomCreate") {
    const name = label(p.name);
    check(!s.rooms.some((r) => r.toLowerCase() === name.toLowerCase()), "Room already exists.");
    check(s.rooms.length < 100, "Maximum 100 rooms.");
    s.rooms.push(name);
    return "Room created: " + name;
  }
  if (type === "roomRename") {
    const name = label(p.name);
    check(s.rooms.includes(p.room), "Room not found.");
    check(
      !s.rooms.some((r) => r !== p.room && r.toLowerCase() === name.toLowerCase()),
      "Room already exists.",
    );
    s.rooms = s.rooms.map((r) => (r === p.room ? name : r));
    s.members.forEach((m) => {
      if (!m.left && m.room === p.room) m.room = name;
    });
    return "Room renamed: " + p.room + " → " + name;
  }
  if (type === "roomDelete") {
    check(s.rooms.includes(p.room), "Room not found.");
    check(
      !s.members.some((m) => !m.left && m.room === p.room),
      "Move all active members before deleting this room.",
    );
    s.rooms = s.rooms.filter((r) => r !== p.room);
    return "Room deleted: " + p.room;
  }
  const target = s.members.find((m) => m.id === p.id && !m.left);
  check(target, "Active member not found.");
  if (type === "memberUpdate") {
    check(actor.role === "owner" || target.role === "member", "Only the owner can edit owners or admins.");
    target.name = label(p.name, 80);
    check(s.rooms.includes(p.room), "Choose an existing room.");
    target.room = p.room;
    return "Household details updated: " + target.name;
  }
  if (type === "memberRole") {
    check(target.id !== actor.id, "You cannot change your own role.");
    check(target.role !== "owner", "The household owner role is protected.");
    check(actor.role === "owner" || target.role === "member", "Only the owner can change an existing admin.");
    check(["admin", "member"].includes(p.role), "Choose admin or member.");
    target.role = p.role;
    return target.name + " assigned " + p.role;
  }
  if (type === "memberRemove") {
    check(target.id !== actor.id, "You cannot remove yourself.");
    check(target.role !== "owner", "The household owner cannot be removed.");
    check(actor.role === "owner" || target.role === "member", "Only the owner can remove an admin.");
    check(p.confirm === true, "Confirm removal.");
    target.left = now.slice(0, 10);
    target.removedAt = now;
    target.removedBy = actor.id;
    return "Access removed: " + target.name + "; financial history retained";
  }
  throw Error("Unsupported household action.");
}
