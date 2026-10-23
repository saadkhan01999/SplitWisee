import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { goToTab, selectRoute } from "../../app/navigationSlice.js";
import { dialogOpened, selectTheme, themeToggled, toastShown } from "../../app/uiSlice.js";
import { Icon } from "../../components/Icon.jsx";
import { Logo } from "../../components/Logo.jsx";
import { shareBlob } from "../../utils/downloads.js";
import { captureElement } from "../../utils/screenshot.js";
import { selectActiveMembers, selectHousehold } from "../household/householdSlice.js";
import { useMonthReminders } from "../notifications/useMonthReminders.js";
import { AppViewSwitch } from "../preferences/AppViewSwitch.jsx";
import { ProfileMenu } from "./ProfileMenu.jsx";

export function TopBar() {
  const dispatch = useDispatch();
  const household = useSelector(selectHousehold);
  const activeMembers = useSelector(selectActiveMembers);
  const theme = useSelector(selectTheme);
  const { tab } = useSelector(selectRoute);
  const reminders = useMonthReminders();
  // The tools menu belongs to the section it was opened on, so it closes itself when the section changes.
  const [toolsTab, setToolsTab] = useState(null);
  const toolsOpen = toolsTab === tab;
  const setToolsOpen = (value) => setToolsTab(value ? tab : null);
  const needsAttention =
    reminders.length > 0 || household.expenses.some((expense) => expense.status !== "approved");

  const open = (name) => {
    setToolsOpen(false);
    dispatch(dialogOpened(name));
  };

  async function screenshot() {
    setToolsOpen(false);
    dispatch(toastShown("Preparing your screenshot…"));
    try {
      const blob = await captureElement(document.getElementById("capture"), {
        background: theme === "dark" ? "#14221e" : "#f7faf8",
      });
      await shareBlob(blob, "SplitWisee-snapshot.png", "Household overview");
    } catch (error) {
      if (error?.name !== "AbortError")
        dispatch(toastShown("Screenshot unavailable here. Use your device’s screenshot buttons instead."));
    }
  }

  return (
    <header
      className="topbar"
      onKeyDown={(event) => {
        if (event.key === "Escape" && toolsOpen) {
          setToolsOpen(false);
          event.currentTarget.querySelector(".member-menu-toggle")?.focus();
        }
      }}
    >
      <div className="mobile-brand">
        <Logo />
      </div>
      <button type="button" className="space-picker" onClick={() => dispatch(goToTab("people"))}>
        <span className="house-icon">
          <Icon name="home" />
        </span>
        <span>
          <strong>{household.name}</strong>
          <small>
            {activeMembers.length} active {activeMembers.length === 1 ? "member" : "members"}
          </small>
        </span>
      </button>
      <button
        type="button"
        className="btn outline member-menu-toggle"
        aria-controls="member-tools"
        aria-expanded={toolsOpen}
        onClick={() => setToolsOpen(!toolsOpen)}
      >
        {toolsOpen ? "Close menu" : "Menu"}
      </button>
      <div id="member-tools" className="tools" data-open={toolsOpen}>
        <AppViewSwitch />
        <button
          type="button"
          className="icon-btn"
          title="Calculator"
          aria-label="Open calculator"
          onClick={() => open("calculator")}
        >
          <Icon name="calc" />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Screenshot"
          aria-label="Save a screenshot"
          onClick={screenshot}
        >
          <Icon name="camera" />
        </button>
        <button
          type="button"
          className="icon-btn"
          title={theme === "dark" ? "Light mode" : "Dark mode"}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          onClick={() => dispatch(themeToggled())}
        >
          <Icon name={theme === "dark" ? "sun" : "moon"} />
        </button>
        <button
          type="button"
          className="icon-btn bell"
          title="Activity"
          aria-label={
            needsAttention ? "Activity and reminders (items need attention)" : "Activity and reminders"
          }
          onClick={() => open("activity")}
        >
          <Icon name="bell" />
          {needsAttention && <i />}
        </button>
        <ProfileMenu />
      </div>
    </header>
  );
}
