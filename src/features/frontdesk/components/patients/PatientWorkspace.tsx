import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
    CalendarPlus,
    ChevronRight,
    Copy,
    MessageCircle,
    PenLine,
    Phone,
    Plus,
    Printer,
    Stethoscope,
    UserRoundSearch,
} from "lucide-react";
import type { PatientDirectoryEntry, PatientHistoryVisit } from "@/lib/db";
import { tintFor } from "../../statusStyle";
import { formatArchiveDate, initials } from "../../utils";
import { useT } from "../../i18n/i18n";
import { VisitTimeline, type TimelineWindow } from "./VisitTimeline";
import { avatarTint } from "./PatientBrowser";

// The patient's operational workspace (right panel): who they are, how to
// reach them, their visit rhythm, and what reception can do next. No
// diagnosis, no prescriptions, no clinical anything — that lives in Cortex.

type Props = {
    patient: PatientDirectoryEntry | null;
    history: PatientHistoryVisit[];
    historyLoading: boolean;
    onNewVisit: (p: PatientDirectoryEntry) => void;
    onEdit: (p: PatientDirectoryEntry) => void;
    onOpenTimeline: () => void;
};

export function PatientWorkspace({ patient, history, historyLoading, onNewVisit, onEdit, onOpenTimeline }: Props) {
    const t = useT();
    const [timelineWindow, setTimelineWindow] = useState<TimelineWindow>(6);

    if (!patient) return <WorkspaceEmpty />;

    const returning = patient.visit_count > 1;
    const tint = avatarTint(patient.name);
    const registered = formatArchiveDate(patient.first_visit_at ?? patient.created_at);

    const copyPhone = async () => {
        if (!patient.phone) return;
        try {
            await navigator.clipboard.writeText(patient.phone);
            toast.success(t("qaCopied"));
        } catch {
            toast.error(t("qaCopyPhone"));
        }
    };

    return (
        // Keyed re-mount per patient: each folder opens with the quiet
        // aren-rise entrance instead of morphing mid-air into the next one.
        <div key={patient.id} className="aren-rise flex min-h-0 flex-col gap-[14px] overflow-y-auto overscroll-contain pr-[2px]">
            {/* ── Patient header: more human than technical ─────────────── */}
            <section className="shrink-0 rounded-[16px] border border-[#e7e9f0] bg-white p-5 shadow-[0_1px_2px_rgba(20,30,50,0.05)]">
                <div className="flex items-start gap-4">
                    <div
                        className="flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-[18px] text-[20px] font-bold"
                        style={{ background: tint.bg, color: tint.text }}
                        aria-hidden
                    >
                        {initials(patient.name)}
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-[10px] gap-y-[6px]">
                            {/* a div on purpose — raw h2 is eaten by the §13 layer
                                trap (legacy CSS uppercases it), same as QueuePanel */}
                            <div className="truncate font-[Manrope,sans-serif] text-[21px] font-extrabold leading-[1.15] tracking-[-0.01em] text-[#161d29]">
                                {patient.name}
                            </div>
                            {returning ? (
                                <span className="shrink-0 rounded-[6px] border border-[#e4e7ee] bg-[#f5f6f9] px-[8px] py-[3px] text-[10.5px] font-bold text-[#5a6472]">
                                    {t("returningBadge")}
                                </span>
                            ) : (
                                <span className="shrink-0 rounded-[6px] border border-[#e5ddfa] bg-[rgba(124,92,240,0.07)] px-[8px] py-[3px] text-[10.5px] font-bold text-[#6d5bc7]">
                                    {t("newPatientBadge")}
                                </span>
                            )}
                        </div>

                        <div className="mt-[6px] flex flex-wrap items-center gap-x-[7px] gap-y-[3px] text-[13px] font-medium text-[#5a6472]">
                            {patient.gender && <span>{patient.gender}</span>}
                            {patient.gender && patient.age > 0 && <Dot />}
                            {patient.age > 0 && <span className="tabular-nums">{patient.age} {t("yrs")}</span>}
                            {(patient.gender || patient.age > 0) && !!patient.phone && <Dot />}
                            {patient.phone && (
                                <button
                                    type="button"
                                    onClick={copyPhone}
                                    title={t("qaCopyPhone")}
                                    className="inline-flex items-center gap-[5px] rounded-[6px] px-[2px] font-semibold text-[#374151] tabular-nums transition-colors hover:text-[#1d51c9] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(99,102,241,0.28)]"
                                >
                                    <Phone size={12.5} className="text-[#8a91a0]" />
                                    {patient.phone}
                                    <Copy size={11.5} className="text-[#c4c9d3]" />
                                </button>
                            )}
                        </div>

                        <div className="mt-[4px] text-[12px] font-medium text-[#a8aeba]">
                            {t("registeredOn", { date: registered })}
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-[9px]">
                        <button
                            type="button"
                            onClick={() => onEdit(patient)}
                            className="flex h-10 items-center gap-[7px] rounded-[10px] border-[1.5px] border-[#e6e3f1] bg-white px-4 text-[13px] font-bold text-[#5a6472] transition-colors hover:border-[#d5cfec] hover:bg-[#f8f7fd] hover:text-[#3b4453] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(99,102,241,0.28)]"
                        >
                            <PenLine size={14.5} />
                            {t("editDetails")}
                        </button>
                        {/* New Visit opens a door — it wears the brand gradient
                            like the launcher + (§7.7). */}
                        <button
                            type="button"
                            onClick={() => onNewVisit(patient)}
                            className="flex h-10 items-center gap-[7px] rounded-[10px] bg-[linear-gradient(155deg,#7c5cf0,#2f6bed)] px-[18px] text-[13px] font-bold text-white shadow-[0_3px_12px_rgba(124,92,240,0.32)] transition-[filter,box-shadow] duration-100 hover:brightness-110 hover:shadow-[0_3px_16px_rgba(124,92,240,0.45)] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(99,102,241,0.4)]"
                        >
                            <Plus size={15} strokeWidth={2.6} />
                            {t("newVisit")}
                        </button>
                    </div>
                </div>

                {/* ── Compact operational summary ────────────────────────── */}
                <div className="mt-4 grid grid-cols-4 divide-x divide-[#eef0f5] rounded-[12px] border border-[#eef0f5] bg-[#fbfbfd] py-[11px] max-[1240px]:grid-cols-2 max-[1240px]:gap-y-3">
                    <SummaryCell label={t("totalVisits")}>
                        <span className={`font-[Manrope,sans-serif] text-[17px] font-extrabold tabular-nums ${patient.visit_count === 0 ? "text-[#a8aeba]" : "text-[#161d29]"}`}>
                            {patient.visit_count}
                        </span>
                    </SummaryCell>
                    <SummaryCell label={t("lastVisitLabel")}>
                        <span className={`text-[13.5px] font-bold ${patient.last_visit_at ? "text-[#161d29]" : "text-[#a8aeba]"}`}>
                            {formatArchiveDate(patient.last_visit_at)}
                        </span>
                    </SummaryCell>
                    <SummaryCell label={t("firstVisitLabel")}>
                        <span className={`text-[13.5px] font-bold ${patient.first_visit_at ? "text-[#161d29]" : "text-[#a8aeba]"}`}>
                            {formatArchiveDate(patient.first_visit_at)}
                        </span>
                    </SummaryCell>
                    <SummaryCell label={t("primaryDoctor")}>
                        <span className={`flex items-center justify-center gap-[6px] text-[13.5px] font-bold ${patient.primary_doctor_name ? "text-[#161d29]" : "text-[#a8aeba]"}`}>
                            {patient.primary_doctor_name && <Stethoscope size={13} className="text-[#8b5cf6] opacity-80" />}
                            <span className="truncate">{patient.primary_doctor_name ?? "—"}</span>
                        </span>
                    </SummaryCell>
                </div>
            </section>

            {/* ── Visit timeline: rhythm at a glance ─────────────────────── */}
            <section className="shrink-0 rounded-[16px] border border-[#e7e9f0] bg-white px-5 pb-2 pt-4 shadow-[0_1px_2px_rgba(20,30,50,0.05)]">
                <div className="mb-1 flex items-center justify-between gap-3">
                    <CardTitle icon={<CalendarPlus size={14} />} text={t("timelineTitle")} />
                    <select
                        value={timelineWindow}
                        onChange={(e) => setTimelineWindow(Number(e.target.value) as TimelineWindow)}
                        className="fd-field-sm"
                        style={{ width: "auto" }}
                        aria-label={t("timelineTitle")}
                    >
                        <option value={3}>{t("tw3m")}</option>
                        <option value={6}>{t("tw6m")}</option>
                        <option value={12}>{t("tw12m")}</option>
                        <option value={0}>{t("twAll")}</option>
                    </select>
                </div>
                {historyLoading ? (
                    <div aria-hidden className="flex h-[96px] items-center animate-pulse motion-reduce:animate-none">
                        <div className="h-[2px] w-full rounded bg-[#eef0f5]" />
                    </div>
                ) : (
                    <VisitTimeline visits={history} windowMonths={timelineWindow} onOpenAll={onOpenTimeline} />
                )}
            </section>

            {/* ── Recent visits + quick actions ──────────────────────────── */}
            <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_300px] items-start gap-[14px] max-[1240px]:grid-cols-1">
                <RecentVisits history={history} loading={historyLoading} onViewAll={onOpenTimeline} />
                <QuickActions patient={patient} onCopyPhone={copyPhone} />
            </div>
        </div>
    );
}

function Dot() {
    return <span aria-hidden className="text-[#c4c9d3]">·</span>;
}

// Card titles on this page follow the V3 sidebar convention: sentence-case
// ink with a violet structural icon (micro-labels stay inside modals).
function CardTitle({ icon, text }: { icon: React.ReactNode; text: string }) {
    return (
        <div className="flex items-center gap-[7px] text-[13.5px] font-bold text-[#161d29]">
            <span className="text-[#8b5cf6] opacity-85">{icon}</span>
            {text}
        </div>
    );
}

function SummaryCell({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex min-w-0 flex-col items-center gap-[3px] px-3 text-center">
            <span className="text-[10.5px] font-extrabold uppercase tracking-[0.07em] text-[#8a91a0]">{label}</span>
            {children}
        </div>
    );
}

function RecentVisits({
    history,
    loading,
    onViewAll,
}: {
    history: PatientHistoryVisit[];
    loading: boolean;
    onViewAll: () => void;
}) {
    const t = useT();
    const firstVisitId = history.length ? history[history.length - 1].visit_id : null;
    const shown = useMemo(() => history.slice(0, 12), [history]);

    return (
        <section className="flex min-h-0 flex-col overflow-hidden rounded-[16px] border border-[#e7e9f0] bg-white shadow-[0_1px_2px_rgba(20,30,50,0.05)]">
            <div className="px-5 pb-[10px] pt-4">
                <CardTitle icon={<Stethoscope size={14} />} text={t("recentVisits")} />
            </div>

            {loading && (
                <div aria-hidden className="animate-pulse px-5 pb-4 motion-reduce:animate-none">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="mt-2 h-[52px] rounded-[11px] bg-[#f5f6f9]" />
                    ))}
                </div>
            )}

            {!loading && shown.length === 0 && (
                <div className="flex flex-col items-center gap-[8px] px-5 pb-8 pt-4 text-center">
                    <h3 className="m-0 text-[13.5px] font-bold text-[#5a6472]">{t("historyEmptyTitle")}</h3>
                    <p className="m-0 max-w-[260px] text-[12.5px] leading-[1.5] text-[#a8aeba]">{t("historyEmptyBody")}</p>
                </div>
            )}

            {!loading && shown.length > 0 && (
                <>
                    {/* Compact density on purpose: internal scroll, page never grows. */}
                    <div className="max-h-[264px] min-h-0 overflow-y-auto overscroll-contain">
                        {shown.map((v) => {
                            const tint = tintFor(v.status);
                            const d = new Date(v.created_at);
                            const day = d.toLocaleDateString("en-IN", { day: "2-digit" });
                            const monYear = d.toLocaleDateString("en-IN", { month: "short", year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined });
                            return (
                                <div key={v.visit_id} className="flex items-center gap-3 border-t border-[#f2f3f7] px-5 py-[8px]">
                                    <div className="w-[40px] shrink-0 text-center">
                                        <div className="font-[Manrope,sans-serif] text-[16px] font-extrabold leading-none text-[#374151] tabular-nums">{day}</div>
                                        <div className="mt-[2px] text-[9.5px] font-semibold uppercase tracking-[0.04em] text-[#a8aeba]">{monYear}</div>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-[13px] font-semibold text-[#161d29]">
                                            {v.visit_id === firstVisitId ? t("visitFirst") : t("visitFollowUp")}
                                        </div>
                                        <div className="mt-[1px] truncate text-[11.5px] text-[#8a91a0]">{v.doctor_name ?? "—"}</div>
                                    </div>
                                    <span className={`inline-flex shrink-0 items-center gap-[5px] rounded-full px-[9px] py-[3px] text-[10.5px] font-semibold ${tint.chipBg} ${tint.textClass}`}>
                                        <span className="h-[5px] w-[5px] rounded-full" style={{ background: tint.dotColor }} />
                                        {t(tint.labelKey)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    <button
                        type="button"
                        onClick={onViewAll}
                        className="group flex items-center justify-center gap-[6px] border-t border-[#eef0f5] bg-[#fbfbfd] py-[9px] text-[12px] font-bold text-[#6d5bc7] transition-colors hover:bg-[rgba(124,92,240,0.05)] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_rgba(99,102,241,0.28)]"
                    >
                        {t("viewAllVisits")}
                        <ChevronRight size={13} className="transition-transform duration-100 group-hover:translate-x-[2px] motion-reduce:transition-none" />
                    </button>
                </>
            )}
        </section>
    );
}

// Reception-relevant actions only. Edit Details / New Visit live in the
// header — never duplicated here (per the brief).
function QuickActions({ patient, onCopyPhone }: { patient: PatientDirectoryEntry; onCopyPhone: () => void }) {
    const t = useT();
    const navigate = useNavigate();

    const openWhatsApp = () => {
        if (!patient.phone) return;
        window.open(`https://wa.me/91${patient.phone}`, "_blank", "noopener,noreferrer");
    };

    return (
        <section className="rounded-[16px] border border-[#e7e9f0] bg-white pb-2 shadow-[0_1px_2px_rgba(20,30,50,0.05)]">
            <div className="px-5 pb-[6px] pt-4">
                <CardTitle icon={<Copy size={13.5} />} text={t("quickActions")} />
            </div>
            <ActionRow
                icon={<Copy size={16} />}
                label={t("qaCopyPhone")}
                sub={patient.phone || "—"}
                disabled={!patient.phone}
                onClick={onCopyPhone}
            />
            <ActionRow
                icon={<MessageCircle size={16} />}
                label={t("qaWhatsApp")}
                sub={t("qaWhatsAppSub")}
                disabled={!patient.phone}
                onClick={openWhatsApp}
            />
            <ActionRow
                icon={<Printer size={16} />}
                label={t("qaPrintRx")}
                sub={t("qaPrintRxSub")}
                onClick={() => navigate(`/app/printrx?patient=${patient.id}`)}
            />
        </section>
    );
}

function ActionRow({
    icon,
    label,
    sub,
    onClick,
    disabled,
    soon,
}: {
    icon: React.ReactNode;
    label: string;
    sub: string;
    onClick?: () => void;
    disabled?: boolean;
    soon?: boolean;
}) {
    const t = useT();
    const inert = disabled || soon;
    return (
        <button
            type="button"
            onClick={inert ? undefined : onClick}
            disabled={inert}
            className={`group flex w-full items-center gap-3 px-5 py-[10px] text-left transition-colors focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_rgba(99,102,241,0.28)] ${
                inert ? "cursor-default opacity-55" : "hover:bg-[#f8f8fd]"
            }`}
        >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#eef0f5] bg-[#f8f8fd] text-[#5a6472] transition-colors ${inert ? "" : "group-hover:border-[#e5ddfa] group-hover:bg-[rgba(124,92,240,0.06)] group-hover:text-[#6d5bc7]"}`}>
                {icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-[#161d29]">{label}</span>
                <span className="mt-[1px] block truncate text-[11.5px] text-[#8a91a0] tabular-nums">{sub}</span>
            </span>
            {soon ? (
                <span className="shrink-0 rounded-[5px] border border-[#eef0f5] bg-[#f5f6f9] px-[6px] py-[1px] text-[9.5px] font-bold uppercase tracking-[0.06em] text-[#a8aeba]">
                    {t("navSoon")}
                </span>
            ) : (
                <ChevronRight size={14} className={`shrink-0 text-[#c4c9d3] transition-transform duration-100 ${inert ? "" : "group-hover:translate-x-[2px] group-hover:text-[#8a91a0]"} motion-reduce:transition-none`} />
            )}
        </button>
    );
}

// The workspace before a selection: a welcoming pause, not a blank panel.
function WorkspaceEmpty() {
    const t = useT();
    return (
        <div className="aren-rise flex min-h-0 flex-1 flex-col items-center justify-center gap-[12px] rounded-[16px] border border-[#e7e9f0] bg-white px-6 py-16 text-center shadow-[0_1px_2px_rgba(20,30,50,0.05)]">
            <h3 className="m-0 mt-1 flex items-center gap-[9px] font-[Manrope,sans-serif] text-[20px] font-extrabold leading-[1.15] tracking-[-0.01em] text-[#161d29]">
                <UserRoundSearch size={19} className="text-[#8b5cf6] opacity-80" />
                {t("wsEmptyTitle")}
            </h3>
            <p className="m-0 max-w-[300px] text-[13.5px] font-[450] leading-[1.55] text-[#5a6472]">{t("wsEmptyBody")}</p>
        </div>
    );
}
