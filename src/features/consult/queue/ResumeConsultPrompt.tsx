// ---------------------------------------------------------------------------
// RESUME YOUR CONSULT — the DB-backed entry gate.
//
// A doctor has at most one consult open at a time (the
// `visits_one_serving_per_doctor` index enforces it). localStorage restores
// that consult on a plain reload; this covers everything localStorage cannot —
// a logout, a different computer, a cleared browser. On entering the consult
// screen with no consult in memory, App.tsx asks the database whether this
// doctor has a `serving` (in the room) or `draft` (parked) visit and, if so,
// shows this before anything else.
//
// Two ways out, no third: Resume it, or Discard it. There is no dismiss —
// leaving it open is exactly the "five parked consults" state this exists to
// end. Same doctrine `ActiveConsultGuard` and the cold-start `QueueSheet`
// already apply.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Stethoscope } from "lucide-react";
import { ConsultModal, GhostButton, PrimaryButton } from "./ConsultModal";

function startedAgo(iso: string | null): string {
    if (!iso) return "a little while ago";
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins === 1) return "1 minute ago";
    if (mins < 60) return `${mins} minutes ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs === 1) return "about an hour ago";
    if (hrs < 24) return `about ${hrs} hours ago`;
    const days = Math.floor(hrs / 24);
    return days === 1 ? "yesterday" : `${days} days ago`;
}

export function ResumeConsultPrompt({
    patientName, status, startedAt, onResume, onDiscard,
}: {
    patientName: string;
    status: "serving" | "draft";
    startedAt: string | null;
    /** Rehydrate the consult (`useConsultLifecycle.resumeConsult`). */
    onResume: () => void | Promise<void>;
    /** Mark the visit discarded and fall through to the normal empty screen. */
    onDiscard: () => void | Promise<void>;
}) {
    const [busy, setBusy] = useState<null | "resume" | "discard">(null);
    const firstName = patientName.split(" ")[0] || "patient";

    const run = (which: "resume" | "discard", fn: () => void | Promise<void>) => async () => {
        if (busy) return;
        setBusy(which);
        try {
            await fn();
        } finally {
            setBusy(null);
        }
    };

    return (
        <ConsultModal
            size="compact"
            icon={<Stethoscope size={16} />}
            eyebrow={status === "draft" ? "Parked consult" : "Consult in progress"}
            title={status === "draft" ? "You parked a consult" : "You left a consult open"}
            subtitle={`Started ${startedAgo(startedAt)}`}
            onClose={() => { /* no dismiss — Resume or Discard only */ }}
            dismissable={false}
            footer={
                <>
                    <GhostButton onClick={run("discard", onDiscard)} disabled={!!busy}>
                        {busy === "discard" ? "Discarding…" : "Discard"}
                    </GhostButton>
                    <span className="min-w-0 flex-1 text-[11.5px] leading-[1.45] text-[var(--cs-faint)]">
                        Only one consult can be open at a time.
                    </span>
                    <PrimaryButton onClick={run("resume", onResume)} disabled={!!busy}>
                        {busy === "resume" ? "Resuming…" : `Resume ${firstName}`}
                    </PrimaryButton>
                </>
            }
        >
            <div className="flex flex-1 flex-col items-center justify-center gap-[8px] px-[22px] py-[34px] text-center">
                <span className="grid h-[46px] w-[46px] place-items-center rounded-full bg-[var(--cs-blue-soft)] text-[var(--cs-blue)]">
                    <Stethoscope size={22} aria-hidden="true" />
                </span>
                <strong className="text-[15px] font-bold text-[var(--cs-ink)]">{patientName}</strong>
                <span className="max-w-[34ch] text-[12.5px] leading-[1.55] text-[var(--cs-muted)]">
                    {status === "draft"
                        ? "Pick this consult back up where you left it, or discard it if it is no longer needed."
                        : "This consult is still open. Resume it to carry on, or discard it to start fresh."}
                </span>
            </div>
        </ConsultModal>
    );
}
