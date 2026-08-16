// ═══════════════════════════════════════════════════════════════════════════
//  PAST VISIT RX VIEWER — the longitudinal read layer
//
//  Renders a stored visit as the prescription document that was actually
//  issued: same component that prints during a live consult, fed through
//  `visitAdapter` instead of live consult state.
//
//  The left rail is the point. It is the patient's whole visit spine, not a
//  single-visit popup — which is why this is the read layer rather than a
//  general-OPD one-off. Visit-to-visit comparison lands here by letting the
//  rail hold two selections instead of one — everything else (the shell, the
//  rail list itself, the seam through visitAdapter) is unchanged.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import {
    Calendar, Check, ChevronLeft, ChevronRight, FileText,
    GitCompare, Pill, Printer, RefreshCw, X,
} from "lucide-react";
import type { DBHospital, RealVisit } from "../../lib/db";
import PrescriptionDocument from "./PrescriptionDocument";
import PrintFormatSelector from "./PrintFormatSelector";
import VisitDiffPanel from "./VisitDiffPanel";
import { usePrintFormat } from "./usePrintFormat";
import {
    formatVisitDateLong,
    formatVisitDateShort,
    hasClinicalContent,
    toDocumentContent,
} from "./visitAdapter";

interface DoctorShape {
    name: string;
    specialization: string | null;
    qualification: string | null;
    registration_number: string | null;
    signature_image_url: string | null;
    avatar_url: string | null;
}

interface PastVisitRxViewerProps {
    visits: RealVisit[];
    /** Which visit to open on. Falls back to the most recent. */
    initialVisitId?: string | null;
    patient: { name: string; age: string | number; gender: string; phone?: string };
    doctor?: DoctorShape | null;
    hospital?: DBHospital | null;
    onClose: () => void;
    onRepeatRx?: (visit: RealVisit) => void;
}

const MM_TO_PX = 96 / 25.4;
const DOC_WIDTH_MM: Record<string, number> = { a5: 148, a4: 210, thermal: 76 };

export default function PastVisitRxViewer({
    visits,
    initialVisitId,
    patient,
    doctor,
    hospital,
    onClose,
    onRepeatRx,
}: PastVisitRxViewerProps) {
    const [activeId, setActiveId] = useState<string | null>(
        initialVisitId ?? visits[0]?.id ?? null
    );
    const [showFormatPicker, setShowFormatPicker] = useState(false);
    const { format, remembered, choose } = usePrintFormat();

    // ── Compare mode ──────────────────────────────────────────────────────────
    // The rail holds up to two selections instead of one active visit. Picking
    // a third while two are already held drops the older pick rather than
    // going inert — a click should always do something.
    const [compareMode, setCompareMode] = useState(false);
    const [compareSelection, setCompareSelection] = useState<string[]>([]);
    const canCompare = visits.length >= 2;

    const toggleCompareSelect = useCallback((id: string) => {
        setCompareSelection((curr) => {
            if (curr.includes(id)) return curr.filter((x) => x !== id);
            if (curr.length < 2) return [...curr, id];
            return [curr[1], id];
        });
    }, []);

    const enterCompareMode = () => {
        setCompareMode(true);
        setCompareSelection(activeId ? [activeId] : []);
    };
    const exitCompareMode = () => {
        setCompareMode(false);
        setCompareSelection([]);
    };

    // Resolved, chronologically ordered pair — undefined until exactly two
    // visits are picked.
    const comparePair = useMemo(() => {
        if (compareSelection.length !== 2) return null;
        const [a, b] = compareSelection
            .map((id) => visits.find((v) => v.id === id))
            .filter((v): v is RealVisit => !!v);
        if (!a || !b) return null;
        return new Date(a.created_at) <= new Date(b.created_at)
            ? { older: a, newer: b }
            : { older: b, newer: a };
    }, [compareSelection, visits]);

    const printRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const [docHeight, setDocHeight] = useState(0);

    const activeIndex = Math.max(0, visits.findIndex((v) => v.id === activeId));
    const visit = visits[activeIndex] ?? null;

    const content = useMemo(
        () => (visit ? toDocumentContent(visit, "rxv") : null),
        [visit]
    );

    const docWidthPx = (DOC_WIDTH_MM[format] ?? DOC_WIDTH_MM.a5) * MM_TO_PX;

    // ── Fit the page to the stage ─────────────────────────────────────────────
    // The document is authored in millimetres because it has to print. On screen
    // we scale it down to whatever room the stage has, and mirror the scaled
    // height onto a sizer so the scroll container reserves the right space
    // (transforms do not affect layout). Skipped entirely in compare mode —
    // the diff panel is normal flowed layout, not a fixed-size page.
    useLayoutEffect(() => {
        if (compareMode) return;
        const stage = stageRef.current;
        const node = printRef.current;
        if (!stage || !node) return;

        const measure = () => {
            const available = stage.clientWidth - 48; // stage padding
            setScale(Math.min(1, available / docWidthPx));
            // offsetHeight is layout height, so it ignores the scale transform on
            // the ancestor. Measuring through getBoundingClientRect instead would
            // return the *scaled* height and undersize the sizer, clipping the
            // bottom of the page behind `overflow: hidden`.
            setDocHeight(Math.ceil(node.offsetHeight));
        };

        // Observing the document node too means late layout shifts — the QR image
        // resolving, webfonts settling — re-measure instead of leaving the sizer
        // stuck at its first-paint height.
        const ro = new ResizeObserver(measure);
        ro.observe(stage);
        ro.observe(node);
        measure();
        return () => ro.disconnect();
    }, [docWidthPx, activeId, compareMode]);

    // ── Print (single-visit only; a diff has no print target) ──────────────────
    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: visit
            ? `${patient.name}_${content?.prescriptionRef ?? visit.id.slice(0, 8)}`
            : "prescription",
        pageStyle:
            format === "thermal"
                ? `@page { size: 80mm auto; margin: 0; } body { margin: 0; }`
                : format === "a5"
                    ? `@page { size: A5 portrait; margin: 0; } body { margin: 0; }`
                    : `@page { size: A4 portrait; margin: 0; } body { margin: 0; }`,
    });

    const handlePrintClick = () => {
        if (remembered) handlePrint();
        else setShowFormatPicker(true);
    };

    const handleFormatConfirm = (f: Parameters<typeof choose>[0], remember: boolean) => {
        choose(f, remember);
        setShowFormatPicker(false);
        setTimeout(() => handlePrint(), 100);
    };

    // ── Navigation ────────────────────────────────────────────────────────────
    const step = useCallback((delta: number) => {
        setActiveId((curr) => {
            const i = visits.findIndex((v) => v.id === curr);
            const next = Math.min(visits.length - 1, Math.max(0, (i === -1 ? 0 : i) + delta));
            return visits[next]?.id ?? curr;
        });
    }, [visits]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (showFormatPicker) return;
            if (e.key === "Escape") {
                e.preventDefault(); e.stopPropagation();
                // Escape steps back one level: out of compare mode first, then
                // closes — mirrors how the format picker and this viewer nest.
                if (compareMode) exitCompareMode(); else onClose();
                return;
            }
            if (compareMode) return; // stepping through a single visit doesn't apply here
            if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); step(1); return; }
            if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); step(-1); return; }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [onClose, step, showFormatPicker, compareMode]);

    if (!visit || !content) {
        return (
            <div className="rxv-overlay" onClick={onClose}>
                <div className="rxv-shell" onClick={(e) => e.stopPropagation()}>
                    <p className="rxv-empty">No past visits to show for this patient.</p>
                </div>
            </div>
        );
    }

    const canRepeat = !!onRepeatRx && hasClinicalContent(visit);

    return (
        <>
            {showFormatPicker && (
                <PrintFormatSelector
                    current={format}
                    remembered={remembered}
                    onConfirm={handleFormatConfirm}
                    onClose={() => setShowFormatPicker(false)}
                />
            )}

            <div className="rxv-overlay" onClick={onClose}>
                <div
                    className="rxv-shell"
                    onClick={(e) => e.stopPropagation()}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Prescription history"
                >
                    <div className="rxv-stripe" aria-hidden="true" />

                    {/* ── Header ── */}
                    <header className="rxv-header">
                        <div className="rxv-header-left">
                            <div className="rxv-icon-wrap"><FileText size={15} /></div>
                            <div>
                                <p className="rxv-eyebrow">Prescription history</p>
                                <h2 className="rxv-title">{patient.name}</h2>
                            </div>
                        </div>
                        <div className="rxv-header-actions">
                            {canCompare && (
                                <button
                                    type="button"
                                    className={`rxv-compare-toggle${compareMode ? " is-active" : ""}`}
                                    onClick={() => (compareMode ? exitCompareMode() : enterCompareMode())}
                                    aria-pressed={compareMode}
                                >
                                    <GitCompare size={13} />
                                    {compareMode ? "Comparing" : "Compare"}
                                </button>
                            )}
                            <button type="button" className="rxv-close" onClick={onClose} aria-label="Close">
                                <X size={15} />
                            </button>
                        </div>
                    </header>

                    <div className="rxv-body">
                        {/* ── Visit spine ── */}
                        <nav className="rxv-rail" aria-label="Past visits">
                            <p className="rxv-rail-label">
                                {compareMode
                                    ? `Select 2 to compare (${compareSelection.length}/2)`
                                    : `${visits.length} visit${visits.length === 1 ? "" : "s"}`}
                            </p>
                            <ul className="rxv-rail-list">
                                {visits.map((v, i) => {
                                    const isActive = !compareMode && v.id === visit.id;
                                    const isSelected = compareMode && compareSelection.includes(v.id);
                                    return (
                                        <li key={v.id}>
                                            <button
                                                type="button"
                                                className={`rxv-rail-item${isActive ? " is-active" : ""}${isSelected ? " is-compare-selected" : ""}`}
                                                onClick={() => (compareMode ? toggleCompareSelect(v.id) : setActiveId(v.id))}
                                                aria-current={isActive ? "true" : undefined}
                                                aria-pressed={compareMode ? isSelected : undefined}
                                            >
                                                {compareMode && (
                                                    <span className={`rxv-rail-checkbox${isSelected ? " is-checked" : ""}`} aria-hidden="true">
                                                        {isSelected && <Check size={10} />}
                                                    </span>
                                                )}
                                                <span className="rxv-rail-date">
                                                    <Calendar size={11} />
                                                    {formatVisitDateShort(v.created_at)}
                                                    {i === 0 && <span className="rxv-rail-latest">Latest</span>}
                                                </span>
                                                <span className="rxv-rail-sub">
                                                    {v.medicines.length > 0 ? (
                                                        <><Pill size={10} />{v.medicines.length} med{v.medicines.length === 1 ? "" : "s"}</>
                                                    ) : v.symptoms.length > 0 ? (
                                                        v.symptoms[0]
                                                    ) : (
                                                        "No record"
                                                    )}
                                                </span>
                                                {v.medicines.length > 0 && (
                                                    <span className="rxv-rail-meds">
                                                        {v.medicines.slice(0, 2).map((m) => m.name).join(", ")}
                                                        {v.medicines.length > 2 && ` +${v.medicines.length - 2}`}
                                                    </span>
                                                )}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </nav>

                        {/* ── Main pane: single document, or the compare diff ── */}
                        <div className="rxv-main">
                            {compareMode ? (
                                <>
                                    <div className="rxv-toolbar">
                                        <span className="rxv-doc-date">
                                            {comparePair
                                                ? `${formatVisitDateShort(comparePair.older.created_at)} vs ${formatVisitDateShort(comparePair.newer.created_at)}`
                                                : "Pick 2 visits from the left"}
                                        </span>
                                        {compareSelection.length > 0 && (
                                            <div className="rxv-toolbar-actions">
                                                <button type="button" className="rxv-action" onClick={() => setCompareSelection([])}>
                                                    Clear
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="rxv-stage rxv-stage-compare">
                                        {comparePair ? (
                                            <VisitDiffPanel older={comparePair.older} newer={comparePair.newer} />
                                        ) : (
                                            <p className="rxv-compare-prompt">
                                                <GitCompare size={22} />
                                                Select {2 - compareSelection.length} more visit{2 - compareSelection.length === 1 ? "" : "s"} to compare.
                                            </p>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="rxv-toolbar">
                                        <div className="rxv-stepper">
                                            <button
                                                type="button" className="rxv-step-btn"
                                                onClick={() => step(-1)} disabled={activeIndex === 0}
                                                aria-label="Newer visit"
                                            >
                                                <ChevronLeft size={13} />
                                            </button>
                                            <span className="rxv-step-count">{activeIndex + 1} / {visits.length}</span>
                                            <button
                                                type="button" className="rxv-step-btn"
                                                onClick={() => step(1)} disabled={activeIndex === visits.length - 1}
                                                aria-label="Older visit"
                                            >
                                                <ChevronRight size={13} />
                                            </button>
                                        </div>

                                        <span className="rxv-doc-date">{formatVisitDateLong(visit.created_at)}</span>

                                        <div className="rxv-toolbar-actions">
                                            {canRepeat && (
                                                <button
                                                    type="button"
                                                    className="rxv-action rxv-action-repeat"
                                                    onClick={() => { onRepeatRx!(visit); onClose(); }}
                                                >
                                                    <RefreshCw size={13} /> Repeat Rx
                                                </button>
                                            )}
                                            <button type="button" className="rxv-action" onClick={handlePrintClick}>
                                                <Printer size={13} /> Print
                                            </button>
                                        </div>
                                    </div>

                                    <div className="rxv-stage" ref={stageRef}>
                                        <div
                                            className="rxv-sizer"
                                            style={{
                                                width: docWidthPx * scale,
                                                height: docHeight ? docHeight * scale : undefined,
                                            }}
                                        >
                                            <div
                                                className="rxv-scaled"
                                                style={{
                                                    transform: `scale(${scale})`,
                                                    transformOrigin: "top left",
                                                    width: docWidthPx,
                                                }}
                                            >
                                                {/* printRef sits *below* the transform so the print
                                                    clone is captured at true page size. */}
                                                <div ref={printRef}>
                                                    <PrescriptionDocument
                                                        patient={patient}
                                                        visitId={content.visitId}
                                                        date={content.date}
                                                        prescriptionRef={content.prescriptionRef}
                                                        symptoms={content.symptoms}
                                                        findings={content.findings}
                                                        prescription={content.prescription}
                                                        tests={content.tests}
                                                        followUpDays={content.followUpDays}
                                                        adviceNotes={content.adviceNotes}
                                                        doctor={doctor}
                                                        hospital={hospital}
                                                        vitals={content.vitals}
                                                        format={format}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
