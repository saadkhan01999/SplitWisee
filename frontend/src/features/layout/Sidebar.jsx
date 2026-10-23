import { useDispatch, useSelector } from "react-redux";
import { goToTab, selectRoute } from "../../app/navigationSlice.js";
import { Avatar } from "../../components/Avatar.jsx";
import { Icon } from "../../components/Icon.jsx";
import { Logo } from "../../components/Logo.jsx";
import { selectCurrentMember, selectHousehold } from "../household/householdSlice.js";
import { TABS } from "./tabs.js";

export function Sidebar() {
  const dispatch = useDispatch();
  const { tab } = useSelector(selectRoute);
  const household = useSelector(selectHousehold);
  const member = useSelector(selectCurrentMember);

  return (
    <aside className="sidebar">
      <Logo />
      <span className="eyebrow nav-label">YOUR HOUSEHOLD</span>
      <nav aria-label="Household sections">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "active" : ""}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => dispatch(goToTab(id))}
          >
            <Icon name={id} />
            {label}
            {id === "expenses" && <span className="nav-count">{household.expenses.length}</span>}
          </button>
        ))}
      </nav>
      <div className="sidebar-note">
        <Icon name="leaf" />
        <strong>
          A little clarity.
          <br />A happier home.
        </strong>
        <p>Every penny accounted for, together.</p>
      </div>
      <button type="button" className="profile" onClick={() => dispatch(goToTab("settings"))}>
        <Avatar member={member} />
        <span>
          <strong>{member?.name}</strong>
          <small>{member?.role}</small>
        </span>
        <Icon name="settings" size={17} />
      </button>
    </aside>
  );
}
