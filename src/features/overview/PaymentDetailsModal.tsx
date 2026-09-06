// ---------------------------------------------------------------------------
// PAYMENT DETAILS — what the Overview "Collected" tile opens onto.
//
// Progressive disclosure, per Anmol's brief: the tile shows one number: the
// tile opens onto what made it: totals, counts, recent transactions. The fee
// a doctor charges lives at the BOTTOM of this same view, as a secondary,
// clearly-separated action — not a fifth Overview card of its own. "Don't add
// a new card when an existing card can become the entry point."
//
// Scoped to the SAME range Overview's period bar is showing, not "all time":
// a doctor who picked "This month" on the tile and opens this expects the
// transactions under that number, not a different, larger question.
//
// Chrome is `PracticeModal`, like every modal in the app. Violet, because
// that is already this codebase's money colour (Parallax's "Collected" tile,
// every rupee figure an admin doctor sees) — not a new accent for this one view.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { Check, IndianRupee, Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { PracticeModal } from "../practice/PracticeModal";
import { BigEmpty, ConversationArt } from "../communication/parts";
import { SkeletonRows } from "../clinic/ui";
import {
    fetchDoctorPaymentSummary, fetchFeeSettings, formatMoney, formatRangeLabel,
    updateDoctorFees,
    type DateRange, type DoctorPaymentSummary,
} from "../../lib/db/admin";

interface Props {
    hospitalId: string;
    doctorId: string;
    range: DateRange;
    onClose: () => void;
}

function stamp(iso: string): string {
    const at = new Date(iso);
    const today = new Date().toDateString() === at.toDateString();
    const time = at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toLowerCase();
    return today
        ? `Today, ${time}`
        : `${at.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${time}`;
}

export function PaymentDetailsModal({ hospitalId, doctorId, range, onClose }: Props) {
    const [summary, setSummary] = useState<DoctorPaymentSummary | null>(null);
    const [currentFee, setCurrentFee] = useState<number | null | undefined>(undefined); // undefined = still loading
    const [followUpFee, setFollowUpFee] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [editingFee, setEditingFee] = useState(false);
    const [feeInput, setFeeInput] = useState("");
    const [savingFee, setSavingFee] = useState(false);

    useEffect(() => {
        let alive = true;
        fetchDoctorPaymentSummary(hospitalId, doctorId, range)
            .then((s) => { if (alive) setSummary(s); })
            .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : "Could not load payments"); });
        fetchFeeSettings(hospitalId)
            .then((fs) => {
                if (!alive) return;
                const mine = fs.doctors.find((d) => d.id === doctorId);
                setCurrentFee(mine?.consultationFee ?? null);
                setFollowUpFee(mine?.followUpFee ?? null);
            })
            .catch(() => { if (alive) setCurrentFee(null); });
        return () => { alive = false; };
    }, [hospitalId, doctorId, range]);

    const startEdit = () => {
        setFeeInput(currentFee != null ? String(currentFee) : "");
        setEditingFee(true);
    };

    const saveFee = async () => {
        const n = Number(feeInput.trim());
        if (!feeInput.trim() || !Number.isFinite(n) || n < 0) {
            toast.error("Enter a valid amount");
            return;
        }
        setSavingFee(true);
        try {
            // Only the consultation fee is editable here — the follow-up fee
            // has no rule yet for what counts as a follow-up (parallax-admin.md,
            // "Open") and stays whatever Parallax's own Fees screen last set,
            // carried through unchanged rather than silently cleared.
            await updateDoctorFees(doctorId, { consultationFee: n, followUpFee });
            setCurrentFee(n);
            setEditingFee(false);
            toast.success("Consultation fee updated");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not save the fee");
        } finally {
            setSavingFee(false);
        }
    };

    return (
        <PracticeModal
            accent="violet"
            icon={<IndianRupee size={15} />}
            eyebrow="Payments"
            title="Payment details"
            onClose={onClose}
            dirty={editingFee}
            wide
        >
            <p className="m-0 -mt-[4px] flex-none text-[11px] text-[var(--cs-faint)]">
                {formatRangeLabel(range)}
            </p>

            {error ? (
                <p className="m-0 flex-none rounded-[10px] bg-[var(--cs-red-soft)] px-[10px] py-[8px] text-[11.5px] font-medium text-[var(--cs-red)]">
                    {error}
                </p>
            ) : !summary ? (
                <SkeletonRows count={4} />
            ) : (
                <>
                    {/* ── Pinned: the numbers ─────────────────────────────── */}
                    <div className="grid flex-none grid-cols-2 gap-[8px]">
                        <div className="flex flex-col gap-[2px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[12px] py-[9px]">
                            <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--cs-label)]">
                                Total collected
                            </span>
                            <span className="text-[19px] font-bold leading-[1.15] tabular-nums text-[var(--cs-green)]">
                                {formatMoney(summary.totalCollected)}
                            </span>
                            <span className="text-[10.5px] text-[var(--cs-faint)]">
                                {summary.paidCount} paid consultation{summary.paidCount === 1 ? "" : "s"}
                            </span>
                        </div>
                        <div className="flex flex-col gap-[2px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[12px] py-[9px]">
                            <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--cs-label)]">
                                Pending
                            </span>
                            <span className="text-[19px] font-bold leading-[1.15] tabular-nums text-[var(--cs-amber)]">
                                {formatMoney(summary.pendingAmount)}
                            </span>
                            <span className="text-[10.5px] text-[var(--cs-faint)]">
                                {summary.pendingCount} pending payment{summary.pendingCount === 1 ? "" : "s"}
                            </span>
                        </div>
                    </div>

                    {/* ── Scrolls: the transactions ───────────────────────── */}
                    <div className="mt-[10px] flex min-h-0 flex-1 flex-col">
                        <span className="flex-none pb-[6px] text-[11px] font-bold uppercase tracking-[0.07em] text-[var(--cs-label)]">
                            Recent transactions
                        </span>
                        <div className="flex min-h-0 flex-1 flex-col gap-[4px] overflow-y-auto">
                            {summary.transactions.length === 0 ? (
                                <BigEmpty
                                    art={<ConversationArt size={110} />}
                                    fact="No transactions in this period"
                                    next="Payments recorded at the desk show up here."
                                />
                            ) : (
                                summary.transactions.map((t) => (
                                    <div
                                        key={t.id}
                                        className="flex flex-none items-center gap-[9px] rounded-[9px] border border-[var(--cs-line)] bg-[var(--cs-card)] px-[10px] py-[7px]"
                                    >
                                        <span className="flex min-w-0 flex-col gap-[1px]">
                                            <span className="truncate text-[12px] font-semibold text-[var(--cs-ink)]">
                                                {t.patientName ?? "Unknown patient"}
                                            </span>
                                            <span className="text-[10.5px] text-[var(--cs-faint)]">{stamp(t.at)}</span>
                                        </span>
                                        <span className="ml-auto flex flex-none flex-col items-end gap-[1px]">
                                            <span className="text-[12.5px] font-bold tabular-nums text-[var(--cs-ink)]">
                                                {formatMoney(t.amount)}
                                            </span>
                                            <span
                                                className={
                                                    "text-[10px] font-semibold capitalize " +
                                                    (t.status === "paid" ? "text-[var(--cs-green)]" : "text-[var(--cs-amber)]")
                                                }
                                            >
                                                {t.status}
                                            </span>
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* ── The secondary setting, at the bottom ────────────────────
                Exactly the shape the spec asks for: a fact, then "Edit fee";
                editing swaps it for an input and "Save changes" in place,
                never a second modal on top of this one. */}
            <div className="mt-[2px] flex-none border-t border-[var(--cs-line)] pt-[10px]">
                {editingFee ? (
                    <div className="flex flex-col gap-[7px]">
                        <span className="text-[11px] font-semibold text-[var(--cs-muted)]">
                            New consultation fee
                        </span>
                        <div className="flex items-center gap-[8px]">
                            <div className="relative flex-1">
                                <IndianRupee size={12} aria-hidden="true" className="pointer-events-none absolute left-[10px] top-1/2 -translate-y-1/2 text-[var(--cs-faint)]" />
                                <input
                                    type="number" min={0} step={10} inputMode="numeric" autoFocus
                                    value={feeInput}
                                    onChange={(e) => setFeeInput(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") void saveFee(); if (e.key === "Escape") setEditingFee(false); }}
                                    // Every one of these carries the trailing
                                    // `!` on purpose: `styles/base.css` sets
                                    // an UNLAYERED `input, select { height:
                                    // 31px; padding:0 9px; font-size:13px }`
                                    // that beats a plain Tailwind utility
                                    // regardless of source order (cortex-
                                    // gotchas.md). Measured live 2026-09-07:
                                    // without the bang, base.css's `padding:
                                    // 0 9px` won the left-padding property
                                    // outright, so the ₹ icon sat on TOP of
                                    // the fee's first digit ("₹00" for 400).
                                    className="h-[36px]! w-full rounded-[9px]! border! border-[var(--cs-line-strong)]! bg-white pl-[26px]! pr-[10px]! text-[13px]! text-[var(--cs-ink)] outline-none focus:border-[var(--cs-violet)]! focus:shadow-[0_0_0_3px_var(--cs-violet-soft)]"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => void saveFee()}
                                disabled={savingFee}
                                className="flex h-[36px] flex-none cursor-pointer items-center gap-[5px] rounded-[9px] border-0 bg-[var(--cs-violet)] px-[14px] text-[12.5px] font-bold text-white outline-none hover:opacity-90 disabled:opacity-50"
                            >
                                {savingFee ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                                Save changes
                            </button>
                            <button
                                type="button"
                                onClick={() => setEditingFee(false)}
                                disabled={savingFee}
                                aria-label="Cancel"
                                className="grid h-[36px] w-[36px] flex-none cursor-pointer place-items-center rounded-[9px] border border-[var(--cs-line-strong)] bg-transparent text-[var(--cs-faint)] outline-none hover:bg-[#f1f5f9] disabled:opacity-50"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-[10px]">
                        <span className="flex min-w-0 flex-col gap-[1px]">
                            <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[var(--cs-label)]">
                                Consultation fee
                            </span>
                            <span className="text-[14px] font-bold text-[var(--cs-ink)]">
                                {currentFee === undefined
                                    ? "—"
                                    : currentFee === null
                                        ? "Not set"
                                        : `${formatMoney(currentFee)} / consultation`}
                            </span>
                        </span>
                        <button
                            type="button"
                            onClick={startEdit}
                            disabled={currentFee === undefined}
                            className="ml-auto inline-flex flex-none cursor-pointer items-center gap-[5px] rounded-full border border-[var(--cs-line-strong)] bg-transparent px-[12px] py-[6px] text-[11.5px] font-semibold text-[var(--cs-ink)] outline-none transition-colors hover:border-[var(--cs-violet)] hover:text-[var(--cs-violet)] disabled:opacity-50"
                        >
                            <Pencil size={11} /> Edit fee
                        </button>
                    </div>
                )}
                <p className="m-0 mt-[6px] text-[10.5px] leading-[1.4] text-[var(--cs-faint)]">
                    This becomes the default amount used for future consultations. It never
                    changes a fee already recorded on a past visit.
                </p>
            </div>
        </PracticeModal>
    );
}
