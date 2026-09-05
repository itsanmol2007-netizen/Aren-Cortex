// ---------------------------------------------------------------------------
// THE PAYMENT RAIL — money, in its own column, revealing one thing at a time.
//
// ── What went wrong the first time
//
// v1 put paid/unpaid, all four payment methods, the discount type, the
// discount value and the visit-type toggle on screen simultaneously, inline,
// under the doctor field. Anmol, 2026-09-05: "why every button possible are
// all visible at once... this is not airplane cockpit."
//
// He was right, and the fix is not smaller controls — it is FEWER controls at
// any one moment. The rail now shows exactly one decision at a time:
//
//   1. What is this visit, and what does it cost   → always
//   2. Collect it, or don't                        → always, two buttons
//   3. HOW was it collected                        → only after Collect
//   4. Discount                                    → only after opening it
//
// Steps 3 and 4 do not exist on screen until someone asks for them. A
// receptionist registering a normal patient who pays cash touches one button.
//
// ── Why it is a rail and not another stacked section
//
// Registration is Information → Visit → Payment. Stacked, that is one very
// tall card and the money ends up below the fold. Beside it, the left column
// stays short, the total is always visible while the form is filled, and the
// two halves stop competing for the same vertical space.
// ---------------------------------------------------------------------------

import { useState } from "react";
import {
    Check, ChevronDown, ClipboardPlus, Clock, CreditCard, Info, Percent, RotateCcw,
} from "lucide-react";
import type {
    BillingPolicy, DiscountKind, FeeBreakdown, PaymentMethod, VisitType,
} from "@/lib/db/payments";

export type PayStatus = "undecided" | "paid" | "unpaid";

export interface FeeState {
    visitType: VisitType;
    discountKind: DiscountKind;
    /** Percent when kind is 'percent', rupees when 'amount'. A string because
     *  that is what an input carries; parsed once, at compute time. */
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

export function PaymentRail({
    state, onChange, policy, baseFee, breakdown, doctorName,
}: {
    state: FeeState;
    onChange: (next: FeeState) => void;
    policy: BillingPolicy;
    /** Resolved from the doctor + visit type. `null` = nothing to charge. */
    baseFee: number | null;
    breakdown: FeeBreakdown | null;
    doctorName: string;
}) {
    // Local, not lifted: whether a panel is OPEN is chrome, not data. Nothing
    // outside this component needs to know, and the parent re-rendering on
    // every keystroke of the patient's name must not collapse it.
    const [collecting, setCollecting] = useState(false);
    const [discountOpen, setDiscountOpen] = useState(false);

    const set = (patch: Partial<FeeState>) => onChange({ ...state, ...patch });

    const money = (n: number) =>
        new Intl.NumberFormat("en-IN", {
            style: "currency", currency: policy.currency,
            minimumFractionDigits: 0, maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
        }).format(n);

    // ── The visit-type control ────────────────────────────────────────────
    // Shown for EVERY patient, not only returning ones. Anmol, 2026-09-05:
    // "what if the clinic has installed the software and they have some
    // follow-up consultation?" — a clinic's first week is full of people who
    // are on their fifth visit as far as the DOCTOR is concerned and their
    // first as far as the database is. The database's opinion is not the
    // clinical fact, so the desk always gets to say.
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
                            "h-[38px] cursor-pointer rounded-[10px] border-[1.5px] text-[13px] font-bold transition-colors " +
                            (on
                                ? "border-[#5b4fe9] bg-[#eeecfe] text-[#4338ca]"
                                : "border-[#e4e2f0] bg-white text-[#6b7280] hover:border-[#c9c4ee] hover:text-[#3b4453]")
                        }
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );

    // ── No fee configured ─────────────────────────────────────────────────
    // The rail still exists (the visit type is a clinical fact worth recording
    // either way) but every money control is gone — not disabled, gone. One
    // line says why, so an admin eventually hears about it.
    if (baseFee === null || !breakdown) {
        return (
            <RailFrame>
                {visitTypeControl}
                <div className="mt-[12px] flex items-start gap-[8px] rounded-[10px] bg-[#f6f5fb] px-[11px] py-[10px]">
                    <Info size={14} className="mt-[1px] shrink-0 text-[#8a91a0]" />
                    <span className="text-[12px] leading-[1.45] text-[#5a6472]">
                        No fee is set for {doctorName || "this doctor"}. Ask your admin to add one —
                        the visit still registers normally.
                    </span>
                </div>
            </RailFrame>
        );
    }

    const decided = state.status !== "undecided";

    return (
        <RailFrame>
            {visitTypeControl}

            {/* ── The bill ─────────────────────────────────────────────── */}
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

            <div className="my-[12px] h-px bg-[#e8e6f2]" />

            <div className="flex items-baseline justify-between gap-[8px]">
                <span className="text-[15px] font-bold text-[#161d29]">Total</span>
                <span className="text-[26px] font-extrabold leading-none tracking-[-0.02em] tabular-nums text-[#161d29]">
                    {money(breakdown.total)}
                </span>
            </div>

            {/* ── The decision ─────────────────────────────────────────── */}
            <div className="mt-[14px] flex flex-col gap-[8px]">
                {decided ? (
                    // Settled. One confirmation strip and a way back — not the
                    // whole control set again.
                    <div
                        className={
                            "flex items-center gap-[9px] rounded-[11px] border-[1.5px] px-[12px] py-[11px] " +
                            (state.status === "paid"
                                ? "border-[#16a34a] bg-[#f0fdf4]"
                                : "border-[#d9822b] bg-[#fffaf3]")
                        }
                    >
                        <span className={state.status === "paid" ? "text-[#16a34a]" : "text-[#d9822b]"}>
                            {state.status === "paid" ? <Check size={16} strokeWidth={3} /> : <Clock size={16} />}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className={`block text-[13.5px] font-bold ${state.status === "paid" ? "text-[#15803d]" : "text-[#b45309]"}`}>
                                {state.status === "paid" ? `Collected ${money(breakdown.total)}` : "Marked unpaid"}
                            </span>
                            <span className="block text-[11.5px] text-[#6b7280]">
                                {state.status === "paid"
                                    ? METHODS.find((m) => m.key === state.method)?.label ?? "Cash"
                                    : "Collect later from the visit page"}
                            </span>
                        </span>
                        <button
                            type="button"
                            aria-label="Change payment"
                            title="Change"
                            onClick={() => { set({ status: "undecided", method: null }); setCollecting(false); }}
                            className="flex h-[28px] w-[28px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] text-[#8a91a0] transition-colors hover:bg-white hover:text-[#3b4453]"
                        >
                            <RotateCcw size={14} />
                        </button>
                    </div>
                ) : collecting ? (
                    // Step 3, and ONLY now: how was it paid.
                    <div className="flex flex-col gap-[8px]">
                        <span className="text-[12px] font-bold text-[#3b4453]">How was it paid?</span>
                        <div className="grid grid-cols-2 gap-[6px]">
                            {METHODS.map((m) => (
                                <button
                                    key={m.key}
                                    type="button"
                                    onClick={() => { set({ status: "paid", method: m.key }); setCollecting(false); }}
                                    className="h-[38px] cursor-pointer rounded-[10px] border-[1.5px] border-[#e4e2f0] bg-white text-[13px] font-bold text-[#3b4453] transition-colors hover:border-[#5b4fe9] hover:bg-[#f5f3ff] hover:text-[#4338ca]"
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={() => setCollecting(false)}
                            className="cursor-pointer self-start border-0 bg-transparent p-0 text-[12px] font-semibold text-[#8a91a0] hover:text-[#3b4453]"
                        >
                            Back
                        </button>
                    </div>
                ) : (
                    <>
                        <button
                            type="button"
                            onClick={() => setCollecting(true)}
                            className="flex h-[46px] w-full cursor-pointer items-center justify-center gap-[9px] rounded-[12px] border-0 bg-[#5b4fe9] text-[14.5px] font-bold text-white shadow-[0_4px_14px_rgba(91,79,233,0.34)] transition-[background-color,box-shadow] hover:bg-[#4a3fd4] hover:shadow-[0_5px_18px_rgba(91,79,233,0.46)]"
                        >
                            <CreditCard size={17} />
                            Collect {money(breakdown.total)}
                        </button>
                        <button
                            type="button"
                            onClick={() => set({ status: "unpaid", method: null })}
                            className="flex h-[42px] w-full cursor-pointer items-center justify-center gap-[8px] rounded-[12px] border-0 bg-[#f1f0f7] text-[13.5px] font-bold text-[#4b5563] transition-colors hover:bg-[#e7e5f2] hover:text-[#161d29]"
                        >
                            <Clock size={15} />
                            Mark as unpaid
                        </button>
                    </>
                )}
            </div>

            {/* ── Discount, collapsed until asked for ──────────────────── */}
            {policy.allowDiscount && (
                <div className="mt-[10px]">
                    <button
                        type="button"
                        onClick={() => {
                            const next = !discountOpen;
                            setDiscountOpen(next);
                            // Opening IS the intent to discount, so the unit
                            // starts at rupees rather than on a sentinel the
                            // receptionist would have to clear first. Closing
                            // is how a discount is taken back off.
                            if (next) { if (state.discountKind === "none") set({ discountKind: "amount" }); }
                            else set({ discountKind: "none", discountValue: "" });
                        }}
                        aria-expanded={discountOpen}
                        className="flex w-full cursor-pointer items-center gap-[8px] rounded-[9px] border-0 bg-transparent px-[2px] py-[7px] text-left text-[13px] font-semibold text-[#5b4fe9] transition-colors hover:text-[#4338ca]"
                    >
                        <Percent size={14} />
                        Adjust amount / discount
                        <ChevronDown
                            size={15}
                            className="ml-auto transition-transform duration-150"
                            style={{ transform: discountOpen ? "rotate(180deg)" : "none" }}
                        />
                    </button>

                    {discountOpen && (
                        // One box and one unit switch.
                        //
                        // The previous version offered None / Percent / Rupees
                        // as three equal buttons, which was wrong twice over:
                        // pressing "Adjust discount" IS the intent to discount,
                        // so "None" was a button that undid the click which
                        // revealed it — and three choices ate the rail's whole
                        // width to express one property. Clearing the box is
                        // "none"; closing the panel clears it.
                        <div className="mt-[4px] flex flex-col gap-[7px] rounded-[11px] bg-[#f8f7fd] p-[10px]">
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
                                    className="h-[36px] min-w-0 flex-1 rounded-[9px] border-[1.5px] border-[#e4e2f0] bg-white px-[11px] text-[14px] font-bold text-[#161d29] outline-none focus:border-[#5b4fe9]"
                                />
                                {/* A two-position switch, not two radio pills:
                                    the unit is one property with two states. */}
                                <div
                                    role="group"
                                    aria-label="Discount unit"
                                    className="flex h-[36px] shrink-0 overflow-hidden rounded-[9px] border-[1.5px] border-[#e4e2f0] bg-white"
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
                                                    "w-[38px] cursor-pointer border-0 text-[14px] font-bold transition-colors " +
                                                    (on ? "bg-[#5b4fe9] text-white" : "bg-transparent text-[#8a91a0] hover:text-[#3b4453]")
                                                }
                                            >
                                                {u.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <p className="m-0 text-[11px] leading-[1.45] text-[#8a91a0]">
                                The doctor's fee is set by your admin. Discounts are recorded against your name.
                            </p>
                        </div>
                    )}
                </div>
            )}

            <div className="mt-[12px] flex items-start gap-[8px] rounded-[10px] bg-[#f6f5fb] px-[11px] py-[9px]">
                <Info size={13} className="mt-[1px] shrink-0 text-[#8a91a0]" />
                <span className="text-[11.5px] leading-[1.45] text-[#6b7280]">
                    Payment can also be collected later from the visit page.
                </span>
            </div>
        </RailFrame>
    );
}

/** The rail's card. Its own component so the empty-fee branch and the full
 *  branch cannot drift apart on padding or border. */
function RailFrame({ children }: { children: React.ReactNode }) {
    return (
        <aside
            aria-label="Payment"
            className="flex flex-col rounded-[14px] border border-[#e8e6f2] bg-white p-[14px] shadow-[0_1px_3px_rgba(16,28,46,0.04)]"
        >
            <div className="mb-[12px] flex items-center gap-[9px]">
                <span className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[10px] bg-[#5b4fe9] text-white">
                    <ClipboardPlus size={16} />
                </span>
                <span className="text-[16px] font-extrabold tracking-[-0.01em] text-[#161d29]">Consultation</span>
            </div>
            {children}
        </aside>
    );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: "minus" }) {
    return (
        <div className="flex items-center justify-between gap-[8px]">
            <span className="text-[13px] text-[#5a6472]">{label}</span>
            <span className={`text-[13.5px] font-bold tabular-nums ${tone === "minus" ? "text-[#d23b34]" : "text-[#161d29]"}`}>
                {value}
            </span>
        </div>
    );
}
