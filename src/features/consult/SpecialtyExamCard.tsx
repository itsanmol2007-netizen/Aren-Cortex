// ---------------------------------------------------------------------------
// SPECIALTY EXAMINATION — the facility's own examination instrument, as a
// module in the Objective phase.
//
// This is a PLACEHOLDER in the architectural sense: the module is always the
// same shape, and what goes inside it is decided by the facility's specialty
// profile (`SpecialtyProfile.charts`). A dentist gets the odontogram, a
// dermatologist the body map, a paediatrician the growth curve. A general OPD
// gets nothing and the row does not render at all — an empty placeholder is
// worse than no placeholder.
//
// ── Why this is in Objective, and not in Measurements ────────────────────
// It was briefly a launcher among the measurement cells. That was wrong on
// SOAP grounds: charting a carious surface is an EXAMINATION FINDING, not a
// measurement. It belongs beside Findings, in the phase that records what the
// doctor observed.
//
// ── Why a launcher and not the chart itself ──────────────────────────────
// The chart is a large permanent surface for something read at a glance most
// of the time. The launcher keeps it one click away — the full odontogram
// opens in `ChartSurface`, sized for the interaction — without spending the
// consultation screen on it.
//
// ── The extract ──────────────────────────────────────────────────────────
// A launcher that says only "Dental Chart" makes the doctor open it to find
// out whether anything is in it. So each tool carries a one-line CLINICAL
// EXTRACT of what is currently charted — "26 MO caries · 36 missing" — built
// by the same label maps the chart itself renders with (`TOOTH_LABEL`,
// `DENTAL_CONDITION_LABEL`, `surfaceLabel`). No new engine, no new
// derivation: the same conversion logic, read back as a sentence.
// ---------------------------------------------------------------------------

import type { ReactNode } from "react";
import { Stethoscope } from "lucide-react";

export interface ExamTool {
    key: string;
    label: string;
    icon: ReactNode;
}

interface Props {
    tools: ExamTool[];
    onOpen: (key: string) => void;
    /** tool key -> clinical extract of what is charted, "" when nothing is */
    summaries: Map<string, string>;
    disabled?: boolean;
}

export function SpecialtyExamCard({ tools, onOpen, summaries, disabled = false }: Props) {
    if (tools.length === 0) return null;

    return (
        <section className="cs-card cs-exam" aria-label="Specialty examination">
            <div className="cs-card-head">
                <h2 className="cs-card-title">
                    <span className="cs-glyph is-slate"><Stethoscope size={16} /></span>
                    Specialty Examination
                </h2>
            </div>

            <div className="cs-exam-body">
                {tools.map((tool) => {
                    const extract = summaries.get(tool.key) ?? "";
                    const charted = extract.length > 0;
                    return (
                        <button
                            key={tool.key}
                            type="button"
                            className={`cs-exam-tool${charted ? " is-charted" : ""}`}
                            disabled={disabled}
                            onClick={() => onOpen(tool.key)}
                        >
                            <span className="cs-exam-icon">{tool.icon}</span>
                            <span className="cs-exam-text">
                                <span className="cs-exam-label">{tool.label}</span>
                                {/* The extract, or an invitation. Never blank —
                                    a launcher with no state reads as broken. */}
                                <span className="cs-exam-extract">
                                    {charted ? extract : "Nothing charted"}
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
