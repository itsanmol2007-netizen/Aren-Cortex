// ---------------------------------------------------------------------------
// THE HANDOVER — between the consultation just finished and the next one.
//
// The doctor pressed Complete & Next. This is the two seconds in which they
// find out who is walking in, what the desk already recorded about them, and
// who else is waiting — and then it gets out of the way on its own.
//
// ── The timer ─────────────────────────────────────────────────────────────
// Ten seconds, counted down on the primary button itself ("Continue · 10"), and
// it STOPS the moment the doctor does anything meaningful: choosing a different
// patient, opening the full queue, or pressing anything. It never restarts by
// itself. That asymmetry is the whole design — an automatic continuation is a
// convenience for the common case (the desk's order is right, the doctor just
// keeps going) and must never be a race the doctor can lose while reading.
//
// `prefers-reduced-motion` does not disable it — this is not decoration, it is
// the flow — but nothing about it animates: the number changes, and that is
// all. `motion.md`'s rule is about movement, and there is none here.
//
// ── Overriding the queue ──────────────────────────────────────────────────
// Picking somebody else from the compact queue swaps the whole context panel
// to that patient, stops the timer, and turns the primary into a named action
// ("Continue with Meera"). Committing it asks once more — "Continue ahead of
// queue?" with Back and Continue — because it is a decision somebody may have
// to account for, and it is recorded as one. Not "Are you sure?": the doctor
// has a reason, the software's job is to make the choice legible, not to doubt
// it (docs' own wording rule, and Anmol's: no unnecessarily harsh wording).
//
// ── Two views, one card ───────────────────────────────────────────────────
// The compact queue beside the patient is four or five rows — enough to see
// the shape of the afternoon. "View full queue →" swaps the body for the whole
// list and "Back" returns to the patient. Same card, same band, no second
// modal stacked on the first.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, ListOrdered, UserPlus } from "lucide-react";
import type { TodayVisit } from "../../../lib/db";
import type { IntakePreview } from "../../../lib/db/intake";
import { ConsultModal, GhostButton, PrimaryButton } from "./ConsultModal";
import { IntakePanel, PatientBand, QueueEmpty, QueueRow } from "./queueParts";

/** Seconds of automatic continuation. Named once; the label reads it. */
export const AUTO_CONTINUE_SECONDS = 10;

/** How many rows the compact queue shows beside the patient — "roughly 4-5". */
const COMPACT_ROWS = 5;

type View = "patient" | "queue";

export function TransitionModal({
    waiting, previews, completedCount, justCompleted,
    onContinue, onRegisterPatient, onDismiss,
}: {
    waiting: TodayVisit[];
    previews: Map<string, IntakePreview>;
    completedCount: number;
    /** the name of the consultation that just finished, for the eyebrow line */
    justCompleted: string | null;
    /** open the consult. `aheadOfQueue` is true when this was not the desk's next. */
    onContinue: (visit: TodayVisit, aheadOfQueue: boolean) => void;
    onRegisterPatient: () => void;
    onDismiss: () => void;
}) {
    const suggested = waiting[0] ?? null;
    const [chosenId, setChosenId] = useState<string | null>(null);
    const [view, setView] = useState<View>("patient");
    const [confirming, setConfirming] = useState(false);
    const [remaining, setRemaining] = useState(AUTO_CONTINUE_SECONDS);
    /** the timer is one-way: once stopped by a real interaction it never
     *  restarts, including on the way BACK from an override. */
    const [timerLive, setTimerLive] = useState(true);

    const chosen = useMemo(
        () => (chosenId ? waiting.find((v) => v.visit_id === chosenId) ?? null : null),
        [chosenId, waiting]
    );
    const showing = chosen ?? suggested;
    const aheadOfQueue = !!chosen && !!suggested && chosen.visit_id !== suggested.visit_id;

    const stopTimer = useCallback(() => setTimerLive(false), []);

    // ── The countdown ───────────────────────────────────────────────────────
    // Only while it is live, only while there is somebody to continue TO, and
    // only on the patient view — a doctor reading the full queue is plainly
    // still deciding.
    const canAuto = timerLive && !!suggested && !chosen && view === "patient" && !confirming;

    useEffect(() => {
        if (!canAuto) return;
        if (remaining <= 0) return;
        const t = window.setTimeout(() => setRemaining((n) => n - 1), 1000);
        return () => window.clearTimeout(t);
    }, [canAuto, remaining]);

    useEffect(() => {
        if (canAuto && remaining <= 0 && suggested) onContinue(suggested, false);
    }, [canAuto, remaining, suggested, onContinue]);

    // Any keystroke is a doctor paying attention. Enter takes the action they
    // are looking at; everything else simply stops the clock, which is the
    // conservative reading of "meaningfully interacts".
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") return;      // ConsultModal owns close
            if (e.key === "Enter") return;       // the focused button owns it
            stopTimer();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [stopTimer]);

    const pick = (visit: TodayVisit) => {
        stopTimer();
        setConfirming(false);
        setChosenId((curr) => (curr === visit.visit_id ? null : visit.visit_id));
        setView("patient");
    };

    const openQueue = () => { stopTimer(); setView("queue"); };

    const commit = () => {
        if (!showing) return;
        if (aheadOfQueue && !confirming) { setConfirming(true); return; }
        onContinue(showing, aheadOfQueue);
    };

    // ── Nobody left ─────────────────────────────────────────────────────────
    // The end of the day is a real answer, not an empty modal. One fact, one
    // way out (`empty-states.md`), plus the register path for a walk-in.
    if (!suggested) {
        return (
            <ConsultModal
                icon={<CheckCircle2 size={16} />}
                eyebrow="Consultation saved"
                title="Nobody is waiting"
                subtitle={justCompleted ? `${justCompleted}'s prescription is saved` : undefined}
                onClose={onDismiss}
                footer={
                    <>
                        <GhostButton onClick={onRegisterPatient}>
                            <UserPlus size={14} /> Register a patient
                        </GhostButton>
                        <span className="min-w-0 flex-1" />
                        <PrimaryButton onClick={onDismiss}>Done</PrimaryButton>
                    </>
                }
            >
                <div className="flex flex-1 flex-col items-center justify-center gap-[6px] px-[20px] py-[38px] text-center">
                    <CheckCircle2 size={26} className="text-[var(--cs-green)]" aria-hidden="true" />
                    <strong className="text-[14px] font-semibold text-[var(--cs-ink)]">
                        {completedCount} consultation{completedCount === 1 ? "" : "s"} today
                    </strong>
                    <span className="max-w-[38ch] text-[12px] leading-[1.55] text-[var(--cs-muted)]">
                        The front desk will add the next patient when they arrive.
                    </span>
                </div>
            </ConsultModal>
        );
    }

    const compact = waiting.slice(0, COMPACT_ROWS);
    const rest = waiting.length - compact.length;

    return (
        <ConsultModal
            icon={view === "queue" ? <ListOrdered size={16} /> : <ArrowRight size={16} />}
            eyebrow={justCompleted ? `${justCompleted} — saved` : "Consultation saved"}
            title={view === "queue" ? "Today's queue" : "Next patient"}
            subtitle={`${waiting.length} waiting · ${completedCount} seen so far`}
            band={showing ? (
                <PatientBand
                    visit={showing}
                    waiting
                    right={aheadOfQueue ? (
                        <span className="rounded-full border border-[#f5c98a]/40 bg-[#f5c98a]/15 px-[9px] py-[3px] text-[10px] font-bold uppercase tracking-[0.06em] text-[#f5c98a]">
                            Ahead of queue
                        </span>
                    ) : (
                        <span className="rounded-full border border-white/25 bg-white/10 px-[9px] py-[3px] text-[10px] font-bold uppercase tracking-[0.06em] text-white/85">
                            Next in queue
                        </span>
                    )}
                />
            ) : undefined}
            onClose={onDismiss}
            holdOpen
            footer={
                confirming ? (
                    // ── The second, progressive step ────────────────────────
                    // One short question and two named actions. No "Are you
                    // sure?" — the doctor has a reason; this only makes the
                    // choice legible and records it.
                    <>
                        <GhostButton onClick={() => setConfirming(false)}>Back</GhostButton>
                        <div className="min-w-0 flex-1 text-[12px] leading-[1.45] text-[var(--cs-muted)]">
                            <strong className="block text-[13px] font-bold text-[var(--cs-ink)]">Continue ahead of queue?</strong>
                            {suggested.patient_name} has been waiting longer. The front desk keeps the order; this is recorded.
                        </div>
                        <PrimaryButton onClick={commit}>
                            Continue with {showing!.patient_name.split(" ")[0]}
                        </PrimaryButton>
                    </>
                ) : view === "queue" ? (
                    <>
                        <GhostButton onClick={() => setView("patient")}>Back</GhostButton>
                        <GhostButton onClick={onRegisterPatient}>
                            <UserPlus size={14} /> Register a patient
                        </GhostButton>
                        <span className="min-w-0 flex-1" />
                        <PrimaryButton onClick={commit} disabled={!showing}>
                            {aheadOfQueue
                                ? `Continue with ${showing!.patient_name.split(" ")[0]}`
                                : "Continue"}
                        </PrimaryButton>
                    </>
                ) : (
                    <>
                        <GhostButton onClick={onDismiss}>Not now</GhostButton>
                        <span className="min-w-0 flex-1" />
                        <PrimaryButton onClick={commit}>
                            {aheadOfQueue
                                ? `Continue with this patient`
                                : canAuto
                                    ? `Continue · ${remaining}`
                                    : "Continue"}
                        </PrimaryButton>
                    </>
                )
            }
        >
            {view === "queue" ? (
                <div className="flex min-h-[280px] flex-col gap-[6px] overflow-y-auto p-[15px]">
                    {waiting.map((v, i) => (
                        <QueueRow
                            key={v.visit_id}
                            visit={v}
                            preview={previews.get(v.visit_id)}
                            position={i + 1}
                            selected={showing?.visit_id === v.visit_id}
                            onSelect={pick}
                        />
                    ))}
                </div>
            ) : (
                <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] max-[720px]:grid-cols-1">
                    {/* What the desk prepared. */}
                    <div className="flex min-h-[240px] min-w-0 flex-col border-r border-[var(--cs-line)] max-[720px]:border-b max-[720px]:border-r-0">
                        <div className="flex-none px-[15px] pb-[2px] pt-[13px]">
                            <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--cs-label)]">
                                Prepared at the front desk
                            </span>
                        </div>
                        {showing && <IntakePanel preview={previews.get(showing.visit_id)} visit={showing} dense />}
                    </div>

                    {/* The compact queue — four or five rows, and a way to all
                        of them. The doctor should not have to open anything
                        else just to understand who is waiting. */}
                    <div className="flex min-h-0 min-w-0 flex-col bg-[var(--cs-page)]">
                        <div className="flex flex-none items-center justify-between px-[15px] pb-[7px] pt-[13px]">
                            <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--cs-label)]">Queue</span>
                            <span className="text-[11px] font-semibold tabular-nums text-[var(--cs-faint)]">{waiting.length}</span>
                        </div>
                        <div className="flex min-h-0 flex-1 flex-col gap-[5px] overflow-y-auto px-[13px] pb-[10px]">
                            {compact.length === 0
                                ? <QueueEmpty />
                                : compact.map((v, i) => (
                                    <QueueRow
                                        key={v.visit_id}
                                        visit={v}
                                        preview={previews.get(v.visit_id)}
                                        position={i + 1}
                                        selected={showing?.visit_id === v.visit_id}
                                        onSelect={pick}
                                    />
                                ))}
                        </div>
                        <button
                            type="button"
                            onClick={openQueue}
                            className="flex flex-none items-center gap-[4px] border-t border-[var(--cs-line)] px-[15px] py-[9px] text-left text-[11.5px] font-semibold text-[var(--cs-blue)] transition-[gap] hover:gap-[7px]"
                        >
                            View full queue{rest > 0 ? ` (${rest} more)` : ""} <ArrowRight size={12} />
                        </button>
                    </div>
                </div>
            )}
        </ConsultModal>
    );
}
