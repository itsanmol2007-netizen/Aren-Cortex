import { useState } from "react";
import {
    Check, ChevronDown, Clock, CreditCard, Info, Percent, RotateCcw, Wallet,
} from "lucide-react";
import type {
    BillingPolicy, DiscountKind, FeeBreakdown, PaymentMethod, VisitType,
} from "@/lib/db/payments";

// ---------------------------------------------------------------------------
// THE PATIENT-MODAL PAYMENT RAIL — Cortex's own take on front desk's
// `PaymentRail` (2026-09-05), not a copy of it.
//
// Same job (one decision on screen at a time, never every control at once),
// same underlying fee maths (`lib/db/payments.ts` — shared, not re-derived),
// deliberately different skin: front desk is the flat indigo `#5b4fe9` of
// `fd-*`; `PatientModal` has run its own pink→violet gradient language
// (`.pm-*`, `components-modals.css`) since before this rail existed, so this
// reuses THAT palette (`#f472b6` / `#a855f7`) rather than importing a second
// accent into one modal. Built in Tailwind, not a new `.pm-*` class family —
// this is new surface, not an edit to the existing legacy sheet.
//
// Why Cortex needed no doctor picker, unlike front desk's rail: a Cortex
// visit is always assigned to the one signed-in doctor (`useClinicalIdentity`),
// so `baseFee`/`breakdown` arrive already resolved — this component only
// ever renders ONE doctor's numbers.
// ---------------------------------------------------------------------------

export type PayStatus = "undecided" | "paid" | "unpaid";

export interface FeeState {
    visitType: VisitType;
    discountKind: DiscountKind;
    /** Percent when kind is 'percent', rupees when 'amount' — a string
     *  because that's what an input carries; parsed once, at compute time. */
    discountValue: string;
    status: PayStatus;
    method: PaymentMethod | null;
}

export const INITIAL_FEE_STATE: FeeState = {
    visitType: "new",
    discountKind: "none",
    discountValue: "",
    status: "undecided",
    method: null,
};

const METHODS: { key: PaymentMethod; label: string }[] = [
    { key: "cash", label: "Cash" },
    { key: "upi", label: "UPI" },
    { key: "card", label: "Card" },
    { key: "other", label: "Other" },
];

export function PatientPaymentRail({
    state, onChange, policy, baseFee, breakdown, doctorName, needsDecision,
}: {
    state: FeeState;
    onChange: (next: FeeState) => void;
    policy: BillingPolicy;
    /** Resolved from the signed-in doctor + visit type. `null` = nothing to charge. */
    baseFee: number | null;
    breakdown: FeeBreakdown | null;
    doctorName: string;
    /**
     * True for one render — the moment `PatientModal` tried to confirm a
     * patient with a real fee still undecided ("just simply create a
     * patient without asking... confirm if it is paid or not"). Highlights
     * the Collect/Mark-as-unpaid buttons rather than silently letting the
     * visit through as pending; clears itself the instant either is
     * pressed (`PatientModal`'s `handleFeeChange` does that, not this
     * component — the rail stays a pure display of `state`).
     */
    needsDecision?: boolean;
}) {
    // Chrome, not data — stays local so the parent re-rendering on every
    // keystroke of the patient's name can't collapse an open panel.
    const [collecting, setCollecting] = useState(false);
    const [discountOpen, setDiscountOpen] = useState(false);

    const set = (patch: Partial<FeeState>) => onChange({ ...state, ...patch });

    const money = (n: number) =>
        new Intl.NumberFormat("en-IN", {
            style: "currency", currency: policy.currency,
            minimumFractionDigits: 0, maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
        }).format(n);

    const visitTypeControl = (
        <div className="grid grid-cols-2 gap-[6px]" role="group" aria-label="Visit type">
            {([
                { key: "new", label: "New visit" },
                { key: "follow_up", label: "Follow-up" },
            ] as { key: VisitType; label: string }[]).map((o) => {
                const on = state.visitType === o.key;
                return (
                    <button
                        key={o.key}
                        type="button"
                        aria-pressed={on}
                        onClick={() => set({ visitType: o.key })}
                        className={
                            "h-[36px] cursor-pointer rounded-[10px] border text-[12.5px] font-bold transition-colors " +
                            (on
                                ? "border-[#a855f7] bg-[#f5ecff] text-[#7c3aed]"
                                : "border-black/10 bg-white text-[#64748b] hover:border-[#d8b4fe] hover:text-[#334155]")
                        }
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );

    if (baseFee === null || !breakdown) {
        return (
            <RailFrame>
                {visitTypeControl}
                <div className="mt-[12px] flex items-start gap-[8px] rounded-[10px] bg-black/[0.03] px-[11px] py-[10px]">
                    <Info size={14} className="mt-[1px] shrink-0 text-[#94a3b8]" />
                    <span className="text-[12px] leading-[1.45] text-[#64748b]">
                        No fee is set for {doctorName || "you"} yet. Add one from Settings —
                        the visit still starts normally.
                    </span>
                </div>
            </RailFrame>
        );
    }

    const decided = state.status !== "undecided";

    return (
        <RailFrame>
            {visitTypeControl}

            <div className="mt-[14px] flex flex-col gap-[7px]">
                <Line label={state.visitType === "follow_up" ? "Follow-up fee" : "Consultation fee"} value={money(breakdown.base)} />
                {breakdown.discount > 0 && (
                    <Line
                        label={state.discountKind === "percent" ? `Discount (${Number(state.discountValue) || 0}%)` : "Discount"}
                        value={`−${money(breakdown.discount)}`}
                        tone="minus"
                    />
                )}
                {breakdown.gstAmount > 0 && (
                    <Line label={`GST (${policy.gstPercent}%)`} value={money(breakdown.gstAmount)} />
                )}
            </div>

            <div className="my-[12px] h-px bg-black/[0.06]" />

            <div className="flex items-baseline justify-between gap-[8px]">
                <span className="text-[14px] font-bold text-[#0f172a]">Total</span>
                <span className="text-[24px] font-extrabold leading-none tracking-[-0.02em] tabular-nums text-[#0f172a]">
                    {money(breakdown.total)}
                </span>
            </div>

            {needsDecision && !decided && (
                <div className="mt-[12px] flex items-center gap-[6px] rounded-[9px] bg-[#fef2f2] px-[10px] py-[7px] text-[11.5px] font-bold text-[#b91c1c]">
                    <Info size={13} className="shrink-0" />
                    Mark this visit paid or unpaid to continue
                </div>
            )}

            <div
                className={
                    "mt-[10px] flex flex-col gap-[8px] rounded-[13px] " +
                    (needsDecision && !decided ? "outline outline-2 outline-offset-[4px] outline-[#fca5a5]" : "")
                }
            >
                {decided ? (
                    <div
                        className={
                            "flex items-center gap-[9px] rounded-[11px] border px-[12px] py-[11px] " +
                            (state.status === "paid"
                                ? "border-[#16a34a]/40 bg-[#f0fdf4]"
                                : "border-[#b45309]/35 bg-[#fffaf3]")
                        }
                    >
                        <span className={state.status === "paid" ? "text-[#16a34a]" : "text-[#b45309]"}>
                            {state.status === "paid" ? <Check size={16} strokeWidth={3} /> : <Clock size={16} />}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className={`block text-[13px] font-bold ${state.status === "paid" ? "text-[#15803d]" : "text-[#92400e]"}`}>
                                {state.status === "paid" ? `Collected ${money(breakdown.total)}` : "Marked unpaid"}
                            </span>
                            <span className="block text-[11px] text-[#64748b]">
                                {state.status === "paid"
                                    ? METHODS.find((m) => m.key === state.method)?.label ?? "Cash"
                                    : "Collect later from the visit"}
                            </span>
                        </span>
                        <button
                            type="button"
                            aria-label="Change payment"
                            title="Change"
                            onClick={() => { set({ status: "undecided", method: null }); setCollecting(false); }}
                            className="flex h-[26px] w-[26px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] text-[#94a3b8] transition-colors hover:bg-white hover:text-[#334155]"
                        >
                            <RotateCcw size={13} />
                        </button>
                    </div>
                ) : collecting ? (
                    <div className="flex flex-col gap-[8px]">
                        <span className="text-[11.5px] font-bold text-[#334155]">How was it paid?</span>
                        <div className="grid grid-cols-2 gap-[6px]">
                            {METHODS.map((m) => (
                                <button
                                    key={m.key}
                                    type="button"
                                    onClick={() => { set({ status: "paid", method: m.key }); setCollecting(false); }}
                                    className="h-[36px] cursor-pointer rounded-[10px] border border-black/10 bg-white text-[12.5px] font-bold text-[#334155] transition-colors hover:border-[#a855f7] hover:bg-[#faf5ff] hover:text-[#7c3aed]"
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={() => setCollecting(false)}
                            className="cursor-pointer self-start border-0 bg-transparent p-0 text-[11.5px] font-semibold text-[#94a3b8] hover:text-[#334155]"
                        >
                            Back
                        </button>
                    </div>
                ) : (
                    <>
                        <button
                            type="button"
                            onClick={() => setCollecting(true)}
                            className="flex h-[44px] w-full cursor-pointer items-center justify-center gap-[9px] rounded-[12px] border-0 bg-gradient-to-br from-[#f472b6] to-[#a855f7] text-[14px] font-bold text-white shadow-[0_4px_14px_rgba(168,85,247,0.32)] transition-[opacity,box-shadow] hover:opacity-90 hover:shadow-[0_5px_18px_rgba(168,85,247,0.42)]"
                        >
                            <CreditCard size={16} />
                            Collect {money(breakdown.total)}
                        </button>
                        <button
                            type="button"
                            onClick={() => set({ status: "unpaid", method: null })}
                            className="flex h-[40px] w-full cursor-pointer items-center justify-center gap-[8px] rounded-[12px] border-0 bg-black/[0.04] text-[13px] font-bold text-[#4b5563] transition-colors hover:bg-black/[0.07] hover:text-[#0f172a]"
                        >
                            <Clock size={14} />
                            Mark as unpaid
                        </button>
                    </>
                )}
            </div>

            {policy.allowDiscount && (
                <div className="mt-[10px]">
                    <button
                        type="button"
                        onClick={() => {
                            const next = !discountOpen;
                            setDiscountOpen(next);
                            if (next) { if (state.discountKind === "none") set({ discountKind: "amount" }); }
                            else set({ discountKind: "none", discountValue: "" });
                        }}
                        aria-expanded={discountOpen}
                        className="flex w-full cursor-pointer items-center gap-[8px] rounded-[9px] border-0 bg-transparent px-[2px] py-[6px] text-left text-[12.5px] font-semibold text-[#a855f7] transition-colors hover:text-[#7c3aed]"
                    >
                        <Percent size={13} />
                        Adjust amount / discount
                        <ChevronDown
                            size={14}
                            className="ml-auto transition-transform duration-150"
                            style={{ transform: discountOpen ? "rotate(180deg)" : "none" }}
                        />
                    </button>

                    {discountOpen && (
                        <div className="mt-[4px] flex flex-col gap-[7px] rounded-[11px] bg-black/[0.025] p-[10px]">
                            <div className="flex items-center gap-[7px]">
                                <input
                                    type="number"
                                    min={0}
                                    max={state.discountKind === "percent" ? 100 : breakdown.base}
                                    inputMode="numeric"
                                    autoFocus
                                    value={state.discountValue}
                                    placeholder="0"
                                    aria-label={state.discountKind === "percent" ? "Discount percent" : "Discount amount"}
                                    onChange={(e) => set({ discountValue: e.target.value })}
                                    className="h-[34px] min-w-0 flex-1 rounded-[9px] border border-black/10 bg-white px-[11px] text-[13px] font-bold text-[#0f172a] outline-none focus:border-[#a855f7] focus:shadow-[0_0_0_3px_rgba(168,85,247,0.12)]"
                                />
                                <div
                                    role="group"
                                    aria-label="Discount unit"
                                    className="flex h-[34px] shrink-0 overflow-hidden rounded-[9px] border border-black/10 bg-white"
                                >
                                    {([
                                        { key: "amount", label: "₹" },
                                        { key: "percent", label: "%" },
                                    ] as { key: DiscountKind; label: string }[]).map((u) => {
                                        const on = state.discountKind === u.key;
                                        return (
                                            <button
                                                key={u.key}
                                                type="button"
                                                aria-pressed={on}
                                                onClick={() => set({ discountKind: u.key })}
                                                className={
                                                    "w-[36px] cursor-pointer border-0 text-[13px] font-bold transition-colors " +
                                                    (on
                                                        ? "bg-gradient-to-br from-[#f472b6] to-[#a855f7] text-white"
                                                        : "bg-transparent text-[#94a3b8] hover:text-[#334155]")
                                                }
                                            >
                                                {u.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <p className="m-0 text-[10.5px] leading-[1.45] text-[#94a3b8]">
                                Your admin sets the fee. Discounts are recorded against your name.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </RailFrame>
    );
}

/**
 * The rail's own header + body spacing — NOT a card. `PatientModal` renders
 * this content AS a column inside its own single `.pm-card`, divided from
 * the form by nothing more than a hairline — the same shape front desk's
 * `CreateVisitModal` uses for its rail (one modal, two columns), and the
 * one this used to get wrong: an independent bordered/shadowed `<aside>`
 * sitting beside (or, once the form grew taller than the viewport, BELOW
 * and partly UNDER) the modal read as two unrelated floating cards rather
 * than one surface, and the resulting overlap silently ate clicks — "Follow-
 * up"/"Adjust amount" appeared to do nothing because the tap was landing on
 * whatever was actually on top at that pixel, not this component at all.
 * Fixed by deleting the card chrome entirely, not by raising a z-index.
 */
function RailFrame({ children }: { children: React.ReactNode }) {
    return (
        <div aria-label="Payment" className="flex flex-1 flex-col">
            <div className="mb-[12px] flex items-center gap-[9px]">
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-gradient-to-br from-[#fce7f3] to-[#ede9fe] text-[#a855f7]">
                    <Wallet size={15} />
                </span>
                <span className="text-[15px] font-extrabold tracking-[-0.01em] text-[#0f172a]">Visit fee</span>
            </div>
            {children}
        </div>
    );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: "minus" }) {
    return (
        <div className="flex items-center justify-between gap-[8px]">
            <span className="text-[12.5px] text-[#64748b]">{label}</span>
            <span className={`text-[13px] font-bold tabular-nums ${tone === "minus" ? "text-[#dc2626]" : "text-[#0f172a]"}`}>
                {value}
            </span>
        </div>
    );
}
