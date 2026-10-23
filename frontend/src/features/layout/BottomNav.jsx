import { useDispatch, useSelector } from "react-redux";
import { goToTab, selectRoute } from "../../app/navigationSlice.js";
import { dialogOpened } from "../../app/uiSlice.js";
import { Icon } from "../../components/Icon.jsx";
import { BOTTOM_NAV } from "./tabs.js";

/** Phone navigation bar with the central "Add expense" action. */
export function BottomNav() {
  const dispatch = useDispatch();
  const { tab } = useSelector(selectRoute);

  return (
    <nav className="bottom-nav" aria-label="Main">
      {BOTTOM_NAV.map(({ id, label }) => {
        const add = id === "add";
        return (
          <button
            key={id}
            type="button"
            className={[add && "add-nav", tab === id && "active"].filter(Boolean).join(" ")}
            aria-current={tab === id ? "page" : undefined}
            aria-label={add ? "Add expense" : undefined}
            onClick={() => dispatch(add ? dialogOpened("expense-new") : goToTab(id))}
          >
            <span>
              <Icon name={add ? "plus" : id} />
            </span>
            {label}
          </button>
        );
      })}
    </nav>
  );
}
