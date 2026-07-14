import { useMemo } from "react";
import { CalendarRange } from "lucide-react";
import type { PatientHistoryVisit } from "@/lib/db";
import { tintFor } from "../../statusStyle";
import { useT } from "../../i18n/i18n";

// The lightweight visit-rhythm strip. Not analytics — recognition: dots sit
// at their true chronological distance, so three visits in one week read as
// a cluster and a gap reads as a gap. Shows the latest ~8 visits in the
// selected window; everything older collapses into "+N earlier visits",
// which opens the full timeline modal.

export type TimelineWindow = 3 | 6 | 12 | 0; // months; 0 = all time

const SHOW_MAX = 8;
const X_MIN = 3;    // % — left edge of the dot domain
const X_MAX = 94;   // % — right edge (labels are centered, keep room)
const GAP_MIN = 9;  // % — labels are ~64px wide; below this they collide

type Props = {
    visits: PatientHistoryVisit[]; // newest first (hook order)
    windowMonths: TimelineWindow;
    onOpenAll: () => void;
};

export function VisitTimeline({ visits, windowMonths, onOpenAll }: Props) {
    const t = useT();

    const { shown, earlierCount, positions } = useMemo(() => {
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - (windowMonths || 1200));
        const inWindow = visits
            .filter((v) => new Date(v.created_at) >= cutoff)
            .slice() // newest first → oldest first for left-to-right reading
            .reverse();
        const shown = inWindow.slice(-SHOW_MAX);
        const earlierCount = visits.length - shown.length;

        // Proportional layout with a collision pass: x maps real time onto
        // the strip, then neighbours closer than GAP_MIN push right (and the
        // tail pushes back if it overflows) so labels never overlap.
        const times = shown.map((v) => new Date(v.created_at).getTime());
        const min = times[0] ?? 0;
        const span = (times[times.length - 1] ?? 0) - min;
        const xs = times.map((time) => (span > 0 ? X_MIN + ((time - min) / span) * (X_MAX - X_MIN) : (X_MIN + X_MAX) / 2));
        for (let i = 1; i < xs.length; i++) xs[i] = Math.max(xs[i], xs[i - 1] + GAP_MIN);
        if (xs.length && xs[xs.length - 1] > X_MAX) {
            xs[xs.length - 1] = X_MAX;
            for (let i = xs.length - 2; i >= 0; i--) xs[i] = Math.min(xs[i], xs[i + 1] - GAP_MIN);
        }
        return { shown, earlierCount, positions: xs };
    }, [visits, windowMonths]);

    // The patient's chronologically first visit ever (not just in-window).
    const firstVisitId = visits.length ? visits[visits.length - 1].visit_id : null;

    if (shown.length === 0) {
        return (
            <div className="flex h-[96px] items-center justify-center gap-2 text-[13px] font-medium text-[#a8aeba]">
                <CalendarRange size={16} strokeWidth={1.8} className="text-[#cbd2df]" />
                {t("timelineEmpty")}
            </div>
        );
    }

    return (
        <div className="flex items-start gap-3">
            <div className="relative h-[96px] min-w-0 flex-1">
                {/* The rail: solid across the dot domain, dashed run-out toward
                    "now" on the right. Structural violet-gray, no glow. */}
                <div className="absolute left-0 right-[14px] top-[30px] h-[2px] rounded-full bg-[#ece9f6]" />
                <div
                    className="absolute right-0 top-[30px] h-[2px] w-[46px]"
                    style={{ backgroundImage: "repeating-linear-gradient(90deg, #dcd6f0 0 5px, transparent 5px 10px)" }}
                />

                {shown.map((v, i) => {
                    const isLatest = i === shown.length - 1;
                    const isFirstEver = v.visit_id === firstVisitId;
                    const cancelled = v.status === "discarded";
                    const d = new Date(v.created_at);
                    const dateLabel = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
                    const typeLabel = isFirstEver ? t("visitFirst") : t("visitFollowUp");
                    const tint = tintFor(v.status);
                    return (
                        <div
                            key={v.visit_id}
                            className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
                            style={{ left: `${positions[i]}%` }}
                            title={`${dateLabel} · ${typeLabel} · ${v.doctor_name ?? "—"} · ${t(tint.labelKey)}`}
                        >
                            {/* Dot: violet is sanctioned in the timeline (brand
                                labels the rhythm, the modal carries status).
                                Cancelled visits render hollow so they read as
                                a non-event without shouting. */}
                            <span
                                className="mt-[25px] box-border block rounded-full"
                                style={
                                    cancelled
                                        ? { width: 11, height: 11, border: "2.5px solid #cbd2df", background: "#fff" }
                                        : {
                                              width: isLatest ? 13 : 11,
                                              height: isLatest ? 13 : 11,
                                              marginTop: isLatest ? 24 : 25,
                                              background: "#7c5cf0",
                                              border: "2.5px solid #fff",
                                              boxShadow: isLatest
                                                  ? "0 0 0 1.5px #7c5cf0, 0 2px 10px rgba(124,92,240,0.45)"
                                                  : "0 0 0 1.5px #c9bdf5",
                                          }
                                }
                            />
                            <span className="mt-[10px] whitespace-nowrap text-[11.5px] font-bold text-[#3b4453] tabular-nums">{dateLabel}</span>
                            <span className="mt-[1px] whitespace-nowrap text-[10.5px] font-medium text-[#a8aeba]">{typeLabel}</span>
                        </div>
                    );
                })}
            </div>

            {earlierCount > 0 && (
                <button
                    type="button"
                    onClick={onOpenAll}
                    className="mt-[21px] shrink-0 whitespace-nowrap rounded-[8px] border border-[#e5ddfa] bg-[rgba(124,92,240,0.06)] px-[10px] py-[5px] text-[11.5px] font-bold text-[#6d5bc7] transition-colors hover:border-[#d5cfec] hover:bg-[rgba(124,92,240,0.11)] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(99,102,241,0.28)]"
                >
                    {t("earlierVisits", { n: earlierCount })}
                </button>
            )}
        </div>
    );
}
