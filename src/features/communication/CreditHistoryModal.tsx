// ---------------------------------------------------------------------------
// CREDIT HISTORY — the graph, and then where each credit actually went.
//
// Opened from the "Credits usage" tile. Two halves, in the order a question
// gets asked: the shape first ("why was Tuesday spiky?"), then the rows that
// made that shape.
//
// ── The nested scroll, which is the whole point of the layout
//
// The chart and the day summary are PINNED; only the movement list scrolls.
// A modal where the whole body scrolls means the chart you are trying to
// explain slides off screen the moment you look for the explanation — which
// is exactly the thing you opened it to compare against.
//
// So: the panel is height-bounded (`max-h`), the head is `flex-none`, and the
// list is `flex-1 min-h-0 overflow-y-auto`. `min-h-0` is load-bearing — a
// flex child's default `min-height:auto` refuses to shrink below its content,
// so without it the list grows the modal instead of scrolling inside it.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Wallet } from "lucide-react";
import { PracticeModal } from "../practice/PracticeModal";
import { SkeletonRows } from "../clinic/ui";
import { BigEmpty, ConversationArt, UsageBars, dayLabel, type UsagePoint } from "./parts";
import {
    LEDGER_LABEL, fetchCreditLedger, fetchCreditUsage, formatCredits,
    type LedgerEntry,
} from "../../lib/db/messaging";

interface Props {
    doctorId: string;
    onClose: () => void;
}

/** "Today, 2:45 pm" / "4 Sep, 2:45 pm". A ledger is read by date, so unlike
 *  the message list every row here carries one. */
function stamp(iso: string): string {
    const at = new Date(iso);
    const today = new Date().toDateString() === at.toDateString();
    const time = at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toLowerCase();
    return today ? `Today, ${time}` : `${at.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${time}`;
}

export function CreditHistoryModal({ doctorId, onClose }: Props) {
    const [usage, setUsage] = useState<UsagePoint[] | null>(null);
    const [ledger, setLedger] = useState<LedgerEntry[] | null>(null);
    const [hovered, setHovered] = useState<UsagePoint | null>(null);

    useEffect(() => {
        let alive = true;
        fetchCreditUsage(doctorId, 14)
            .then((u) => { if (alive) setUsage(u); })
            .catch(() => { if (alive) setUsage([]); });
        fetchCreditLedger(doctorId, 60)
            .then((l) => { if (alive) setLedger(l); })
            .catch(() => { if (alive) setLedger([]); });
        return () => { alive = false; };
    }, [doctorId]);

    const total = useMemo(() => (usage ?? []).reduce((n, p) => n + p.credits, 0), [usage]);
    const busiest = useMemo(
        () => (usage ?? []).reduce<UsagePoint | null>((a, b) => (!a || b.credits > a.credits ? b : a), null),
        [usage]
    );

    return (
        <PracticeModal
            accent="violet"
            icon={<Wallet size={15} />}
            eyebrow="Messaging credits"
            title="Credit history"
            onClose={onClose}
            wide
        >
            {/* ── Pinned: the shape ───────────────────────────────────────── */}
            <div className="flex flex-none flex-col gap-[8px] rounded-[12px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[12px] py-[11px]">
                <div className="flex items-baseline gap-[10px]">
                    <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-[var(--cs-label)]">
                        Last 14 days
                    </span>
                    <span className="ml-auto text-[19px] font-bold leading-none tabular-nums text-[var(--cs-violet)]">
                        {formatCredits(total)}
                    </span>
                    <span className="text-[11px] text-[var(--cs-faint)]">credits used</span>
                </div>

                {!usage ? (
                    <div className="h-[92px] animate-pulse rounded-[8px] bg-[#eef0f5]" />
                ) : (
                    <>
                        <UsageBars points={usage} onHover={setHovered} />
                        <div className="flex items-center justify-between text-[10px] font-medium text-[var(--cs-faint)]">
                            <span>{usage.length ? dayLabel(usage[0].date) : ""}</span>
                            {/* One live line rather than a tooltip that has to
                                be chased with a mouse — the hovered day if
                                there is one, the busiest day otherwise, so the
                                space is never empty. */}
                            <span className="font-semibold text-[var(--cs-violet)]">
                                {hovered
                                    ? `${dayLabel(hovered.date)} · ${formatCredits(hovered.credits)}`
                                    : busiest && busiest.credits > 0
                                        ? `Busiest ${dayLabel(busiest.date)} · ${formatCredits(busiest.credits)}`
                                        : "No messages in this window"}
                            </span>
                            <span>{usage.length ? dayLabel(usage[usage.length - 1].date) : ""}</span>
                        </div>
                    </>
                )}
            </div>

            {/* ── Scrolls: what made that shape ───────────────────────────── */}
            <div className="mt-[10px] flex min-h-0 flex-1 flex-col">
                <span className="flex-none pb-[6px] text-[11px] font-bold uppercase tracking-[0.07em] text-[var(--cs-label)]">
                    Every movement
                </span>

                <div className="relative flex min-h-0 flex-1 flex-col gap-[4px] overflow-y-auto">
                    {!ledger ? (
                        <SkeletonRows count={6} />
                    ) : ledger.length === 0 ? (
                        <BigEmpty
                            art={<ConversationArt size={130} />}
                            fact="No credit movements yet"
                            next="Your included credits appear here, and every message you send after that."
                        />
                    ) : (
                        <>
                            {ledger.map((row) => {
                                const positive = row.delta > 0;
                                return (
                                    <div
                                        key={row.id}
                                        className="flex flex-none items-center gap-[9px] rounded-[9px] border border-[var(--cs-line)] bg-[var(--cs-card)] px-[10px] py-[7px]"
                                    >
                                        <span
                                            className={
                                                "grid h-[22px] w-[22px] flex-none place-items-center rounded-[6px] " +
                                                (positive
                                                    ? "bg-[var(--cs-green-soft)] text-[var(--cs-green)]"
                                                    : "bg-[#f1f5f9] text-[#475569]")
                                            }
                                        >
                                            {positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                        </span>
                                        <span className="flex min-w-0 flex-col gap-[1px]">
                                            <span className="truncate text-[12px] font-semibold text-[var(--cs-ink)]">
                                                {LEDGER_LABEL[row.kind]}
                                            </span>
                                            <span className="truncate text-[10.5px] text-[var(--cs-faint)]">
                                                {row.note || stamp(row.createdAt)}
                                            </span>
                                        </span>
                                        <span className="ml-auto flex flex-none flex-col items-end gap-[1px]">
                                            <span className={`text-[12.5px] font-bold tabular-nums ${positive ? "text-[var(--cs-green)]" : "text-[var(--cs-ink)]"}`}>
                                                {positive ? "+" : ""}{formatCredits(Math.abs(row.delta))}
                                            </span>
                                            <span className="text-[10px] tabular-nums text-[var(--cs-faint)]">
                                                {stamp(row.createdAt)}
                                            </span>
                                        </span>
                                    </div>
                                );
                            })}
                            {/* Says the list is capped rather than letting a
                                doctor conclude their history simply stops. */}
                            {ledger.length >= 60 && (
                                <p className="m-0 flex-none py-[6px] text-center text-[10.5px] text-[var(--cs-faint)]">
                                    Showing the 60 most recent movements.
                                </p>
                            )}
                        </>
                    )}
                </div>
            </div>
        </PracticeModal>
    );
}
