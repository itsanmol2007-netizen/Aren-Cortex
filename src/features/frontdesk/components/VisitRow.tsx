import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ExternalLink, ArrowRightLeft, CheckCircle2, XCircle, MoreVertical, Printer } from "lucide-react";
import type { TodayVisit } from "../types/frontdesk";
import { tintFor } from "../statusStyle";
import { maskPhone, padToken, formatShortDate } from "../utils";
import { useT } from "../i18n/i18n";

type Props = {
    visit: TodayVisit;
    now: Date;
    selected?: boolean;
    onOpen: (visit: TodayVisit) => void;
    onComplete: (visit: TodayVisit) => void;
    onCancel: (visit: TodayVisit) => void;
};

export function VisitRow({ visit, now, selected, onOpen, onComplete, onCancel }: Props) {
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
                    <MenuItem icon={<ArrowRightLeft size={15} className="opacity-70" />} onClick={() => { onOpen(visit); closeMenu(); }}>
                        {t("menuMove")}
                    </MenuItem>
                    {visit.status !== "completed" && (
                        <MenuItem icon={<CheckCircle2 size={15} className="opacity-70" />} onClick={() => { onComplete(visit); closeMenu(); }}>
                            {t("menuComplete")}
                        </MenuItem>
                    )}
                    {isCompleted && (
                        <MenuItem icon={<Printer size={15} className="opacity-70" />} onClick={() => { goToPrintRx(); closeMenu(); }}>
                            {t("menuPrintRx")}
                        </MenuItem>
                    )}
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
            className={`grid grid-cols-[56px_1.7fr_1.4fr_0.9fr_0.8fr_130px_30px] max-lg:grid-cols-[48px_1.5fr_0.9fr_116px_30px] items-center gap-[10px] border-t border-[#eef0f5] border-l-[3px] px-4 py-[9px] min-h-[44px] cursor-pointer relative transition-[background,box-shadow,border-color] duration-100 focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_rgba(99,102,241,0.28)] ${selected ? "bg-[rgba(47,107,237,0.055)]" : ""} ${isCancelled ? "opacity-60" : ""}`}
            style={{
                borderLeftColor: tint.borderColor,
                backgroundImage: !selected ? (hovered ? tint.backgroundHover : tint.background) : undefined,
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={(e) => {
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
                </div>
                <div className="mt-[1px] truncate text-[12px] text-[#8a91a0] tabular-nums">
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
                <div className="mt-[1px] text-[11px] text-[#a8aeba]">{formatShortDate(visit.created_at)}</div>
            </div>

            {/* Status pill: dot + label, and for waiting the live duration —
                "Waiting · 18 min" says what AND how long in one breath. */}
            <div className="flex items-center gap-[4px]">
                <div className={`inline-flex w-fit items-center gap-[6px] rounded-full px-[11px] py-[5px] text-[11.5px] font-semibold ${tint.chipBg} ${tint.textClass}`}>
                    <span className="h-[6px] w-[6px] shrink-0 rounded-full" style={{ background: tint.dotColor }} />
                    <span className="whitespace-nowrap">
                        {t(tint.labelKey)}
                        {visit.status === "waiting" && waitMins >= 1 && (
                            <span className="tabular-nums"> · {waitMins} {t("min")}</span>
                        )}
                    </span>
                </div>
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
