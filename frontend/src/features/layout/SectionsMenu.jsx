import { useDispatch, useSelector } from "react-redux";
import { goToTab, selectRoute } from "../../app/navigationSlice.js";
import { Icon } from "../../components/Icon.jsx";
import { selectUser } from "../session/sessionSlice.js";
import { TABS } from "./tabs.js";

/** Every app section, reachable on phones from "More" (the sidebar is hidden on small screens). */
export function SectionsMenu({ onClose }) {
  const dispatch = useDispatch();
  const { tab } = useSelector(selectRoute);
  const user = useSelector(selectUser);

  return (
    <nav className="sections-menu" aria-label="All sections">
      {TABS.map(({ id, label, intro }) => (
        <button
          key={id}
          type="button"
          className={tab === id ? "active" : ""}
          aria-current={tab === id ? "page" : undefined}
          onClick={() => {
            dispatch(goToTab(id));
            onClose();
          }}
        >
          <Icon name={id} />
          <span>
            <strong>{label}</strong>
            <small>{intro}</small>
          </span>
        </button>
      ))}
      {user?.operator && (
        <a href="/admin/">
          <Icon name="shield" />
          <span>
            <strong>Superadmin</strong>
            <small>Platform statistics, website campaigns and audits.</small>
          </span>
        </a>
      )}
    </nav>
  );
}
