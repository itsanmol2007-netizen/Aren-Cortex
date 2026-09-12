import { useEffect, useRef, useState } from "react";
import {
    Check, ChevronDown, Clock, CreditCard, Info, Lock, Percent, RotateCcw, Split, Wallet,
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
//
// ── 2026-09-08: `lockReason`
//
// This rail never wrote anything prematurely — a decision here is only ever
// a PLAN, applied by `PatientModal.onConfirm` at the moment a real patient
// is actually established — but nothing stopped a doctor from reaching a
// confirmed-looking "Will collect ₹472" box with NO patient chosen at all
// (fresh modal, "Search existing" tab, nothing typed). Reads as broken
// regardless of what is or isn't written. `lockReason` disables the
// deciding controls until `PatientModal` says there's a real patient
// context to attach the plan to — see its own doc comment.
// ---------------------------------------------------------------------------

export type PayStatus = "undecided" | "paid" | "unpaid";

/** Two methods, two amounts, one total — the whole shape a split payment
 *  needs. `firstAmount + secondAmount` always equals the total being
 *  collected; the rail enforces that by deriving one from the other rather
 *  than ever letting both be typed independently. Three-way splits don't
 *  exist here — Anmol's own spec was two ("you click on that UPI card, and
 *  that will automatically convert into something where you can insert
 *  thing... adjusted with 100 INR"), and every extra method is one more
 *  reconciliation question a receptionist actually has to answer at the
 *  till, not fewer. */
export interface SplitPayment {
    firstMethod: PaymentMethod;
    firstAmount: number;
    secondMethod: PaymentMethod;
    secondAmount: number;
}

export interface FeeState {
    visitType: VisitType;
    discountKind: DiscountKind;
    /** Percent when kind is 'percent', rupees when 'amount' — a string
     *  because that's what an input carries; parsed once, at compute time. */
    discountValue: string;
    status: PayStatus;
    method: PaymentMethod | null;
    /** Set only when `method` was collected across two methods at once —
     *  `method` itself stays the FIRST portion's method, so every other
     *  reader of `FeeState` (the "Will collect ₹472" summary, the eventual
     *  DB write) that only ever looked at `method` still gets a real,
     *  correct answer instead of `null`; this is the second portion. */
    split: SplitPayment | null;
}

export const INITIAL_FEE_STATE: FeeState = {
    visitType: "new",
    discountKind: "none",
    discountValue: "",
    status: "undecided",
    method: null,
    split: null,
};

// One ring, every button in this rail. Violet reads clearly against the
// modal's light backdrop regardless of what the button itself is filled
// with — a WHITE ring (the obvious choice for the dark Collect/Confirm-split
// buttons) would have blended into the same light backdrop it sits on,
// which is exactly the "gray-on-gray" disappearing-focus Anmol flagged
// (2026-09-12): the ring's own contrast is against its SURROUNDINGS, not
// the control it outlines. `outline`, not `box-shadow` or `border`, so it
// never nudges layout and never gets clipped by a parent's `overflow`.
//
// NOT `focus-visible:outline focus-visible:outline-[…]` — Tailwind's bare
// `outline` utility resolves its style through the SAME shared
// `--tw-outline-style` custom property that `outline-none` writes to, and
// `focus:outline-none` (needed to suppress the ring on a plain mouse click)
// pins that variable to `none` for every `:focus` state — which
// `:focus-visible` always also is. The `focus-visible:outline` rule then
// reads its own already-overridden variable and the ring silently never
// draws (confirmed against the built CSS: verified by measuring an
// actually-focused button's computed style, not by reading the class list).
// The arbitrary-property form below sets the literal `outline` shorthand
// directly, sidestepping that shared variable entirely.
const FOCUS_RING =
    "focus:outline-none focus-visible:[outline:2.5px_solid_#a855f7] focus-visible:outline-offset-2";

const METHODS: { key: PaymentMethod; label: string }[] = [
    { key: "cash", label: "Cash" },
    { key: "upi", label: "UPI" },
    { key: "card", label: "Card" },
    { key: "other", label: "Other" },
];

export function PatientPaymentRail({
    state, onChange, onCommit, policy, baseFee, breakdown, doctorName, needsDecision, lockReason, isSubmitting = false,
    containerRef: externalRailRef,
}: {
    state: FeeState;
    onChange: (next: FeeState) => void;
    /**
     * Called the instant the doctor makes the paid/unpaid call — this rail's
     * two buttons ARE the submit now (`PatientModal` removed its own "Start
     * consult" button when a fee is on the table). The decision is passed
     * explicitly rather than read back from `state`, which has not flushed
     * through React yet at call time. Optional: without it the rail just
     * records the decision and shows its "Will collect …" summary as before.
     */
    onCommit?: (decision: { status: "paid" | "unpaid"; method: PaymentMethod | null; split?: SplitPayment | null }) => void;
    policy: BillingPolicy;
    /** Resolved from the signed-in doctor + visit type. `null` = nothing to charge. */
    baseFee: number | null;
    breakdown: FeeBreakdown | null;
    doctorName: string;
    needsDecision?: boolean;
    lockReason?: string;
    isSubmitting?: boolean;
    /** Handed down by `PatientModal` so IT can focus the rail's first
     *  control the instant a patient is selected off the roving search list
     *  — "you click enter, and then automatically highlight to the payment
     *  rail" (Anmol). Same DOM node the arrow-key handler below already
     *  walks; exposing it is simpler than a second imperative API. */
    containerRef?: React.RefObject<HTMLDivElement | null>;
}) {
    const locked = !!lockReason || isSubmitting;
    // Chrome, not data — stays local so the parent re-rendering on every
    // keystroke of the patient's name can't collapse an open panel.
    const [collecting, setCollecting] = useState(false);
    const [discountOpen, setDiscountOpen] = useState(false);
    // The split sub-flow's own scratch state — local for the same reason
    // `collecting` is: it's mid-decision chrome, not a fact worth round-
    // tripping through the parent until the doctor actually confirms it.
    const [splitting, setSplitting] = useState(false);
    const [splitFirstMethod, setSplitFirstMethod] = useState<PaymentMethod>("cash");
    const [splitSecondMethod, setSplitSecondMethod] = useState<PaymentMethod>("upi");
    const [splitFirstAmount, setSplitFirstAmount] = useState("");

    // ── Arrow-key travel across the rail's own controls ─────────────────────
    // "you simply click on down arrow, patient is selected, you click enter,
    // and then automatically highlight to the payment rail... select payment
    // method... by side arrows" (Anmol). Real <button>s already answer Enter/
    // Space on their own — the only thing missing was arrows moving focus
    // BETWEEN them, so this walks whichever buttons are actually visible
    // right now (visit type, then Collect/Mark-unpaid or the method grid or
    // the split sub-form, depending on where the doctor is in the flow) in
    // DOM order. Left/Up = back, Right/Down = forward, and it wraps rather
    // than falling off the end — one small ring, not a cliff.
    const internalRailRef = useRef<HTMLDivElement>(null);
    const railRef = externalRailRef ?? internalRailRef;
    const onRailKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
        // Never steal arrows from a text input (the split amount field) —
        // there, Left/Right mean "move the cursor," not "change focus."
        if ((e.target as HTMLElement).tagName === "INPUT") return;
        const focusable = Array.from(
            railRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []
        );
        const i = focusable.indexOf(document.activeElement as HTMLButtonElement);
        if (i === -1) return;
        e.preventDefault();
        const dir = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
        focusable[(i + dir + focusable.length) % focusable.length]?.focus();
    };

    // Which of the four decision states is on screen right now — moved above
    // the no-fee early return below because the effect right after it needs
    // to run on every render, hook rules and all.
    const decided = state.status !== "undecided";

    // ── Keep focus INSIDE the rail across a decision transition ────────────
    // 2026-09-12, Anmol: "you click enter [on Collect], and then this thing
    // just disappeared, now the whole arrow movement [stopped working]."
    // Root cause: pressing Enter on "Collect ₹total" swaps it out for the
    // method grid — the focused button is removed from the DOM, and the
    // BROWSER resets focus to <body> the instant that happens (React does
    // not choose a new focus target for you). `onRailKeyDown` above walks
    // `document.activeElement` through the rail's own buttons, but a
    // keydown fired while `document.body` is focused never even reaches
    // this div's listener — it doesn't bubble down. So the fix isn't in the
    // arrow handler at all: whichever new controls just appeared need to
    // actually receive focus once they land, or the whole mechanism goes
    // quiet with no error and no visible cause.
    //
    // Skipped on the very first mount (`mountedRef`) — `PatientModal` has
    // its own reason for deciding WHEN this rail first earns focus (the
    // instant a patient is picked off the search list, per the
    // `containerRef` doc above); this effect only ever repairs a transition
    // that has already happened, never grabs focus unprompted on open. And
    // skipped entirely if focus is already somewhere inside the decision
    // area — the split amount input's own `autoFocus` already lands there
    // first, and this must never fight it.
    const decisionAreaRef = useRef<HTMLDivElement>(null);
    const mountedRef = useRef(false);
    useEffect(() => {
        if (!mountedRef.current) {
            mountedRef.current = true;
            return;
        }
        const root = decisionAreaRef.current;
        if (!root || root.contains(document.activeElement)) return;
        root.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    }, [decided, collecting, splitting]);

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
                            FOCUS_RING + " " +
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

    return (
        <RailFrame rootRef={railRef} onKeyDown={onRailKeyDown}>
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

            {locked ? (
                <div className="mt-[12px] flex items-center gap-[7px] rounded-[9px] bg-black/[0.03] px-[10px] py-[8px] text-[11.5px] leading-[1.4] text-[#64748b]">
                    <Lock size={12} className="shrink-0" />
                    {lockReason}
                </div>
            ) : needsDecision && !decided && (
                <div className="mt-[12px] flex items-center gap-[6px] rounded-[9px] bg-[#fef2f2] px-[10px] py-[7px] text-[11.5px] font-bold text-[#b91c1c]">
                    <Info size={13} className="shrink-0" />
                    Mark this visit paid or unpaid to continue
                </div>
            )}

            <div
                ref={decisionAreaRef}
                className={
                    "mt-[10px] flex flex-col gap-[8px] rounded-[13px] " +
                    (needsDecision && !decided && !locked ? "outline outline-2 outline-offset-[4px] outline-[#fca5a5]" : "")
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
                            {/* Future tense, deliberately — see this component's
                                own prop doc for `needsDecision`. Nothing is
                                actually recorded by picking Collect/Cash here;
                                only confirming a patient below writes anything
                                anywhere. "Collected ₹472" read as a completed,
                                already-recorded transaction to a doctor who
                                had not even picked a patient yet — this is
                                the plan for whichever patient gets confirmed,
                                not a receipt. */}
                            <span className={`block text-[13px] font-bold ${state.status === "paid" ? "text-[#15803d]" : "text-[#92400e]"}`}>
                                {state.status === "paid" ? `Will collect ${money(breakdown.total)}` : "Will mark unpaid"}
                            </span>
                            <span className="block text-[11px] text-[#64748b]">
                                {state.status === "paid"
                                    ? state.split
                                        ? `${METHODS.find((m) => m.key === state.split!.firstMethod)?.label} ${money(state.split.firstAmount)} + ${METHODS.find((m) => m.key === state.split!.secondMethod)?.label} ${money(state.split.secondAmount)} — once you confirm a patient`
                                        : `${METHODS.find((m) => m.key === state.method)?.label ?? "Cash"} — once you confirm a patient`
                                    : "Recorded once you confirm a patient"}
                            </span>
                        </span>
                        <button
                            type="button"
                            aria-label="Change payment"
                            title="Change"
                            onClick={() => { set({ status: "undecided", method: null, split: null }); setCollecting(false); setSplitting(false); }}
                            className={"flex h-[26px] w-[26px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] text-[#94a3b8] transition-colors hover:bg-white hover:text-[#334155] " + FOCUS_RING}
                        >
                            <RotateCcw size={13} />
                        </button>
                    </div>
                ) : collecting && splitting ? (
                    // ── Split: pick two methods, type one amount, the other
                    // balances itself. "you click on split... it asks what
                    // way to split... you click on UPI, and then you enter
                    // 400 there, and then you click on credit card... that
                    // will automatically be adjusted with 100 INR" (Anmol).
                    (() => {
                        const total = breakdown.total;
                        const firstAmt = Math.max(0, Math.min(total, Math.round(Number(splitFirstAmount) || 0)));
                        const secondAmt = Math.max(0, total - firstAmt);
                        const validFirst = splitFirstAmount.trim() !== "" && firstAmt > 0 && firstAmt < total;
                        const confirmSplit = () => {
                            if (!validFirst) return;
                            const split: SplitPayment = {
                                firstMethod: splitFirstMethod, firstAmount: firstAmt,
                                secondMethod: splitSecondMethod, secondAmount: secondAmt,
                            };
                            set({ status: "paid", method: splitFirstMethod, split });
                            setCollecting(false);
                            setSplitting(false);
                            onCommit?.({ status: "paid", method: splitFirstMethod, split });
                        };
                        return (
                            <div className="flex flex-col gap-[9px]">
                                <span className="text-[11.5px] font-bold text-[#334155]">Split {money(total)} across two methods</span>

                                <div className="flex flex-col gap-[5px]">
                                    <span className="text-[10.5px] font-semibold text-[#94a3b8]">First method</span>
                                    <div className="grid grid-cols-4 gap-[5px]">
                                        {METHODS.map((m) => (
                                            <button
                                                key={m.key}
                                                type="button"
                                                aria-pressed={splitFirstMethod === m.key}
                                                onClick={() => {
                                                    setSplitFirstMethod(m.key);
                                                    // The two sides can never be the same method —
                                                    // bump the second one out of the way rather than
                                                    // silently letting "Cash + Cash" through.
                                                    if (m.key === splitSecondMethod) {
                                                        setSplitSecondMethod(METHODS.find((x) => x.key !== m.key)!.key);
                                                    }
                                                }}
                                                className={
                                                    "h-[32px] cursor-pointer rounded-[8px] border text-[11.5px] font-bold transition-colors " +
                                                    FOCUS_RING + " " +
                                                    (splitFirstMethod === m.key
                                                        ? "border-[#a855f7] bg-[#f5ecff] text-[#7c3aed]"
                                                        : "border-black/10 bg-white text-[#64748b] hover:border-[#d8b4fe]")
                                                }
                                            >
                                                {m.label}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="relative">
                                        <span className="pointer-events-none absolute left-[10px] top-1/2 -translate-y-1/2 text-[12.5px] font-bold text-[#94a3b8]">
                                            {policy.currency === "INR" ? "₹" : ""}
                                        </span>
                                        <input
                                            type="number"
                                            min={1}
                                            max={total - 1}
                                            inputMode="numeric"
                                            autoFocus
                                            value={splitFirstAmount}
                                            onChange={(e) => setSplitFirstAmount(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === "Enter") confirmSplit(); }}
                                            placeholder={`Amount via ${METHODS.find((m) => m.key === splitFirstMethod)?.label}`}
                                            aria-label={`Amount collected via ${METHODS.find((m) => m.key === splitFirstMethod)?.label}`}
                                            className="h-[36px] w-full rounded-[9px] border border-black/10 bg-white pl-[24px] pr-[10px] text-[13px] font-bold text-[#0f172a] outline-none focus:border-[#a855f7] focus:shadow-[0_0_0_3px_rgba(168,85,247,0.12)]"
                                        />
                                    </div>
                                </div>

                                <div className="flex flex-col gap-[5px]">
                                    <span className="text-[10.5px] font-semibold text-[#94a3b8]">
                                        Second method — the rest, {money(secondAmt)}
                                    </span>
                                    <div className="grid grid-cols-4 gap-[5px]">
                                        {METHODS.map((m) => (
                                            <button
                                                key={m.key}
                                                type="button"
                                                disabled={m.key === splitFirstMethod}
                                                aria-pressed={splitSecondMethod === m.key}
                                                onClick={() => setSplitSecondMethod(m.key)}
                                                className={
                                                    "h-[32px] cursor-pointer rounded-[8px] border text-[11.5px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-30 " +
                                                    FOCUS_RING + " " +
                                                    (splitSecondMethod === m.key
                                                        ? "border-[#a855f7] bg-[#f5ecff] text-[#7c3aed]"
                                                        : "border-black/10 bg-white text-[#64748b] hover:border-[#d8b4fe]")
                                                }
                                            >
                                                {m.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex items-center gap-[8px]">
                                    <button
                                        type="button"
                                        onClick={() => setSplitting(false)}
                                        className={"cursor-pointer self-start rounded-[4px] border-0 bg-transparent p-0 text-[11.5px] font-semibold text-[#94a3b8] hover:text-[#334155] " + FOCUS_RING}
                                    >
                                        Back
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!validFirst}
                                        onClick={confirmSplit}
                                        className={"ml-auto flex h-[34px] cursor-pointer items-center gap-[6px] rounded-[9px] border-0 bg-gradient-to-br from-[#f472b6] to-[#a855f7] px-[14px] text-[12.5px] font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 " + FOCUS_RING}
                                    >
                                        <Check size={13} /> Confirm split
                                    </button>
                                </div>
                            </div>
                        );
                    })()
                ) : collecting ? (
                    <div className="flex flex-col gap-[8px]">
                        <span className="text-[11.5px] font-bold text-[#334155]">How was it paid?</span>
                        <div className="grid grid-cols-2 gap-[6px]">
                            {METHODS.map((m) => (
                                <button
                                    key={m.key}
                                    type="button"
                                    disabled={locked}
                                    onClick={() => {
                                        set({ status: "paid", method: m.key, split: null });
                                        setCollecting(false);
                                        onCommit?.({ status: "paid", method: m.key });
                                    }}
                                    className={"h-[36px] cursor-pointer rounded-[10px] border border-black/10 bg-white text-[12.5px] font-bold text-[#334155] transition-colors hover:border-[#a855f7] hover:bg-[#faf5ff] hover:text-[#7c3aed] disabled:cursor-not-allowed " + FOCUS_RING}
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>
                        {/* Split lives BELOW the four methods, its own full-width
                            row — Anmol described it as a fifth option in the same
                            breath as the methods themselves, not a buried
                            "advanced" toggle: "we already asked if we are
                            collecting this in UPI cash or something, this will
                            be a simple option of split payment." */}
                        <button
                            type="button"
                            disabled={locked}
                            onClick={() => {
                                setSplitFirstAmount("");
                                setSplitFirstMethod("cash");
                                setSplitSecondMethod("upi");
                                setSplitting(true);
                            }}
                            className={"flex h-[34px] w-full cursor-pointer items-center justify-center gap-[6px] rounded-[10px] border border-dashed border-black/15 bg-transparent text-[12px] font-bold text-[#64748b] transition-colors hover:border-[#a855f7] hover:text-[#7c3aed] disabled:cursor-not-allowed " + FOCUS_RING}
                        >
                            <Split size={13} /> Split across two methods
                        </button>
                        <button
                            type="button"
                            onClick={() => setCollecting(false)}
                            className={"cursor-pointer self-start rounded-[4px] border-0 bg-transparent p-0 text-[11.5px] font-semibold text-[#94a3b8] hover:text-[#334155] " + FOCUS_RING}
                        >
                            Back
                        </button>
                    </div>
                ) : (
                    <>
                        <button
                            type="button"
                            disabled={locked}
                            onClick={() => setCollecting(true)}
                            className={"flex h-[44px] w-full cursor-pointer items-center justify-center gap-[9px] rounded-[12px] border-0 bg-gradient-to-br from-[#f472b6] to-[#a855f7] text-[14px] font-bold text-white shadow-[0_4px_14px_rgba(168,85,247,0.32)] transition-[opacity,box-shadow] hover:opacity-90 hover:shadow-[0_5px_18px_rgba(168,85,247,0.42)] disabled:cursor-not-allowed disabled:shadow-none " + FOCUS_RING}
                        >
                            <CreditCard size={16} />
                            Collect {money(breakdown.total)}
                        </button>
                        <button
                            type="button"
                            disabled={locked}
                            onClick={() => { set({ status: "unpaid", method: null, split: null }); onCommit?.({ status: "unpaid", method: null }); }}
                            className={"flex h-[40px] w-full cursor-pointer items-center justify-center gap-[8px] rounded-[12px] border-0 bg-black/[0.04] text-[13px] font-bold text-[#4b5563] transition-colors hover:bg-black/[0.07] hover:text-[#0f172a] disabled:cursor-not-allowed " + FOCUS_RING}
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
                        className={"flex w-full cursor-pointer items-center gap-[8px] rounded-[9px] border-0 bg-transparent px-[2px] py-[6px] text-left text-[12.5px] font-semibold text-[#a855f7] transition-colors hover:text-[#7c3aed] " + FOCUS_RING}
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
                        <div className="mt-[4px] flex flex-col gap-[7px] rounded-[11px] bg-black/[0.025] p-[10px] transition-all duration-200">
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
                                                    FOCUS_RING + " " +
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

            {/* Always visible, not only once something's been picked — this
                whole rail is a PLAN attached to whichever patient gets
                confirmed, never a standalone action with its own effect.
                Nothing here writes anywhere until then. */}
            <div className="mt-[12px] flex items-start gap-[7px] rounded-[10px] bg-black/[0.03] px-[10px] py-[8px]">
                <Info size={12} className="mt-[1px] shrink-0 text-[#94a3b8]" />
                <span className="text-[11px] leading-[1.45] text-[#64748b]">
                    Nothing is recorded until you confirm a patient.
                </span>
            </div>
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
function RailFrame({
    children, rootRef, onKeyDown,
}: {
    children: React.ReactNode;
    /** Set only by the fee-wired return — the no-fee one has nothing to
     *  arrow between beyond the visit-type toggle, which Tab already
     *  reaches fine. */
    rootRef?: React.RefObject<HTMLDivElement | null>;
    onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}) {
    return (
        <div aria-label="Payment" className="flex flex-1 flex-col" ref={rootRef} onKeyDown={onKeyDown}>
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
