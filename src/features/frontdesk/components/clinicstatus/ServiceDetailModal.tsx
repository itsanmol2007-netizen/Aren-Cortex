import { useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, LifeBuoy, ClipboardCopy, ChevronDown } from "lucide-react";
import { ModalShell } from "../ModalShell";
import { useT } from "../../i18n/i18n";
import { STATE_META } from "./shared";
import type { Service } from "../../clinicStatus/model";

// Level 3 — the deepest layer of the progressive workflow. One service, fully
// explained in operational language: current state, what it affects, how to
// fix it, whether AREN is already self-healing, and — folded away for AREN
// Support — the raw diagnostics. The receptionist should never need to open
// this; when they do, it should feel like a calm help desk, not a console.

export function ServiceDetailModal({ service, onClose }: { service: Service; onClose: () => void }) {
    const t = useT();
    const meta = STATE_META[service.state];
    const Icon = service.icon;
    const degraded = service.state === "attention" || service.state === "offline";
    const [checking, setChecking] = useState(false);
    const [diagOpen, setDiagOpen] = useState(false);

    const retry = () => {
        if (checking) return;
        setChecking(true);
        // No live probe yet — the check runs, then settles back to the known
        // state. When a real health endpoint lands, this is the only call to swap.
        setTimeout(() => setChecking(false), 1200);
    };

    const diagnostics = [
        `service: ${service.id}`,
        `state: ${service.state}`,
        `detail: ${service.diagnostics}`,
        `checked: ${new Date().toISOString()}`,
    ].join("\n");

    const copyDiagnostics = async () => {
        try {
            await navigator.clipboard.writeText(diagnostics);
            toast.success(t("csDiagnosticsCopied"));
        } catch {
            /* clipboard blocked — non-fatal */
        }
    };

    return (
        <ModalShell
            eyebrow={t("csDetailEyebrow")}
            title={t(service.nameKey)}
            icon={<Icon size={19} />}
            onClose={onClose}
            footer={
                <>
                    <button
                        type="button"
                        onClick={copyDiagnostics}
                        className="flex h-[38px] items-center gap-[7px] rounded-[10px] border border-[#e7e4f2] bg-white px-[13px] text-[13px] font-semibold text-[#5a6472] transition-colors hover:bg-[#f7f6fc] hover:text-[#3b4453]"
                    >
                        <ClipboardCopy size={15} /> {t("csCopyDiagnostics")}
                    </button>
                    {degraded && (
                        <button
                            type="button"
                            onClick={retry}
                            disabled={checking}
                            className="flex h-[38px] items-center gap-[7px] rounded-[10px] bg-[linear-gradient(155deg,#7c5cf0,#2f6bed)] px-[16px] text-[13px] font-bold text-white shadow-[0_3px_12px_rgba(124,92,240,0.30)] transition-transform hover:scale-[1.015] disabled:opacity-70"
                        >
                            {checking ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                            {t("csRetry")}
                        </button>
                    )}
                </>
            }
        >
            {/* State + one-line service description */}
            <div className="flex items-center justify-between gap-3 rounded-[13px] border border-[#eef0f5] bg-[#fafbfc] px-[15px] py-[13px]">
                <div className="min-w-0">
                    <div className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#a3aab8]">
                        {t("csDetailStateLabel")}
                    </div>
                    <div className="mt-[3px] truncate text-[13px] font-medium text-[#5a6472]">{t(service.descKey)}</div>
                </div>
                <span
                    className="inline-flex shrink-0 items-center gap-[6px] whitespace-nowrap rounded-full px-[11px] py-[5px] text-[12px] font-bold"
                    style={{ background: meta.bg, color: meta.text, border: `1px solid ${meta.border}` }}
                >
                    <span className="h-[7px] w-[7px] rounded-full" style={{ background: meta.dot }} />
                    {t(meta.labelKey)}
                </span>
            </div>

            {/* Why this matters — gives every service its own identity */}
            <Section label={t("csDetailRole")}>
                <p className="m-0 text-[13px] leading-[1.55] text-[#5a6472]">{t(service.roleKey)}</p>
            </Section>

            {/* What this affects */}
            <Section label={t("csDetailImpact")}>
                <p className="m-0 text-[13.5px] leading-[1.55] text-[#3b4453]">
                    {degraded ? t(service.impactKey) : t("csHealthyServiceBody")}
                </p>
            </Section>

            {/* How to fix it — ordered recovery steps */}
            {degraded && service.recoveryKeys.length > 0 && (
                <Section label={t("csDetailRecovery")}>
                    <ol className="m-0 flex list-none flex-col gap-[9px] p-0">
                        {service.recoveryKeys.map((k, i) => (
                            <li key={k} className="flex items-start gap-[11px]">
                                <span className="mt-[1px] flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[rgba(124,92,240,0.10)] text-[12px] font-extrabold text-[#6d4fd0]">
                                    {i + 1}
                                </span>
                                <span className="text-[13.5px] leading-[1.5] text-[#3b4453]">{t(k)}</span>
                            </li>
                        ))}
                    </ol>
                </Section>
            )}

            {/* Automatic recovery */}
            {degraded && service.autoRecovery && (
                <div className="mt-[14px] flex items-center gap-[11px] rounded-[12px] border border-[rgba(201,121,26,0.22)] bg-[rgba(201,121,26,0.06)] px-[13px] py-[11px]">
                    <Loader2 size={16} className="shrink-0 animate-spin text-[#c0771a]" />
                    <div>
                        <div className="text-[12.5px] font-bold text-[#b06f14]">{t("csDetailAutoRecovery")}</div>
                        <div className="mt-[1px] text-[12.5px] leading-[1.45] text-[#8a7550]">{t("csDetailAutoBody")}</div>
                    </div>
                </div>
            )}

            {/* Advanced diagnostics — folded away; support-facing */}
            <div className="mt-[16px] border-t border-[#eef0f5] pt-[13px]">
                <button
                    type="button"
                    onClick={() => setDiagOpen((v) => !v)}
                    className="flex w-full items-center gap-[8px] text-left"
                >
                    <ChevronDown
                        size={15}
                        className={`shrink-0 text-[#a3aab8] transition-transform ${diagOpen ? "rotate-180" : ""}`}
                    />
                    <span className="text-[12.5px] font-bold text-[#5a6472]">{t("csDetailDiagnostics")}</span>
                    <span className="text-[11.5px] font-medium text-[#a8aeba]">· {t("csDetailDiagnosticsHint")}</span>
                </button>
                {diagOpen && (
                    <pre className="mt-[10px] overflow-x-auto rounded-[10px] border border-[#e9ecf2] bg-[#0d1b35] px-[13px] py-[11px] font-mono text-[11.5px] leading-[1.6] text-[#c7d2fe]">
                        {diagnostics}
                    </pre>
                )}
            </div>

            {/* Support — always after recovery, never before */}
            <div className="mt-[14px] flex items-start gap-[9px] rounded-[12px] bg-[#f7f8fb] px-[13px] py-[11px]">
                <LifeBuoy size={15} className="mt-[2px] shrink-0 text-[#8b84c0]" />
                <p className="m-0 text-[12.5px] leading-[1.5] text-[#6b7280]">{t("csSupportLine")}</p>
            </div>
        </ModalShell>
    );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="mt-[16px]">
            <div className="mb-[8px] text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[#8b5cf6]">
                {label}
            </div>
            {children}
        </div>
    );
}
