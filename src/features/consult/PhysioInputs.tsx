// ---------------------------------------------------------------------------
// PHYSIOTHERAPY — the input half of the consult screen, for this profile.
//
// Copy of `GeneralOpdInputs.tsx`, per that file's own instruction ("the
// template for a future specialty's own input layout is this file... copy
// it, rename it, change what it renders"). Physiotherapy was checked
// against §14.24's "is the input half genuinely different" test and, on
// 2026-08-16, answered no — this file did not exist yet for that reason.
// It exists now because the STORY is genuinely different: a physiotherapy
// consultation starts by asking how the symptom behaves and what the
// patient wants back, which General OPD's screen has no place for and
// should not grow one for every specialty that might want it.
//
// Doctrine amendment (plan §8, aren-cortex-ui-doctrine.md): the
// no-per-specialty-branch law holds where a specialty needs a different
// INSTRUMENT inside the same shape; it does not hold where the clinical
// reasoning is itself a different shape. This file is that second case,
// stated rather than assumed.
//
// Everything below `StoryCard` / `GoalsCard` is unchanged from
// `GeneralOpdInputs.tsx` — same command bar, same Case Sheet, same
// Measurements/Attachments row. A bug fixed in one profile's shared half
// is fixed in both, because it is the same code, not a fork of it.
// ---------------------------------------------------------------------------

import { useRef } from "react";
import { ClinicalCommandBar, CaseSheet, type CaseSheetEntry } from "./CaseSheet";
import { MeasurementsCard } from "./MeasurementsCard";
import { AttachmentsCard } from "./AttachmentsCard";
import { StoryCard } from "./StoryCard";
import { GoalsCard } from "./GoalsCard";
import { useRovingList } from "../../hooks/useRovingList";
import type { Observable } from "../../lib/db/synapse";
import type { MeasureFieldKey } from "./measures";
import type { TrendVisit } from "./trend";
import type { SelectedSymptom, Vitals } from "../../types";
import type { Story } from "./story";
import type { PatientGoal, GoalStatus } from "../../lib/db/story";

interface Props {
    observables: Observable[];
    onChartSet: Set<string>;
    onObservableToggle: (o: Observable) => void;
    caseSheetEntries: CaseSheetEntry[];
    onCaseSheetRemove: (label: string) => void;
    onRetireCarried?: (label: string, status: "resolved" | "refuted") => void;
    intensities: SelectedSymptom[];
    onIntensityChange: (label: string, intensity: SelectedSymptom["intensity"]) => void;
    relatedFindings: Observable[];
    onBrowseFinding: () => void;
    vitals: Vitals;
    onVitalsChange: (v: Vitals) => void;
    defaultMeasureKeys: MeasureFieldKey[];
    relevantMeasureKeys: Set<MeasureFieldKey>;
    relevantMeasureBecause: Map<MeasureFieldKey, string>;
    pastVisits?: TrendVisit[];
    visitId: string | null;
    disabled?: boolean;
    searchRef?: React.RefObject<HTMLInputElement>;
    measurementsRef?: React.RefObject<HTMLElement | null>;

    // ── The Story half — everything GeneralOpdInputs does not have ────────
    story: Story;
    onStoryChange: (s: Story) => void;
    goals: PatientGoal[];
    lastGoalScores: Map<number, number>;
    todayGoalScores: Map<number, number>;
    onGoalScoreChange: (goalId: number, score: number) => void;
    onAddGoal: (activity: string, baselineScore: number | null) => void;
    onRetireGoal: (goalId: number, status: Exclude<GoalStatus, "active">) => void;
}

export function PhysioInputs({
    observables, onChartSet, onObservableToggle, caseSheetEntries, onCaseSheetRemove,
    intensities, onIntensityChange, relatedFindings, onBrowseFinding, onRetireCarried,
    vitals, onVitalsChange, defaultMeasureKeys, relevantMeasureKeys, relevantMeasureBecause,
    pastVisits,
    visitId, disabled = false, searchRef, measurementsRef,
    story, onStoryChange, goals, lastGoalScores, todayGoalScores,
    onGoalScoreChange, onAddGoal, onRetireGoal,
}: Props) {
    // Identical to GeneralOpdInputs — see that file's own comment for why
    // this lives here rather than inside CaseSheet or ClinicalCommandBar.
    const relatedRef = useRef<HTMLDivElement>(null);
    const relatedRoving = useRovingList({
        containerRef: relatedRef,
        rowSelector: ".cx-related-chip",
        actionSelector: ".cx-related-chip",
    });

    return (
        <>
            {/* Story + Goals, above the command bar — this is the Subjective
                half a physiotherapist reasons through BEFORE the chip-based
                intake, not an add-on beside it. */}
            <StoryCard story={story} onChange={onStoryChange} disabled={disabled} />
            <GoalsCard
                goals={goals}
                lastScores={lastGoalScores}
                todayScores={todayGoalScores}
                onScoreChange={onGoalScoreChange}
                onAdd={onAddGoal}
                onRetire={onRetireGoal}
                disabled={disabled}
            />

            <ClinicalCommandBar
                observables={observables}
                onSheet={onChartSet}
                onToggle={onObservableToggle}
                disabled={disabled}
                searchRef={searchRef}
                onEmptyDown={() => relatedRoving.move(1)}
                onEmptyUp={() => relatedRoving.move(-1)}
                onEmptyEnter={() => relatedRoving.activate()}
            />

            <div className="cs-row cs-row-obj is-locked">
                <CaseSheet
                    entries={caseSheetEntries}
                    onToggle={onObservableToggle}
                    onRemove={onCaseSheetRemove}
                    onRetireCarried={onRetireCarried}
                    intensities={intensities}
                    onIntensityChange={onIntensityChange}
                    related={relatedFindings}
                    onBrowse={onBrowseFinding}
                    disabled={disabled}
                    relatedRef={relatedRef}
                />

                <div className="cs-rowone-right">
                    <MeasurementsCard
                        vitals={vitals}
                        onChange={onVitalsChange}
                        defaultKeys={defaultMeasureKeys}
                        relevantKeys={relevantMeasureKeys}
                        relevantBecause={relevantMeasureBecause}
                        pastVisits={pastVisits}
                        disabled={disabled}
                        maxInline={6}
                        containerRef={measurementsRef}
                    />
                    <AttachmentsCard visitId={visitId} disabled={disabled} maxInline={3} strip />
                </div>
            </div>
        </>
    );
}
