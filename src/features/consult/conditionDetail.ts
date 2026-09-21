// ---------------------------------------------------------------------------
// CARDIAC HISTORY, ENRICHED — not a new history system, a richer chip on the
// one that already exists.
//
// Project Pulse Point, 2026-09-21. Anmol's own correction to the first draft
// of this scoping, which proposed a new table: "I think we are overengineering
// this thing... We already have a history system, like pregnancy, or NSAID
// allergy... The cardiac history just needs to be a little bit more detailed
// or populated... previous MI 2019... this could literally fit into one chip
// ... Don't engineer entirely new thing." This file is the "little bit more"
// — a curated list of which confirmed conditions are worth asking "since
// when", nothing else. Confirming any of them still goes through the exact
// same `condition_observable_map` / `patient_conditions` mechanism every
// other standing fact (Known diabetic, Known hypertensive, ...) already uses.
//
// ── Why a curated list, not every chronic condition
//
// The same argument `duration.ts`'s `ASKS_DURATION` makes for symptoms:
// asking "since when" on every one of ~15 chronic history observables would
// be the form-filling this workspace exists to avoid. A date changes what a
// cardiologist does for exactly the handful below — it does not for
// "Known hypertensive" (hypertension is simply active or it is not; a start
// year rarely changes management the way "MI 2019" changes risk
// stratification and secondary-prevention dosing).
//
// ── Why these five, and not "PCI 2019" and "CABG 2019" different intents
//
// Checked against the live catalogue before writing this (2026-09-21): none
// of Previous MI / PCI / CABG / Pacemaker / ICD existed as a confirmable
// condition at all — not as an observable, not as an intent, not mapped as
// chronic. All five were added as real catalogue rows (`intents`,
// `observables`, `condition_observable_map`, `is_chronic = true`) in the same
// pass that added this file — this is content curation on the existing
// mechanism, not new architecture. Atrial fibrillation already existed
// (`intent_id` 658, mapped to `ecg_afib_rhythm`) and needed nothing added.
//
// ── Second pass (2026-09-21b): broader than the five original examples
//
// Anmol's own correction to a narrow reading of the first pass: "I just
// gave a couple of examples... there is a lot more things, findings and the
// history... verify the actual things from WHO or some other sources, not
// just the example I gave." Checked against a standard cardiovascular
// history/examination reference (cited in the commit) rather than guessed:
// added the exam findings a cardiovascular exam routinely records (S4
// gallop, displaced apex beat, carotid bruit, diminished peripheral pulses,
// peripheral cyanosis, clubbing, pericardial rub — JVP/S3/murmurs/irregular
// pulse/pedal oedema already existed) and the chronic-history facts a cardiac
// history routinely screens for (rheumatic heart disease, congenital heart
// disease, cardiomyopathy, valvular disease, prior stroke/TIA, prior VTE).
//
// Stroke/TIA and VTE join the detail-worthy set below for the same reason MI
// did — recency changes management directly (anticoagulation timing).
// Congenital heart disease, rheumatic heart disease, cardiomyopathy and
// valvular disease stay plain chips, same as hypertension: active-or-not is
// the fact that matters, not a date.
// ---------------------------------------------------------------------------

/**
 * Observable slugs worth an optional "since when" once confirmed — the chip
 * this earns is `CaseSheet.tsx`'s `OnsetPrompt` / `+ since` affordance, and
 * the note lands on `patient_conditions.onset_note`.
 */
export const DETAIL_WORTHY_CONDITIONS: ReadonlySet<string> = new Set([
    "previous_mi",
    "pci_done",
    "cabg_done",
    "pacemaker_in_situ",
    "icd_in_situ",
    "known_stroke_tia",
    "known_vte",
]);

/**
 * Which chart labels currently on the sheet are detail-worthy, by slug
 * lookup — the same "labels are what the UI speaks, slugs are what this
 * curation speaks" split `duration.ts`'s `durationCandidates` uses.
 */
export function detailWorthyLabels(
    observables: readonly { label: string; slug: string }[]
): Set<string> {
    const out = new Set<string>();
    for (const o of observables) {
        if (DETAIL_WORTHY_CONDITIONS.has(o.slug)) out.add(o.label);
    }
    return out;
}
