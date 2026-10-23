import { useEffect } from "react";
import { useSelector } from "react-redux";
import { selectAppView, selectFontScale, selectTheme } from "./uiSlice.js";

/** Mirrors display preferences onto <html> so the stylesheets can use them. */
export function useDocumentPreferences() {
  const theme = useSelector(selectTheme);
  const fontScale = useSelector(selectFontScale);
  const appView = useSelector(selectAppView);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.appView = appView;
    root.style.setProperty("--font-scale", String(fontScale));
  }, [theme, fontScale, appView]);
}
