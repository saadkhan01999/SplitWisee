import { useDispatch, useSelector } from "react-redux";
import { appViewChanged, selectAppView } from "../../app/uiSlice.js";

/** Lets a desktop user preview the compact phone layout. Saved on this device. */
export function AppViewSwitch({ onMobile }) {
  const dispatch = useDispatch();
  const mobile = useSelector(selectAppView) === "mobile";
  return (
    <button
      type="button"
      className="btn outline small app-view-switch"
      aria-pressed={mobile}
      onClick={() => {
        dispatch(appViewChanged(mobile ? "auto" : "mobile"));
        if (!mobile) onMobile?.();
      }}
    >
      {mobile ? "Desktop view" : "Mobile app view"}
    </button>
  );
}
