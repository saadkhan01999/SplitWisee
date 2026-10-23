import { useDispatch, useSelector } from "react-redux";
import { goToPage } from "../../app/navigationSlice.js";
import {
  dialogOpened,
  fontScaleChanged,
  selectFontScale,
  selectTheme,
  themeToggled,
  toastShown,
} from "../../app/uiSlice.js";
import { Avatar } from "../../components/Avatar.jsx";
import { Button } from "../../components/Button.jsx";
import { Field } from "../../components/Field.jsx";
import { Switch } from "../../components/Switch.jsx";
import { brand } from "../../config/brand.js";
import { jsonBlob, saveBlob } from "../../utils/downloads.js";
import { refreshHousehold, selectCurrentMember, selectHousehold } from "../household/householdSlice.js";
import { InstallAppButton } from "../install/InstallGuide.jsx";
import { AppViewSwitch } from "../preferences/AppViewSwitch.jsx";
import { selectUser, signOut } from "../session/sessionSlice.js";
import { HouseholdPreferences } from "./HouseholdPreferences.jsx";
import { ProfileSettings } from "./ProfileSettings.jsx";

export function SettingsPage() {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const member = useSelector(selectCurrentMember);
  const household = useSelector(selectHousehold);
  const theme = useSelector(selectTheme);
  const fontScale = useSelector(selectFontScale);

  async function run(action, success) {
    try {
      await dispatch(action).unwrap();
      if (success) dispatch(toastShown(success));
    } catch (failure) {
      dispatch(toastShown(failure.message || "That did not work. Please try again."));
    }
  }

  function exportHousehold() {
    saveBlob(
      jsonBlob({ format: "splitwisee-household-v1", exportedAt: new Date().toISOString(), household }),
      `SplitWisee-${household.name.replace(/[^a-z0-9]+/gi, "-")}-export.json`,
    );
  }

  return (
    <div className="content-grid">
      <section className="card">
        <h2>Your account</h2>
        <div className="member-row">
          <Avatar member={member ?? user} />
          <div className="grow">
            <strong>{user.name}</strong>
            <small>{user.email || user.phone}</small>
          </div>
        </div>
        <p className="caption">
          Account ID: <code>{user.id}</code>
        </p>
        <div className="actions wrap">
          <Button variant="outline" onClick={() => run(signOut())}>
            Sign out
          </Button>
          <Button variant="text" onClick={() => run(refreshHousehold(), "Household refreshed")}>
            Refresh household
          </Button>
          <Button variant="text" icon="help" onClick={() => dispatch(dialogOpened("support"))}>
            Contact support
          </Button>
        </div>
        <hr />
        <ProfileSettings />
        <hr />
        <h2>Appearance &amp; tools</h2>
        <Field label={`Text size: ${Math.round(fontScale * 100)}%`}>
          <input
            type="range"
            min="0.85"
            max="1.4"
            step="0.05"
            value={fontScale}
            onChange={(event) => dispatch(fontScaleChanged(Number(event.target.value)))}
          />
        </Field>
        <div className="row">
          <small>Smaller</small>
          <Button variant="text" onClick={() => dispatch(fontScaleChanged(1))}>
            Reset text size
          </Button>
          <small>Larger</small>
        </div>
        <p className="font-preview">A clear view of your shared spending.</p>
        <div className="setting-row">
          <span>Dark mode</span>
          <Switch checked={theme === "dark"} label="Dark mode" onChange={() => dispatch(themeToggled())} />
        </div>
        <div className="setting-row">
          <span>Layout on this device</span>
          <AppViewSwitch />
        </div>
        <div className="setting-row">
          <span>Install on your phone</span>
          <InstallAppButton className="btn text" onShowGuide={() => dispatch(dialogOpened("install"))} />
        </div>
        <div className="actions wrap">
          <Button variant="outline" icon="calc" onClick={() => dispatch(dialogOpened("calculator"))}>
            Calculator
          </Button>
          <Button variant="text" onClick={() => dispatch(goToPage("website"))}>
            Visit website
          </Button>
        </div>
      </section>

      <section className="card">
        <h2>Household preferences</h2>
        <HouseholdPreferences key={household.id} />
        <hr />
        <h2>Your data</h2>
        <p className="caption">
          Exports contain household records. Share them only with people who should see them.
        </p>
        <div className="actions wrap">
          <Button variant="outline" icon="download" onClick={exportHousehold}>
            Export household data
          </Button>
          <Button variant="text" onClick={() => dispatch(dialogOpened("activity"))}>
            Audit trail
          </Button>
        </div>
        <p className="caption">
          {brand.name} v{brand.version}. SplitWisee never connects to your bank or moves money.
        </p>
      </section>
    </div>
  );
}
