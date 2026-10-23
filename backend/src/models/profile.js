export const TIMEZONES = [
  "Europe/London",
  "Asia/Karachi",
  "Asia/Dubai",
  "Europe/Paris",
  "America/New_York",
  "UTC",
];
export function cleanProfile(input) {
  const name = String(input.name || "").trim(),
    bio = String(input.bio || "").trim(),
    timeZone = String(input.timeZone || "Europe/London");
  if (
    !name ||
    name.length > 80 ||
    bio.length > 240 ||
    !TIMEZONES.includes(timeZone) ||
    typeof input.monthEndReminders !== "boolean"
  )
    throw Error("Check your name, bio, timezone and reminder preference.");
  return { name, bio, timeZone, monthEndReminders: input.monthEndReminders };
}
export function profileView(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email || "",
    phone: u.phone || "",
    bio: u.profile?.bio || "",
    timeZone: u.profile?.timeZone || "Europe/London",
    monthEndReminders: u.profile?.monthEndReminders !== false,
    createdAt: u.createdAt,
  };
}
