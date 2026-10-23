import { useMemo } from "react";
import { useSelector } from "react-redux";
import { useNow } from "../../app/useNow.js";
import { selectHousehold } from "../household/householdSlice.js";
import { selectUser } from "../session/sessionSlice.js";
import { monthReminders } from "./reminders.js";

export function useMonthReminders() {
  const household = useSelector(selectHousehold);
  const user = useSelector(selectUser);
  const now = useNow();
  return useMemo(() => {
    const profile = user?.profile ?? {};
    if (!household || profile.monthEndReminders === false) return [];
    return monthReminders(household, new Date(now), profile.timeZone || "Europe/London");
  }, [household, user, now]);
}
