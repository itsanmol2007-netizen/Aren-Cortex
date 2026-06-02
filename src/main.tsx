import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import './styles.css'
import "./styles/base.css"
import "./styles/layout.css"
import "./styles/components-base.css"
import "./styles/components-medicines.css"
import "./styles/components-picks.css"
import "./styles/components-bar.css"
import "./styles/components-panels.css"
import "./styles/components-modals.css"
import "./styles/past-visit.css"
import "./features/sidebar/sidebar.css"
import "./styles/workspace-header.css"
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);