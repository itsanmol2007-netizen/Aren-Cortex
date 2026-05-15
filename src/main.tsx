import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/base.css"
import "./styles/layout.css"
import "./styles/components-base.css"
import "./styles/components-panels.css"
import "./styles/components-modals.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
