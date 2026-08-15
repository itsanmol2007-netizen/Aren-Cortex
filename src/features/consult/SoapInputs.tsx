// ---------------------------------------------------------------------------
// SOAP INPUTS — the shared input layout every profile EXCEPT General OPD
// still renders: three pickers (History/Context, Symptoms, Findings), then
// Measurements beside the specialty examination and Attachments.
//
// Extracted 2026-08-15 from App.tsx alongside GeneralOpdInputs.tsx — see that
// file's header for why the split stops here and does not reach into
// Possible Conditions, the plan row or anything below this. This file is
// the FALLBACK every profile without its own input layout gets; it is not
// "physiotherapy's file" or "cardiology's file", it is the shared one, and
// splitting it into seven near-identical copies would be exactly the
// placeholder-building doctrine already warned a past session off of. The
// day a second profile earns its own input layout the way General OPD did,
// it gets its own file copied from GeneralOpdInputs.tsx — this one keeps
// serving everyone who still hasn't.
//
// `measurementsRef` (2026-08-15b) is wired here because `MeasurementsCard` is
// the one part of this file that IS shared, unconditionally, with General
// OPD — see App.tsx and useConsultKeyboard.ts for the Tab stop it feeds.
// `examSuggestionLabels` below is this profile's OWN version of "related
// findings" and does NOT get the same keyboard reach GeneralOpdInputs.tsx's
// Related row got that day — `PickerCard`'s suggestion chips are a different
// component with a different shape, and wiring them was out of scope for a
// pass driven by the General OPD screen specifically. Known gap, not an
// oversight; worth closing the same way if this profile gets its own
// complaint about it.
// ---------------------------------------------------------------------------

import { CircleDot, HeartPulse, UserRound } from "lucide-react";
import { PickerCard } from "./PickerCard";
import { MeasurementsCard } from "./MeasurementsCard";
import { SpecialtyExamCard, type ExamTool } from "./SpecialtyExamCard";
import { AttachmentsCard } from "./AttachmentsCard";
import type { Observable } from "../../lib/db/synapse";
import type { MeasureFieldKey } from "./measures";
import type { SelectedSymptom, Vitals } from "../../types";

interface Props {
    observables: Observable[];
    /** every label currently on the chart, for the ✓ in a search result */
    onChartSet: Set<string>;

    contextChips: string[];
    onContextToggle: (label: string) => void;

    symptomChips: string[];
    onSymptomToggle: (label: string) => void;
    intensities: SelectedSymptom[];
    onIntensityChange: (label: string, intensity: SelectedSymptom["intensity"]) => void;

    selectedFindings: string[];
    onFindingToggle: (label: string) => void;
    /** labels the chart suggests are worth examining for — see examSuggestions.ts */
    examSuggestionLabels: string[];

    onBrowse: (kind: "history" | "symptom" | "finding") => void;

    vitals: Vitals;
    onVitalsChange: (v: Vitals) => void;
    defaultMeasureKeys: MeasureFieldKey[];
    relevantMeasureKeys: Set<MeasureFieldKey>;
    relevantMeasureBecause: Map<MeasureFieldKey, string>;

    /** this facility's specialty tool launchers — empty for most profiles */
    chartTools: ExamTool[];
    onOpenChart: (key: string) => void;
    /** tool key -> one-line extract of what is already charted */
    chartSummaries: Map<string, string>;

    visitId: string | null;
    disabled?: boolean;
    searchRef?: React.RefObject<HTMLInputElement>;
    /** the workspace's Measurements Tab stop — see App.tsx and useConsultKeyboard.ts */
    measurementsRef?: React.RefObject<HTMLElement | null>;
}

export function SoapInputs({
    observables, onChartSet,
    contextChips, onContextToggle,
    symptomChips, onSymptomToggle, intensities, onIntensityChange,
    selectedFindings, onFindingToggle, examSuggestionLabels,
    onBrowse,
    vitals, onVitalsChange, defaultMeasureKeys, relevantMeasureKeys, relevantMeasureBecause,
    chartTools, onOpenChart, chartSummaries,
    visitId, disabled = false, searchRef, measurementsRef,
}: Props) {
    return (
        <>
            {/* Context first, but not at the same visual weight as the three
                cards below it — most consults tick zero or one of these. Same
                PickerCard, same behaviour, just full-width and shorter instead
                of competing for one of the four grid slots. */}
            <div className="cs-phase">Subjective</div>
            <div className="cs-row cs-row-sub">
                <PickerCard
                    kind="history"
                    title="History / Context"
                    glyph={<UserRound size={16} />}
                    glyphTone="blue"
                    placeholder="Search history…"
                    observables={observables}
                    selected={contextChips}
                    onToggle={onContextToggle}
                    onChart={onChartSet}
                    onBrowse={() => onBrowse("history")}
                    emptyHint="Pregnancy, comorbidities, allergies — what frames the whole consultation."
                    disabled={disabled}
                />

                <PickerCard
                    kind="symptom"
                    title="Symptoms"
                    glyph={<HeartPulse size={16} />}
                    glyphTone="rose"
                    placeholder="Search symptoms…"
                    observables={observables}
                    selected={symptomChips}
                    onToggle={onSymptomToggle}
                    onChart={onChartSet}
                    intensities={intensities}
                    onIntensityChange={onIntensityChange}
                    onBrowse={() => onBrowse("symptom")}
                    emptyHint="What the patient came in with. Hindi works too — बुखार, bukhar."
                    disabled={disabled}
                    searchRef={searchRef}
                />
            </div>

            {/* Objective — what you observed and what you measured, on one row.
                Findings take the room because chips wrap; measurements are
                compact structured values and do not need a broad strip of
                their own. */}
            <div className="cs-phase">Objective</div>
            <div className="cs-row cs-row-obj">
                <PickerCard
                    kind="finding"
                    title="Findings"
                    note="On Examination"
                    glyph={<CircleDot size={16} />}
                    glyphTone="teal"
                    placeholder="Search findings…"
                    observables={observables}
                    selected={selectedFindings}
                    onToggle={onFindingToggle}
                    onChart={onChartSet}
                    onBrowse={() => onBrowse("finding")}
                    suggestions={examSuggestionLabels}
                    emptyHint="What you saw on examination — every entry here is an abnormal sign."
                    disabled={disabled}
                />

                <MeasurementsCard
                    vitals={vitals}
                    onChange={onVitalsChange}
                    // Which fields this facility shows without being asked — the
                    // same one-time onboarding config that decides which intent
                    // type gets the Primary Recommendation slot.
                    defaultKeys={defaultMeasureKeys}
                    relevantKeys={relevantMeasureKeys}
                    relevantBecause={relevantMeasureBecause}
                    disabled={disabled}
                    containerRef={measurementsRef}
                />
            </div>

            {/* Objective, second row — the specialty examination and the
                attachments that support it. A facility with no specialty
                module renders no exam card, so Attachments takes the row on
                its own rather than sitting beside an empty placeholder. */}
            <div className={chartTools.length > 0 ? "cs-row cs-row-exam" : "cs-row"}>
                <SpecialtyExamCard
                    tools={chartTools}
                    onOpen={onOpenChart}
                    summaries={chartSummaries}
                    disabled={disabled}
                />
                <AttachmentsCard visitId={visitId} disabled={disabled} />
            </div>
        </>
    );
}
