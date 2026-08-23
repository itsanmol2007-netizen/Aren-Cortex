import { ArrowUp, Clock, Stethoscope, CheckCheck, Inbox, Plus } from "lucide-react";
import { useT } from "../i18n/i18n";
import type { StringKey } from "../i18n/strings";
import { useAuth } from "../../auth/AuthProvider";

// The three-part empty-state system (§7): typographic and quiet, with one
// illustrated moment for the morning — an astronomy/healthcare mark (planet +
// cross, orbit ring, telescope) in the dawn thread palette. Per-tab empties
// stay small so they don't perform mid-work.

function greetingKey(): StringKey {
    const h = new Date().getHours();
    if (h < 12) return "greetingMorning";
    if (h < 17) return "greetingAfternoon";
    return "greetingEvening";
}

// The morning mark: a small line-art scene (orbit + planet/cross + telescope
// + stars) in near-monochrome dawn violet, static (no motion per §9). Reads
// as "clinic at rest", not a stock illustration.
function MorningMark() {
    return (
        <svg width="148" height="108" viewBox="0 0 220 160" fill="none" aria-hidden="true">
            <defs>
                <linearGradient id="mm-thread" x1="0" y1="0" x2="220" y2="160" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#f2a986" />
                    <stop offset="32%" stopColor="#f472b6" />
                    <stop offset="68%" stopColor="#a855f7" />
                    <stop offset="100%" stopColor="#6366f1" />
                </linearGradient>
                <radialGradient id="mm-planet" cx="35%" cy="30%" r="75%">
                    <stop offset="0%" stopColor="#c7bdf5" />
                    <stop offset="55%" stopColor="#a78bf0" />
                    <stop offset="100%" stopColor="#7c5cf0" />
                </radialGradient>
            </defs>

            {/* Atmosphere: faint concentric rings behind the planet */}
            <circle cx="122" cy="60" r="70" stroke="#7c5cf0" strokeOpacity="0.06" />
            <circle cx="122" cy="60" r="52" stroke="#7c5cf0" strokeOpacity="0.09" />

            {/* Orbit ring, tilted, drawn in the dawn thread */}
            <ellipse
                cx="122" cy="60" rx="58" ry="19"
                transform="rotate(-14 122 60)"
                stroke="url(#mm-thread)" strokeOpacity="0.5" strokeWidth="1.4"
            />
            {/* A point riding the orbit */}
            <circle cx="70" cy="66" r="2.4" fill="#f472b6" fillOpacity="0.8" />

            {/* Planet + medical cross */}
            <circle cx="122" cy="60" r="25" fill="url(#mm-planet)" />
            <circle cx="112" cy="50" r="9" fill="#ffffff" fillOpacity="0.14" />
            <rect x="118.5" y="49" width="7" height="22" rx="2" fill="#ffffff" />
            <rect x="111" y="56.5" width="22" height="7" rx="2" fill="#ffffff" />

            {/* Sparkle stars */}
            <path d="M42 34 L44.4 39.6 L50 42 L44.4 44.4 L42 50 L39.6 44.4 L34 42 L39.6 39.6 Z" fill="#f2a986" fillOpacity="0.75" />
            <path d="M182 44 L183.6 47.8 L187.4 49.4 L183.6 51 L182 54.8 L180.4 51 L176.6 49.4 L180.4 47.8 Z" fill="#a855f7" fillOpacity="0.6" />
            <path d="M64 100 L65.4 103.4 L68.8 104.8 L65.4 106.2 L64 109.6 L62.6 106.2 L59.2 104.8 L62.6 103.4 Z" fill="#f472b6" fillOpacity="0.6" />

            {/* Horizon */}
            <path d="M8 138 Q110 118 212 138" stroke="#c9c3ea" strokeOpacity="0.5" strokeWidth="1.4" />

            {/* Telescope, angled toward the planet */}
            <g transform="translate(56 128) rotate(-52)">
                <rect x="-5.5" y="-32" width="11" height="40" rx="4" fill="#ffffff" stroke="#a79bd8" strokeWidth="1.3" />
                <circle cx="0" cy="8" r="4.5" fill="#ffffff" stroke="#a79bd8" strokeWidth="1.3" />
            </g>
            <path d="M56 128 L40 154 M56 128 L58 156 M56 128 L70 152" stroke="#a79bd8" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
    );
}

// §7.1 — queue empty AND zero visits today. The one place the morning moment
// lives; the stats/sidebar stay structurally normal (muted zeros).
export function MorningWelcome({ onAddPatient }: { onAddPatient?: () => void }) {
    const t = useT();
    const auth = useAuth();
    const userName = auth.status === "authed" ? auth.identity.user.full_name?.trim() ?? "" : "";

    return (
        <div className="aren-rise flex flex-col items-center gap-[4px] px-5 py-[18px] text-center">
            <MorningMark />

            <h3 className="m-0 font-[Manrope,sans-serif] text-[19px] font-extrabold leading-[1.15] tracking-[-0.01em] text-[#161d29]">
                {t(greetingKey())}
                {userName ? `, ${userName}` : ""}
            </h3>
            <p className="m-0 text-[13px] font-[450] text-[#5a6472]">{t("emptyMorningLead")}</p>
            <p className="m-0 flex items-center gap-[6px] text-[12.5px] font-medium text-[#a8aeba]">
                {t("emptyMorningBody")}
                <ArrowUp size={12} className="shrink-0" />
            </p>

            {onAddPatient && (
                <button
                    type="button"
                    onClick={onAddPatient}
                    className="mt-[4px] flex h-[38px] items-center gap-[8px] rounded-[10px] bg-[linear-gradient(155deg,#6366f1,#3d3ac9)] px-[17px] text-[13px] font-bold text-white shadow-[0_3px_14px_rgba(79,70,229,0.32)] transition-[box-shadow,transform,filter] duration-100 hover:brightness-110 hover:shadow-[0_3px_18px_rgba(79,70,229,0.46)] active:scale-[0.97] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(99,102,241,0.28)]"
                >
                    <Plus size={16} strokeWidth={2.6} />
                    {t("emptyMorningCta")}
                </button>
            )}
        </div>
    );
}

// §7.2 — a filter is empty while the day is alive. Quiet: one 20px line icon
// in faint gray plus one line of copy. No illustration, no color, no motion.
const TAB_ICON = {
    waiting: Clock,
    serving: Stethoscope,
    completed: CheckCheck,
    generic: Inbox,
} as const;

const TAB_COPY: Record<keyof typeof TAB_ICON, StringKey> = {
    waiting: "emptyTabWaiting",
    serving: "emptyTabConsult",
    completed: "emptyTabCompleted",
    generic: "emptyGeneric",
};

export function TabEmpty({ kind }: { kind: keyof typeof TAB_ICON }) {
    const t = useT();
    const Icon = TAB_ICON[kind];
    return (
        <div className="flex flex-col items-center gap-[9px] px-5 py-[34px] text-center">
            {/* A neutral circle backdrop only — no color, no gradient — so the
                icon reads as a placed object instead of nothing having been
                designed here, without competing with the morning illustration. */}
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f3f4f7]">
                <Icon size={17} className="text-[#a3aab8]" strokeWidth={1.8} />
            </div>
            <p className="m-0 text-[12.5px] font-medium text-[#a8aeba]">{t(TAB_COPY[kind])}</p>
        </div>
    );
}

// §7.3 — every visit completed/cancelled, viewing All. A small satisfied
// sign-off, not a celebration. Entrance fade only.
export function DayDone() {
    const t = useT();
    return (
        <div className="aren-rise flex flex-col items-center gap-[8px] border-t border-[#eef0f5] px-5 py-[38px] text-center">
            <h3 className="m-0 mt-1 font-[Manrope,sans-serif] text-[18px] font-bold leading-[1.2] tracking-[-0.01em] text-[#161d29]">
                {t("dayDoneTitle")}
            </h3>
            <p className="m-0 text-[13.5px] font-[450] text-[#5a6472]">{t("dayDoneBody")}</p>
        </div>
    );
}
