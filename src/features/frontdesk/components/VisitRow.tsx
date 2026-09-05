import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Activity, ExternalLink, IndianRupee, Loader2, WifiOff, XCircle, MoreVertical, Paperclip, Printer } from "lucide-react";
import type { TodayVisit } from "../types/frontdesk";
import { tintFor } from "../statusStyle";
import { maskPhone, padToken, formatShortDate } from "../utils";
import { useT } from "../i18n/i18n";

type Props = {
    visit: TodayVisit;
    now: Date;
    selected?: boolean;
    onOpen: (visit: TodayVisit) => void;
    onCancel: (visit: TodayVisit) => void;
    onAttachments: (visit: TodayVisit) => void;
    onMeasurements: (visit: TodayVisit) => void;
};

export function VisitRow({ visit, now, selected, onOpen, onCancel, onAttachments, onMeasurements }: Props) {
    const t = useT();
    const navigate = useNavigate();
    const [hovered, setHovered] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
    const menuBtnRef = useRef<HTMLButtonElement>(null);

    const tint = tintFor(visit.status);
    const isCancelled = visit.status === "discarded";
    const returning = visit.visit_count > 1;

    // The receptionist thinks in "how long has she been sitting there", not
    // in clock time — so the WAITING status pill carries a live duration
    // ("Waiting · 18 min"), ticking with the page's 20s clock. One pill says
    // both what and how long, instead of two redundant lines.
    const created = new Date(visit.created_at);
    const createdTime = created.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
    const waitMins = Math.max(0, Math.floor((now.getTime() - created.getTime()) / 60000));
    const shown = visit.symptom_names.slice(0, 2).join(", ");
    const extra = visit.symptom_names.length - 2;
    const moreTip = extra > 0 ? visit.symptom_names.slice(2).join(", ") : "";

    const isCompleted = visit.status === "completed";
    const goToPrintRx = () => navigate(`/app/printrx?visit=${visit.visit_id}`);

    // An optimistic row (see useVisitActions.createNewVisit): the queue
    // shows it the instant reception clicks Save, before the server has
    // confirmed anything — so it carries a temp id and none of its actions
    // (open/complete/attachments/…) are real yet. Row is inert until the
    // background create resolves and a live refresh replaces it.
    const isPending = !!visit.pending;

    const openMenu = () => {
        const rect = menuBtnRef.current?.getBoundingClientRect();
        if (!rect) return;
        setMenuPos({ top: rect.bottom + 4, left: Math.min(rect.left - 150, window.innerWidth - 210) });
        setMenuOpen(true);
    };

    const closeMenu = () => setMenuOpen(false);

    const menu = menuOpen && menuPos
        ? createPortal(
            <>
                <div className="fixed inset-0 z-[119]" onClick={closeMenu} />
                <div
                    className="fixed z-[120] min-w-[190px] rounded-[9px] border border-[#e4e7ee] bg-white p-[5px] shadow-[0_24px_60px_rgba(16,24,40,0.24)]"
                    style={{ top: menuPos.top, left: menuPos.left }}
                >
                    <MenuItem icon={<ExternalLink size={15} className="opacity-70" />} onClick={() => { onOpen(visit); closeMenu(); }}>
                        {t("menuOpen")}
                    </MenuItem>
                    <MenuItem icon={<Activity size={15} className="opacity-70" />} onClick={() => { onMeasurements(visit); closeMenu(); }}>
                        Add measurements
                    </MenuItem>
                    {isCompleted && (
                        <MenuItem icon={<Printer size={15} className="opacity-70" />} onClick={() => { goToPrintRx(); closeMenu(); }}>
                            {t("menuPrintRx")}
                        </MenuItem>
                    )}
                    <MenuItem icon={<Paperclip size={15} className="opacity-70" />} onClick={() => { onAttachments(visit); closeMenu(); }}>
                        {t("menuAttachments")}
                    </MenuItem>
                    <div className="my-1 h-px bg-[#eef0f5]" />
                    <MenuItem danger icon={<XCircle size={15} className="opacity-70" />} onClick={() => { onCancel(visit); closeMenu(); }}>
                        {t("menuCancel")}
                    </MenuItem>
                </div>
            </>,
            document.body
        )
        : null;

    return (
        <div
            role="option"
            aria-selected={!!selected}
            data-token={padToken(visit.token_number)}
            className={`grid grid-cols-[56px_1.7fr_1.4fr_0.9fr_0.8fr_130px_30px] max-lg:grid-cols-[48px_1.5fr_0.9fr_116px_30px] items-center gap-[10px] border-t border-[#eef0f5] border-l-[3px] px-4 py-[9px] min-h-[44px] relative transition-[background,box-shadow,border-color] duration-100 focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_rgba(99,102,241,0.28)] ${isPending ? "cursor-default" : "cursor-pointer"} ${selected ? "bg-[rgba(47,107,237,0.055)]" : ""} ${isCancelled ? "opacity-60" : ""} ${isPending ? "opacity-70" : ""}`}
            style={{
                borderLeftColor: tint.borderColor,
                backgroundImage: !selected ? (hovered ? tint.backgroundHover : tint.background) : undefined,
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={(e) => {
                if (isPending) return;
                if ((e.target as HTMLElement).closest("[data-row-menu-btn]")) return;
                onOpen(visit);
            }}
        >
            {/* Token chip (V3): lavender identity tile, same family as the
                sidebar's Current Token. Structure, not status — so no tint. */}
            <div className="inline-flex h-[30px] w-fit items-center justify-center rounded-[8px] bg-[rgba(99,102,241,0.08)] px-[8px] font-[Manrope,sans-serif] text-[13px] font-extrabold tracking-[-0.01em] text-[#4c46c9] tabular-nums">
                #{padToken(visit.token_number)}
            </div>

            <div className="min-w-0">
                <div className="flex items-center gap-[7px] text-[14.5px] font-semibold leading-[1.25] text-[#161d29]">
                    <span className="truncate">{visit.patient_name}</span>
                    {returning && (
                        <span
                            title={t("returningTip", { n: visit.visit_count, date: formatShortDate(visit.last_visit_at) })}
                            className="shrink-0 whitespace-nowrap rounded-[5px] border border-[#e4e7ee] bg-[#f5f6f9] px-[7px] py-[2px] text-[10px] font-semibold text-[#5a6472]"
                        >
                            {t("returning")}
                        </span>
                    )}
                    {/* Quiet indicator, not a status — a visit with files
                        attached (from intake or the ⋮ menu) shouldn't need
                        opening the row to know they're there. Also a
                        shortcut straight into the attachments modal —
                        data-row-menu-btn opts it out of the row's own
                        onOpen click, same mechanism the kebab uses. */}
                    {visit.payment_status === "paid" && (
                        <span
                            title={visit.payment_total ? `Paid ₹${visit.payment_total}` : "Paid"}
                            className="flex shrink-0 items-center gap-[3px] whitespace-nowrap rounded-[5px] border border-[#bbf0cd] bg-[#effdf4] px-[6px] py-[2px] text-[10px] font-bold text-[#15803d]"
                        >
                            <IndianRupee size={9} strokeWidth={3} />
                            Paid
                        </span>
                    )}
                    {visit.payment_status === "pending" && (
                        <span
                            title={visit.payment_total ? `₹${visit.payment_total} due` : "Unpaid"}
                            className="flex shrink-0 items-center gap-[3px] whitespace-nowrap rounded-[5px] border border-[#3b4453] bg-[#3b4453] px-[6px] py-[2px] text-[10px] font-bold text-white"
                        >
                            <IndianRupee size={9} strokeWidth={3} />
                            {visit.payment_total ? visit.payment_total : "Unpaid"}
                        </span>
                    )}
                    {visit.attachment_count > 0 && (
                        <button
                            type="button"
                            data-row-menu-btn
                            onClick={(e) => { e.stopPropagation(); if (!isPending) onAttachments(visit); }}
                            title={t("attachCount", { n: visit.attachment_count })}
                            aria-label={t("menuAttachments")}
                            className="flex shrink-0 items-center gap-[3px] whitespace-nowrap rounded-[5px] border border-[#e5ddfa] bg-[#f7f5fd] px-[6px] py-[2px] text-[10px] font-semibold text-[#6d5bc7] transition-colors hover:border-[#c9bdf5] hover:bg-[#efeafd]"
                        >
                            <Paperclip size={10} />
                            {visit.attachment_count}
                        </button>
                    )}
                </div>
                <div className="mt-[1px] truncate text-[12px] text-[#6b7280] tabular-nums">
                    {maskPhone(visit.phone)}
                    {visit.age > 0 && <span> · {visit.age} yrs</span>}
                    {visit.gender && <span> · {visit.gender}</span>}
                </div>
            </div>

            <div className="max-lg:hidden text-[13px] leading-[1.35] text-[#5a6472] truncate">
                {shown}
                {extra > 0 && (
                    <span title={moreTip} className="ml-1 cursor-help border-b border-dashed border-[#d5dae4] font-semibold text-[#1d51c9]">
                        +{extra}
                    </span>
                )}
            </div>

            <div className="text-[12.5px] font-medium text-[#5a6472] truncate" title={visit.doctor_name ?? ""}>
                {visit.doctor_name ?? "—"}
            </div>

            <div className="max-lg:hidden">
                <div className="text-[12.5px] font-medium text-[#374151] tabular-nums">{createdTime}</div>
                <div className="mt-[1px] text-[11px] text-[#7c8593]">{formatShortDate(visit.created_at)}</div>
            </div>

            {/* Status pill: dot + label, and for waiting the live duration —
                "Waiting · 18 min" says what AND how long in one breath. */}
            <div className="flex items-center gap-[4px]">
                {isPending ? (
                    <div className="inline-flex w-fit items-center gap-[6px] rounded-full bg-[#f5f6f9] px-[11px] py-[5px] text-[11.5px] font-semibold text-[#5a6472]">
                        {visit.offline ? <WifiOff size={11} /> : <Loader2 size={11} className="animate-spin" />}
                        <span className="whitespace-nowrap">{visit.offline ? t("syncOffline") : t("syncSaving")}</span>
                    </div>
                ) : (
                    <div className={`inline-flex w-fit items-center gap-[6px] rounded-full px-[11px] py-[5px] text-[11.5px] font-semibold ${tint.chipBg} ${tint.textClass}`}>
                        <span className="h-[6px] w-[6px] shrink-0 rounded-full" style={{ background: tint.dotColor }} />
                        <span className="whitespace-nowrap">
                            {t(tint.labelKey)}
                            {visit.status === "waiting" && waitMins >= 1 && (
                                <span className="tabular-nums"> · {waitMins} {t("min")}</span>
                            )}
                        </span>
                    </div>
                )}
                {/* Completed visits grow a quiet next step: jump to Print RX
                    with this visit's prescription already selected. Contextual,
                    never dominant — same presence rules as the kebab. */}
                {isCompleted && (
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); goToPrintRx(); }}
                        title={t("rowPrintRxTip")}
                        aria-label={t("rowPrintRxTip")}
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-[#347d55] transition-opacity duration-100 hover:bg-[#e4f5eb] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(99,102,241,0.28)] ${hovered ? "opacity-100" : "opacity-45"}`}
                    >
                        <Printer size={14.5} />
                    </button>
                )}
            </div>

            {!isPending && (
                <button
                    ref={menuBtnRef}
                    data-row-menu-btn
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openMenu(); }}
                    aria-label={t("menuOpen")}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-[#a8aeba] transition-opacity duration-100 hover:bg-[#eef0f5] hover:text-[#5a6472] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(99,102,241,0.28)] ${hovered || menuOpen ? "opacity-100" : "opacity-40"}`}
                >
                    <MoreVertical size={17} />
                </button>
            )}

            {menu}
        </div>
    );
}

function MenuItem({
    icon,
    children,
    onClick,
    danger,
}: {
    icon: React.ReactNode;
    children: React.ReactNode;
    onClick: () => void;
    danger?: boolean;
}) {
    return (
        <div
            onClick={onClick}
            className={`flex cursor-pointer items-center gap-[10px] rounded-[7px] px-[11px] py-[9px] text-[13px] font-medium transition-colors ${danger ? "text-[#d23b34] hover:bg-[rgba(210,59,52,0.05)]" : "text-[#5a6472] hover:bg-[#f5f6f9] hover:text-[#161d29]"}`}
        >
            {icon}
            {children}
        </div>
    );
}
