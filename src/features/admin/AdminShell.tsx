// ---------------------------------------------------------------------------
// AREN PARALLAX — the admin suite's shell.
//
// Anmol, 2026-09-04: "there will be a dedicated page for admin /admin. And
// there, a proper sidebar, like consult or cortex, where there would be a
// couple of pages... it would be like an admin computer. A full admin suite."
//
// ── The rail, and the correction that produced it
//
// This began as a permanently-expanded 208px column and was rightly called out
// for eating horizontal space on every page — "why is the sidebar always
// stretched out, taking that much horizontal space always". It is now the SAME
// collapsible rail Front Desk uses (`frontdesk/components/NavRail.tsx`): a slim
// icon column at rest, expanding to full labels when the AREN logo is clicked,
// folding back on any click outside it.
//
// One continuous transformation, copied from that file deliberately rather
// than reinvented: the container's width interpolates, icons stay anchored by
// a fixed left padding, labels fade and slide 8px in beside them. No element
// ever jumps, and the two rails in this product animate identically.
//
// The choice persists in localStorage — a preference about chrome should
// survive a reload.
//
// ── Two kinds of person stand here
//
//   A dedicated admin — signs in and lands here. This IS their app.
//   An owner-doctor   — arrives through the door on their Clinic Control page,
//                       on their own session, and needs a way back.
//
// The footer renders one or the other, never both. See `useAdminAccess`.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
    BookOpen, Building2, ChevronLeft, CreditCard, LayoutDashboard, LogOut,
    Table2, Users, Wallet,
} from "lucide-react";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { useAuth } from "../auth/AuthProvider";
import { useLogout } from "../auth/useLogout";
import { useAdminAccess } from "../../hooks/useAdminAccess";
import { ADMIN_BRAND } from "../../lib/workspace/mode";

const NAV_STORAGE_KEY = "aren.parallax.nav";
const RAIL_W = 58;
const RAIL_W_OPEN = 206;

interface NavEntry {
    to: string;
    label: string;
    icon: ReactNode;
    tone: "blue" | "indigo" | "slate";
    /** `end` on the index route only, or every child would light it up too. */
    end?: boolean;
}

const NAV: NavEntry[] = [
    { to: "/app/admin", label: "Overview", icon: <LayoutDashboard size={15} />, tone: "blue", end: true },
    { to: "/app/admin/reports", label: "Reports", icon: <Table2 size={15} />, tone: "blue" },
    { to: "/app/admin/people", label: "People & Benches", icon: <Users size={15} />, tone: "blue" },
    { to: "/app/admin/money", label: "Money", icon: <Wallet size={15} />, tone: "indigo" },
    { to: "/app/admin/catalogue", label: "Catalogue", icon: <BookOpen size={15} />, tone: "indigo" },
    { to: "/app/admin/clinic", label: "Clinic", icon: <Building2 size={15} />, tone: "indigo" },
    { to: "/app/admin/plan", label: "Plan", icon: <CreditCard size={15} />, tone: "slate" },
];

const BADGE = {
    blue: "bg-[var(--cs-blue-soft)] text-[var(--cs-blue)]",
    indigo: "bg-[#eef2ff] text-[#4338ca]",
    slate: "bg-[#f1f5f9] text-[#475569]",
} as const;

/** Fades and slides in beside its icon while the rail width interpolates, and
 *  collapses without reflowing the icon. Same component NavRail uses. */
function NavLabel({ expanded, children }: { expanded: boolean; children: ReactNode }) {
    return (
        <span
            aria-hidden={!expanded}
            className="flex min-w-0 flex-1 items-center whitespace-nowrap transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none"
            style={{ opacity: expanded ? 1 : 0, transform: expanded ? "translateX(0)" : "translateX(-8px)" }}
        >
            {children}
        </span>
    );
}

export function AdminShell() {
    const auth = useAuth();
    const logout = useLogout();
    const navigate = useNavigate();
    const access = useAdminAccess();
    const logoRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;
    const railRef = useRef<HTMLElement>(null);

    const [expanded, setExpanded] = useState(() => {
        try { return localStorage.getItem(NAV_STORAGE_KEY) === "1"; } catch { return false; }
    });

    useEffect(() => {
        try { localStorage.setItem(NAV_STORAGE_KEY, expanded ? "1" : "0"); } catch { /* private mode */ }
    }, [expanded]);

    // Expanded is a temporary mode: a click that is neither the rail nor the
    // logo that opened it folds it back, so the wide state never outlives the
    // moment someone actually needed to read a label.
    useEffect(() => {
        if (!expanded) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as HTMLElement | null;
            if (!t) return;
            if (railRef.current?.contains(t)) return;
            if (t.closest?.(".ws-logo-pill")) return; // the toggle itself
            setExpanded(false);
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [expanded]);

    const clinicName = auth.status === "authed" ? auth.identity.hospital.name : null;
    const personName = auth.status === "authed" ? auth.identity.user.full_name : null;
    const isVisitingDoctor = access.access === "embedded";

    return (
        <div className="flex h-screen flex-col overflow-hidden bg-[var(--cs-page)]">
            <div className="shrink-0">
                <WorkspaceHeader
                    logoRef={logoRef}
                    onOpenSidebar={() => setExpanded((v) => !v)}
                    brand={ADMIN_BRAND}
                    title={clinicName ?? "Clinic"}
                    subtitle={access.shape}
                />
            </div>

            <div className="flex min-h-0 flex-1">
                <nav
                    ref={railRef}
                    aria-label={`AREN ${ADMIN_BRAND.product}`}
                    className="relative z-10 flex h-full shrink-0 flex-col overflow-y-auto overflow-x-hidden border-r border-[var(--cs-line)] bg-[var(--cs-card)] pb-[12px] pt-[14px] transition-[width] duration-200 ease-out motion-reduce:transition-none max-[760px]:hidden"
                    style={{ width: expanded ? RAIL_W_OPEN : RAIL_W }}
                >
                    <div className="flex flex-col gap-[3px] px-[9px]">
                        {NAV.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.end}
                                /* Collapsed, the rail is icons only — the title
                                   attribute IS the label, or the nav becomes
                                   seven unexplained glyphs. */
                                title={expanded ? undefined : item.label}
                                className={({ isActive }) =>
                                    "flex h-[38px] items-center gap-[10px] overflow-hidden rounded-[9px] px-[8px] text-left no-underline transition-colors outline-none " +
                                    "focus-visible:shadow-[0_0_0_3px_var(--cs-blue-soft)] " +
                                    (isActive ? "bg-[var(--cs-page)]" : "hover:bg-[var(--cs-page)]")
                                }
                            >
                                {({ isActive }) => (
                                    <>
                                        <span className={`grid h-[26px] w-[26px] flex-none place-items-center rounded-[8px] ${BADGE[item.tone]}`}>
                                            {item.icon}
                                        </span>
                                        <NavLabel expanded={expanded}>
                                            <span className={`text-[12.5px] ${isActive ? "font-bold text-[var(--cs-ink)]" : "font-semibold text-[var(--cs-muted)]"}`}>
                                                {item.label}
                                            </span>
                                        </NavLabel>
                                    </>
                                )}
                            </NavLink>
                        ))}
                    </div>

                    <div className="mt-auto px-[9px]">
                        <div className="mb-[10px] h-px bg-[var(--cs-line)]" />
                        {isVisitingDoctor ? (
                            /* An owner-doctor is a GUEST here. Their exit is
                               back to the consultation workspace, not a sign
                               out — ending their clinical session to leave a
                               two-minute visit would be hostile. */
                            <button
                                type="button"
                                title={expanded ? undefined : "Back to my workspace"}
                                onClick={() => navigate("/app/cortex")}
                                className="flex h-[38px] w-full cursor-pointer items-center gap-[10px] overflow-hidden rounded-[9px] border-0 bg-transparent px-[8px] text-left transition-colors hover:bg-[var(--cs-page)]"
                            >
                                <span className="grid h-[26px] w-[26px] flex-none place-items-center rounded-[8px] bg-[#f1f5f9] text-[#475569]">
                                    <ChevronLeft size={15} />
                                </span>
                                <NavLabel expanded={expanded}>
                                    <span className="text-[12px] font-semibold text-[var(--cs-muted)]">Back to my workspace</span>
                                </NavLabel>
                            </button>
                        ) : (
                            <>
                                <div className="flex h-[38px] items-center gap-[10px] overflow-hidden rounded-[9px] px-[8px]">
                                    <span className="grid h-[26px] w-[26px] flex-none place-items-center rounded-[8px] bg-[var(--cs-violet-soft)] text-[11px] font-bold text-[var(--cs-violet)]">
                                        {(personName ?? "A").trim().charAt(0).toUpperCase()}
                                    </span>
                                    <NavLabel expanded={expanded}>
                                        <span className="flex min-w-0 flex-col">
                                            <span className="truncate text-[12px] font-semibold text-[var(--cs-ink)]">{personName ?? "Signed in"}</span>
                                            <span className="text-[10px] text-[var(--cs-faint)]">Administrator</span>
                                        </span>
                                    </NavLabel>
                                </div>
                                <button
                                    type="button"
                                    title={expanded ? undefined : "Sign out"}
                                    onClick={() => void logout()}
                                    className="flex h-[34px] w-full cursor-pointer items-center gap-[10px] overflow-hidden rounded-[9px] border-0 bg-transparent px-[8px] text-left text-[var(--cs-faint)] transition-colors hover:text-[var(--cs-red)]"
                                >
                                    <span className="grid h-[26px] w-[26px] flex-none place-items-center"><LogOut size={14} /></span>
                                    <NavLabel expanded={expanded}>
                                        <span className="text-[11.5px] font-semibold">Sign out</span>
                                    </NavLabel>
                                </button>
                            </>
                        )}
                    </div>
                </nav>

                {/* `min-w-0` is load-bearing: without it a wide table inside a
                    flex child refuses to shrink and pushes the whole page into
                    a horizontal scroll instead of scrolling itself. */}
                <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
