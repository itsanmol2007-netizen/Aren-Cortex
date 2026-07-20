import {
    Check,
    AlertTriangle,
    Lightbulb,
    Clock3,
    ArrowRight,
    UserPlus,
    Users,
    Stethoscope,
    Printer,
    Building2,
    UserRound,
    LayoutGrid,
    LogOut,
    type LucideIcon,
} from "lucide-react";
import { useT } from "../../i18n/i18n";
import { StatusIllustration } from "./StatusIllustration";
import type { ClinicStatus, OverallState } from "../../clinicStatus/model";

// Level 1 — the interpretation layer. Answers one question in 2–3 seconds:
// "Can I keep working?" Everything technical has already been translated into
// operational meaning by the model; this view only composes it calmly.

const HERO: Record<OverallState, { glyph: LucideIcon; ink: string; soft: string; ring: string }> = {
    healthy: { glyph: Check, ink: "#1c8a4d", soft: "rgba(39,163,95,0.12)", ring: "rgba(39,163,95,0.30)" },
    warning: { glyph: AlertTriangle, ink: "#c0771a", soft: "rgba(201,121,26,0.13)", ring: "rgba(201,121,26,0.32)" },
    critical: { glyph: AlertTriangle, ink: "#c33b33", soft: "rgba(210,59,52,0.12)", ring: "rgba(210,59,52,0.30)" },
};

export function ClinicStatusSummary({
    status,
    operatorName,
    clinicName,
    registeredToday,
    onOpenDetails,
    onLogout,
}: {
    status: ClinicStatus;
    operatorName: string;
    clinicName: string;
    registeredToday: number;
    onOpenDetails: () => void;
    onLogout: () => void;
}) {
    const t = useT();
    const { situation } = status;
    const hero = HERO[situation.overall];
    const Glyph = hero.glyph;

    const printer = status.services.find((s) => s.id === "printing");
    const printingUp = printer?.state === "operational";

    return (
        <div className="aren-rise grid grid-cols-[minmax(0,1fr)_320px] items-start gap-[16px] max-[1080px]:grid-cols-1">
            {/* ── Primary column ─────────────────────────────────────────── */}
            <div className="flex flex-col gap-[16px]">
                {/* Main hero card — the heart of the page */}
                <section className="relative overflow-hidden rounded-[20px] border border-[#ecebf3] bg-white shadow-[0_2px_16px_rgba(18,20,45,0.05)]">
                    <div
                        className="pointer-events-none absolute inset-0"
                        style={{
                            background:
                                "radial-gradient(680px 200px at 88% 0%, rgba(139,92,246,0.05), transparent 70%)," +
                                "radial-gradient(520px 200px at 100% 100%, rgba(244,114,182,0.045), transparent 70%)",
                        }}
                    />
                    <div className="relative grid grid-cols-[minmax(0,1fr)_minmax(240px,340px)] items-center gap-2 max-[760px]:grid-cols-1">
                        <div className="p-[26px] max-[760px]:pb-2">
                            <div
                                className="mb-[18px] flex h-[52px] w-[52px] items-center justify-center rounded-full"
                                style={{ background: hero.soft, boxShadow: `0 0 0 6px ${hero.soft}` }}
                            >
                                <div
                                    className="flex h-[38px] w-[38px] items-center justify-center rounded-full"
                                    style={{ background: hero.ink }}
                                >
                                    <Glyph size={20} className="text-white" strokeWidth={2.6} />
                                </div>
                            </div>

                            <div className="max-w-[24ch] font-[Manrope,sans-serif] text-[27px] font-extrabold leading-[1.12] tracking-[-0.015em] text-[#161d29]">
                                {t(situation.headlineKey)}
                            </div>
                            <p className="m-0 mt-[12px] max-w-[46ch] text-[14.5px] leading-[1.6] text-[#5a6472]">
                                {t(situation.bodyKey)}
                            </p>

                            {situation.actionKey && (
                                <div className="mt-[16px] inline-flex items-start gap-[10px] rounded-[13px] border border-[rgba(201,121,26,0.22)] bg-[rgba(201,121,26,0.06)] px-[14px] py-[11px]">
                                    <Lightbulb size={16} className="mt-[1px] shrink-0 text-[#c0771a]" />
                                    <div>
                                        <div className="text-[10.5px] font-extrabold uppercase tracking-[0.07em] text-[#b06f14]">
                                            {t("csRecommended")}
                                        </div>
                                        <div className="mt-[2px] text-[13.5px] font-semibold text-[#3b4453]">
                                            {t(situation.actionKey)}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="mt-[18px] flex items-center gap-[7px] text-[12.5px] font-medium text-[#8a91a0]">
                                <Clock3 size={14} />
                                {t("csLastChecked")}{" "}
                                <span className="font-semibold text-[#1c8a4d]">{t("csJustNow")}</span>
                            </div>
                        </div>

                        <div className="relative flex items-center justify-center p-[20px] max-[760px]:pt-0">
                            <div
                                className="pointer-events-none absolute inset-[12px] rounded-[22px]"
                                style={{
                                    background:
                                        "radial-gradient(130% 120% at 68% 22%, rgba(124,92,240,0.055), transparent 62%)",
                                }}
                            />
                            <StatusIllustration state={situation.overall} className="relative h-auto w-full max-w-[356px]" />
                        </div>
                    </div>
                </section>

                {/* Today's operations — helpful, high-level, never diagnostic */}
                <section className="rounded-[18px] border border-[#ecebf3] bg-white p-[18px] shadow-[0_2px_14px_rgba(18,20,45,0.04)]">
                    <div className="mb-[14px] text-[10.5px] font-extrabold uppercase tracking-[0.09em] text-[#8b5cf6]">
                        {t("csOpsTitle")}
                    </div>
                    <div className="grid grid-cols-4 gap-[10px] max-[820px]:grid-cols-2">
                        <OpCard
                            icon={UserPlus}
                            label={t("csOpsRegistered")}
                            value={String(registeredToday)}
                            tone="value"
                        />
                        <OpCard icon={Users} label={t("csOpsQueue")} value={t("csOpsQueueNormal")} tone="ok" />
                        <OpCard icon={Stethoscope} label={t("csOpsDoctor")} value={t("csOpsConnected")} tone="ok" />
                        <OpCard
                            icon={Printer}
                            label={t("csOpsPrinting")}
                            value={printingUp ? t("csOpsAvailable") : t("csOpsUnavailable")}
                            tone={printingUp ? "ok" : "warn"}
                        />
                    </div>
                </section>
            </div>

            {/* ── Secondary column — never overpowers the summary ─────────── */}
            <div className="flex flex-col gap-[16px]">
                {/* At a glance */}
                <section className="rounded-[18px] border border-[#ecebf3] bg-white p-[18px] shadow-[0_2px_14px_rgba(18,20,45,0.04)]">
                    <div className="mb-[13px] text-[10.5px] font-extrabold uppercase tracking-[0.09em] text-[#8b5cf6]">
                        {t("csContextEyebrow")}
                    </div>
                    <div className="flex flex-col">
                        <ContextRow icon={Building2} label={t("csClinicLabel")} value={clinicName} />
                        <ContextRow icon={UserRound} label={t("csOperatorLabel")} value={operatorName} />
                        <ContextRow icon={LayoutGrid} label={t("csModeLabel")} value={t("csModeFrontDesk")} />
                        <ContextRow icon={Clock3} label={t("csLastCheckLabel")} value={t("csJustNow")} last />
                    </div>
                </section>

                {/* Progressive-disclosure CTA — the door to Level 2 */}
                <button
                    type="button"
                    onClick={onOpenDetails}
                    className="group rounded-[18px] border border-[rgba(124,92,240,0.28)] bg-[linear-gradient(160deg,#7c5cf0,#2f6bed)] p-[18px] text-left shadow-[0_10px_30px_rgba(70,60,180,0.24)] transition-transform hover:-translate-y-[1px]"
                >
                    <div className="flex items-center justify-between">
                        <div className="text-[14px] font-extrabold text-white">{t("csViewDetails")}</div>
                        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white/15 text-white transition-transform group-hover:translate-x-[2px]">
                            <ArrowRight size={16} />
                        </span>
                    </div>
                    <div className="mt-[6px] max-w-[34ch] text-[12.5px] leading-[1.5] text-white/70">
                        {t("csViewDetailsSub")}
                    </div>
                </button>

                {/* Session — the quiet, buried corner where logout lives */}
                <section className="rounded-[18px] border border-[#ecebf3] bg-[#fafbfc] p-[16px]">
                    <div className="mb-[9px] text-[10px] font-extrabold uppercase tracking-[0.09em] text-[#a3aab8]">
                        {t("csSessionEyebrow")}
                    </div>
                    <div className="text-[12.5px] font-medium text-[#5a6472]">
                        {t("csSignedInAs", { name: operatorName })}
                    </div>
                    <button
                        type="button"
                        onClick={onLogout}
                        className="mt-[11px] flex items-center gap-[7px] text-[12.5px] font-semibold text-[#8a91a0] transition-colors hover:text-[#d23b34]"
                    >
                        <LogOut size={14} />
                        {t("csLogoutLink")}
                    </button>
                </section>
            </div>
        </div>
    );
}

function OpCard({
    icon: Icon,
    label,
    value,
    tone,
}: {
    icon: LucideIcon;
    label: string;
    value: string;
    tone: "ok" | "warn" | "value";
}) {
    const valueColor = tone === "warn" ? "#b06f14" : tone === "ok" ? "#1c7a45" : "#161d29";
    return (
        <div className="rounded-[14px] border border-[#eef0f5] bg-[#fafbfc] px-[15px] py-[14px] transition-colors hover:border-[#e6e3f4] hover:bg-white">
            <div className="flex items-center gap-[9px]">
                <span className="flex h-[28px] w-[28px] items-center justify-center rounded-[9px] bg-[rgba(124,92,240,0.10)]">
                    <Icon size={15} className="text-[#7c5cf0]" />
                </span>
                <span className="text-[11px] font-semibold leading-[1.25] text-[#8a91a0]">{label}</span>
            </div>
            <div
                className="mt-[11px] font-[Manrope,sans-serif] text-[17px] font-extrabold leading-[1.1] tracking-[-0.01em]"
                style={{ color: valueColor }}
            >
                {value}
            </div>
        </div>
    );
}

function ContextRow({
    icon: Icon,
    label,
    value,
    last,
}: {
    icon: LucideIcon;
    label: string;
    value: string;
    last?: boolean;
}) {
    return (
        <div className={`flex items-center gap-[11px] py-[10px] ${last ? "" : "border-b border-[#f0f1f5]"}`}>
            <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-[#f4f4f8]">
                <Icon size={15} className="text-[#8b84c0]" />
            </span>
            <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium text-[#a3aab8]">{label}</div>
                <div className="mt-[1px] truncate text-[13px] font-semibold text-[#3b4453]">{value}</div>
            </div>
        </div>
    );
}
