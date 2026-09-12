// ---------------------------------------------------------------------------
// ACTIVITY LIST — what "Patients seen" and "Prescriptions" open onto.
//
// One component for both, because both are the same shape of question: who,
// and when. `icon`/`title`/`fetcher` are the only things that differ between
// them — a second near-identical modal file would be the fork this codebase's
// own rule (reuse the read, reuse the component) exists to prevent.
//
// Deliberately thin: a name, a timestamp, a one-word detail. This is a list a
// doctor scans to confirm "yes, that's everyone" or find one name, not a
// second Patients page — the real record is one click away via `onViewPatient`
// exactly the way Communication's conversation panel already does it.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { PracticeModal, type PracticeModalAccent } from "../practice/PracticeModal";
import { SkeletonRows } from "../clinic/ui";
import { BigEmpty, ConversationArt } from "../communication/parts";
import { formatRangeLabel, type DateRange, type DoctorActivityRow } from "../../lib/db/admin";

interface Props {
    accent: PracticeModalAccent;
    icon: ReactNode;
    eyebrow: string;
    title: string;
    range: DateRange;
    fetcher: () => Promise<DoctorActivityRow[]>;
    emptyFact: string;
    emptyNext: string;
    onClose: () => void;
    /** Opens the exact patient record (2026-09-08) — every row here already
     *  carries a real `patientId`, so there is no search step in between
     *  any more. Same door Communication's conversation panel uses. */
    onViewPatient: (patientId: string | null, name: string | null) => void;
    /**
     * When given, a row click opens THIS instead of the patient record —
     * the "Prescriptions" list's own door (2026-09-12): a doctor scanning
     * prescriptions wants the document itself, not a detour through the
     * patient page to find it again. `r.id` here is the fetcher's own row
     * id, which for `fetchDoctorPrescriptionRows` is the prescription's id.
     */
    onOpenPrescription?: (row: DoctorActivityRow) => void;
    /** A door out of the list, below it — "there should be a button in
     *  that model which will open actual patient page" (Anmol, 2026-09-12).
     *  Forwarded straight to `PracticeModal`'s own `footer` slot. */
    footer?: ReactNode;
}

function stamp(iso: string): string {
    const at = new Date(iso);
    const today = new Date().toDateString() === at.toDateString();
    const time = at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toLowerCase();
    return today
        ? `Today, ${time}`
        : `${at.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${time}`;
}

export function ActivityListModal({
    accent, icon, eyebrow, title, range, fetcher, emptyFact, emptyNext, onClose, onViewPatient,
    onOpenPrescription, footer,
}: Props) {
    const [rows, setRows] = useState<DoctorActivityRow[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        setRows(null);
        setError(null);
        fetcher()
            .then((r) => { if (alive) setRows(r); })
            .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : "Could not load this"); });
        return () => { alive = false; };
        // `fetcher` is re-created by the caller on every range/tab change —
        // exactly the signal this effect should re-run on.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetcher]);

    return (
        <PracticeModal accent={accent} icon={icon} eyebrow={eyebrow} title={title} onClose={onClose} footer={footer}>
            <p className="m-0 -mt-[4px] flex-none text-[11px] text-[var(--cs-faint)]">
                {formatRangeLabel(range)}{rows ? ` · ${rows.length}` : ""}
            </p>

            <div className="flex min-h-0 flex-1 flex-col gap-[4px] overflow-y-auto">
                {error ? (
                    <p className="m-0 rounded-[10px] bg-[var(--cs-red-soft)] px-[10px] py-[8px] text-[11.5px] font-medium text-[var(--cs-red)]">
                        {error}
                    </p>
                ) : !rows ? (
                    <SkeletonRows count={6} />
                ) : rows.length === 0 ? (
                    <BigEmpty art={<ConversationArt size={120} />} fact={emptyFact} next={emptyNext} />
                ) : (
                    rows.map((r) => {
                        // A plain `<div>` when there is no patient to open —
                        // never a `disabled` `<button>`. `styles/base.css`
                        // carries an unlayered `button:disabled { opacity }`
                        // rule that beats any Tailwind override on this
                        // element (cortex-gotchas.md; measured live on this
                        // exact row 2026-09-07) and would wash a legitimate
                        // "Unknown patient" row out to near-illegible grey.
                        const inner = (
                            <>
                                <span className="flex min-w-0 flex-col gap-[1px]">
                                    <span className="truncate text-[12.5px] font-semibold text-[var(--cs-ink)]">
                                        {r.patientName ?? "Unknown patient"}
                                    </span>
                                    <span className="text-[10.5px] text-[var(--cs-faint)]">{stamp(r.at)}</span>
                                </span>
                                <span className="ml-auto flex flex-none items-center gap-[6px]">
                                    {r.detail && (
                                        <span className="text-[10.5px] font-semibold text-[var(--cs-muted)]">{r.detail}</span>
                                    )}
                                    {r.patientName && (
                                        <ExternalLink size={12} className="text-[var(--cs-faint)] opacity-0 transition-opacity group-hover:opacity-100" />
                                    )}
                                </span>
                            </>
                        );
                        // A prescription row always has a real prescription
                        // to open (that's what `r.id` IS here), even on the
                        // rare row with no patient name resolved — so this
                        // branch doesn't need `r.patientName` the way the
                        // patient-record door below does.
                        return onOpenPrescription ? (
                            <button
                                key={r.id}
                                type="button"
                                onClick={() => onOpenPrescription(r)}
                                className="group flex flex-none cursor-pointer items-center gap-[9px] rounded-[9px] border border-[var(--cs-line)] bg-[var(--cs-card)] px-[10px] py-[8px] text-left outline-none transition-colors hover:border-[var(--cs-violet)]"
                            >
                                {inner}
                            </button>
                        ) : r.patientName ? (
                            <button
                                key={r.id}
                                type="button"
                                onClick={() => onViewPatient(r.patientId, r.patientName)}
                                className="group flex flex-none cursor-pointer items-center gap-[9px] rounded-[9px] border border-[var(--cs-line)] bg-[var(--cs-card)] px-[10px] py-[8px] text-left outline-none transition-colors hover:border-[var(--cs-violet)]"
                            >
                                {inner}
                            </button>
                        ) : (
                            <div
                                key={r.id}
                                className="group flex flex-none items-center gap-[9px] rounded-[9px] border border-[var(--cs-line)] bg-[var(--cs-card)] px-[10px] py-[8px] text-left"
                            >
                                {inner}
                            </div>
                        );
                    })
                )}
            </div>
        </PracticeModal>
    );
}
