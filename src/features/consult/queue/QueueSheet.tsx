// ---------------------------------------------------------------------------
// THE QUEUE, ON DEMAND.
//
// Opened from the Queue control in the dark header, and closed again — the
// doctor does not need to watch the queue while they are consulting, they need
// to be able to ASK. That is the whole brief for this surface: who is waiting,
// how long they have been, what the desk recorded, and a way to take somebody
// out of order when there is a reason to.
//
// ── The desk still owns the order ─────────────────────────────────────────
// Nothing here reorders anything. The list is the desk's own order, numbered,
// and taking somebody out of it is a deliberate act that gets recorded as an
// operational event (`logOperationalEvent`, `operational_events`). "Who is
// next" is reception's decision; "I am seeing this person now" is the
// doctor's, and the two are different sentences.
//
// ── Where "new patient" went ──────────────────────────────────────────────
// Out of the dark header (where it was one of four controls competing for a
// doctor's attention during a consultation) and into the foot of this sheet.
// It is not gone and must not be: a receptionist steps out, a doctor runs the
// clinic alone for an hour, somebody walks in. It is simply no longer the
// first thing on screen in a clinic that has a front desk — it is one line
// under the queue it is an exception to.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ListOrdered, UserPlus } from "lucide-react";
import type { TodayVisit } from "../../../lib/db";
import type { IntakePreview } from "../../../lib/db/intake";
import { ConsultModal, GhostButton, PrimaryButton } from "./ConsultModal";
import { IntakePanel, PatientBand, QueueEmpty, QueueRow } from "./queueParts";

export function QueueSheet({
    waiting, serving, previews, completedCount, loading,
    currentVisitId, onClose, onPick, onRegisterPatient, onManageAttachments, dismissable = true,
}: {
    waiting: TodayVisit[];
    serving: TodayVisit[];
    previews: Map<string, IntakePreview>;
    completedCount: number;
    loading: boolean;
    /** the visit the doctor is in right now, so its row reads as "in the room" */
    currentVisitId: string | null;
    onClose: () => void;
    /**
     * False when there is no active consult behind this sheet — a doctor who
     * dismisses it here lands on a workspace with nothing in the header at
     * all. See `ConsultModal`'s own doc comment; App.tsx passes
     * `hasActiveConsult` straight through.
     */
    dismissable?: boolean;
    /**
     * Take this patient now. The caller decides what that means (finish the
     * current consult first, record the override) — this surface only ever
     * reports the intention.
     */
    onPick: (visit: TodayVisit, aheadOfQueue: boolean) => void;
    /** the receptionist-unavailable path — see the file header */
    onRegisterPatient: () => void;
    /** view/add/delete attachments for the previewed visit — same modal the
     *  front desk uses. Omitted where the caller hasn't wired the gateway
     *  provider needed to mount it. */
    onManageAttachments?: (visit: TodayVisit) => void;
}) {
    const [selected, setSelected] = useState<TodayVisit | null>(null);
    const reduce = useReducedMotion();

    // "Ahead of queue" is a fact about position, not a judgement: it is true
    // whenever the chosen patient is not the one the desk has at the front.
    const next = waiting[0] ?? null;
    const aheadOfQueue = !!selected && !!next && selected.visit_id !== next.visit_id;

    const inRoom = serving.find((v) => v.visit_id === currentVisitId) ?? serving[0] ?? null;

    return (
        <ConsultModal
            icon={<ListOrdered size={16} />}
            eyebrow="Front desk"
            title="Today's queue"
            subtitle={
                loading
                    ? "Loading…"
                    : `${waiting.length} waiting · ${completedCount} seen so far`
            }
            band={inRoom ? <PatientBand visit={inRoom} tone="inline" right={
                <span className="rounded-full border border-white/25 bg-white/10 px-[9px] py-[3px] text-[10px] font-bold uppercase tracking-[0.06em] text-white/85">
                    In the room
                </span>
            } /> : undefined}
            onClose={onClose}
            dismissable={dismissable}
            footer={
                selected ? (
                    <>
                        <GhostButton onClick={() => setSelected(null)}>Back</GhostButton>
                        <div className="min-w-0 flex-1 text-[11.5px] leading-[1.45] text-[var(--cs-muted)]">
                            {aheadOfQueue
                                ? <>Taking <strong className="font-bold text-[var(--cs-ink)]">{selected.patient_name}</strong> ahead of the queue. The front desk keeps the order; this is recorded.</>
                                : <>Next in the front desk's order.</>}
                        </div>
                        <PrimaryButton onClick={() => onPick(selected, aheadOfQueue)}>
                            Consult {selected.patient_name.split(" ")[0]}
                        </PrimaryButton>
                    </>
                ) : (
                    <>
                        <GhostButton onClick={onRegisterPatient}>
                            <UserPlus size={14} /> Register a patient
                        </GhostButton>
                        <span className="min-w-0 flex-1 text-[11.5px] leading-[1.45] text-[var(--cs-faint)]">
                            {dismissable
                                ? "For when the front desk is unavailable."
                                : "Pick a patient from the queue, or register one yourself."}
                        </span>
                        {dismissable && <GhostButton onClick={onClose}>Close</GhostButton>}
                    </>
                )
            }
        >
            {/* The detail column is a glance, not a form — thinned from an
                even ~54/46 split (2026-09-06) so the queue itself, the actual
                subject of this screen, carries more of the width. */}
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.4fr)_minmax(0,0.75fr)] max-[720px]:grid-cols-1">
                {/* The queue itself. Scrolls in its own box, never grows the
                    card — the bound `layout-composition.md` rule 10 asks for on
                    any region fed by data we do not control. */}
                <div className="flex min-h-[300px] min-w-0 flex-col border-r border-[var(--cs-line)] max-[720px]:border-b max-[720px]:border-r-0">
                    <div className="flex flex-none items-center justify-between px-[15px] pb-[7px] pt-[13px]">
                        <span className="text-[12.5px] font-bold text-[var(--cs-blue)]">Waiting</span>
                        <span className="text-[11px] font-semibold tabular-nums text-[var(--cs-faint)]">{waiting.length}</span>
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col gap-[6px] overflow-y-auto px-[15px] pb-[15px]">
                        {waiting.length === 0
                            ? <QueueEmpty />
                            : waiting.map((v, i) => (
                                <QueueRow
                                    key={v.visit_id}
                                    visit={v}
                                    preview={previews.get(v.visit_id)}
                                    position={i + 1}
                                    selected={selected?.visit_id === v.visit_id}
                                    onSelect={(picked) =>
                                        setSelected((curr) => (curr?.visit_id === picked.visit_id ? null : picked))
                                    }
                                />
                            ))}
                    </div>
                </div>

                {/* What the desk recorded about whoever is selected — or, with
                    nothing selected, about whoever is next, because that is the
                    question a doctor opening the queue is usually asking. */}
                <div className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--cs-page)]">
                    {(() => {
                        const showing = selected ?? next;
                        if (!showing) return <QueueEmpty note="Nothing to preview." />;
                        return (
                            // A new patient landing here is a real change of
                            // subject, not a value update — worth a beat of
                            // its own rather than the text just snapping to
                            // the next name mid-read. `mode="wait"` so the
                            // outgoing card is gone before the next begins;
                            // this panel is a single answer at a time, never
                            // two overlapping.
                            <AnimatePresence mode="wait" initial={false}>
                                <motion.div
                                    key={showing.visit_id}
                                    className="flex min-h-0 flex-1 flex-col"
                                    initial={reduce ? false : { opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={reduce ? undefined : { opacity: 0 }}
                                    transition={{ duration: 0.14 }}
                                >
                                    <div className="flex flex-none items-center gap-[8px] px-[15px] pb-[7px] pt-[13px]">
                                        <span className="text-[11px] font-semibold text-[var(--cs-faint)]">
                                            {selected ? "Selected" : "Up next"}
                                        </span>
                                        <span className="truncate text-[12.5px] font-bold text-[var(--cs-ink)]">{showing.patient_name}</span>
                                    </div>
                                    <IntakePanel preview={previews.get(showing.visit_id)} visit={showing} dense onManageAttachments={onManageAttachments} />
                                </motion.div>
                            </AnimatePresence>
                        );
                    })()}
                </div>
            </div>
        </ConsultModal>
    );
}
