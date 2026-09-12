import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { initPWA } from "./pwa";
import { initInstallPrompt } from "./lib/pwa/installPrompt";
import { installSessionTrace } from "./lib/diagnostics/sessionTrace";
import { initConnectivityClock } from "./lib/offline/connectivityClock";
import { initWriteQueue } from "./lib/offline/writeQueue";
import { initIdleLock } from "./lib/security/idleTimer";
import { FrontDeskPage } from "./features/frontdesk/FrontDeskPage";
import { PatientsPage } from "./features/frontdesk/PatientsPage";
import { PrintRxPage } from "./features/frontdesk/PrintRxPage";
import { ClinicStatusPage } from "./features/frontdesk/ClinicStatusPage";
import { AuthProvider } from "./features/auth/AuthProvider";
import { AppLockGate } from "./components/AppLockGate";
import { RequireAuth, RequireRole, HomeRedirect } from "./features/auth/RequireAuth";
import { AdminShell } from "./features/admin/AdminShell";
import { OverviewPage } from "./features/admin/pages/OverviewPage";
import { ReportsPage } from "./features/admin/pages/ReportsPage";
import { PeoplePage } from "./features/admin/pages/PeoplePage";
import { MoneyPage } from "./features/admin/pages/MoneyPage";
import { CataloguePage } from "./features/admin/pages/CataloguePage";
import { ClinicSettingsPage } from "./features/admin/pages/ClinicSettingsPage";
import { PlanPage } from "./features/admin/pages/PlanPage";
import { LoginPage } from "./features/auth/LoginPage";
import { WelcomePage } from "./features/auth/WelcomePage";
import { AuthLayout } from "./features/auth/AuthLayout";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

import "./styles.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components-base.css";
import "./styles/components-panels.css";
import "./styles/components-modals.css";
import "./styles/past-visit.css";
import "./styles/workspace-header.css";
import "./styles/workspace.css";
import "./styles/consult.css";
import "./features/sidebar/sidebar.css";

const queryClient = new QueryClient();

// Inside the router so the boundary can reset itself on navigation (see
// AppErrorBoundary's `resetKey`) — a screen that threw shouldn't trap the
// user there once they've navigated away.
function RoutedApp() {
  const location = useLocation();
  return (
    <AppErrorBoundary resetKey={location.pathname}>
      <AuthProvider>
        <AppLockGate>
        <Routes>
            {/* The marketing-style welcome screen at the index, the actual
                credential form one level down — see AuthLayout.tsx for why
                they share one element instead of each owning their own
                background. A cold, unauthenticated visit (RequireAuth's own
                redirect below) lands on the welcome screen; a returning
                visit that has something specific to say (device revoked,
                session lost) skips straight to /login/signin instead. */}
            <Route path="/login" element={<AuthLayout />}>
              <Route index element={<WelcomePage />} />
              <Route path="signin" element={<LoginPage />} />
            </Route>
            {/* Everything else — every workspace, every future route — sits
                behind the auth gate. No verified session + active user +
                active hospital ⇒ nothing renders but the login screen. */}
            <Route element={<RequireAuth />}>
              {/* Role guards run on every navigation, before any page
                  mounts: wrong role → own workspace, never a flash of the
                  other side. Add future role-specific routes under the
                  matching RequireRole (or a new one). */}
              <Route element={<RequireRole allow={["doctor"]} />}>
                <Route path="/app/cortex" element={<App />} />
              </Route>
              <Route element={<RequireRole allow={["reception"]} />}>
                <Route path="/app/frontdesk" element={<FrontDeskPage />} />
                <Route path="/app/patients" element={<PatientsPage />} />
                <Route path="/app/printrx" element={<PrintRxPage />} />
                <Route path="/app/clinicstatus" element={<ClinicStatusPage />} />
              </Route>
              {/* The clinic owner's workspace — its own route, NOT a page in
                  the clinical sidebar: "how is my clinic performing" is a
                  different job from consulting, even when it is the same human.
                  'doctor' is in the allow list because every clinic on the
                  platform today is owner-operated (one doctor, one
                  receptionist, verified live) — a doctor IS the owner here. It
                  comes back out the moment real 'owner' accounts exist and a
                  junior doctor should not be reading clinic-wide money. */}
              <Route element={<RequireRole allow={["admin", "owner", "doctor"]} />}>
                <Route path="/app/admin" element={<AdminShell />}>
                  <Route index element={<OverviewPage />} />
                  <Route path="reports" element={<ReportsPage />} />
                  <Route path="people" element={<PeoplePage />} />
                  <Route path="money" element={<MoneyPage />} />
                  <Route path="catalogue" element={<CataloguePage />} />
                  <Route path="clinic" element={<ClinicSettingsPage />} />
                  <Route path="plan" element={<PlanPage />} />
                </Route>
              </Route>
              <Route path="/app" element={<HomeRedirect />} />
              <Route path="/" element={<HomeRedirect />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </AppLockGate>
        </AuthProvider>
      </AppErrorBoundary>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <RoutedApp />
      </BrowserRouter>
      <Toaster position="bottom-right" richColors />
    </QueryClientProvider>
  </StrictMode>
);

// Service worker + "new version" prompt. After render so a slow registration
// never delays first paint.

// Before anything else renders: a crash during the first paint is exactly
// the one a support request most needs to carry. See sessionTrace.ts.
installSessionTrace();
initPWA();
initInstallPrompt();
// The offline foundation: the "when did we last really hear from the
// server" clock, and the durable write queue that replays anything queued
// while disconnected. Both are pure background wiring — neither blocks or
// delays first paint above.
initConnectivityClock();
initWriteQueue();
initIdleLock();