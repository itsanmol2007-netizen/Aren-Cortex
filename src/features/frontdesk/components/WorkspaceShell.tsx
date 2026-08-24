import { useEffect, useRef, useState } from "react";
import { Globe, ChevronDown, Check, Clock, UserRound } from "lucide-react";
import { NavRail } from "./NavRail";
import { OperationalBanner } from "./OperationalBanner";
import { FrontDeskStyles } from "./FrontDeskStyles";
import { useConnectivityLog } from "../operational/eventLog";
import { initials } from "../utils";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n, useT } from "../i18n/i18n";
import { LANGS } from "../i18n/strings";
import arenLogo from "@/assets/aren-logo.png";

const NAV_STORAGE_KEY = "aren.frontdesk.nav";

// The shared chrome of the reception workspace (extracted from FrontDeskPage
// in s39 when Patients arrived): ink header band, collapsible navigation
// rail, dawn-residue paper background, and the fd-* style counterweight.
// Every reception page renders inside this shell so moving between Front
// Desk and Patients feels like walking between rooms of one building, not
// switching applications. Pages own their content, data and modals; the
// shell owns identity, time and navigation.
export function WorkspaceShell({ children }: { children: React.ReactNode }) {
    const [now, setNow] = useState(() => new Date());
    const [navOpen, setNavOpen] = useState(() => localStorage.getItem(NAV_STORAGE_KEY) === "1");

    // The real signed-in person — replaces the old hardcoded "RS" placeholder
    // in the header and the nav rail. Empty when the name is missing; the
    // consuming components fall back to a neutral label/icon.
    const auth = useAuth();
    const identity = auth.status === "authed" ? auth.identity : null;
    const userName = identity?.user.full_name?.trim() ?? "";
    const userInitials = userName ? initials(userName) : "";

    // The clinic name comes off the verified identity, not a fetch. AuthProvider
    // has already loaded and activity-checked this `hospitals` row during the
    // gate, so re-fetching it by a hardcoded id was both a redundant round trip
    // and the reason the header could name a different clinic than the data
    // below it belonged to.
    const hospitalName = identity?.hospital.name?.trim() || null;

    // Write the real connectivity history (session start / offline / online)
    // to the local event log. Mounted once here so it covers every page.
    useConnectivityLog();

    const toggleNav = () => {
        setNavOpen((open) => {
            localStorage.setItem(NAV_STORAGE_KEY, open ? "0" : "1");
            return !open;
        });
    };

    // The expanded drawer is a temporary mode: clicking anywhere outside it
    // (or its logo toggle — both carry data-nav-keep) folds it back to the
    // slim rail. Escape-like behavior for the pointer.
    useEffect(() => {
        if (!navOpen) return;
        const onDown = (e: MouseEvent) => {
            if ((e.target as HTMLElement).closest?.("[data-nav-keep]")) return;
            localStorage.setItem(NAV_STORAGE_KEY, "0");
            setNavOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [navOpen]);

    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 20000);
        return () => clearInterval(t);
    }, []);

    return (
        <div
            className="flex h-dvh flex-col overflow-hidden bg-[#f4f4f8] font-[Inter,system-ui,sans-serif] text-[#161d29]"
            style={{
                // Dawn residue (§3.4): three faint washes bleeding down from the
                // horizon, over the ratified dot grid. Static, near-invisible.
                backgroundImage:
                    "radial-gradient(900px 240px at 12% 0%, rgba(139,92,246,0.05), transparent 70%)," +
                    "radial-gradient(760px 220px at 55% 0%, rgba(244,114,182,0.04), transparent 70%)," +
                    "radial-gradient(640px 200px at 92% 0%, rgba(242,169,134,0.05), transparent 70%)," +
                    "radial-gradient(rgba(20,30,50,0.045) 1px, transparent 1px)",
                backgroundSize: "auto, auto, auto, 22px 22px",
                backgroundRepeat: "no-repeat, no-repeat, no-repeat, repeat",
            }}
        >
            <FrontDeskStyles />
            <Header
                hospitalName={hospitalName}
                now={now}
                navOpen={navOpen}
                onToggleNav={toggleNav}
                userName={userName}
                userInitials={userInitials}
            />
            {/* Proactive operational voice: a slim band that speaks up when
                connectivity (or, later, another operational signal) changes —
                spans every reception page, clears itself on recovery. */}
            <OperationalBanner />
            {/* The rail and the workspace share a flex row: as the rail's width
                interpolates the content shifts right naturally — one continuous
                transformation, not a drawer sliding on top. */}
            <div className="flex min-h-0 flex-1 items-stretch overflow-hidden">
                <NavRail expanded={navOpen} userName={userName} userInitials={userInitials} />
                <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
            </div>
        </div>
    );
}

function Header({
    hospitalName,
    now,
    navOpen,
    onToggleNav,
    userName,
    userInitials,
}: {
    hospitalName: string | null;
    now: Date;
    navOpen: boolean;
    onToggleNav: () => void;
    userName: string;
    userInitials: string;
}) {
    const t = useT();
    const time = now.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
    const date = now.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });

    // Two-tone wordmark (§3.3): "AREN" white / rest dawn pink. appTitle is the
    // same string in every language, so splitting on the first space is stable.
    const title = t("appTitle");
    const [brandWord, ...productWords] = title.split(" ");

    return (
        <header
            className="relative shrink-0"
            style={{
                // The ink band (§3.1): Cortex's exact ink, warmed by dawn
                // atmospherics (apricot / pink / violet instead of pink / violet
                // / indigo). Same sky, different hour.
                background:
                    "radial-gradient(ellipse 340px 150px at 15% -30%, rgba(242,169,134,0.12), transparent 70%)," +
                    "radial-gradient(ellipse 420px 200px at 55% 130%, rgba(244,114,182,0.10), transparent 65%)," +
                    "radial-gradient(ellipse 280px 160px at 90% -15%, rgba(139,92,246,0.10), transparent 60%)," +
                    "linear-gradient(135deg, #0d1b35 0%, #120f28 38%, #170d27 62%, #0b1525 100%)",
                boxShadow: "0 4px 28px rgba(8,16,44,0.28), 0 6px 40px rgba(139,92,246,0.05)",
            }}
        >
            {/* The same nebula that hangs over Cortex's header — the two
                workspaces share one sky (V3 reference). Kept faint so the dawn
                radials still read as the dominant weather. */}
            <img
                src="/aren-nebula.svg"
                aria-hidden="true"
                alt=""
                className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover opacity-45"
            />

            {/* Full-bleed (not centered): the brand mark anchors the top-left
                corner, exactly above the navigation rail it toggles. */}
            <div className="relative z-10 flex items-center gap-[16px] py-[13px] pl-4 pr-6">
                <div className="flex shrink-0 items-center gap-[11px]">
                    {/* The permanent application mark — clicking it grows the rail
                        into the sidebar (same logo-as-menu language as Cortex). */}
                    <button
                        type="button"
                        data-nav-keep
                        onClick={onToggleNav}
                        aria-expanded={navOpen}
                        aria-label={t("navToggle")}
                        title={t("navToggle")}
                        className="group flex h-[38px] w-[38px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-[rgba(139,92,246,0.42)] shadow-[0_0_12px_rgba(139,92,246,0.30)] transition-shadow duration-150 hover:shadow-[0_0_18px_rgba(139,92,246,0.55)] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(99,102,241,0.5)]"
                    >
                        <img src={arenLogo} alt="AREN" className="h-full w-full object-cover transition-transform duration-150 group-hover:scale-[1.06] motion-reduce:transition-none" />
                    </button>
                    <div>
                        <div className="font-[Manrope,sans-serif] text-[15px] font-extrabold leading-[1.1] tracking-[-0.01em]">
                            <span className="text-white">{brandWord}</span>
                            {productWords.length > 0 && <span className="text-[#f0abc8]"> {productWords.join(" ")}</span>}
                        </div>
                        <div className="mt-[1px] text-[11px] font-medium text-[rgba(199,195,224,0.62)]">{t("appSub")}</div>
                    </div>
                </div>

                <div className="flex-1" />

                <div className="flex shrink-0 items-center gap-[13px]">
                    <div className="whitespace-nowrap text-[14px] font-bold tracking-[-0.01em] text-white">{hospitalName ?? "Clinic"}</div>
                    <div className="h-6 w-px bg-white/10" />
                    <div className="flex items-center gap-[6px] whitespace-nowrap text-[12px] font-medium text-white/55">
                        <Clock size={13} strokeWidth={2} />
                        <span>{date}</span>
                        <span className="text-white/30">·</span>
                        <span className="tabular-nums">{time}</span>
                    </div>
                    <div className="h-6 w-px bg-white/10" />
                    <LanguageDropdown />
                    <div
                        title={userName || t("navUser")}
                        className="flex h-[33px] min-w-[33px] shrink-0 items-center justify-center rounded-[9px] bg-[rgba(99,102,241,0.28)] px-[7px] text-[12px] font-bold text-[#c7d2fe]"
                    >
                        {userInitials || <UserRound size={15} strokeWidth={2.2} />}
                    </div>
                </div>
            </div>

            {/* The dawn thread at the horizon (§3.2): dawn breaks *under* the
                night — Cortex wears the same thread as a crown on top. */}
            <div
                className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px]"
                style={{
                    background: "linear-gradient(90deg, #f2a986 0%, #f472b6 32%, #a855f7 68%, #6366f1 100%)",
                    boxShadow: "0 1px 10px rgba(168,85,247,0.45), 0 2px 20px rgba(244,114,182,0.18)",
                }}
            />
        </header>
    );
}

function LanguageDropdown() {
    const { lang, setLang, t } = useI18n();
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDocClick = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDocClick);
        return () => document.removeEventListener("mousedown", onDocClick);
    }, [open]);

    const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];

    return (
        <div ref={wrapRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex h-[32px] items-center gap-[6px] rounded-[8px] border border-white/15 bg-transparent px-[10px] text-[12px] font-semibold text-[#c7c3e0] transition-colors hover:border-white/30 hover:bg-white/5 focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(99,102,241,0.28)]"
            >
                <Globe size={12.5} className="text-[#8f8bb0]" />
                {t(current.labelKey)}
                <ChevronDown size={12} className={`text-white/40 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>

            {open && (
                <div className="absolute right-0 top-[40px] z-[80] min-w-[168px] rounded-[9px] border border-[#e4e7ee] bg-white p-[5px] shadow-[0_24px_60px_rgba(16,24,40,0.24)]">
                    {LANGS.map((l) => {
                        const active = l.code === lang;
                        return (
                            <button
                                key={l.code}
                                type="button"
                                disabled={l.soon}
                                onClick={() => {
                                    if (l.soon) return;
                                    setLang(l.code);
                                    setOpen(false);
                                }}
                                className={`flex w-full items-center gap-2 rounded-[7px] px-[11px] py-[9px] text-left text-[13px] font-medium transition-colors ${
                                    l.soon
                                        ? "cursor-default text-[#c4c9d3]"
                                        : active
                                          ? "bg-[rgba(47,107,237,0.055)] text-[#1d51c9]"
                                          : "text-[#5a6472] hover:bg-[#f5f6f9] hover:text-[#161d29]"
                                }`}
                            >
                                <span className="flex-1">{t(l.labelKey)}</span>
                                {l.soon && (
                                    <span className="rounded-[5px] border border-[#eef0f5] bg-[#f5f6f9] px-[6px] py-[1px] text-[10px] font-semibold text-[#a8aeba]">
                                        {t("langSoon")}
                                    </span>
                                )}
                                {active && !l.soon && <Check size={14} className="text-[#1d51c9]" />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
