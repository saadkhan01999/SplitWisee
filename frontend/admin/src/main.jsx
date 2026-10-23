import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { setUnauthorizedHandler } from "../../src/api/client.js";
import { checkSession, sessionExpired } from "../../src/features/session/sessionSlice.js";
import "../../src/styles/app.css";
import "../../src/styles/responsive.css";
import { AdminApp } from "./AdminApp.jsx";
import { createAdminStore } from "./store.js";

const store = createAdminStore();
setUnauthorizedHandler(() => store.dispatch(sessionExpired()));
store.dispatch(checkSession());

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Provider store={store}>
      <AdminApp />
    </Provider>
  </StrictMode>,
);
