import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { WifiOff, Wifi, ArrowRight, X } from "lucide-react";
import { useT } from "../i18n/i18n";
import { useOnline } from "../operational/useOnline";

// The proactive operational voice of the reception workspace. When a real
// operational event happens (right now: the internet dropping), a slim band
// slides in under the header and explains — in plain, Error-Morphology language
// — what it means for the clinic, not what broke technically. It appears on
// EVERY reception page because losing connectivity matters wherever you are,
// and it clears itself the moment things recover.
//
// Phases:
//   offline      → persistent amber band, "You're working offline…"
//   reconnected  → transient green band, "Back online…" (auto-dismisses)
//   (online)     → nothing at all

type Phase = "hidden" | "offline" | "reconnected";

export function OperationalBanner() {
    const t = useT();
    const online = useOnline();
    const navigate = useNavigate();
    const { pathname } = useLocation();

    const [phase, setPhase] = useState<Phase>(online ? "hidden" : "offline");
    const wasOffline = useRef(!online);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (!online) {
            wasOffline.current = true;
            setPhase("offline");
            return;
        }
        // Back online — only celebrate if we were actually offline.
        if (wasOffline.current) {
            wasOffline.current = false;
            setPhase("reconnected");
            timerRef.current = setTimeout(() => setPhase("hidden"), 5200);
        } else {
            setPhase("hidden");
        }
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [online]);

    if (phase === "hidden") return null;

    const offline = phase === "offline";
    const onStatusPage = pathname.startsWith("/app/clinicstatus");

    // Warm amber for offline (recoverable, never alarming); calm green for the
    // recovery note — matching the semantic vocabulary used across Clinic Status.
    const skin = offline
        ? { bar: "#d38a2c", tint: "rgba(201,121,26,0.10)", border: "rgba(201,121,26,0.28)", ink: "#8a5a12", title: "#b06f14" }
        : { bar: "#27a35f", tint: "rgba(39,163,95,0.10)", border: "rgba(39,163,95,0.28)", ink: "#3f7a58", title: "#1c7a45" };

    return (
        <div
            role="status"
            aria-live="polite"
            className="aren-rise relative z-[60] flex shrink-0 items-center gap-[13px] border-b px-5 py-[10px]"
            style={{ background: skin.tint, borderColor: skin.border }}
        >
            <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: skin.bar }} />
            <span
                className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px]"
                style={{ background: "#fff", boxShadow: `0 0 0 1px ${skin.border}` }}
            >
                {offline ? (
                    <WifiOff size={16} style={{ color: skin.bar }} />
                ) : (
                    <Wifi size={16} style={{ color: skin.bar }} />
                )}
            </span>

            <div className="min-w-0 flex-1">
                <span className="text-[13px] font-bold" style={{ color: skin.title }}>
                    {t(offline ? "opOfflineTitle" : "opReconnectedTitle")}
                </span>
                <span className="ml-[8px] text-[12.5px] font-medium" style={{ color: skin.ink }}>
                    {t(offline ? "opOfflineBody" : "opReconnectedBody")}
                </span>
            </div>

            {offline && !onStatusPage && (
                <button
                    type="button"
                    onClick={() => navigate("/app/clinicstatus")}
                    className="hidden shrink-0 items-center gap-[5px] whitespace-nowrap rounded-[8px] border px-[11px] py-[5px] text-[12px] font-bold transition-colors hover:bg-white min-[720px]:flex"
                    style={{ borderColor: skin.border, color: skin.title }}
                >
                    {t("opViewStatus")}
                    <ArrowRight size={13} />
                </button>
            )}
            {!offline && (
                <button
                    type="button"
                    onClick={() => setPhase("hidden")}
                    aria-label={t("back")}
                    className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px] transition-colors hover:bg-white/70"
                    style={{ color: skin.ink }}
                >
                    <X size={15} />
                </button>
            )}
        </div>
    );
}
