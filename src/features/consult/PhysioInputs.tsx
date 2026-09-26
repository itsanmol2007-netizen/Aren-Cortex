// ---------------------------------------------------------------------------
// PHYSIOTHERAPY — the input half of the consult screen, for this profile.
//
// ── What this file is now (2026-08-20 rebuild)
//
// It was a copy of `GeneralOpdInputs.tsx` with two extra cards bolted above
// the command bar — a Story form and a Goals form — and an Examination card
// bolted below it. Anmol tested that and the verdict was that it read as
// General OPD with physiotherapy fields added, which is exactly what it was.
//
// The rebuild is not more cards. It is FEWER surfaces, each of which knows
// more:
//
//   ONE input          `ClinicalCommandBar` searches the observable catalogue
//                      AND the story vocabulary together and routes the answer
//                      itself. There is no longer a question the clinician has
//                      to answer before they can type ("is this Story or Case
//                      Sheet?"), because there is no longer a second box to
//                      answer it into. Story became a behaviour of the one
//                      input rather than a form beside it.
//
//   ONE record         `CaseSheet` shows the story chips and the observation
//                      chips in one table. They are stored apart —
//                      `visit_story` has columns, observations are a set — and
//                      that split is deliberately invisible here, because it
//                      is the software's business and not the clinician's.
//
//   ONE site context   `ExamSummaryStrip` is a single line. The figure, the
//                      range grid, the strength grades and the special tests
//                      all live inside the body map it opens, scoped to the
//                      joint and side that were clicked. Nothing anatomical
//                      can be recorded without a site any more, which is what
//                      makes a right knee and a left shoulder two examinations
//                      instead of one ambiguous set of numbers.
//
// General Measurements keeps only genuinely general measurements — BP, pulse,
// SpO2, temperature, weight. Pain and ROM moved into the examination above,
// where they carry a site and a side. See `specialtyProfile.ts`.
//
// Everything below the Case Sheet row is unchanged from `GeneralOpdInputs`: a
// bug fixed in one profile's shared half is fixed in both, because it is the
// same code and not a fork of it.
// ---------------------------------------------------------------------------

import { useMemo, useRef } from "react";
import { ClinicalCommandBar, CaseSheet, type CaseSheetEntry } from "./CaseSheet";
import { MeasurementsCard } from "./MeasurementsCard";
import { AttachmentsCard } from "./AttachmentsCard";
import { GoalsCard } from "./GoalsCard";
import { ExamSummaryStrip } from "./ExamSummaryStrip";
import { useRovingList } from "../../hooks/useRovingList";
import { addStoryNote, addToStory, removeFromStory, removeStoryNote, selectedStoryItems, storyNotes } from "./story";
import type { SiteRef } from "../../lib/body/clinicalSite";
import type { Observable } from "../../lib/db/synapse";
import type { MeasureFieldKey } from "./measures";
import type { TrendVisit } from "./trend";
import type { SelectedSymptom, Vitals } from "../../types";
import type { Story } from "./story";
import type { PatientGoal, GoalStatus } from "../../lib/db/story";
import type { ExaminationHook } from "../../hooks/useExamination";
import type { MeasureSide } from "../../lib/db/examination";

interface Props {
    observables: Observable[];
    /** see SpecialtyProfile.preferSystems */
    preferSystems?: string[];
    preferDomain?: string;
    onChartSet: Set<string>;
    onObservableToggle: (o: Observable, opts?: { deferSite?: boolean }) => void;
    caseSheetEntries: CaseSheetEntry[];
    onCaseSheetRemove: (label: string) => void;
    onRetireCarried?: (label: string, status: "resolved" | "refuted") => void;
    /** sited findings — see CaseSheet's FindingSitePrompt */
    knownSites?: SiteRef[];
    onSetFindingSites?: (label: string, sites: SiteRef[]) => void;
    askSiteLabel?: string | null;
    onAskSiteHandled?: () => void;
    /** the command bar's where-slot — see ClinicalCommandBar */
    onSiteChange?: (finding: string, site: SiteRef, on: boolean) => void;
    intensities: SelectedSymptom[];
    onIntensityChange: (label: string, intensity: SelectedSymptom["intensity"]) => void;
    relatedFindings: Observable[];
    onBrowseFinding: () => void;
    vitals: Vitals;
    onVitalsChange: (v: Vitals) => void;
    defaultMeasureKeys: MeasureFieldKey[];
    relevantMeasureKeys: Set<MeasureFieldKey>;
    relevantMeasureBecause: Map<MeasureFieldKey, string>;
    /** pain / ROM — recorded against a site, never in this card. See the profile. */
    anatomicalMeasureKeys: Set<MeasureFieldKey>;
    pastVisits?: TrendVisit[];
    visitId: string | null;
    /** threaded down to AttachmentsCard's "Upload from phone" — see its own Props doc. */
    hospitalId?: string | null;
    patientId?: string | null;
    disabled?: boolean;
    searchRef?: React.RefObject<HTMLInputElement>;
    measurementsRef?: React.RefObject<HTMLElement | null>;

    // ── The Story half — no longer a card, now a behaviour of the one input ──
    story: Story;
    onStoryChange: (s: Story) => void;
    goals: PatientGoal[];
    lastGoalScores: Map<number, number>;
    todayGoalScores: Map<number, number>;
    onGoalScoreChange: (goalId: number, score: number) => void;
    onAddGoal: (activity: string, baselineScore: number | null) => void;
    onRetireGoal: (goalId: number, status: Exclude<GoalStatus, "active">) => void;

    /** What was examined, and where. Opened from the summary strip. */
    examination: ExaminationHook;
    /** every marked body-map site, each side its own */
    markedSites: { region: string; side: MeasureSide | null }[];
    /** assessments made at a site, for the body map summary */
    siteAssessments?: { label: string; site: SiteRef | null }[];
    onOpenBodyMap: () => void;
}

export function PhysioInputs({
    observables, preferSystems, preferDomain, onChartSet, onObservableToggle, caseSheetEntries, onCaseSheetRemove,
    intensities, onIntensityChange, relatedFindings, onBrowseFinding, onRetireCarried,
    knownSites, onSetFindingSites, askSiteLabel, onAskSiteHandled, onSiteChange,
    vitals, onVitalsChange, defaultMeasureKeys, relevantMeasureKeys, relevantMeasureBecause,
    anatomicalMeasureKeys, pastVisits,
    visitId, hospitalId, patientId, disabled = false, searchRef, measurementsRef,
    story, onStoryChange, goals, lastGoalScores, todayGoalScores,
    onGoalScoreChange, onAddGoal, onRetireGoal,
    examination, markedSites, siteAssessments, onOpenBodyMap,
}: Props) {
    // Identical to GeneralOpdInputs — see that file's own comment for why
    // this lives here rather than inside CaseSheet or ClinicalCommandBar.
    const relatedRef = useRef<HTMLDivElement>(null);
    const relatedRoving = useRovingList({
        containerRef: relatedRef,
        rowSelector: ".cx-related-chip",
        actionSelector: ".cx-related-chip",
    });

    const storyChips = useMemo(() => selectedStoryItems(story), [story]);

    /**
     * The complaint — the first thing REPORTED. It is the subject the story
     * qualifies, so the composer withholds every story question until it
     * exists (see `ClinicalCommandBar`'s `slot`).
     */
    const leadComplaint = useMemo(
        () => caseSheetEntries.find((e) => e.kind === "symptom")?.label,
        [caseSheetEntries]
    );

    return (
        <>
            {/* THE input. One box, both vocabularies, no decision to make
                before typing — see the file header. */}
            <ClinicalCommandBar
                observables={observables}
                preferSystems={preferSystems}
                preferDomain={preferDomain}
                onSheet={onChartSet}
                onToggle={onObservableToggle}
                story={story}
                onStoryAdd={(it) => onStoryChange(addToStory(story, it))}
                onStoryRemove={(it) => onStoryChange(removeFromStory(story, it))}
                onStoryNote={(text) => onStoryChange(addStoryNote(story, text))}
                leadComplaint={leadComplaint}
                siteKnown={knownSites}
                onSiteChange={onSiteChange}
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
                    knownSites={knownSites}
                    onSetFindingSites={onSetFindingSites}
                    autoOpenSiteLabel={askSiteLabel}
                    onAutoOpenSiteHandled={onAskSiteHandled}
                    intensities={intensities}
                    onIntensityChange={onIntensityChange}
                    related={relatedFindings}
                    onBrowse={onBrowseFinding}
                    disabled={disabled}
                    relatedRef={relatedRef}
                    storyChips={storyChips}
                    story={story}
                    onStoryRemove={(it) => onStoryChange(removeFromStory(story, it))}
                    storyNotes={storyNotes(story)}
                    onStoryNoteRemove={(i) => onStoryChange(removeStoryNote(story, i))}
                    onFocusSearch={() => searchRef?.current?.focus()}
                />

                <div className="cs-rowone-right">
                    <MeasurementsCard
                        vitals={vitals}
                        onChange={onVitalsChange}
                        defaultKeys={defaultMeasureKeys}
                        relevantKeys={relevantMeasureKeys}
                        relevantBecause={relevantMeasureBecause}
                        anatomicalKeys={anatomicalMeasureKeys}
                        pastVisits={pastVisits}
                        disabled={disabled}
                        maxInline={5}
                        containerRef={measurementsRef}
                    />
                    <AttachmentsCard visitId={visitId} hospitalId={hospitalId} patientId={patientId} disabled={disabled} maxInline={3} strip />
                </div>
            </div>

            {/* Body map launcher beside Goals, same 60/40 ratio as Case Sheet
                beside Measurements above (`.cs-row-obj`) — Anmol, 2026-09-23:
                Goals on its own full-width row was mostly empty vertical
                space under a short search box; pairing it here uses that
                space the same way the row above already does, rather than
                inventing a second layout rule for one card. */}
            <div className="cs-row cs-row-bodygoal">
                {/* One line for the whole anatomical examination. Opens the
                    body map; everything measurable lives in there, next to
                    the joint it was measured on. */}
                <ExamSummaryStrip
                    exam={examination}
                    markedSites={markedSites}
                    entries={caseSheetEntries}
                    assessments={siteAssessments}
                    onOpen={onOpenBodyMap}
                    disabled={disabled}
                />

                {/* Goals sit after the record rather than before it. They are
                    context for the PLAN — what this person wants back — and a
                    physiotherapist writes them once the complaint is on the
                    page, not before the patient has said what is wrong. */}
                <GoalsCard
                    goals={goals}
                    lastScores={lastGoalScores}
                    todayScores={todayGoalScores}
                    onScoreChange={onGoalScoreChange}
                    onAdd={onAddGoal}
                    onRetire={onRetireGoal}
                    disabled={disabled}
                />
            </div>
        </>
    );
}
