// ---------------------------------------------------------------------------
// PLAN — what this clinic is on, and the one way to change it.
//
// ── Nobody edits their own subscription from inside the product
//
// Every control here writes a REQUEST (`subscription_requests`), never the
// subscription. Seats, plan and billing period are commercial facts AREN sets;
// a screen that let a clinic set its own seat count would be a screen that
// lets a clinic set its own bill. So the primary action is "ask", and the page
// says plainly what happens next rather than implying an instant change.
//
// ── The one number that earns an alert
//
// Benches over seats. It is the likeliest mismatch in a growing clinic, the
// clinic cannot fix it themselves, and nothing else in the product would ever
// tell them — front desk does not care and the doctor does not see billing.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
    AlertTriangle, BadgeCheck, CalendarDays, CreditCard, Send, Sparkles,
    Stethoscope, Users,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../auth/AuthProvider";
import { useClinicalIdentity } from "../../../hooks/useClinicalIdentity";
import { Card, INPUT_CLASS, SkeletonRows } from "../../clinic/ui";
import {
    createSubscriptionRequest, fetchClinicSetup, type ClinicSetup,
} from "../../../lib/db/admin";

function Fact({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone?: "warn" | "good" }) {
    return (
        <div className="flex min-w-0 items-center gap-[9px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[10px] py-[9px]">
            <span className="grid h-[24px] w-[24px] flex-none place-items-center rounded-[7px] bg-[#f1f5f9] text-[#475569]">
                {icon}
            </span>
            <span className="text-[11.5px] font-medium text-[var(--cs-muted)]">{label}</span>
            <span
                className={
                    "ml-auto flex-none text-[12.5px] font-bold tabular-nums " +
                    (tone === "warn" ? "text-[var(--cs-amber)]" : tone === "good" ? "text-[var(--cs-green)]" : "text-[var(--cs-ink)]")
                }
            >
                {value}
            </span>
        </div>
    );
}

export function PlanPage() {
    const identity = useClinicalIdentity();
    const auth = useAuth();
    const userId = auth.status === "authed" ? auth.identity.user.id : null;

    const [setup, setSetup] = useState<ClinicSetup | null>(null);
    const [message, setMessage] = useState("");
    const [email, setEmail] = useState("");
    const [sending, setSending] = useState(false);

    const load = useCallback(() => {
        if (!identity.ready) return;
        fetchClinicSetup(identity.hospitalId).then(setSetup).catch((e: unknown) => {
            console.error("[plan]", e);
            setSetup(null);
        });
    }, [identity.ready, identity.hospitalId]);

    useEffect(load, [load]);

    const send = async (kind: string, body: string) => {
        if (sending || !body.trim()) return;
        setSending(true);
        try {
            await createSubscriptionRequest({
                hospitalId: identity.hospitalId,
                requestedBy: userId,
                kind,
                message: body,
                contactEmail: email,
            });
            setMessage("");
            toast.success("Sent to AREN — we'll be in touch");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not send that request.");
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex w-full flex-1 flex-col gap-[12px] overflow-y-auto px-[28px] pb-[44px] pt-[15px] max-[900px]:px-[12px]">

                {setup?.seatsExceeded && (
                    <div className="flex items-start gap-[8px] rounded-[var(--cs-radius)] border border-[var(--cs-amber)] bg-[var(--cs-amber-soft)] px-[12px] py-[10px]">
                        <AlertTriangle size={14} className="mt-[1px] flex-none text-[var(--cs-amber)]" />
                        <span className="text-[11.5px] leading-[1.45] text-[var(--cs-muted)]">
                            <strong className="font-semibold text-[var(--cs-ink)]">
                                You are running {setup.benches} benches on {setup.seats} seats.
                            </strong>{" "}
                            Nothing stops working — but your plan no longer describes your clinic. Ask for
                            more seats below and we'll sort it out.
                        </span>
                    </div>
                )}

                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-stretch gap-[12px] max-[980px]:grid-cols-1">

                    <Card
                        id="adm-card-plan"
                        tone="slate"
                        icon={<CreditCard size={14} />}
                        title="Your plan"
                        subtitle={setup?.planName ?? "Subscription"}
                    >
                        {!setup ? (
                            <SkeletonRows count={5} />
                        ) : (
                            <div className="flex flex-col gap-[9px]">
                                {setup.isFounding && (
                                    <div className="flex items-center gap-[7px] rounded-[10px] border border-[var(--cs-violet)] bg-[var(--cs-violet-soft)] px-[10px] py-[8px]">
                                        <Sparkles size={13} className="flex-none text-[var(--cs-violet)]" />
                                        <span className="text-[11.5px] font-semibold text-[var(--cs-violet)]">
                                            Founding clinic
                                        </span>
                                    </div>
                                )}
                                <div className="flex flex-col gap-[6px]">
                                    <Fact
                                        icon={<BadgeCheck size={12} />}
                                        label="Status"
                                        value={setup.planStatus ? setup.planStatus[0].toUpperCase() + setup.planStatus.slice(1) : "—"}
                                        tone={setup.planStatus === "active" ? "good" : undefined}
                                    />
                                    <Fact icon={<CreditCard size={12} />} label="Plan" value={setup.planName ?? "—"} />
                                    <Fact
                                        icon={<Users size={12} />}
                                        label="Seats"
                                        value={setup.seats === null ? "Not set" : String(setup.seats)}
                                        tone={setup.seatsExceeded ? "warn" : undefined}
                                    />
                                    <Fact icon={<Stethoscope size={12} />} label="Benches in use" value={String(setup.benches)} />
                                    <Fact
                                        icon={<CalendarDays size={12} />}
                                        label={setup.isFounding ? "Covered until" : "Renews"}
                                        value={setup.periodEnd
                                            ? new Date(setup.periodEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                                            : "—"}
                                    />
                                </div>
                            </div>
                        )}
                    </Card>

                    <Card
                        id="adm-card-ask"
                        tone="blue"
                        icon={<Send size={14} />}
                        title="Ask AREN"
                        subtitle="Seats, billing or anything about the plan"
                        foot={
                            <span className="text-[11px] leading-[1.45] text-[var(--cs-faint)]">
                                Nothing changes automatically — a person reads this and replies. Your clinic
                                keeps working exactly as it does now in the meantime.
                            </span>
                        }
                    >
                        <div className="flex flex-col gap-[9px]">
                            {/* One tap for the request nine clinics in ten are
                                here to make, rather than making them compose it. */}
                            {setup && setup.seatsExceeded && (
                                <button
                                    type="button"
                                    disabled={sending}
                                    onClick={() => send("seats", `We are running ${setup.benches} benches on ${setup.seats} seats. Please add seats.`)}
                                    className="inline-flex cursor-pointer items-center justify-center gap-[6px] rounded-[11px] border-[1.5px] border-[var(--cs-blue)] bg-[var(--cs-blue-soft)] px-[14px] py-[9px] text-[12.5px] font-semibold text-[var(--cs-blue)] outline-none transition-colors hover:bg-[var(--cs-card)] disabled:opacity-50"
                                >
                                    <Users size={13} /> Ask for {setup.benches - (setup.seats ?? 0)} more seat
                                    {setup.benches - (setup.seats ?? 0) === 1 ? "" : "s"}
                                </button>
                            )}

                            <div className="flex flex-col gap-[5px]">
                                <label htmlFor="plan-msg" className="text-[10.5px] font-semibold text-[var(--cs-muted)]">
                                    Your message
                                </label>
                                <textarea
                                    id="plan-msg"
                                    rows={4}
                                    value={message}
                                    placeholder="What do you need?"
                                    onChange={(e) => setMessage(e.target.value)}
                                    className="w-full rounded-[11px]! border! border-[var(--cs-line)]! bg-[rgba(248,250,252,0.9)]! px-[12px]! py-[9px]! text-[13px]! leading-[1.5] text-[var(--cs-ink)] outline-none transition-shadow focus:border-[#a855f7]! focus:bg-white! focus:shadow-[0_0_0_3px_rgba(168,85,247,0.14)]!"
                                />
                            </div>

                            <div className="flex flex-col gap-[5px]">
                                <label htmlFor="plan-email" className="text-[10.5px] font-semibold text-[var(--cs-muted)]">
                                    Reply-to email (optional)
                                </label>
                                <input
                                    id="plan-email"
                                    type="email"
                                    value={email}
                                    placeholder="you@clinic.com"
                                    onChange={(e) => setEmail(e.target.value)}
                                    className={INPUT_CLASS}
                                />
                            </div>

                            <button
                                type="button"
                                disabled={!message.trim() || sending}
                                onClick={() => send("other", message)}
                                className="inline-flex cursor-pointer items-center justify-center gap-[6px] self-start rounded-[11px] border-[1.5px] border-[var(--cs-blue)] bg-transparent px-[16px] py-[9px] text-[12.5px] font-semibold text-[var(--cs-blue)] outline-none transition-colors hover:bg-[var(--cs-blue-soft)] disabled:opacity-45"
                            >
                                <Send size={13} /> {sending ? "Sending…" : "Send to AREN"}
                            </button>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
