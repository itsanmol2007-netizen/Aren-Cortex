// ---------------------------------------------------------------------------
// BUY CREDITS — which is, in V1, "ask us to sell you credits".
//
// Anmol's V1 spec is explicit: no payment gateway yet. The doctor picks a
// package, files a request, AREN verifies payment by hand and approves it.
// So this modal must be honest about what pressing the button does — it does
// NOT charge a card and it does NOT add credits, and a modal that implies
// either would produce a support call from a doctor watching a balance that
// never moved.
//
// Hence the wording throughout: "Request recharge", not "Buy". And the
// confirmation says what happens next, not "success".
//
// ── Why the packages are fetched, not listed here
//
// `messaging_credit_packages` is a table. AREN reprices with an UPDATE and
// every doctor sees it on their next load. A hardcoded price list in a
// frontend bundle is a release to change a number, and it is the number most
// likely to change.
//
// Chrome is `PracticeModal` like every other modal in the app
// (docs/aren-modal-design.md — one modal family, never a one-off look).
// Violet accent, which is already this codebase's money colour: Parallax's
// "Collected" tile and every rupee figure on Clinic Control read
// `--cs-violet`. Not a new hue.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { Check, Loader2, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { PracticeModal } from "../practice/PracticeModal";
import { EmptyBlock, FormNote, SkeletonRows } from "../clinic/ui";
import {
    DuplicateRechargeError, cancelRechargeRequest, createRechargeRequest,
    fetchCreditPackages, formatCredits, formatPrice, formatWait, msUntilCancellable,
    type CreditPackage, type RechargeRequest,
} from "../../lib/db/messaging";

interface Props {
    hospitalId: string;
    doctorId: string;
    userId: string | null;
    /** Shown on each card as "takes you to N" — the concrete consequence of
     *  buying, which is more useful than the package's own credit count. */
    currentBalance: number;
    /** A request already waiting. The modal becomes read-only when there is
     *  one: a second request is a UNIQUE violation at the database, and
     *  finding that out by pressing a button is a worse experience than being
     *  told before you pick. */
    pending: RechargeRequest | null;
    onClose: () => void;
    onRequested: (request: RechargeRequest) => void;
    /** Reload after a withdrawal — the pending row is gone and the doctor can
     *  immediately raise a fresh one, which this modal has to reflect. */
    onWithdrawn?: () => void;
}

export function BuyCreditsModal({
    hospitalId, doctorId, userId, currentBalance, pending, onClose, onRequested, onWithdrawn,
}: Props) {
    const [packages, setPackages] = useState<CreditPackage[] | null>(null);
    const [selected, setSelected] = useState<CreditPackage | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [withdrawing, setWithdrawing] = useState(false);

    // How long they still have to wait. Read once per open rather than ticked
    // every second: nobody sits on this modal watching a countdown, and a
    // timer that re-renders a dialog once a second for two hours is a battery
    // cost with no reader.
    const waitMs = pending ? msUntilCancellable(pending) : 0;

    const withdraw = async () => {
        if (!pending || withdrawing) return;
        setWithdrawing(true);
        setError(null);
        try {
            await cancelRechargeRequest(pending.id);
            toast.success("Request withdrawn — you can raise a new one");
            onWithdrawn?.();
            onClose();
        } catch (e) {
            // The database's own words. It refuses before three hours even if
            // this modal somehow offered the button early.
            setError(e instanceof Error ? e.message : "Could not withdraw the request");
            setWithdrawing(false);
        }
    };

    useEffect(() => {
        let alive = true;
        fetchCreditPackages()
            .then((rows) => {
                if (!alive) return;
                setPackages(rows);
                // Pre-select the second package rather than the first or none:
                // with nothing chosen the primary button is dead on arrival,
                // and the cheapest option as a default quietly recommends it.
                setSelected(rows[1] ?? rows[0] ?? null);
            })
            .catch((e: unknown) => {
                if (!alive) return;
                setPackages([]);
                setError(e instanceof Error ? e.message : "Could not load packages");
            });
        return () => { alive = false; };
    }, []);

    const submit = async () => {
        if (!selected || busy) return;
        setBusy(true);
        setError(null);
        try {
            const request = await createRechargeRequest({
                hospitalId, doctorId, userId, pack: selected, currentBalance,
            });
            toast.success("Recharge request submitted");
            onRequested(request);
            onClose();
        } catch (e) {
            if (e instanceof DuplicateRechargeError) setError(e.message);
            else setError(e instanceof Error ? e.message : "Could not submit the request");
            setBusy(false);
        }
    };

    return (
        <PracticeModal
            accent="violet"
            icon={<Wallet size={15} />}
            eyebrow="Messaging credits"
            title={pending ? "Recharge in progress" : "Buy credits"}
            onClose={onClose}
            dirty={!pending && !!selected}
            footer={
                pending ? (
                    <div className="flex w-full items-center gap-[8px]">
                        <button
                            type="button"
                            onClick={onClose}
                            className="h-[42px] flex-1 cursor-pointer rounded-[12px] border border-[var(--cs-line-strong)] bg-[rgba(0,0,0,0.03)] text-[13px] font-semibold text-[var(--cs-muted)]"
                        >
                            Close
                        </button>
                        {waitMs <= 0 && (
                            <button
                                type="button"
                                onClick={() => void withdraw()}
                                disabled={withdrawing}
                                className="inline-flex h-[42px] flex-none cursor-pointer items-center justify-center gap-[6px] rounded-[12px] border-[1.5px] border-[var(--cs-red)] bg-transparent px-[16px] text-[13px] font-semibold text-[var(--cs-red)] outline-none transition-colors hover:bg-[var(--cs-red-soft)] disabled:opacity-50"
                            >
                                {withdrawing ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                                Withdraw
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="flex w-full items-center gap-[8px]">
                        <button
                            type="button"
                            onClick={onClose}
                            className="h-[42px] flex-none cursor-pointer rounded-[12px] border border-[var(--cs-line-strong)] bg-[rgba(0,0,0,0.03)] px-[18px] text-[13px] font-semibold text-[var(--cs-muted)]"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            disabled={!selected || busy}
                            onClick={() => void submit()}
                            className={
                                "flex h-[42px] flex-1 cursor-pointer items-center justify-center gap-[7px] rounded-[12px] border-0 " +
                                "bg-[var(--cs-violet)] text-[13px] font-bold text-white transition-opacity " +
                                "disabled:cursor-not-allowed disabled:opacity-45"
                            }
                        >
                            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
                            {busy ? "Sending…" : "Request recharge"}
                        </button>
                    </div>
                )
            }
        >
            {pending ? (
                // Not an error and not a dead end: the doctor asked, and this
                // says exactly where that ask stands rather than letting them
                // ask again into a unique-index violation.
                <div className="flex flex-col gap-[10px]">
                    <div className="flex items-start gap-[9px] rounded-[12px] border border-[var(--cs-violet)] bg-[var(--cs-violet-soft)] px-[12px] py-[11px]">
                        <Check size={15} className="mt-[1px] flex-none text-[var(--cs-violet)]" />
                        <div className="flex min-w-0 flex-col gap-[3px]">
                            <strong className="text-[13px] font-semibold text-[var(--cs-ink)]">
                                Recharge request submitted
                            </strong>
                            <span className="text-[11.5px] leading-[1.5] text-[var(--cs-muted)]">
                                We'll contact you shortly to complete the recharge. Credits are
                                added as soon as we've confirmed the payment.
                            </span>
                        </div>
                    </div>
                    {/* The wait, stated rather than left to be discovered by
                        pressing a button that errors. Three hours is enforced
                        by `cancel_credit_recharge()` itself. */}
                    <p className="m-0 text-[11.5px] leading-[1.5] text-[var(--cs-muted)]">
                        {waitMs > 0
                            ? `If you haven't heard from us, you can withdraw this and raise a new one in ${formatWait(waitMs)}.`
                            : "Nobody has picked this up yet — you can withdraw it and raise a new one."}
                    </p>
                    {error && (
                        <p className="m-0 rounded-[10px] bg-[var(--cs-red-soft)] px-[10px] py-[7px] text-[11.5px] font-medium text-[var(--cs-red)]">
                            {error}
                        </p>
                    )}
                    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-[14px] gap-y-[5px] text-[12px]">
                        {[
                            ["Package", pending.packageLabel],
                            ["Credits", formatCredits(pending.credits)],
                            ["Amount", formatPrice(pending.amount, pending.currency)],
                            ["Reference", pending.reference],
                        ].map(([k, v]) => (
                            <div key={k} className="contents">
                                <dt className="text-[var(--cs-faint)]">{k}</dt>
                                <dd className="m-0 font-semibold text-[var(--cs-ink)]">{v}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            ) : !packages ? (
                <SkeletonRows count={4} />
            ) : packages.length === 0 ? (
                <EmptyBlock
                    fact="No packages available"
                    next="Get in touch and we'll add credits directly."
                />
            ) : (
                <div className="flex flex-col gap-[8px]">
                    <div className="grid grid-cols-2 gap-[8px] max-[420px]:grid-cols-1">
                        {packages.map((p) => {
                            const isOn = selected?.id === p.id;
                            return (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => setSelected(p)}
                                    aria-pressed={isOn}
                                    className={
                                        "flex cursor-pointer flex-col items-start gap-[2px] rounded-[12px] border px-[12px] py-[10px] text-left transition-colors outline-none " +
                                        (isOn
                                            ? "border-[var(--cs-violet)] bg-[var(--cs-violet-soft)]"
                                            : "border-[var(--cs-line)] bg-[var(--cs-card)] hover:border-[var(--cs-line-strong)]")
                                    }
                                >
                                    <span className="text-[17px] font-bold leading-[1.15] tabular-nums text-[var(--cs-ink)]">
                                        {formatCredits(p.credits)}
                                    </span>
                                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--cs-label)]">
                                        credits
                                    </span>
                                    <span className={`mt-[3px] text-[13px] font-bold tabular-nums ${isOn ? "text-[var(--cs-violet)]" : "text-[var(--cs-muted)]"}`}>
                                        {formatPrice(p.amount, p.currency)}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {selected && (
                        <p className="m-0 text-[11.5px] text-[var(--cs-muted)]">
                            Takes you to{" "}
                            <strong className="font-semibold tabular-nums text-[var(--cs-ink)]">
                                {formatCredits(currentBalance + selected.credits)}
                            </strong>{" "}
                            credits.
                        </p>
                    )}

                    {error && (
                        <p className="m-0 rounded-[10px] bg-[var(--cs-red-soft)] px-[10px] py-[7px] text-[11.5px] font-medium text-[var(--cs-red)]">
                            {error}
                        </p>
                    )}

                    {/* The whole point of the modal, said once, plainly. */}
                    <FormNote>
                        This files a request — nothing is charged here. We'll contact you to
                        complete the payment, and your credits are added as soon as it's confirmed.
                    </FormNote>
                </div>
            )}
        </PracticeModal>
    );
}
