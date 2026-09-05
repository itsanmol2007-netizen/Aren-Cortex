// ---------------------------------------------------------------------------
// MONEY — what the clinic charged, what it collected, what is still owed.
//
// Three questions in the order an owner asks them, and nothing else. This is
// not accounting software: no invoice numbers, no tax register, no ledger, no
// gateway. The `visit_payments` table comment says the same thing and this page
// is built to stay inside it.
//
// ── The only write on this page, and its limit
//
// "Mark paid" changes a status. It cannot change an amount — a recorded fee is
// what the patient was actually quoted, and a screen that could rewrite it
// later is a screen that can quietly make yesterday's takings disagree with
// yesterday's receipts. Amount corrections belong at the desk, on a new row.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, BadgeIndianRupee, History, IndianRupee, Receipt, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useClinicalIdentity } from "../../../hooks/useClinicalIdentity";
import { Card, CardPillButton, EmptyBlock, RowText, SkeletonRows } from "../../clinic/ui";
import { Delta, TrendChart } from "../charts";
import { PeriodBar, type PeriodState } from "../PeriodBar";
import { FeesModal } from "../FeesModal";
import { fetchPaymentAudit, type PaymentEvent } from "../../../lib/db/payments";
import {
    buildRange, clinicToday, fetchClinicAnalytics, fetchFeeSettings, fetchPendingPayments,
    formatMoney, formatRangeLabel, markPaymentPaid, previousRange,
    type ClinicAnalytics, type FeeSettings, type PendingPayment,
} from "../../../lib/db/admin";

/** One number in the collections breakdown. */
function Figure({ label, value, tone, hint }: { label: string; value: string; tone?: "violet" | "red"; hint?: ReactNode }) {
    return (
        <div className="flex min-w-0 flex-col gap-[2px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[11px] py-[9px]">
            <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--cs-label)]">{label}</span>
            <span className={`truncate text-[17px] font-bold tabular-nums ${tone === "violet" ? "text-[var(--cs-violet)]" : tone === "red" ? "text-[var(--cs-red)]" : "text-[var(--cs-ink)]"}`}>
                {value}
            </span>
            {hint}
        </div>
    );
}

export function MoneyPage() {
    const identity = useClinicalIdentity();
    const navigate = useNavigate();
    const today = clinicToday();

    const [period, setPeriod] = useState<PeriodState>({ preset: "30d", from: today, to: today });
    const [data, setData] = useState<ClinicAnalytics | null>(null);
    const [fees, setFees] = useState<FeeSettings | null>(null);
    const [pending, setPending] = useState<PendingPayment[] | null>(null);
    const [audit, setAudit] = useState<PaymentEvent[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [feesOpen, setFeesOpen] = useState(false);
    const [settling, setSettling] = useState<number | null>(null);

    const range = useMemo(
        () => buildRange(period.preset, { from: period.from, to: period.to }),
        [period]
    );

    const load = useCallback(() => {
        if (!identity.ready) return;
        setLoading(true);
        fetchClinicAnalytics(identity.hospitalId, range)
            .then(setData)
            .catch((e: unknown) => { console.error("[money]", e); setData(null); })
            .finally(() => setLoading(false));
    }, [identity.ready, identity.hospitalId, range]);

    const loadStatic = useCallback(() => {
        if (!identity.ready) return;
        fetchFeeSettings(identity.hospitalId).then(setFees).catch(() => setFees(null));
        fetchPendingPayments(identity.hospitalId).then(setPending).catch((e: unknown) => {
            console.error("[money] pending:", e);
            setPending(null);
        });
        fetchPaymentAudit(identity.hospitalId).then(setAudit).catch((e: unknown) => {
            console.error("[money] audit:", e);
            setAudit(null);
        });
    }, [identity.ready, identity.hospitalId]);

    useEffect(load, [load]);
    useEffect(loadStatic, [loadStatic]);

    const currency = fees?.policy.currency ?? "INR";
    const money = (n: number) => formatMoney(n, currency);
    const compareLabel = useMemo(() => {
        const p = previousRange(range);
        return p.from === p.to ? "day before" : "previous period";
    }, [range]);

    const totals = useMemo(() => {
        const z = { gross: 0, discount: 0, net: 0, cash: 0, upi: 0, card: 0 };
        for (const d of data?.series ?? []) {
            z.gross += d.gross; z.discount += d.discount; z.net += d.revenue;
            z.cash += d.cash; z.upi += d.upi; z.card += d.card;
        }
        return z;
    }, [data]);

    const pricedDoctors = useMemo(
        () => (fees?.doctors ?? []).filter((d) => d.consultationFee !== null),
        [fees]
    );

    const settle = async (p: PendingPayment) => {
        setSettling(p.id);
        try {
            await markPaymentPaid(p.id);
            toast.success(`${money(p.total)} marked paid`);
            loadStatic();
            load();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not update that payment.");
        } finally {
            setSettling(null);
        }
    };

    const untracked = data && !data.revenueTracked;

    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex w-full flex-1 flex-col gap-[12px] overflow-y-auto px-[28px] pb-[44px] pt-[15px] max-[900px]:px-[12px]">

                <PeriodBar period={period} range={range} onChange={setPeriod} onRefresh={load} busy={loading} />

                {/* ── Collections ────────────────────────────────────────── */}
                <Card
                    id="adm-card-collections"
                    tone="violet"
                    icon={<Wallet size={14} />}
                    title="Collections"
                    subtitle={formatRangeLabel(range)}
                    action={
                        <button
                            type="button"
                            onClick={() => navigate("/app/admin/reports?tab=money")}
                            className="inline-flex cursor-pointer items-center gap-[3px] rounded-[6px] border-0 bg-transparent px-[4px] py-[3px] text-[10.5px] font-semibold text-[var(--cs-violet)] outline-none hover:underline"
                        >
                            Detail <ArrowUpRight size={11} />
                        </button>
                    }
                >
                    {!data ? (
                        <SkeletonRows count={3} />
                    ) : untracked ? (
                        <EmptyBlock
                            fact="No payments recorded yet"
                            next="Set a consultation fee, and front desk can start collecting."
                        />
                    ) : (
                        <div className="flex flex-col gap-[10px]">
                            <div className="grid grid-cols-6 gap-[8px] max-[1100px]:grid-cols-3 max-[620px]:grid-cols-2">
                                <Figure label="Gross" value={money(totals.gross)} />
                                <Figure
                                    label="Discount"
                                    value={totals.discount > 0 ? `−${money(totals.discount)}` : "—"}
                                    tone={totals.discount > 0 ? "red" : undefined}
                                />
                                <Figure
                                    label="Net"
                                    value={money(totals.net)}
                                    tone="violet"
                                    hint={data.revenue.changePct !== null
                                        ? <Delta metric={data.revenue} compareLabel={compareLabel} />
                                        : undefined}
                                />
                                <Figure label="Cash" value={money(totals.cash)} />
                                <Figure label="UPI" value={money(totals.upi)} />
                                <Figure label="Card" value={money(totals.card)} />
                            </div>
                            <TrendChart points={data.series} metricKey="revenue" height={118} />
                        </div>
                    )}
                </Card>

                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-stretch gap-[12px] max-[980px]:grid-cols-1">

                    {/* ── Outstanding ────────────────────────────────────── */}
                    <Card
                        id="adm-card-pending"
                        tone="blue"
                        icon={<Receipt size={14} />}
                        title="Outstanding"
                        subtitle="Recorded but not settled"
                    >
                        {!pending ? (
                            <SkeletonRows count={3} />
                        ) : pending.length === 0 ? (
                            <EmptyBlock fact="Nothing outstanding" next="Every recorded payment has been settled." />
                        ) : (
                            <div className="flex max-h-[300px] flex-col gap-[6px] overflow-y-auto pr-[2px]">
                                {pending.map((p) => (
                                    <div
                                        key={p.id}
                                        className={
                                            "flex min-w-0 flex-none items-center gap-[9px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[10px] py-[8px] " +
                                            (settling === p.id ? "pointer-events-none opacity-50" : "")
                                        }
                                    >
                                        <RowText
                                            label={p.patientName ?? "Unnamed patient"}
                                            sub={[p.doctorName, new Date(p.collectedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })]
                                                .filter(Boolean).join(" · ")}
                                        />
                                        <span className="ml-auto flex flex-none items-center gap-[9px]">
                                            <span className="text-[13px] font-bold tabular-nums text-[var(--cs-ink)]">{money(p.total)}</span>
                                            <button
                                                type="button"
                                                onClick={() => settle(p)}
                                                className="cursor-pointer rounded-full border border-[var(--cs-green)] bg-transparent px-[10px] py-[4px] text-[10.5px] font-semibold text-[var(--cs-green)] outline-none transition-colors hover:bg-[var(--cs-green-soft)]"
                                            >
                                                Mark paid
                                            </button>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>

                    {/* ── Fees ───────────────────────────────────────────── */}
                    <Card
                        id="adm-card-fees"
                        tone="violet"
                        icon={<IndianRupee size={14} />}
                        title="Consultation fees"
                        subtitle="What each bench charges, and how the clinic bills it"
                        action={
                            fees && (
                                <CardPillButton tone="violet" onClick={() => setFeesOpen(true)}>
                                    {pricedDoctors.length ? "Edit fees" : "Set fees"}
                                </CardPillButton>
                            )
                        }
                        foot={
                            fees && (
                                <div className="flex flex-wrap items-center gap-x-[12px] gap-y-[3px] text-[11px] text-[var(--cs-faint)]">
                                    <span>GST: <strong className="font-semibold text-[var(--cs-muted)]">{fees.policy.gstEnabled ? `${fees.policy.gstPercent}%` : "Not charged"}</strong></span>
                                    <span>Desk discount: <strong className="font-semibold text-[var(--cs-muted)]">{fees.policy.allowDiscount ? "Allowed" : "Off"}</strong></span>
                                </div>
                            )
                        }
                    >
                        {!fees ? (
                            <SkeletonRows count={3} />
                        ) : pricedDoctors.length === 0 ? (
                            <EmptyBlock fact="No fees set yet" next="Add what each bench charges so front desk can collect it." />
                        ) : (
                            <div className="flex flex-col gap-[6px]">
                                {pricedDoctors.map((d) => (
                                    <div key={d.id} className="flex min-w-0 items-center gap-[9px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[9px] py-[8px]">
                                        <RowText label={d.name} sub={d.specialization} />
                                        <span className="ml-auto flex flex-none flex-col items-end gap-[1px]">
                                            <span className="text-[13px] font-bold tabular-nums text-[var(--cs-ink)]">
                                                {money(d.consultationFee!)}
                                            </span>
                                            {d.followUpFee !== null && (
                                                <span className="text-[10px] tabular-nums text-[var(--cs-faint)]">
                                                    {money(d.followUpFee)} follow-up
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>

                {/* Average ticket — one honest derived number, not a tile wall. */}
                {/* ── Fee activity ───────────────────────────────────────
                    Reception may discount but never change a doctor's fee.
                    This is where an owner sees what was actually done and by
                    whom — append-only at the policy level, so nothing on this
                    page or any other can rewrite it. */}
                <Card
                    id="adm-card-audit"
                    tone="slate"
                    icon={<History size={14} />}
                    title="Fee activity"
                    subtitle="Every discount and payment action at the desk"
                    foot={
                        <span className="text-[11px] leading-[1.45] text-[var(--cs-faint)]">
                            Front desk can give a discount but cannot change a doctor's fee. Rates are
                            set on this page; every change to one is recorded here.
                        </span>
                    }
                >
                    {!audit ? (
                        <SkeletonRows count={4} />
                    ) : audit.length === 0 ? (
                        <EmptyBlock
                            fact="Nothing recorded yet"
                            next="Actions appear here as front desk collects fees."
                        />
                    ) : (
                        <div className="flex max-h-[300px] flex-col gap-[6px] overflow-y-auto pr-[2px]">
                            {audit.map((e) => (
                                <div
                                    key={e.id}
                                    className="flex min-w-0 flex-none items-center gap-[9px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[10px] py-[8px]"
                                >
                                    <span
                                        className={
                                            "flex-none rounded-full border px-[8px] py-[2px] text-[10px] font-bold uppercase tracking-[0.05em] " +
                                            (e.action === "discounted"
                                                ? "border-[var(--cs-amber)] bg-[var(--cs-amber-soft)] text-[var(--cs-amber)]"
                                                : "border-[var(--cs-line-strong)] bg-[var(--cs-card)] text-[var(--cs-label)]")
                                        }
                                    >
                                        {e.action.replace(/_/g, " ")}
                                    </span>
                                    <RowText
                                        label={e.patientName ?? "Unnamed patient"}
                                        sub={[
                                            e.actorName ? `by ${e.actorName}` : null,
                                            e.note,
                                            e.method,
                                            new Date(e.createdAt).toLocaleString("en-IN", {
                                                day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
                                            }),
                                        ].filter(Boolean).join(" · ")}
                                    />
                                    <span className="ml-auto flex flex-none flex-col items-end gap-[1px]">
                                        {e.total !== null && (
                                            <span className="text-[12.5px] font-bold tabular-nums text-[var(--cs-ink)]">
                                                {money(e.total)}
                                            </span>
                                        )}
                                        {e.discount !== null && e.discount > 0 && (
                                            <span className="text-[10px] tabular-nums text-[var(--cs-red)]">
                                                −{money(e.discount)} off {e.fee !== null ? money(e.fee) : ""}
                                            </span>
                                        )}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>

                {data && data.revenueTracked && data.patients.value > 0 && (
                    <div className="flex items-center gap-[9px] rounded-[var(--cs-radius)] border border-[var(--cs-line)] bg-[var(--cs-card)] px-[14px] py-[11px] shadow-[var(--cs-shadow)]">
                        <span className="grid h-[26px] w-[26px] flex-none place-items-center rounded-[8px] bg-[var(--cs-violet-soft)] text-[var(--cs-violet)]">
                            <BadgeIndianRupee size={14} />
                        </span>
                        <span className="text-[12px] text-[var(--cs-muted)]">
                            Average per patient seen
                        </span>
                        <span className="ml-auto text-[17px] font-bold tabular-nums text-[var(--cs-ink)]">
                            {money(Math.round(totals.net / data.patients.value))}
                        </span>
                    </div>
                )}
            </div>

            {feesOpen && fees && (
                <FeesModal
                    hospitalId={identity.hospitalId}
                    policy={fees.policy}
                    doctors={fees.doctors}
                    onClose={() => setFeesOpen(false)}
                    onSaved={() => { toast.success("Fees saved"); loadStatic(); load(); }}
                />
            )}
        </div>
    );
}
