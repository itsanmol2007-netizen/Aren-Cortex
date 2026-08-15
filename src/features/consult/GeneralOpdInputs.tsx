// ---------------------------------------------------------------------------
// GENERAL OPD — the input half of the consult screen, for this one profile.
//
// Extracted 2026-08-15 from App.tsx, where it lived behind an `isGeneralOpd`
// boolean checked about ten times through one 2,300-line render function —
// the exact "appending onto the same file" problem Anmol flagged. This file
// is the whole of what that boolean's TRUE branch used to render: the
// command bar, the Case Sheet, and Measurements/Attachments locked to one
// height beside it.
//
// What did NOT move here, on purpose: Possible Conditions, the plan row,
// the Consultation Plan rail, StatusBar, every modal/sheet (MedicineAddSheet,
// BrandSheet, ContributionSheet, BrowseSheet, the three specialty chart
// modals). All of that was ALREADY identical for every profile before this
// split — General OPD never touched it — so it stays exactly where it was,
// in App.tsx, shared. Doctrine's own law for this file: "configuration can
// change what goes INSIDE a module, it can never remove a module another
// profile requires" (aren-cortex-ui-doctrine.md §8). Duplicating the shared
// half into this file, or into SoapInputs.tsx beside it, would be the
// opposite of that law — one bug fixed in two places from the day it landed.
//
// The template for a future specialty's OWN input layout is this file, not
// the whole screen: copy it, rename it, change what it renders, add one
// branch to the picker in App.tsx. Nothing else moves.
// ---------------------------------------------------------------------------

import { ClinicalCommandBar, CaseSheet, type CaseSheetEntry } from "./CaseSheet";
import { MeasurementsCard } from "./MeasurementsCard";
import { AttachmentsCard } from "./AttachmentsCard";
import type { Observable } from "../../lib/db/synapse";
import type { MeasureFieldKey } from "./measures";
import type { SelectedSymptom, Vitals } from "../../types";

interface Props {
    observables: Observable[];
    /** every label currently on the chart, for the ✓ in a search result */
    onChartSet: Set<string>;
    onObservableToggle: (o: Observable) => void;
    caseSheetEntries: CaseSheetEntry[];
    onCaseSheetRemove: (label: string) => void;
    intensities: SelectedSymptom[];
    onIntensityChange: (label: string, intensity: SelectedSymptom["intensity"]) => void;
    /** findings that co-occur with what is already charted — see examSuggestions.ts */
    relatedFindings: Observable[];
    onBrowseFinding: () => void;
    vitals: Vitals;
    onVitalsChange: (v: Vitals) => void;
    /** the facility's default measurement set, from the specialty profile */
    defaultMeasureKeys: MeasureFieldKey[];
    relevantMeasureKeys: Set<MeasureFieldKey>;
    relevantMeasureBecause: Map<MeasureFieldKey, string>;
    visitId: string | null;
    disabled?: boolean;
    searchRef?: React.RefObject<HTMLInputElement>;
}

export function GeneralOpdInputs({
    observables, onChartSet, onObservableToggle, caseSheetEntries, onCaseSheetRemove,
    intensities, onIntensityChange, relatedFindings, onBrowseFinding,
    vitals, onVitalsChange, defaultMeasureKeys, relevantMeasureKeys, relevantMeasureBecause,
    visitId, disabled = false, searchRef,
}: Props) {
    return (
        <>
            {/* The page's one input, above every card because it belongs to the
                consultation rather than to any single module. */}
            <ClinicalCommandBar
                observables={observables}
                onSheet={onChartSet}
                onToggle={onObservableToggle}
                disabled={disabled}
                searchRef={searchRef}
            />

            {/* One box in place of three (History, Symptoms, Findings): the Case
                Sheet takes the wrapping room the findings picker needed, and
                Measurements/Attachments stay the compact structured values they
                already were — same row ratio as every other profile's Objective
                row, just one input surface instead of three. */}
            <div className="cs-row cs-row-obj is-locked">
                <CaseSheet
                    entries={caseSheetEntries}
                    onToggle={onObservableToggle}
                    onRemove={onCaseSheetRemove}
                    intensities={intensities}
                    onIntensityChange={onIntensityChange}
                    related={relatedFindings}
                    onBrowse={onBrowseFinding}
                    disabled={disabled}
                />

                {/* Same fixed height as the Case Sheet beside it — see
                    `.cs-rowone-right` and the height-contract note in
                    consult.css: nothing in this row grows. */}
                <div className="cs-rowone-right">
                    <MeasurementsCard
                        vitals={vitals}
                        onChange={onVitalsChange}
                        defaultKeys={defaultMeasureKeys}
                        relevantKeys={relevantMeasureKeys}
                        relevantBecause={relevantMeasureBecause}
                        disabled={disabled}
                        maxInline={6}
                    />
                    <AttachmentsCard visitId={visitId} disabled={disabled} maxInline={3} strip />
                </div>
            </div>
        </>
    );
}
