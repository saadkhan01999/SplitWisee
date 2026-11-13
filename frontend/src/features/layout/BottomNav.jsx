import { useDispatch, useSelector } from "react-redux";
import { goToTab, selectRoute } from "../../app/navigationSlice.js";
import { dialogOpened } from "../../app/uiSlice.js";
import { Icon } from "../../components/Icon.jsx";
import { BOTTOM_NAV } from "./tabs.js";

const DIRECT = new Set(BOTTOM_NAV.map((item) => item.id));

/** Phone navigation bar: main sections, the central "Add expense" action and "More" for all other sections. */
export function BottomNav() {
  const dispatch = useDispatch();
  const { tab } = useSelector(selectRoute);

  const action = (id) => {
    if (id === "add") return dialogOpened("expense-new");
    if (id === "more") return dialogOpened("sections");
    return goToTab(id);
  };

  return (
    <nav className="bottom-nav" aria-label="Main">
      {BOTTOM_NAV.map(({ id, label }) => {
        const add = id === "add";
        const active = id === "more" ? !DIRECT.has(tab) : tab === id;
        return (
          <button
            key={id}
            type="button"
            className={[add && "add-nav", active && "active"].filter(Boolean).join(" ")}
            aria-current={active ? "page" : undefined}
            aria-label={add ? "Add expense" : id === "more" ? "More sections" : undefined}
            onClick={() => dispatch(action(id))}
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
