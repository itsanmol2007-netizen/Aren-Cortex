import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock, QrCode, UploadCloud } from "lucide-react";
import { isEffectivelyExpired, type GatewaySessionSummary } from "@/lib/db/gateways";
import { useT } from "../../i18n/i18n";
import { useGatewaySessions } from "./GatewaySessionsProvider";

// The header's "active upload links" indicator — violet, not semantic
// amber/blue/green/red (§7.1: violet labels STRUCTURE, semantic color labels
// DATA about one patient; this counts sessions across the whole clinic, it
// isn't itself a patient's status). Static glow, not an animated pulse: the
// one ambient "something needs attention" animation this feature already
// has (`.aren-pulse`, FrontDeskStyles.tsx) is hardcoded amber — literally
// reusing it here would borrow the "waiting" status color for an unrelated
// structural badge, and the frozen motion doctrine (§9) caps ambient
// animation at two existing loops, not a third new one. A static glow reads
// as "worth noticing" the same way the header's own logo button already
// does, with neither problem.
export function GatewaySessionsBadge() {
    const t = useT();
    const { sessions, reopen } = useGatewaySessions();
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDocClick = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDocClick);
        return () => document.removeEventListener("mousedown", onDocClick);
    }, [open]);

    const count = sessions.length;

    return (
        <div ref={wrapRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-label={t("gwBadgeAria", { n: count })}
                title={t("gwPopoverTitle")}
                className={`relative flex h-[32px] items-center gap-[6px] rounded-[8px] border px-[10px] text-[12px] font-semibold transition-colors ${
                    count > 0
                        ? "border-[rgba(139,92,246,0.45)] bg-[rgba(139,92,246,0.14)] text-[#c7d2fe] shadow-[0_0_10px_rgba(139,92,246,0.30)] hover:bg-[rgba(139,92,246,0.20)]"
                        : "border-white/15 bg-transparent text-[#8f8bb0] hover:border-white/30 hover:bg-white/5"
                }`}
            >
                <QrCode size={13.5} />
                {count > 0 && <span className="tabular-nums">{count}</span>}
            </button>

            {open && (
                <div className="absolute right-0 top-[40px] z-[80] w-[300px] rounded-[11px] border border-[#e4e7ee] bg-white p-[6px] shadow-[0_24px_60px_rgba(16,24,40,0.24)]">
                    <div className="px-[8px] py-[7px] text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[#837bb2]">
                        {t("gwPopoverTitle")}
                    </div>
                    {count === 0 ? (
                        <p className="px-[8px] pb-[9px] text-[12.5px] text-[#a8aeba]">{t("gwPopoverEmpty")}</p>
                    ) : (
                        <div className="flex max-h-[280px] flex-col gap-[2px] overflow-y-auto">
                            {sessions.map((s) => (
                                <SessionRow
                                    key={s.gateway.id}
                                    summary={s}
                                    onClick={() => { reopen(s); setOpen(false); }}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function SessionRow({ summary, onClick }: { summary: GatewaySessionSummary; onClick: () => void }) {
    const t = useT();
    const { gateway, patientName, tokenNumber } = summary;
    const expired = isEffectivelyExpired(gateway);

    // Three states, one dot each — "uploading in progress vs patient marked
    // done vs expired", per the brief, never a separate list.
    const status = expired
        ? { dot: "bg-[#a8aeba]", label: t("gwExpiredTitle") }
        : gateway.patientMarkedDone
            ? { dot: "bg-[#1c8a4d]", label: t("gwStatusDone") }
            : gateway.documentsUploadedCount > 0
                ? { dot: "bg-[#2f6bed]", label: t("gwStatusUploading") }
                : { dot: "bg-[#c9791a]", label: t("gwStatusIdle") };

    return (
        <button
            type="button"
            onClick={onClick}
            className="flex w-full items-center gap-[9px] rounded-[8px] px-[8px] py-[8px] text-left transition-colors hover:bg-[#f7f6fd]"
        >
            <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${status.dot}`} />
            <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-bold text-[#161d29]">
                    {patientName}
                    {tokenNumber != null && (
                        <span className="ml-[6px] font-medium text-[#8a91a0] tabular-nums">#{String(tokenNumber).padStart(3, "0")}</span>
                    )}
                </div>
                <div className="mt-[1px] flex items-center gap-[5px] text-[11px] font-medium text-[#8a91a0]">
                    {gateway.patientMarkedDone ? <CheckCircle2 size={11} /> : expired ? <Clock size={11} /> : <UploadCloud size={11} />}
                    {status.label}
                </div>
            </div>
        </button>
    );
}
