import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App";
import { FrontDeskPage } from "./features/frontdesk/FrontDeskPage";
import { PatientsPage } from "./features/frontdesk/PatientsPage";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

import "./styles.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components-base.css";
import "./styles/components-medicines.css";
import "./styles/components-picks.css";
import "./styles/components-bar.css";
import "./styles/components-panels.css";
import "./styles/components-modals.css";
import "./styles/past-visit.css";
import "./styles/workspace-header.css";
import "./features/sidebar/sidebar.css";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/app/cortex" element={<App />} />
          <Route path="/app/frontdesk" element={<FrontDeskPage />} />
          <Route path="/app/patients" element={<PatientsPage />} />
          <Route path="/app" element={<Navigate to="/app/cortex" replace />} />
          <Route path="/" element={<Navigate to="/app/cortex" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="bottom-right" richColors />
    </QueryClientProvider>
  </StrictMode>
);