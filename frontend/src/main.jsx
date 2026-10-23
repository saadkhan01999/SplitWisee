import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { setUnauthorizedHandler } from "./api/client.js";
import { App } from "./app/App.jsx";
import { startApp } from "./app/bootstrap.js";
import { takeLaunchParams } from "./app/launchParams.js";
import { createStore } from "./app/store.js";
import { listenForInstallPrompt } from "./features/install/installPrompt.js";
import { registerServiceWorker } from "./features/install/serviceWorker.js";
import { sessionExpired } from "./features/session/sessionSlice.js";
import "./styles/app.css";
import "./styles/responsive.css";
import "./styles/calculator.css";

const store = createStore();
setUnauthorizedHandler(() => store.dispatch(sessionExpired()));
listenForInstallPrompt();
registerServiceWorker();
store.dispatch(startApp(takeLaunchParams()));

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
);
