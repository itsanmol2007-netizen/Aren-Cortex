// The route gate. Every /app route renders through <RequireAuth> (an Outlet
// wrapper in main.tsx). Until the AuthProvider has a fully verified identity,
// nothing of the real app mounts — no page chrome, no data fetches, no
// "beautiful UI with empty data". While checking (bounded by GATE_TIMEOUT_MS)
// a neutral paper splash shows; on any failure the user lands on /login.

import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { homeRouteForRole } from "../../lib/auth";
import { ArenMark } from "./ArenMark";

export function RequireAuth() {
    const auth = useAuth();

    if (auth.status === "checking") return <GateScreen />;

    if (auth.status === "anon") {
        return <Navigate to="/login" replace state={auth.notice ? { notice: auth.notice } : undefined} />;
    }

    return <Outlet />;
}

// Role guard for workspace routes. Nest under RequireAuth as a layout route:
//
//   <Route element={<RequireRole allow={["reception"]} />}>
//     <Route path="/app/frontdesk" element={<FrontDeskPage />} />
//   </Route>
//
// Runs on every navigation (each route render), before the page element
// mounts — a wrong-role visit renders <Navigate/> instead of the page, so no
// layout and no data fetch of the wrong workspace ever starts. A valid,
// active user with the wrong role is sent to their OWN workspace, never to
// login; login redirects stay RequireAuth's job.
//
// Loop safety for roles outside `allow` lists entirely (future 'owner' /
// 'admin'): homeRouteForRole() places them in Cortex by design, so a role
// standing on its own home route is admitted even when not listed —
// otherwise it would bounce to where it already is, forever.
export function RequireRole({ allow }: { allow: string[] }) {
    const auth = useAuth();
    const location = useLocation();
    if (auth.status !== "authed") return null; // RequireAuth above owns anon/checking
    const role = auth.identity.user.role ?? "";
    const home = homeRouteForRole(role);
    if (!allow.includes(role) && home !== location.pathname) {
        return <Navigate to={home} replace />;
    }
    return <Outlet />;
}

// `/` and `/app` land here (inside RequireAuth): route by the verified role.
export function HomeRedirect() {
    const auth = useAuth();
    if (auth.status !== "authed") return null; // unreachable behind the gate
    return <Navigate to={homeRouteForRole(auth.identity.user.role)} replace />;
}

// The only thing a person may see between "app opened" and "session verified".
// Deliberately app-agnostic: paper, the mark, nothing else — it never leaks
// workspace UI and it cannot outlive the gate timeout.
function GateScreen() {
    return (
        <div
            aria-busy="true"
            style={{
                position: "fixed",
                inset: 0,
                display: "grid",
                placeItems: "center",
                background: "#fbfaf8",
                zIndex: 9999,
            }}
        >
            <style>{`
                @keyframes aren-gate-breath { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.7; } }
                .aren-gate-mark { animation: aren-gate-breath 2.4s ease-in-out infinite; }
                @media (prefers-reduced-motion: reduce) { .aren-gate-mark { animation: none; opacity: 0.5; } }
            `}</style>
            <div className="aren-gate-mark">
                <ArenMark size={44} ink="#6a6a63" accent="#6311d3" />
            </div>
        </div>
    );
}
