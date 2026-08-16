// ---------------------------------------------------------------------------
// Synapse's data layer, on AREN's identity.
//
// The engine and everything downstream of it (personalise, brands, companions)
// are pure and know nothing about Supabase. This file is the whole boundary.
//
// The sandbox these modules came from had no auth: it minted a random UUID into
// localStorage and called that "the doctor". Every function here takes the real
// signed-in `doctorId` and `hospitalId` as arguments instead — there is no
// ambient identity anywhere in this file, so a call that forgets to say who it
// is for does not compile.
//
// Scope rule, decided at the product level:
//   * PERSONAL and learned  — preference model, brand habits, frequent list,
//     doctor rule overlay. Keyed by doctor. Never shared, not even inside a
//     clinic: one doctor's habit is not another's evidence.
//   * CLINIC and declared   — the preferred brand for a composition. Keyed by
//     hospital, shared by everyone working there, and it teaches the learning
//     loop nothing.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";
import {
    loadRuleset as loadRulesetFromDb,
    type Ruleset,
    type EngineResult,
    type ScoredIntent,
    type IntentType,
} from "../synapse/engine";
import { contextOf, type PreferenceRow } from "../synapse/personalize";
import {
    resolveBrands,
    groupBrandFamilies,
    type BrandFamily,
    type BrandPreference,
    type BrandPreferenceModel,
    type Medicine,
} from "../synapse/brands";
import type { CompanionEdge } from "../synapse/companions";
import type { MeasurementRow } from "../synapse/consultInput";
import type { FindingSuggestionRule } from "../synapse/examSuggestions";

export const RULESET_VERSION = "mvp-1";

/**
 * Candidates fetched per composition. Not a display limit — `resolveBrands`
 * reorders within this set, so it has to be wide enough for the doctor's own
 * brand to surface and small enough that paracetamol's ~1,800 single-molecule
 * brands never reach the browser.
 *
 * Raised from 12 once brands were grouped into families. Products, not brands,
 * are what this limit counts, and the catalogue's worst brand family is twelve
 * products — so at 12 a single brand could consume the entire window and the
 * doctor would be offered one brand with no alternative. 30 leaves room for a
 * real choice after grouping, and is still one round trip.
 */
export const BRAND_CANDIDATES = 30;

// ============================================================
// THE RULESET
// ============================================================

/**
 * Global medical knowledge plus this doctor's own learned overlay.
 *
 * The sandbox never passed the third argument, so its per-doctor overlay was
 * live code that never ran. It runs here.
 */
export function loadSynapseRuleset(doctorId: string | null): Promise<Ruleset> {
    return loadRulesetFromDb(supabase, RULESET_VERSION, doctorId ?? undefined);
}

/** signalId -> human label, for explaining why something ranked. */
export async function loadSignalLabels(): Promise<Map<string, string>> {
    const { data, error } = await supabase.from("signals").select("id, label");
    if (error) throw new Error(`signals: ${error.message}`);
    const out = new Map<string, string>();
    for (const s of data ?? []) out.set(s.id, s.label ?? s.id);
    return out;
}

// ============================================================
// AREN CATALOGUE -> ENGINE VOCABULARY
// ============================================================

// ============================================================
// THE CATALOGUE — `observables` is it
// ============================================================

/**
 * A pickable input chip. Handoff §16, Translator 4.
 *
 * There is no separate symptoms table in v2: symptoms, examination findings and
 * patient history are ONE catalogue distinguished by `kind`, and that is
 * deliberate — a chip can be reported by the patient or observed on examination
 * without becoming two rows.
 *
 * The legacy `symptoms` / `findings` tables still exist and still carry every
 * patient's history, but they are v1 and Cortex no longer picks from them.
 */
export interface Observable {
    id: number;
    slug: string;
    label: string;
    kind: "symptom" | "finding" | "history";
    /** which specialty views surface this. UI filter only — the engine never reads it. */
    domains: string[];
    /** colloquial terms ("nazla" for blocked nose); must rank before a slug match */
    searchText: string;
    /** body-system grouping for the picker. UI only. */
    system: string;
}

export async function fetchObservables(): Promise<Observable[]> {
    const { data, error } = await supabase
        .from("observables")
        .select("id, slug, label, kind, domains, search_text, system")
        .eq("is_active", true)
        // 373 today and expected to grow; Supabase silently caps an unbounded
        // select at 1000, so the ceiling is stated rather than discovered.
        .limit(2000);
    if (error) throw new Error(`observables: ${error.message}`);
    return (data ?? []).map((o: any) => ({
        id: o.id,
        slug: o.slug,
        label: o.label,
        kind: o.kind,
        domains: (o.domains ?? []) as string[],
        searchText: o.search_text ?? "",
        // a null here must not become an unlabelled group
        system: o.system ?? "general",
    }));
}

// ============================================================
// INTAKE — the same catalogue, in the language it is spoken
// ============================================================

export interface IntakeAlias {
    term: string;
    /** 'hi' Devanagari · 'hinglish' romanised · 'en' English colloquial */
    lang: string;
}

/**
 * A chip as the FRONT DESK needs it.
 *
 * Same 374 observables the doctor works with — a receptionist must be able to
 * enter anything a patient reports, and narrowing their catalogue just moves
 * the transcription problem to someone less equipped to solve it.
 *
 * What changes is only how it is FOUND. `terms` carries every string that
 * should match this chip: the English label, the catalogue's own colloquial
 * search text, and the regional-language aliases. What gets stored is always
 * `observableId` — no alias is ever persisted, so the clinical record stays in
 * one language regardless of what was typed to reach it.
 */
export interface IntakeChip {
    observableId: number;
    label: string;
    kind: "symptom" | "finding" | "history";
    system: string;
    /** everything this chip can be found by, lowercased */
    terms: string[];
    /** the regional terms only, so the UI can show which one matched */
    aliases: IntakeAlias[];
}

export async function fetchIntakeChips(): Promise<IntakeChip[]> {
    const [all, aliasRes] = await Promise.all([
        fetchObservables(),
        supabase.from("observable_alias").select("observable_id, term, lang").limit(5000),
    ]);
    if (aliasRes.error) throw new Error(`observable_alias: ${aliasRes.error.message}`);

    // What a patient REPORTS, plus the history they volunteer. Examination
    // findings are excluded: "crepitations on chest" is not something a patient
    // says at a front desk, and a receptionist recording one would be putting a
    // clinical observation into the chart that nobody examined.
    const obs = all.filter((o) => o.kind === "symptom" || o.kind === "history");

    const byObservable = new Map<number, IntakeAlias[]>();
    for (const a of aliasRes.data ?? []) {
        const id = Number(a.observable_id);
        const list = byObservable.get(id);
        if (list) list.push({ term: a.term, lang: a.lang });
        else byObservable.set(id, [{ term: a.term, lang: a.lang }]);
    }

    return obs.map((o) => {
        const aliases = byObservable.get(o.id) ?? [];
        return {
            observableId: o.id,
            label: o.label,
            kind: o.kind,
            system: o.system,
            aliases,
            terms: [
                o.label.toLowerCase(),
                ...(o.searchText ? o.searchText.toLowerCase().split(/\s+/).filter(Boolean) : []),
                ...aliases.map((a) => a.term.toLowerCase()),
            ],
        };
    });
}

export interface ObservableMaps {
    /** observable id -> legacy symptom id */
    symptomOf: Map<number, number>;
    /** observable id -> legacy finding id */
    findingOf: Map<number, number>;
}

/**
 * The bridge back to the v1 tables.
 *
 * Cortex picks observables, but `visit_symptoms` / `visit_findings` are what
 * Front Desk's visit detail, the past-visit rail and every existing patient
 * record read. So an observable that HAS a legacy row still gets written there,
 * and the clinical record keeps reading the way it always has.
 *
 * An observable with no legacy row is written only to `visit_observations` —
 * which is the permanent, engine-shaped record and the one that survives the v1
 * teardown. This map exists to be deleted along with those tables.
 */
export async function loadObservableMaps(): Promise<ObservableMaps> {
    const [sym, fnd] = await Promise.all([
        supabase.from("symptom_observable_map").select("symptom_id, observable_id"),
        supabase.from("finding_observable_map").select("finding_id, observable_id"),
    ]);
    if (sym.error) throw new Error(`symptom_observable_map: ${sym.error.message}`);
    if (fnd.error) throw new Error(`finding_observable_map: ${fnd.error.message}`);

    const reverse = (rows: any[], key: string) => {
        const m = new Map<number, number>();
        // First mapping wins: a legacy row that fans out to several observables
        // ("numbness or tingling") must still resolve back to one legacy id.
        for (const r of rows) {
            const obsId = Number(r.observable_id);
            if (!m.has(obsId)) m.set(obsId, Number(r[key]));
        }
        return m;
    };

    return {
        symptomOf: reverse(sym.data ?? [], "symptom_id"),
        findingOf: reverse(fnd.data ?? [], "finding_id"),
    };
}

// ============================================================
// THE LONGITUDINAL RECORD
// ============================================================
//
// See docs/confirmed-conditions-investigation.md for the full reasoning. The
// short version: `intents (type='finding')` are OUTPUTS the engine ranks, and
// `observables (kind='history')` are INPUTS the engine reads. They describe the
// same clinical facts and had zero overlap — "Type 2 diabetes mellitus" the
// rankable condition and "Known diabetic" the readable context were two
// unrelated rows. `condition_observable_map` is that join, and it is what turns
// confirming a condition from a display label into an engine input.

export interface ConditionMapEntry {
    observableId: number;
    /**
     * True only when confirming this establishes a STANDING fact about the
     * patient. Most finding intents are episodes — nobody is permanently
     * appendicitic — and only chronic rows are allowed to reach
     * `patient_conditions` and follow the patient to their next visit.
     */
    isChronic: boolean;
}

/** intent id -> the observable that represents the same fact as an INPUT. */
export type ConditionMap = Map<number, ConditionMapEntry>;

export async function loadConditionMap(): Promise<ConditionMap> {
    const { data, error } = await supabase
        .from("condition_observable_map")
        .select("intent_id, observable_id, is_chronic");
    if (error) throw new Error(`condition_observable_map: ${error.message}`);

    const m: ConditionMap = new Map();
    for (const r of data ?? []) {
        m.set(Number(r.intent_id), {
            observableId: Number(r.observable_id),
            isChronic: !!r.is_chronic,
        });
    }
    return m;
}

export interface PatientCondition {
    observableId: number;
    status: "active" | "resolved" | "refuted";
    confirmedAt: string;
    visitId: string | null;
}

/**
 * This patient's standing conditions, for pre-ticking on the next visit.
 *
 * Active only. A resolved or refuted condition is deliberately still a row —
 * "confirmed and later disproved" is a different fact from "never confirmed",
 * and deleting it would lose the difference — but it must not re-enter the
 * engine, so it is filtered here rather than at the call site.
 */
export async function loadPatientConditions(patientId: string): Promise<PatientCondition[]> {
    const { data, error } = await supabase
        .from("patient_conditions")
        .select("observable_id, status, confirmed_at, visit_id")
        .eq("patient_id", patientId)
        .eq("status", "active");
    if (error) throw new Error(`patient_conditions: ${error.message}`);

    return (data ?? []).map((r: any) => ({
        observableId: Number(r.observable_id),
        status: r.status,
        confirmedAt: r.confirmed_at,
        visitId: r.visit_id,
    }));
}

/**
 * Record a confirmed chronic condition as a durable patient fact.
 *
 * Idempotent on `(patient_id, observable_id)`: confirming the same condition at
 * a later visit refreshes provenance rather than creating a second row, and it
 * revives a previously resolved one — a doctor re-confirming something is
 * asserting it is true again.
 *
 * Non-fatal by rule, like the decision log: a consultation must never fail
 * because the longitudinal write did. The caller logs and carries on.
 *
 * Its counterpart is `retirePatientCondition` below, added 2026-08-16.
 */
/**
 * Take a standing fact off a patient — the counterpart to the upsert above,
 * and the close of the gap atlas §14.21 opened on 2026-08-15 and called "the
 * most important" one: until this existed, a condition confirmed in error was
 * permanent from the doctor's point of view. They could un-tick the chip and
 * it came back at the next visit, forever, looking freshly entered.
 *
 * ── Two statuses, because they are two different clinical claims
 *
 *   'resolved' — it WAS true and no longer is. The asthma was outgrown, the
 *                TB was treated. The history is real and worth keeping.
 *   'refuted'  — it was NEVER true. Recorded in error, or on the wrong
 *                patient.
 *
 * Both stop it carrying forward, so a doctor in a hurry gets the same
 * immediate outcome either way and the record still distinguishes them. That
 * distinction is the whole reason this is not a delete: a resolved condition
 * is a fact about the patient's history, and destroying the row would destroy
 * the evidence that anyone ever thought it.
 *
 * ── Why this one is NOT non-fatal
 *
 * `upsertPatientCondition` swallows its errors on the rule that a consultation
 * must never fail because a background write did. This is the opposite case:
 * the doctor has explicitly asked to take something back, and a silent failure
 * would tell them they had while the fact stayed active and returned at the
 * next visit. It throws; the caller surfaces it.
 */
export async function retirePatientCondition(opts: {
    patientId: string;
    observableId: number;
    status: "resolved" | "refuted";
    /** the visit it was retired at, for the audit line in `note` */
    visitId: string | null;
}): Promise<void> {
    const { error } = await supabase
        .from("patient_conditions")
        .update({
            status: opts.status,
            updated_at: new Date().toISOString(),
            // There is no `retired_at` / `retired_by` column and this does not
            // justify adding two. `note` is unused by anything else, so it
            // carries the one line a human would want when asking "why is this
            // not on the chart any more".
            note: `${opts.status} on ${new Date().toISOString().slice(0, 10)}` +
                (opts.visitId ? ` at visit ${opts.visitId}` : ""),
        })
        .eq("patient_id", opts.patientId)
        .eq("observable_id", opts.observableId)
        // Only an ACTIVE row is retired. Without this, re-retiring something
        // already resolved would overwrite the date it was resolved on.
        .eq("status", "active");
    if (error) throw new Error(`patient_conditions retire: ${error.message}`);
}

export async function upsertPatientCondition(opts: {
    patientId: string;
    observableId: number;
    visitId: string | null;
    doctorId: string | null;
}): Promise<void> {
    const { error } = await supabase
        .from("patient_conditions")
        .upsert(
            {
                patient_id: opts.patientId,
                observable_id: opts.observableId,
                status: "active",
                confirmed_at: new Date().toISOString(),
                confirmed_by: opts.doctorId,
                visit_id: opts.visitId,
                source: "confirmed",
                updated_at: new Date().toISOString(),
            },
            { onConflict: "patient_id,observable_id" }
        );
    if (error) throw new Error(`patient_conditions upsert: ${error.message}`);
}

// ============================================================
// PREFERENCE MODELS — all per-doctor
// ============================================================

export async function loadPreferences(doctorId: string): Promise<PreferenceRow[]> {
    const { data, error } = await supabase
        .from("v_doctor_preference")
        .select("intent_id, context_key, preference, consistency, confidence, observations")
        .eq("doctor_id", doctorId);
    if (error) throw new Error(`preferences: ${error.message}`);
    return (data ?? []).map((r: any) => ({
        intentId: r.intent_id,
        contextKey: r.context_key,
        preference: Number(r.preference),
        consistency: Number(r.consistency),
        confidence: Number(r.confidence),
        observations: r.observations,
    }));
}

/**
 * This doctor's brand habits. Same shape as `loadPreferences`, different model:
 * the view behind it uses a confidence constant of 0.5, so it moves on one or
 * two decisions rather than a dozen. Choosing a brand inside an already-chosen
 * molecule is a habit, not a clinical judgement.
 */
export async function loadBrandPreferences(doctorId: string): Promise<BrandPreference[]> {
    const { data, error } = await supabase
        .from("v_doctor_brand_preference")
        .select("composition_id, medicine_id, form, preference")
        .eq("doctor_id", doctorId);
    if (error) throw new Error(`brand preferences: ${error.message}`);
    return (data ?? []).map((r: any) => ({
        compositionId: r.composition_id,
        medicineId: r.medicine_id,
        form: r.form,
        preference: Number(r.preference),
    }));
}

export interface FrequentMedicine {
    intentId: number;
    composition: string;
    compositionId: number | null;
    timesPrescribed: number;
    lastPrescribed: string;
    usualMedicineId: number | null;
    usualBrand: string | null;
}

/**
 * These rows do two jobs, and the larger one sets the limit.
 *
 *  * The idle "Your frequent" shortlist, which shows the head of this list and
 *    slices it to 8 itself — a door with forty options is a wall.
 *  * The tiered habit meter on every ranked medicine card, which needs a row
 *    for any molecule the doctor might be shown. Capped at 8, the meter would
 *    silently vanish from everything outside their ten most-used drugs and
 *    read as "you have never prescribed this", which is a different and false
 *    statement.
 *
 * One extra ordered read of a view already being fetched; no schema change.
 */
export const FREQUENT_LIMIT = 60;
/** Below this it is a coincidence, not a habit, and the list is noise. */
export const FREQUENT_MIN_TIMES = 2;

export async function loadFrequentMedicines(doctorId: string): Promise<FrequentMedicine[]> {
    const { data, error } = await supabase
        .from("v_doctor_frequent_medicine")
        .select("intent_id, composition, composition_id, times_prescribed, last_prescribed, usual_medicine_id, usual_brand")
        .eq("doctor_id", doctorId)
        .gte("times_prescribed", FREQUENT_MIN_TIMES)
        .order("times_prescribed", { ascending: false })
        .order("last_prescribed", { ascending: false })
        .limit(FREQUENT_LIMIT);
    if (error) throw new Error(`frequent medicines: ${error.message}`);
    return (data ?? []).map((r: any) => ({
        intentId: r.intent_id,
        composition: r.composition,
        compositionId: r.composition_id,
        timesPrescribed: r.times_prescribed,
        lastPrescribed: r.last_prescribed,
        usualMedicineId: r.usual_medicine_id,
        usualBrand: r.usual_brand,
    }));
}

// ============================================================
// THE CLINIC TIER
// ============================================================

/** `compositionId|medicineId` -> the form it applies to (null = every form). */
export type ClinicBrandDefaults = Map<string, { form: string | null; note: string | null }>;

export const clinicBrandKey = (compositionId: number, medicineId: number) =>
    `${compositionId}|${medicineId}`;

/**
 * The clinic's declared brand for a composition — "when we prescribe
 * amoxicillin here, we dispense this one". Shared by every doctor in the
 * hospital and DECLARED rather than learned, which is what makes it safe to
 * share: nobody's private prescribing history leaks through it.
 *
 * It sits at tier 2 of `resolveBrands`, so a doctor's own learned preference
 * still wins. The clinic sets the default; the doctor keeps the last word.
 */
export async function loadClinicBrandDefaults(hospitalId: string): Promise<ClinicBrandDefaults> {
    const { data, error } = await supabase
        .from("clinic_brand_preference")
        .select("composition_id, medicine_id, form, note")
        .eq("hospital_id", hospitalId);
    if (error) throw new Error(`clinic brand preference: ${error.message}`);
    const out: ClinicBrandDefaults = new Map();
    for (const r of data ?? []) {
        out.set(clinicBrandKey(Number(r.composition_id), Number(r.medicine_id)), {
            form: r.form ?? null,
            note: r.note ?? null,
        });
    }
    return out;
}

export async function setClinicBrandDefault(opts: {
    hospitalId: string;
    compositionId: number;
    medicineId: number;
    form?: string | null;
    note?: string | null;
    setBy?: string | null;
}): Promise<void> {
    const { error } = await supabase.from("clinic_brand_preference").upsert(
        {
            hospital_id: opts.hospitalId,
            composition_id: opts.compositionId,
            medicine_id: opts.medicineId,
            form: opts.form ?? null,
            note: opts.note ?? null,
            set_by: opts.setBy ?? null,
            updated_at: new Date().toISOString(),
        },
        { onConflict: "hospital_id,composition_id,medicine_id" }
    );
    if (error) throw new Error(`set clinic brand: ${error.message}`);
}

export async function clearClinicBrandDefault(opts: {
    hospitalId: string;
    compositionId: number;
    medicineId: number;
}): Promise<void> {
    const { error } = await supabase
        .from("clinic_brand_preference")
        .delete()
        .eq("hospital_id", opts.hospitalId)
        .eq("composition_id", opts.compositionId)
        .eq("medicine_id", opts.medicineId);
    if (error) throw new Error(`clear clinic brand: ${error.message}`);
}

// ============================================================
// BRAND LOOKUP
// ============================================================

export interface CompositionBrands {
    compositionId: number;
    /**
     * One entry per BRAND, ordered for this doctor, in this clinic — not one
     * per product. The catalogue stores every strength and form as its own row
     * (`Aceto` is six rows under paracetamol), so a flat list repeats the same
     * name until it fills the card. Each of these carries its strengths in
     * `families`; nothing is dropped.
     */
    brands: Medicine[];
    /** the full family behind each entry in `brands`, same order */
    families: BrandFamily[];
    /** every single-molecule brand in the catalogue, not just the ones fetched */
    singleTotal: number;
    /** combination products containing this molecule — counted, never offered */
    combinationTotal: number;
}

export type BrandIndex = Map<number, CompositionBrands>;

interface BrandRow {
    composition_id: number;
    medicine_id: number | null;
    name: string | null;
    manufacturer: string | null;
    strength_mg: number | null;
    route: string | null;
    is_primary: boolean;
    ingredient_count: number;
    single_total: number;
    combination_total: number;
}

/**
 * Fetch and order the brands for every ranked composition, in one round trip.
 *
 * A brand is only offered for a composition when the product contains that
 * molecule ALONE — the engine ranked one molecule, and offering a combination
 * product is a different prescription. The RPC filters on ingredient_count = 1
 * and returns the combination count separately, so the UI can say they exist
 * without offering them.
 */
export async function fetchCompositionBrands(opts: {
    compositionIds: number[];
    prefs: BrandPreferenceModel;
    clinicDefaults: ClinicBrandDefaults;
    isPediatric: boolean;
    /**
     * The calling doctor's hospital. Required to see their own hospital's
     * pending (doctor-added, not-yet-approved) medicines alongside the
     * global catalogue — composition_brands() filters to
     * `hospital_id IS NULL OR hospital_id = p_hospital_id`, so omitting this
     * silently hides nothing global but also silently hides every one of
     * THIS hospital's own pending additions. Optional only because a couple
     * of legacy callers predate hospital scoping existing at all; every new
     * call site should pass it.
     */
    hospitalId?: string;
}): Promise<BrandIndex> {
    const index: BrandIndex = new Map();
    if (opts.compositionIds.length === 0) return index;

    const wanted = new Set(opts.compositionIds);

    // Brands this doctor already has history with must always be in the
    // candidate set. Without this, a preference learned on a brand sitting 900
    // names down the alphabet could never surface and the layer looks broken.
    const keep = [
        ...new Set([
            ...[...opts.prefs.values()]
                .filter((p) => wanted.has(p.compositionId))
                .map((p) => p.medicineId),
            // the clinic's declared brand must always be reachable too
            ...[...opts.clinicDefaults.keys()]
                .map((k) => k.split("|").map(Number))
                .filter(([compId]) => wanted.has(compId))
                .map(([, medId]) => medId),
        ]),
    ];

    const { data, error } = await supabase.rpc("composition_brands", {
        p_composition_ids: opts.compositionIds,
        p_limit: BRAND_CANDIDATES,
        p_hospital_id: opts.hospitalId ?? null,
        p_pediatric: opts.isPediatric,
        p_keep_medicine_ids: keep,
    });
    if (error) throw new Error(`brands: ${error.message}`);

    const rows = (data ?? []) as BrandRow[];
    const candidates = new Map<number, Medicine[]>();
    const totals = new Map<number, { single: number; combination: number }>();

    for (const r of rows) {
        if (!totals.has(r.composition_id)) {
            totals.set(r.composition_id, {
                single: Number(r.single_total),
                combination: Number(r.combination_total),
            });
        }
        // A composition whose only products are combinations returns one row
        // with no medicine on it. The totals are the whole point of that row.
        if (r.medicine_id == null) continue;

        const list = candidates.get(r.composition_id);
        const clinic = opts.clinicDefaults.get(clinicBrandKey(r.composition_id, r.medicine_id));

        const m: Medicine = {
            id: r.medicine_id,
            compositionId: r.composition_id,
            name: r.name ?? `#${r.medicine_id}`,
            // the dosage form is medicine_composition_map.route — `medicines`
            // has no form column, and the paediatric rule keys on this
            form: r.route,
            // display only — null on ~31% of the catalogue, so the variant
            // label prefers the strength written into the product name
            strengthMg: r.strength_mg,
            prescriptionCount: 0,
            // ★ the clinic tier, tier 2 of resolveBrands' fallback chain.
            //   A default declared for a specific form only counts when the
            //   form matches; a default with no form applies to all of them.
            isClinicDefault: !!clinic && (clinic.form == null || clinic.form === r.route),
            // The RPC already ordered these: doctor's own history, then
            // paediatric forms when relevant, then catalogue-seeded, then name.
            catalogueRank: list ? list.length : 0,
        };
        if (list) list.push(m);
        else candidates.set(r.composition_id, [m]);
    }

    for (const compositionId of wanted) {
        const list = candidates.get(compositionId) ?? [];
        const t = totals.get(compositionId);
        // Resolve first, group second. Grouping inherits the resolved order, so
        // the doctor's learned brand still leads its family and the family
        // still leads the list — see groupBrandFamilies.
        const families = groupBrandFamilies(
            resolveBrands(compositionId, opts.prefs, {
                candidates: list,
                isPediatric: opts.isPediatric,
            })
        );
        index.set(compositionId, {
            compositionId,
            brands: families.map((f) => f.lead),
            families,
            singleTotal: t?.single ?? 0,
            combinationTotal: t?.combination ?? 0,
        });
    }

    return index;
}

/** The compositions behind these medicine intents, deduped and stable. */
export function compositionIdsOf(
    intents: Pick<ScoredIntent, "type" | "refTable" | "refId">[]
): number[] {
    const ids = new Set<number>();
    for (const i of intents) {
        if (i.type === "medicine" && i.refTable === "compositions" && i.refId != null) {
            ids.add(i.refId);
        }
    }
    return [...ids].sort((a, b) => a - b);
}

export interface AddMedicineResult {
    compositionId: number;
    medicine: Medicine;
}

/**
 * Doctor-added medicine, linked to one or more EXISTING compositions — never
 * creates a composition. That stays behind compositions → guards → rules
 * (§6.3/6.4 of the atlas), a clinical decision the RPC refuses to make on its
 * own; `add_medicine` raises if any id doesn't already exist.
 *
 * Hospital-scoped on creation, never global. Promotion to the shared
 * catalogue is an admin action (clearing `hospital_id` back to null), not
 * available here — see atlas §14.5 for the full design.
 *
 * Returns one entry per composition linked — a combination product returns
 * more than one — each already shaped as a `Medicine` so the caller can
 * splice it straight into the CURRENT consult's brand list. It does not need
 * to wait on `mv_composition_brand`'s refresh to do that: the refresh is what
 * makes the medicine reachable on the *next* search, by anyone, not what this
 * consult needs right now.
 */
export async function addMedicine(opts: {
    name: string;
    compositionIds: number[];
    route?: string | null;
    strengthMg?: number | null;
    manufacturer?: string | null;
}): Promise<AddMedicineResult[]> {
    const { data, error } = await supabase.rpc("add_medicine", {
        p_name: opts.name,
        p_composition_ids: opts.compositionIds,
        p_route: opts.route ?? null,
        p_strength_mg: opts.strengthMg ?? null,
        p_manufacturer: opts.manufacturer ?? null,
    });
    // The RPC's RAISE EXCEPTION text ("a medicine named … already exists",
    // "unknown composition id(s): …", "no doctor profile linked to this
    // account", …) IS the doctor-facing message. Surfaced as-is, not
    // reworded, so the UI can show it directly rather than a generic failure.
    if (error) throw new Error(error.message);

    return (data ?? []).map((r: any) => ({
        compositionId: Number(r.composition_id),
        medicine: {
            id: Number(r.medicine_id),
            compositionId: Number(r.composition_id),
            name: r.name as string,
            form: r.route as string | null,
            strengthMg: r.strength_mg == null ? null : Number(r.strength_mg),
            prescriptionCount: 0,
            isClinicDefault: false,
            // no catalogueRank — a brand-new product carries no lookup-order
            // opinion yet; resolveBrands falls through to alphabetical for
            // it, which is correct: nothing distinguishes it from any other
            // brand until a doctor actually prescribes it.
        } satisfies Medicine,
    }));
}

// ============================================================
// COMPANIONS
// ============================================================

export async function loadCompanionEdges(): Promise<CompanionEdge[]> {
    const { data, error } = await supabase
        .from("intent_companions")
        .select("intent_id, companion_intent_id, weight, reason, scope, is_active")
        .eq("is_active", true);
    if (error) throw new Error(`intent_companions: ${error.message}`);
    return (data ?? []).map((r: any) => ({
        intentId: Number(r.intent_id),
        companionIntentId: Number(r.companion_intent_id),
        weight: Number(r.weight),
        reason: r.reason,
        scope: r.scope,
    }));
}

/**
 * signal -> examination-finding-to-check rules. Same shape as loading the
 * main ruleset's `signal_intent_rules`, just a different edge type — see
 * lib/synapse/examSuggestions.ts for why this is a separate table rather
 * than more rows in signal_intent_rules.
 */
export async function loadFindingSuggestionRules(): Promise<FindingSuggestionRule[]> {
    const { data, error } = await supabase
        .from("signal_finding_suggestions")
        .select("signal_id, observable_id, weight")
        .eq("is_active", true);
    if (error) throw new Error(`signal_finding_suggestions: ${error.message}`);
    return (data ?? []).map((r: any) => ({
        signalId: r.signal_id,
        observableId: Number(r.observable_id),
        weight: Number(r.weight),
    }));
}

/**
 * Pinned medicines — the doctor's own shortcut, persisted so it follows them
 * between machines. `usePinnedMedicines` is the single read/write point on
 * the React side; these two functions are its only DB access.
 */
export async function loadPinnedIntents(doctorId: string): Promise<Set<number>> {
    const { data, error } = await supabase
        .from("doctor_pinned_intent")
        .select("intent_id")
        .eq("doctor_id", doctorId);
    if (error) throw new Error(`doctor_pinned_intent (load): ${error.message}`);
    return new Set((data ?? []).map((r: any) => Number(r.intent_id)));
}

export async function setPinnedIntent(opts: {
    doctorId: string;
    hospitalId: string;
    intentId: number;
    pinned: boolean;
}): Promise<void> {
    const { doctorId, hospitalId, intentId, pinned } = opts;
    if (pinned) {
        const { error } = await supabase
            .from("doctor_pinned_intent")
            .upsert(
                { doctor_id: doctorId, hospital_id: hospitalId, intent_id: intentId },
                { onConflict: "doctor_id,intent_id" }
            );
        if (error) throw new Error(`doctor_pinned_intent (pin): ${error.message}`);
    } else {
        const { error } = await supabase
            .from("doctor_pinned_intent")
            .delete()
            .eq("doctor_id", doctorId)
            .eq("intent_id", intentId);
        if (error) throw new Error(`doctor_pinned_intent (unpin): ${error.message}`);
    }
}

/**
 * A test panel's member tests, by name — "Fever Workup" resolves to CBC,
 * Widal, Dengue NS1, etc. via `test_panel_map`.
 *
 * Panels are `intents` with `ref_table = 'panels'`, same as a medicine intent
 * points at `compositions`. Accepting one is not "order a test called Fever
 * Workup" — it's "order everything in it" — so the accept path resolves this
 * before touching `selectedTests`, the same way a medicine accept resolves a
 * brand before touching the prescription.
 */
export async function resolvePanelTests(panelId: number): Promise<string[]> {
    const { data, error } = await supabase
        .from("test_panel_map")
        .select("tests(name)")
        .eq("panel_id", panelId);
    if (error) throw new Error(`resolvePanelTests: ${error.message}`);
    return (data ?? [])
        .map((r: any) => r.tests?.name)
        .filter((name: unknown): name is string => typeof name === "string");
}

// ============================================================
// RAW CONSULT INPUT — permanent record
// ============================================================

/**
 * The consult's inputs, written as the engine saw them.
 *
 * `visit_symptoms` / `visit_findings` stay exactly as they were — Front Desk
 * and the prescription document read those, and nothing here disturbs them.
 * These two tables are the parallel, engine-shaped record: what the ranking
 * actually ran on, which is the only thing that makes a past ranking
 * reproducible.
 */
/**
 * The UI's names for provenance, translated to the column's vocabulary.
 *
 * `visit_observations.source` is guarded by a CHECK constraint, so an unknown
 * value does not degrade — it rejects the WHOLE insert, and this write is
 * deliberately fire-and-forget, so the failure is invisible. Every value here
 * must exist in `visit_observations_source_check`. Translating at this single
 * boundary is what stops UI wording drifting into a silent data outage.
 */
const DB_SOURCE: Record<"doctor" | "confirmed" | "carried", string> = {
    doctor: "doctor",
    confirmed: "confirmed_intent",
    carried: "carried_forward",
};

export async function persistVisitInput(opts: {
    visitId: string;
    observableIds: number[];
    measurements: MeasurementRow[];
    /**
     * Observables that did NOT come from the doctor tapping a chip.
     *
     * `visit_observations.source` has always existed and always said 'doctor'.
     * Now that a chip can arrive by confirming a condition, or be carried
     * forward from a previous visit's confirmation, the permanent record should
     * say which — otherwise a ranking re-derived from this table looks like the
     * doctor typed something they never touched.
     */
    sources?: Map<number, "confirmed" | "carried">;
}): Promise<void> {
    await supabase.from("visit_observations").delete().eq("visit_id", opts.visitId);
    if (opts.observableIds.length) {
        const { error } = await supabase.from("visit_observations").insert(
            opts.observableIds.map((observable_id) => ({
                visit_id: opts.visitId,
                observable_id,
                is_negated: false,
                source: DB_SOURCE[opts.sources?.get(observable_id) ?? "doctor"],
            }))
        );
        if (error) throw new Error(`visit_observations: ${error.message}`);
    }

    if (opts.measurements.length) {
        const { error } = await supabase.from("visit_measurements").upsert(
            // A measurement is either a number or a string, never both. Blood
            // group is the only text one today; the column has existed for it
            // since the schema was built, and writing it into `value_num` would
            // fail the numeric cast rather than degrade quietly.
            opts.measurements.map((m) => ({
                visit_id: opts.visitId,
                measure_key: m.measureKey,
                value_num: m.value,
                value_text: m.text ?? null,
                unit: m.unit,
            })),
            { onConflict: "visit_id,measure_key" }
        );
        if (error) throw new Error(`visit_measurements: ${error.message}`);
    }
}

// ============================================================
// THE DECISION LOG — where learning comes from
// ============================================================

/**
 * `searched_accepted` is a stronger signal than a low-ranked accept: the doctor
 * ignored the ranked list entirely and went looking, so the ranking MISSED
 * rather than merely mis-ordered.
 *
 * `override_accepted` is an accept of a hard-warned intent — the doctor read
 * the guard's reason, acknowledged it, and prescribed anyway. It is separate
 * from a plain accept on purpose: the preference model reads accepted/skipped,
 * and an override must not teach the system to promote something a guard is
 * warning about. The prescription still happens; only the learning is withheld.
 */
export type Outcome =
    | "shown"
    | "accepted"
    | "skipped"
    | "searched_accepted"
    | "override_accepted";

export interface SearchedAccept {
    intentId: number;
    chosenMedicineId?: number | null;
}

export interface CommitConsultationArgs {
    visitId: string;
    doctorId: string;
    hospitalId: string;
    result: EngineResult;
    accepted: Set<number>;
    skipped: Set<number>;
    /** intentId -> medicine_id actually prescribed */
    chosenBrands?: Map<number, number>;
    /** intents the doctor found by searching, absent from the ranked list */
    searched?: SearchedAccept[];
}

interface LogRow {
    visit_id: string;
    doctor_id: string;
    hospital_id: string;
    intent_id: number;
    score: number;
    rank: number;
    rank_position: number | null;
    was_shown: boolean;
    chosen_medicine_id: number | null;
    outcome: Outcome;
    signal_context: string[];
    context_key: string | null;
    ruleset_version: string;
}

/**
 * One write, when the consultation is closed.
 *
 * Nothing is logged while the doctor is still working: an abandoned draft is
 * not evidence of anything, and streaming every keystroke would poison the
 * model with intents that existed for half a second.
 *
 * Implicit skips are the important subtlety. Doctors will not click "skip"
 * twenty times, but if they accepted one medicine and left four others on
 * screen, they chose against those four. That inference is drawn ONLY within an
 * intent type where something was actually accepted — ordering no tests at all
 * says nothing about any individual test — and safety-critical intents are
 * never inferred as rejected.
 */
export async function commitConsultation(
    args: CommitConsultationArgs
): Promise<{ rows: number; implicit: number; searched: number; overrides: number }> {
    const { visitId, doctorId, hospitalId, result, accepted, skipped } = args;
    const chosenBrands = args.chosenBrands ?? new Map<number, number>();
    const searched = args.searched ?? [];

    // Per-type rank: result.intents is one list ranked across all types, so the
    // intent's position within its OWN type is counted here. "First medicine
    // offered" and "first test offered" both read as 1.
    const perTypeRank = new Map<number, number>();
    const typeCount = new Map<IntentType, number>();
    for (const i of result.intents) {
        const n = (typeCount.get(i.type) ?? 0) + 1;
        typeCount.set(i.type, n);
        perTypeRank.set(i.intentId, n);
    }

    const ranked = result.intents.map((i, idx) => ({
        i,
        rank: idx + 1,
        pos: perTypeRank.get(i.intentId) ?? null,
    }));

    const row = (
        intent: ScoredIntent,
        rank: number,
        outcome: Outcome,
        extras: { rankPosition: number | null; wasShown: boolean; chosenMedicineId: number | null }
    ): LogRow => ({
        visit_id: visitId,
        doctor_id: doctorId,
        hospital_id: hospitalId,
        intent_id: intent.intentId,
        // the clinical score is logged, never the personalised one — otherwise
        // the model would be learning from its own output
        score: Number(intent.rawScore.toFixed(4)),
        rank,
        rank_position: extras.rankPosition,
        was_shown: extras.wasShown,
        chosen_medicine_id: extras.chosenMedicineId,
        outcome,
        signal_context: result.activeSignals.map((s) => s.signalId),
        context_key: contextOf(intent),
        ruleset_version: result.rulesetVersion,
    });

    const typesWithAcceptance = new Set(
        ranked.filter(({ i }) => accepted.has(i.intentId)).map(({ i }) => i.type)
    );

    const implicit = ranked.filter(
        ({ i }) =>
            typesWithAcceptance.has(i.type) &&
            !accepted.has(i.intentId) &&
            !skipped.has(i.intentId) &&
            !i.isSafetyCritical
    );

    const rows: LogRow[] = [
        ...ranked.map(({ i, rank, pos }) =>
            row(i, rank, "shown", { rankPosition: pos, wasShown: true, chosenMedicineId: null })
        ),
        ...ranked
            .filter(({ i }) => accepted.has(i.intentId))
            .map(({ i, rank, pos }) =>
                row(i, rank, i.status === "warn_hard" ? "override_accepted" : "accepted", {
                    rankPosition: pos,
                    wasShown: true,
                    chosenMedicineId: chosenBrands.get(i.intentId) ?? null,
                })
            ),
        ...ranked
            .filter(({ i }) => skipped.has(i.intentId))
            .map(({ i, rank, pos }) =>
                row(i, rank, "skipped", { rankPosition: pos, wasShown: true, chosenMedicineId: null })
            ),
        ...implicit.map(({ i, rank, pos }) =>
            row(i, rank, "skipped", { rankPosition: pos, wasShown: true, chosenMedicineId: null })
        ),
        // the doctor bypassed the ranked list entirely: never scored here, so
        // score 0, no per-type position, no context, was_shown false
        ...searched.map((s) => ({
            visit_id: visitId,
            doctor_id: doctorId,
            hospital_id: hospitalId,
            intent_id: s.intentId,
            score: 0,
            rank: 0,
            rank_position: null,
            was_shown: false,
            chosen_medicine_id: s.chosenMedicineId ?? null,
            outcome: "searched_accepted" as Outcome,
            signal_context: result.activeSignals.map((sig) => sig.signalId),
            context_key: null,
            ruleset_version: result.rulesetVersion,
        })),
    ];

    const overrides = rows.filter((r) => r.outcome === "override_accepted").length;
    if (rows.length === 0) return { rows: 0, implicit: 0, searched: 0, overrides: 0 };

    const { error } = await supabase.from("decision_log").insert(rows);
    if (error) throw new Error(`decision_log: ${error.message}`);
    return { rows: rows.length, implicit: implicit.length, searched: searched.length, overrides };
}

// ============================================================
// SEARCH — by name, by brand, or by what it is FOR
// ============================================================

export interface IntentSearchHit {
    intentId: number;
    type: IntentType;
    label: string;
    refTable: string | null;
    refId: number | null;
    /** how this was reached — drives the provenance line in the UI */
    matchKind: "label" | "brand" | "symptom";
    /** the brand or the reason that reached it */
    viaLabel: string | null;
    score: number;
}

/**
 * A doctor typing "fever" is naming a reason, not a product. The rule base
 * already knows which molecules answer that reason, so search reads the same
 * rules the ranking does and nothing new is asserted.
 */
export async function searchIntents(opts: {
    query: string;
    types?: IntentType[];
    limit?: number;
}): Promise<IntentSearchHit[]> {
    const q = opts.query.trim();
    if (q.length < 2) return [];

    const { data, error } = await supabase.rpc("search_intents", {
        p_query: q,
        p_limit: opts.limit ?? 24,
        p_types: opts.types ?? null,
    });
    if (error) throw new Error(`search: ${error.message}`);

    return (data ?? []).map((r: any) => ({
        intentId: Number(r.intent_id),
        type: r.intent_type as IntentType,
        label: r.label,
        refTable: r.ref_table,
        refId: r.ref_id == null ? null : Number(r.ref_id),
        matchKind: r.match_kind,
        viaLabel: r.via_label,
        score: Number(r.score),
    }));
}
