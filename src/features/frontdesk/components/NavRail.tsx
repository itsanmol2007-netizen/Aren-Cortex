import { useNavigate, useLocation } from "react-router-dom";
import { ConciergeBell, BookUser, Printer, Settings, type LucideIcon } from "lucide-react";
import { useT } from "../i18n/i18n";
import type { StringKey } from "../i18n/strings";

// ── Navigation registry ────────────────────────────────────────────────────
// Adding a future page = add one entry here (+ its route in src/main.tsx and
// its label in i18n/strings.ts) and flip `soon` off. Nothing else in the rail
// — geometry, animation, active state — needs touching. A future global
// shortcut registry can also read this list to bind keys per destination.
type NavItem = {
    labelKey: StringKey;
    icon: LucideIcon;
    path: string;
    soon?: boolean;
};

const NAV_ITEMS: NavItem[] = [
    { labelKey: "navFrontDesk", icon: ConciergeBell, path: "/app/frontdesk" },
    { labelKey: "navPatients", icon: BookUser, path: "/app/patients" },
    { labelKey: "navPrintRx", icon: Printer, path: "/app/printrx", soon: true },
    { labelKey: "navSettings", icon: Settings, path: "/app/settings", soon: true },
];

const RAIL_W = 68;
const SIDEBAR_W = 228;

// The collapsible navigation rail. Collapsed it is a slim icon column; the
// AREN logo in the header toggles it into a full sidebar. One continuous
// transformation (§ future-nav): the container's width interpolates, icons
// stay anchored (fixed left padding), labels fade + slide in beside them, and
// the active pill stretches with the container — no element ever jumps.
// Width/opacity/translate only, 200ms ease-out, GPU-friendly.
export function NavRail({ expanded }: { expanded: boolean }) {
    const t = useT();
    const navigate = useNavigate();
    const { pathname } = useLocation();

    return (
        <nav
            aria-label={t("appTitle")}
            data-nav-keep
            className="relative z-10 flex shrink-0 flex-col overflow-hidden border-r border-[#e7e9f0] bg-white pb-4 pt-6 transition-[width] duration-200 ease-out motion-reduce:transition-none"
            style={{ width: expanded ? SIDEBAR_W : RAIL_W }}
        >
            <div className="flex flex-col gap-[6px] px-3">
                {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = pathname.startsWith(item.path);
                    const label = t(item.labelKey);
                    return (
                        <button
                            key={item.path}
                            type="button"
                            aria-current={active ? "page" : undefined}
                            aria-disabled={item.soon || undefined}
                            title={expanded ? undefined : item.soon ? `${label} · ${t("navSoon")}` : label}
                            onClick={() => { if (!item.soon && !active) navigate(item.path); }}
                            className={`flex h-11 items-center gap-3 overflow-hidden whitespace-nowrap rounded-[10px] px-3 text-left transition-colors focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(99,102,241,0.28)] ${
                                active
                                    ? "bg-[rgba(124,92,240,0.10)]"
                                    : item.soon
                                        ? "cursor-default"
                                        : "hover:bg-[#f5f6f9]"
                            }`}
                        >
                            <Icon
                                size={20}
                                strokeWidth={2}
                                className={`shrink-0 ${active ? "text-[#7c5cf0]" : item.soon ? "text-[#b6bcc8]" : "text-[#5a6472]"}`}
                            />
                            <NavLabel expanded={expanded}>
                                <span className={`text-[13.5px] ${active ? "font-bold text-[#4c3db2]" : item.soon ? "font-medium text-[#a8aeba]" : "font-semibold text-[#3b4453]"}`}>
                                    {label}
                                </span>
                                {item.soon && (
                                    <span className="ml-auto rounded-[5px] border border-[#eef0f5] bg-[#f5f6f9] px-[6px] py-[1px] text-[9.5px] font-bold uppercase tracking-[0.06em] text-[#a8aeba]">
                                        {t("navSoon")}
                                    </span>
                                )}
                            </NavLabel>
                        </button>
                    );
                })}
            </div>

            {/* Bottom zone: user/profile actions land here when accounts arrive.
                For now the reception identity chip keeps the slot warm. */}
            <div className="mt-auto px-3">
                <div className="mb-3 h-px bg-[#eef0f5]" />
                <div className="flex h-11 items-center gap-3 overflow-hidden whitespace-nowrap rounded-[10px] px-[6px]">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[rgba(99,102,241,0.12)] text-[11px] font-bold text-[#4c3db2]">
                        RS
                    </div>
                    <NavLabel expanded={expanded}>
                        <span className="text-[12.5px] font-semibold text-[#3b4453]">{t("navUser")}</span>
                    </NavLabel>
                </div>
            </div>
        </nav>
    );
}

// Label wrapper: fades + slides 8px in beside its icon while the rail width
// interpolates, and collapses without reflowing the icon.
function NavLabel({ expanded, children }: { expanded: boolean; children: React.ReactNode }) {
    return (
        <span
            aria-hidden={!expanded}
            className="flex min-w-0 flex-1 items-center transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none"
            style={{ opacity: expanded ? 1 : 0, transform: expanded ? "translateX(0)" : "translateX(-8px)" }}
        >
            {children}
        </span>
    );
}
