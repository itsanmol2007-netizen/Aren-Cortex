// ---------------------------------------------------------------------------
// THE PLAN — everything the doctor has TAKEN, and the pipeline that gets it
// there.
//
// Extracted 2026-08-15 from App.tsx as Stage 2, step 2 (atlas §14.19), after
// useConsultChart.ts. Where that hook owns what was RECORDED, this one owns
// what was DECIDED: the prescription, the tests, the working diagnosis, the
// advice, and the six maps that remember which engine intent each of those
// came from.
//
// ── Why the six intent maps live next door, in useAcceptLedger.ts
//
// They are read by `useConsultIntelligence` (accepted ids drive companions) at
// the same render this hook reads the intelligence back (brand index, active
// signals, hard warnings). Both cannot be second, so the ledger is declared
// first and passed to both. See that file's header — the split is a real seam,
// not a wiring trick.
//
// ── The boundary
//
//   IN  — the plan's state, the accept-to-plan pipeline (one entry point for
//         every intent type), and every edit a plan line can receive.
//   OUT — the chart (useConsultChart), the patient/visit this plan belongs to
//         and the save itself (useConsultSession). This hook never writes to
//         the database; `handlePinClinicBrand` is the one exception and it
//         writes a CLINIC preference, not a consultation.
//
// The one entry point rule is load-bearing: `handleAcceptIntent` is how a
// medicine, a test, a referral, advice and a confirmed condition all arrive,
// because the decision log must not be able to tell apart the route a doctor
// reached something by. Anything that bypasses it is invisible to the
// learning loop.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PrescriptionMedicine } from "../types";
import type { AcceptPayload } from "../features/consult/types";
import type { MedicineDraft, MedicineBillingContext } from "../features/consult/MedicineAddSheet";
import { useJustAdded } from "../features/consult/useJustAdded";
import type { Medicine as SynapseBrand } from "../lib/synapse/brands";
import type { CompanionSuggestion } from "../lib/synapse/companions";
import { doseFor, type ExerciseLine, type ExerciseSide } from "../features/consult/exercisePlan";
import { formatLine as formatIntervention, type InterventionLine, type InterventionSide } from "../features/consult/interventionPlan";
import type { AssessmentLine } from "../features/consult/assessmentPlan";
import {
  composeAssessmentText, familyFor, pruneDetails, type AssessmentDetails,
} from "../features/consult/assessmentFamilies";
import type { SiteRef } from "../lib/body/clinicalSite";
import type { PersonalizedIntent } from "../lib/synapse/personalize";
import { guardIntent } from "../lib/synapse/engine";
import { resolveProductByName } from "../lib/db/medicines";
import {
  setClinicBrandDefault, clearClinicBrandDefault,
  fetchCompositionBrands, resolvePanelTests,
  type SearchedAccept,
} from "../lib/db/synapse";
import {
  fetchMedicineBillingPolicy, fetchClinicMedicinePrices, setClinicMedicinePrice,
  type MedicineBillingPolicy, type ClinicMedicinePrice,
} from "../lib/db/medicinePricing";
import type { SynapseData } from "./useSynapse";
import type { ConsultIntelligence } from "./useConsultIntelligence";
import type { AcceptLedger } from "./useAcceptLedger";
import type { PlanDraft } from "../lib/consultDraft";

/**
 * A ranked molecule plus the brand chosen for it, as a prescription line.
 *
 * The engine ranks compositions; `brand` is the product actually dispensed.
 * A composition with no single-molecule product behind it is rankable but not
 * prescribable, and the caller must handle that rather than silently adding a
 * medicine with no id.
 */
function toPrescriptionLine(
  payload: AcceptPayload,
  brand: SynapseBrand,
  sortOrder: number
): PrescriptionMedicine {
  return {
    id: String(brand.id),
    medicine_id: brand.id,
    // EVERY molecule in the product, not just the one it was ranked through.
    // This read `[brand.compositionId]` unconditionally, so a combination was
    // written into the clinical record as a single molecule and its second
    // drug was invisible to duplicate and interaction checking. Absent means
    // single-molecule, where the fallback is exactly correct — EXCEPT when
    // `compositionId` is itself null (a composition-less add, 2026-09-19),
    // where there is no molecule to fall back to at all and this must stay
    // `[]`, never `[null]` polluting the array every duplicate/interaction
    // check and DB write downstream reads.
    composition_ids: brand.compositionIds ?? (brand.compositionId != null ? [brand.compositionId] : []),
    primary_composition_id: brand.compositionId,
    name: brand.name,
    category: payload.label,
    use: "",
    match: 0,
    // The molecules, joined. `payload.label` is the INTENT's label, which is
    // the single composition this product was ranked or searched through, so
    // the summary rail and the prescription preview were both printing one
    // molecule of a combination. They read this one field, so they are both
    // fixed here. `composition_ids` above is the machine-readable half; this
    // is what the doctor and the patient actually see on the page. A
    // composition-less medicine shows its own free-text note instead, or
    // falls back to empty rather than the misleading intent label (there is
    // no real composition behind `payload.label` in that case).
    composition: brand.compositionLabels?.length
      ? brand.compositionLabels.join(" + ")
      : brand.compositionId != null
        ? payload.label
        : brand.compositionNote ?? "",
    compositionNote: brand.compositionNote ?? null,
    dosage: "1 tab",
    frequency: "Morning and Night",
    duration: "5 days",
    notes: "After food",
    dosage_mg: null,
    duration_days: null,
    route: brand.form ?? "oral",
    instructions: "",
    is_sos: false,
    sort_order: sortOrder,
    intent_id: payload.intentId,
    via_search: payload.viaSearch,
    overridden: payload.overridden,
  };
}

export interface ConsultPlanArgs {
  data: SynapseData | null;
  /** re-read the catalogue after a clinic-level brand default changes */
  reloadSynapse: () => void;
  intelligence: ConsultIntelligence;
  /** the six intent maps, declared before the engine — see the header */
  ledger: AcceptLedger;
  hospitalId: string;
  /** `users.id` of the signed-in doctor — attributes a clinic medicine price
   *  to whoever set it (`clinic_medicine_prices.set_by`). Null while
   *  unauthenticated, same as `ClinicalIdentity.userId`. */
  actorUserId: string | null;
  showToast: (msg: string) => void;
  /**
   * Turn a confirmed condition into an engine input and, when it is chronic, a
   * durable patient fact. Returns the standing fact's label, or null when this
   * condition is not mapped.
   *
   * A callback rather than the hook itself, because the chart and the patient
   * are both explicitly OUT of this hook's scope (see the header) and should
   * stay that way — the plan records what was DECIDED, and a standing fact
   * about a patient is not a line on a prescription. See useLongitudinalRecord.
   */
  confirmCondition: (intentId: number) => string | null;
  /**
   * The body map's most recently marked site, formatted ("Right knee"), or
   * null when nothing has been marked this visit. A ref, not a value — read
   * only at the moment of an intervention accept, so it never has to be a
   * dependency the way a plain prop would. Anmol: "we should pre-fill the
   * things there with the help of synapse... site and then type of that
   * thing." This is the site half of that; the type/site is already implied
   * by which ranked row the doctor clicked.
   */
  lastMarkedSiteRef: React.RefObject<string | null>;
  /** The inverse — see useLongitudinalRecord.ts's doc comment. */
  unconfirmCondition: (intentId: number, stillConfirmedIntentIds: Iterable<number>) => void;
}

export interface ConsultPlan {
  // ── What has been taken ───────────────────────────────────────────────
  prescription: PrescriptionMedicine[];
  selectedTests: string[];
  selectedLabName: string | null;
  setSelectedLabName: React.Dispatch<React.SetStateAction<string | null>>;
  /** Impressions the doctor agreed with — the working diagnosis. */
  diagnoses: string[];
  adviceNotes: string;
  /** Free text for this visit, separate from the advice the doctor accepted. */
  visitNotes: string;
  setVisitNotes: React.Dispatch<React.SetStateAction<string>>;
  followUpDays: number | null;
  setFollowUpDays: React.Dispatch<React.SetStateAction<number | null>>;

  // ── What it was taken FROM ────────────────────────────────────────────
  acceptedIntents: Map<number, AcceptPayload>;
  acceptedIntentIdSet: Set<number>;
  chosenBrands: Map<number, number>;
  /** Only these are fed to the learning write — see the header. */
  deliberateBrands: Map<number, number>;
  searchedAccepts: SearchedAccept[];
  acknowledgedIntents: Set<number>;

  // ── Derived, for the surfaces that read it ────────────────────────────
  /** Advice notes are one string; the Plan column edits them as lines. */
  adviceLines: string[];
  /** what was delivered in the clinic today, structured — see `interventionPlan` in the body */
  interventionPlan: InterventionLine[];
  /** `interventionPlan`, formatted and newline-joined — the one thing the
   *  prescription's `therapy_notes` column and the print/review surfaces
   *  still read; see the header on `interventionPlan` for why. */
  therapyNotes: string;
  /** the home programme, with its dose in fields rather than in prose */
  exercisePlan: ExerciseLine[];
  /** What actually prints as Advice: accepted lines, then freehand. */
  reviewAdvice: string;
  /** Which plan lines just arrived, so the rail is not a box that silently grows. */
  justAdded: Set<string>;
  /** Hard warnings on something being prescribed that the doctor has not read. */
  unreadPrescribedWarnings: PersonalizedIntent[];

  // ── The medicine inspector / add sheet ────────────────────────────────
  selectedMedicineId: string | null;
  setSelectedMedicineId: React.Dispatch<React.SetStateAction<string | null>>;
  stagedMedicine: PrescriptionMedicine | null;
  setStagedMedicine: React.Dispatch<React.SetStateAction<PrescriptionMedicine | null>>;
  /** the medicine waiting on brand + dose confirmation — see MedicineAddSheet */
  pendingMedicine: PendingMedicine | null;
  setPendingMedicine: React.Dispatch<React.SetStateAction<PendingMedicine | null>>;
  inspectorMedicine: PrescriptionMedicine | null;
  confirmPendingMedicine: (draft: MedicineDraft) => void;
  confirmStagedMedicine: () => void;
  /** The medicine-billing half of the dose sheet — `enabled: false` for the
   *  vast majority of clinics that never turn this on. See
   *  lib/db/medicinePricing.ts and MedicineAddSheet's own doc comment. */
  medicineBilling: MedicineBillingContext;
  /** The same policy, in the shape `saveConsult` needs (its GST rate, not
   *  just the sheet's prices) — see useConsultLifecycle's save path. */
  medicineBillingPolicy: MedicineBillingPolicy;

  // ── The intervention inspector ─────────────────────────────────────────
  /** the intervention waiting on site/side/notes confirmation — see
   *  InterventionInspector.tsx */
  pendingIntervention: PendingIntervention | null;
  confirmPendingIntervention: (draft: { site: string; side: InterventionSide | null; notes: string }) => void;
  cancelPendingIntervention: () => void;

  // ── Assessments at a site ────────────────────────────────────────────
  /** the structure behind every anatomical entry in `diagnoses` — see
   *  features/consult/assessmentPlan.ts */
  assessmentLines: AssessmentLine[];
  /** an anatomical assessment waiting on its site — see AssessmentSiteModal */
  pendingAssessment: PendingAssessment | null;
  confirmPendingAssessment: (draft: { site: SiteRef | null; details: AssessmentDetails }) => void;
  cancelPendingAssessment: () => void;
  /** reopen a line's modal to change its site or details */
  editAssessmentLine: (id: string) => void;
  /** the same assessment at another site — a second fracture */
  addAnotherAssessmentSite: (intentId: number | null, label: string) => void;

  // ── Taking things, and taking them back ───────────────────────────────
  handleAcceptIntent: (payload: AcceptPayload) => void;
  handleAcknowledge: (intentId: number, ack: boolean) => void;
  handleChangeBrand: (intentId: number, brand: SynapseBrand) => void;
  handlePinClinicBrand: (brand: SynapseBrand, pinned: boolean) => Promise<void>;
  updateMedicine: (updated: PrescriptionMedicine) => void;
  removeMedicine: (id: string) => void;
  removeTest: (label: string) => void;
  removeDiagnosis: (label: string) => void;
  /** The chart-local half of the free-text fallback — see the doc comment. */
  addFreeDiagnosis: (label: string) => void;
  addFreeTest: (label: string) => void;
  addFreeReferral: (label: string) => void;
  addFreeAdvice: (label: string) => void;
  removeAdviceLine: (line: string) => void;
  removeIntervention: (id: string) => void;
  /** The same intervention, at another site — see the doc comment on
   *  `duplicateExerciseForSide`, the pattern this borrows. Opens the
   *  inspector again rather than cloning silently, because a second site
   *  is as much a clinical decision as the first. */
  addAnotherInterventionSite: (id: string) => void;
  /** Undo any accept, from the row it was accepted on — see the doc comment. */
  removeAcceptedIntent: (intentId: number, type: AcceptPayload["type"], label: string) => void;
  updateExercise: (id: string, patch: Partial<ExerciseLine>) => void;
  removeExercise: (id: string) => void;
  duplicateExerciseForSide: (id: string, side: ExerciseSide) => void;

  // ── Companions ────────────────────────────────────────────────────────
  companionsFor: (intentId: number) => CompanionSuggestion[];
  handleAddCompanion: (c: CompanionSuggestion) => void;
  dismissCompanion: (companionIntentId: number) => void;

  // ── Lifecycle ─────────────────────────────────────────────────────────
  /** Back to an empty plan. */
  reset: () => void;
  /** Reload/crash recovery (lib/consultDraft.ts) — restores everything
   *  `reset()` above clears, from a snapshot instead of to empty. Leaves the
   *  ledger and the transient pick/staging state untouched — see
   *  `PlanDraft`'s own doc comment for why those aren't part of the draft. */
  restorePlan: (draft: PlanDraft) => void;
  /** Replace the prescription wholesale, for Repeat Rx. */
  loadRepeatRx: (medicines: PrescriptionMedicine[], tests?: string[], diagnoses?: string[]) => void;
}

export interface PendingMedicine {
  payload: AcceptPayload;
  compositionId: number;
  brands: SynapseBrand[];
  initialBrand: SynapseBrand | null;
}

export interface PendingIntervention {
  payload: AcceptPayload;
  /** pre-filled when opened from "add another site" on an existing line;
   *  empty for a fresh accept from the ranked list. */
  initialSite: string;
}

export interface PendingAssessment {
  payload: AcceptPayload;
  /** the line being edited; null for a new one */
  editId: string | null;
  initialSite: SiteRef | null;
  initialDetails: AssessmentDetails;
}

export function useConsultPlan({
  data,
  reloadSynapse,
  intelligence,
  ledger,
  hospitalId,
  actorUserId,
  showToast,
  confirmCondition,
  unconfirmCondition,
  lastMarkedSiteRef,
}: ConsultPlanArgs): ConsultPlan {
  const {
    acceptedIntents, setAcceptedIntents,
    chosenBrands, setChosenBrands,
    deliberateBrands, setDeliberateBrands,
    searchedAccepts, setSearchedAccepts,
    acknowledgedIntents, setAcknowledgedIntents,
    dismissedCompanions, setDismissedCompanions,
    acceptedIntentIdSet,
    releaseIntent,
    reset: resetLedger,
  } = ledger;

  // `handleAcceptIntent` keeps the empty dependency list it was moved with —
  // see the NOTE on that callback. Anything it calls is therefore frozen at the
  // first render unless it is reached through a ref, and `confirmCondition`
  // closes over the patient and the visit id, both of which change during a
  // consult. A stale one would file a standing fact against whoever was on
  // screen first, which on a real patient cannot be unpicked afterwards. The
  // ref is the narrow fix: it corrects this path without changing the
  // dependency list that the medicine path still depends on.
  const confirmConditionRef = useRef(confirmCondition);
  confirmConditionRef.current = confirmCondition;

  const [prescription, setPrescription] = useState<PrescriptionMedicine[]>([]);
  const [selectedMedicineId, setSelectedMedicineId] = useState<string | null>(null);
  const [selectedTests, setSelectedTests] = useState<string[]>([]);
  /** Which diagnostic centre these tests should be ordered from — the plan
   *  rail's "order from" prompt, seeded with the doctor's default preferred
   *  lab and editable per consult. Null until at least one test is on the
   *  plan; see PlanCard's investigations section. */
  const [selectedLabName, setSelectedLabName] = useState<string | null>(null);

  /** Impressions the doctor agreed with — the working diagnosis. */
  const [diagnoses, setDiagnoses] = useState<string[]>([]);

  const [stagedMedicine, setStagedMedicine] = useState<PrescriptionMedicine | null>(null);
  const [followUpDays, setFollowUpDays] = useState<number | null>(null);
  const [adviceNotes, setAdviceNotes] = useState<string>("");
  const [visitNotes, setVisitNotes] = useState("");
  const [pendingMedicine, setPendingMedicine] = useState<PendingMedicine | null>(null);

  // ── Medicine dispensing billing (opt-in) — see lib/db/medicinePricing.ts ─
  // Read once per hospital, cheap and rarely changing (durable-cached inside
  // fetchMedicineBillingPolicy itself, same as the consult-fee policy).
  const [medicineBillingPolicy, setMedicineBillingPolicy] = useState<MedicineBillingPolicy>({
    enabled: false, gstEnabled: false, gstPercent: 18,
  });
  useEffect(() => {
    let cancelled = false;
    fetchMedicineBillingPolicy(hospitalId).then((policy) => {
      if (!cancelled) setMedicineBillingPolicy(policy);
    });
    return () => { cancelled = true; };
  }, [hospitalId]);

  // This clinic's own price per medicine, batch-fetched for whichever brands
  // the dose sheet is currently showing — accumulated across sheet openings
  // (never cleared) so a price already seen this consult doesn't cost a
  // second round trip the next time the same brand comes up.
  const [medicinePrices, setMedicinePrices] = useState<Map<number, ClinicMedicinePrice>>(new Map());
  const [loadingMedicinePrices, setLoadingMedicinePrices] = useState(false);
  useEffect(() => {
    if (!medicineBillingPolicy.enabled || !pendingMedicine || pendingMedicine.brands.length === 0) return;
    let cancelled = false;
    setLoadingMedicinePrices(true);
    fetchClinicMedicinePrices(hospitalId, pendingMedicine.brands.map((b) => b.id))
      .then((prices) => {
        if (cancelled) return;
        setMedicinePrices((curr) => {
          const next = new Map(curr);
          prices.forEach((v, k) => next.set(k, v));
          return next;
        });
      })
      .catch((err) => console.warn("fetchClinicMedicinePrices failed:", err))
      .finally(() => { if (!cancelled) setLoadingMedicinePrices(false); });
    return () => { cancelled = true; };
  }, [pendingMedicine, medicineBillingPolicy.enabled, hospitalId]);

  const onSetMedicinePrice = useCallback(async (medicineId: number, packPrice: number, packUnits: number) => {
    const price = await setClinicMedicinePrice({ hospitalId, medicineId, packPrice, packUnits, setBy: actorUserId });
    setMedicinePrices((curr) => new Map(curr).set(medicineId, price));
  }, [hospitalId, actorUserId]);

  const medicineBilling: MedicineBillingContext = useMemo(() => ({
    enabled: medicineBillingPolicy.enabled,
    prices: medicinePrices,
    loadingPrices: loadingMedicinePrices,
    onSetPrice: onSetMedicinePrice,
  }), [medicineBillingPolicy.enabled, medicinePrices, loadingMedicinePrices, onSetMedicinePrice]);

  /**
   * INTERVENTIONS — what was DELIVERED in the clinic today: casting, closed
   * reduction, splinting, joint injection (orthopedics); ultrasound, IFT,
   * manual therapy (physiotherapy). Same `modality` IntentType as always —
   * see interventionPlan.ts's header for the full reasoning — restructured
   * 2026-09-23 from a newline-joined string (the same shape `adviceNotes`
   * uses) into lines with their own site, because a plain string could not
   * say WHERE a procedure was done. That is not a cosmetic gap: a patient
   * with two simultaneous fractures needs two lines, each with its own
   * site, and a string cannot hold that without becoming prose a human has
   * to parse back apart.
   *
   * A `modality` accept is STAGED here, exactly as `medicine` is staged in
   * `pendingMedicine` — see `handleAcceptIntent`. Unlike advice, referral
   * and exercise (all of which commit straight to the plan), a doctor
   * confirms an intervention's site before it lands, because the site is
   * the one thing worth asking about every single time.
   */
  const [interventionPlan, setInterventionPlan] = useState<InterventionLine[]>([]);
  const [pendingIntervention, setPendingIntervention] = useState<PendingIntervention | null>(null);

  /**
   * The home programme — what the patient takes away and performs themselves.
   *
   * Structured lines rather than text, unlike advice and referrals, and this
   * is the change that makes a physiotherapy course legible: a dose held in
   * columns can be compared with last session's, and a dose held in a sentence
   * cannot. See features/consult/exercisePlan.ts.
   *
   * This applies to EVERY profile, not only physiotherapy. A general OPD
   * accepting "walk 30 minutes daily" gets a line with no numbers on it, which
   * prints exactly as it always did — the structure costs nothing where it is
   * not used, and inventing a second, text-only path for exercises would be
   * two code paths for one clinical object.
   */
  const [exercisePlan, setExercisePlan] = useState<ExerciseLine[]>([]);

  /**
   * Assessments that happen somewhere on the body ("Fracture — Left knee").
   * Staged like an intervention: the site is asked for on every accept,
   * because an unplaced fracture is not something anyone can treat. Each
   * line's `text` also lives in `diagnoses`; see assessmentPlan.ts.
   */
  const [assessmentLines, setAssessmentLines] = useState<AssessmentLine[]>([]);
  const [pendingAssessment, setPendingAssessment] = useState<PendingAssessment | null>(null);

  const appendAdvice = useCallback((line: string) => {
    setAdviceNotes((curr) => {
      const existing = curr.split("\n").map((l) => l.trim()).filter(Boolean);
      if (existing.includes(line)) return curr;
      return [...existing, line].join("\n");
    });
  }, []);

  // ────────────────────────────────────────────────────────────────────
  // Taking a suggestion.
  //
  // One entry point for every intent type, because the decision log records
  // them all the same way. Where each type LANDS differs — a medicine becomes
  // a prescription line, a test becomes an order, advice and referrals become
  // lines on the advice note — but the record of "the doctor took this" is one
  // shape, and that is what the learning loop reads.
  //
  // `commitAccept` is the second half: everything below assumes a medicine
  // intent already knows its product. `handleAcceptIntent` guarantees that.
  // ────────────────────────────────────────────────────────────────────
  /**
   * The guard verdict for a PRODUCT, across every molecule it contains.
   *
   * `guardIntent` is keyed on an intent, and the engine's medicine intents are
   * one per composition. A combination therefore had exactly one of its
   * molecules guarded: the one it was ranked or searched through. Taking
   * Acenac-P off an aceclofenac intent ran aceclofenac's contraindications and
   * never ran paracetamol's.
   *
   * This finds the medicine intent behind each of the product's compositions
   * and merges the verdicts, worst wins. It WARNS and never blocks: the
   * standing rule is that guards warn, never hide, and reachability is
   * absolute. The doctor is told what is in the product and decides.
   */
  const guardProduct = useCallback((brand: SynapseBrand): string[] => {
    const ruleset = data?.ruleset;
    const compositionIds = brand.compositionIds ?? (brand.compositionId != null ? [brand.compositionId] : []);
    if (!ruleset || compositionIds.length < 2) return [];

    const active = intelligence.result?.activeSignals ?? [];
    const reasons = new Set<string>();

    for (const [, intent] of ruleset.intents) {
      if (intent.type !== "medicine" || intent.refTable !== "compositions") continue;
      if (intent.refId == null || !compositionIds.includes(intent.refId)) continue;
      // Skip the molecule the row already guarded and displayed; this exists
      // for the ones the doctor never saw a verdict for.
      if (intent.refId === brand.compositionId) continue;
      const verdict = guardIntent(ruleset, active, { id: intent.id, type: intent.type });
      for (const r of verdict.reasons) reasons.add(r);
    }
    return [...reasons];
  }, [data?.ruleset, intelligence.result?.activeSignals]);

  const commitAccept = useCallback((payload: AcceptPayload, panelTestNames?: string[]) => {
    setAcceptedIntents((curr) => {
      if (curr.has(payload.intentId)) return curr;
      const next = new Map(curr);
      next.set(payload.intentId, payload);
      return next;
    });

    if (payload.viaSearch) {
      setSearchedAccepts((curr) => [
        ...curr.filter((s) => s.intentId !== payload.intentId),
        { intentId: payload.intentId, chosenMedicineId: payload.medicine?.id ?? null },
      ]);
    }

    switch (payload.type) {
      case "medicine": {
        if (!payload.medicine) {
          // Genuinely not prescribable: the catalogue holds no product with
          // this molecule on its own. `handleAcceptIntent` has already tried to
          // resolve one, so reaching here means there is nothing to resolve —
          // saying so is the whole point of surfacing it rather than quietly
          // dropping it.
          showToast(`${payload.label} has no single-molecule brand — search a product instead`);
          setAcceptedIntents((curr) => {
            const next = new Map(curr);
            next.delete(payload.intentId);
            return next;
          });
          return;
        }
        const brand = payload.medicine;
        setChosenBrands((curr) => new Map(curr).set(payload.intentId, brand.id));
        // Only a DELIBERATE pick teaches the brand model. Recording the default
        // as if it had been chosen would train the model on its own output —
        // the drift avoided by never logging the personalised score.
        if (payload.brandDeliberate) {
          setDeliberateBrands((curr) => new Map(curr).set(payload.intentId, brand.id));
        }
        setPrescription((curr) => {
          // Silently returning `curr` showed the row a tick for something that
          // was never added. Say so instead.
          if (curr.some((m) => m.medicine_id === brand.id)) {
            showToast(`${brand.name} is already on the plan`);
            return curr;
          }
          return [...curr, toPrescriptionLine(payload, brand, curr.length)];
        });
        // A combination carries molecules the doctor did not search for, and
        // the ranked row only ever guarded the one it was ranked through.
        // Surface the rest at the moment it lands, never by refusing it.
        const extra = guardProduct(brand);
        if (extra.length > 0) {
          showToast(`${brand.name}: ${extra.join(" · ")}`);
        }
        // Deliberately NOT opening the dose editor. The defaults are right most
        // of the time, and a modal after every single accept was the largest
        // click cost in the old workspace. The line is editable on the Plan.
        break;
      }
      case "test":
        // A panel intent isn't itself an orderable test — "Fever Workup" is
        // the accept, but CBC / Widal / Dengue NS1 etc. are what actually go
        // on the plan. `panelTestNames` carries that resolved list; every
        // other test accept still adds its own label as one line.
        if (panelTestNames) {
          setSelectedTests((curr) => {
            const merged = new Set(curr);
            panelTestNames.forEach((name) => merged.add(name));
            return [...merged];
          });
        } else {
          setSelectedTests((curr) =>
            curr.includes(payload.label) ? curr : [...curr, payload.label]
          );
        }
        break;
      case "referral":
        appendAdvice(`Refer to ${payload.label}`);
        break;
      case "advice":
        appendAdvice(payload.label);
        break;
      // The home programme. Was `appendAdvice(payload.label)` until
      // 2026-08-16, which flattened the dose into prose — see `exercisePlan`
      // above. A newly accepted exercise starts on a sensible dose that the
      // physiotherapist edits on the row; `doseFor` picks reps or a hold from
      // the exercise's own name.
      case "exercise":
        setExercisePlan((curr) => {
          if (curr.some((l) => l.intentId === payload.intentId && l.side === null)) return curr;
          return [...curr, {
            id: `ex-${payload.intentId}-${Date.now()}`,
            intentId: payload.intentId,
            label: payload.label,
            side: null,
            notes: "",
            sortOrder: curr.length,
            ...doseFor(payload.label),
          }];
        });
        break;
      // Nothing to do here: `handleAcceptIntent` never reaches `commitAccept`
      // for a fresh `modality` accept — it stages into `pendingIntervention`
      // instead, and `confirmPendingIntervention` calls this function ONLY
      // for the ledger registration above, once the site is confirmed. This
      // case exists so a future caller cannot reintroduce the old
      // instant-commit-with-no-site behaviour by accident.
      case "modality":
        break;
      case "finding": {
        // The engine's reading of the chart, taken as the working diagnosis.
        // It lands on the Plan and prints on the Rx — and, the part that was
        // missing until now, it is finally RECORDED as an accept, so the
        // decision log sees which impression the doctor actually agreed with.
        const dxText = payload.diagnosisText ?? payload.label;
        setDiagnoses((curr) =>
          curr.includes(dxText) ? curr : [...curr, dxText]
        );
        // ★ And, since 2026-08-15, it also becomes an INPUT. A mapped condition
        // joins the chart as context and the engine re-ranks in the same frame;
        // a chronic one additionally becomes a standing fact that comes back on
        // this patient's next visit. Unmapped conditions fall through to the
        // behaviour above, unchanged. See useLongitudinalRecord.ts.
        const standingFact = confirmConditionRef.current(payload.intentId);
        if (standingFact) {
          // Say it plainly. The chart just gained a chip the doctor did not
          // tap, and a surface that silently edits itself is one a doctor
          // stops trusting.
          showToast(`${payload.label} confirmed — recorded as "${standingFact}"`);
        }
        break;
      }
    }
    // NOTE: this dependency list was `[]` in App.tsx, which captured the FIRST
    // render's `guardProduct` — one built before the ruleset had loaded, so it
    // returned [] forever and the combination guard toast never fired. Moved
    // here unchanged on purpose; the fix is a separate, labelled change so a
    // regression can be traced to one or the other.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * The product behind a molecule, fetched on demand.
   *
   * ── The bug this exists to fix ─────────────────────────────────────────
   * Only the RANKED medicine list ever had brands in hand: `useConsultIntelligence`
   * fetches them for the compositions the engine scored, and the ranked row
   * passes the resolved product straight into the accept. Every OTHER way of
   * reaching a medicine — searching for it, taking a companion before its
   * brands had loaded — handed the accept a `medicine: null`, and the accept
   * path read that as "this molecule has no product in the catalogue". The
   * doctor got "…has no single-molecule brand" on drugs with hundreds of
   * brands, and the intent was silently un-accepted.
   *
   * The catalogue was never the problem — `composition_brands` returns those
   * brands for anon and authenticated alike, and `medicine_composition_map`
   * has had a working read policy throughout. The lookup simply was not being
   * made. It is made here, once, for every path into an accept.
   *
   * The session cache inside `useConsultIntelligence` is consulted first, so
   * accepting a ranked medicine still costs no round trip.
   */
  const resolveBrandFor = useCallback(
    async (compositionId: number): Promise<SynapseBrand | null> => {
      const cached = intelligence.brands.get(compositionId);
      if (cached) return cached.brands[0] ?? null;
      if (!data) return null;

      const index = await fetchCompositionBrands({
        compositionIds: [compositionId],
        prefs: data.brandPreferences,
        clinicDefaults: data.clinicBrandDefaults,
        isPediatric: intelligence.isPediatric,
      });
      return index.get(compositionId)?.brands[0] ?? null;
    },
    [intelligence.brands, intelligence.isPediatric, data]
  );

  /**
   * The one entry point. A medicine that arrives without a product gets one
   * before anything else happens; a panel gets its member tests resolved the
   * same way; every other type passes straight through.
   */
  const handleAcceptIntent = useCallback((payload: AcceptPayload) => {
    if (payload.type === "test" && payload.refTable === "panels" && payload.refId != null) {
      resolvePanelTests(payload.refId)
        .then((testNames) => commitAccept(payload, testNames))
        .catch((err: any) => showToast(`Could not load tests for ${payload.label}: ${err.message}`));
      return;
    }
    // ── EVERY intervention confirms its site first ─────────────────────────
    // Staged exactly like medicine, for the same reason: the site is a
    // clinical decision on every single accept, not only on the ones where
    // it happens to matter, and asking after the fact means the doctor has
    // to remember to go back and add it. See PendingIntervention.
    if (payload.type === "modality") {
      setPendingIntervention({ payload, initialSite: lastMarkedSiteRef.current ?? "" });
      return;
    }

    // An assessment with a place on the body asks where, first — the same
    // staging as an intervention. Everything else (malaria, hypertension)
    // still lands in one tap.
    if (payload.type === "finding" && familyFor(payload.label)) {
      setPendingAssessment({ payload, editId: null, initialSite: null, initialDetails: {} });
      return;
    }

    if (payload.type !== "medicine") {
      commitAccept(payload);
      return;
    }

    // ── EVERY medicine confirms in the sheet ──────────────────────────────
    // This read `|| payload.medicine`, which meant a payload that ALREADY had
    // a product skipped the sheet entirely. The ranked list always resolves a
    // brand before calling, so RECOMMENDED medicines never showed the confirm
    // step at all: pressing the button on a ranked row put a medicine on the
    // prescription at the composition's default dose with no dose, duration,
    // timing or brand ever shown. Only searched medicines, which arrive
    // without a product, got the sheet.
    //
    // The dose is a clinical decision on every route to a prescription, not
    // only on the one that happens to lack a brand.
    const compositionId =
      payload.refTable === "compositions" ? payload.refId : null;
    if (compositionId == null) {
      // No composition behind it. If a product came with the payload there is
      // still something to prescribe, so take it rather than refusing; only a
      // medicine with neither is a genuine data problem.
      if (payload.medicine) {
        commitAccept(payload);
        return;
      }
      showToast(`${payload.label} is not linked to a composition`);
      return;
    }

    // STAGE, don't commit. A medicine used to go straight onto the plan with
    // the resolver's brand and the composition's default dose; both are now
    // confirmed once, in MedicineAddSheet, at the moment of the decision.
    //
    // ── The named product comes first ─────────────────────────────────────
    // When the doctor reached this by typing a brand, THAT product is the
    // answer, whatever its ingredient count. `composition_brands` cannot
    // return it if it is a combination, so it is resolved separately and put
    // at the head of the list. The molecule's own single-molecule brands still
    // follow, because swapping to one of them is a legitimate next thought.
    Promise.all([
      resolveBrandFor(compositionId),
      payload.brandHint
        ? resolveProductByName(payload.brandHint).catch((err) => {
          // A failed product lookup must never cost the doctor the accept.
          // The molecule's own brands are still below.
          console.warn("named product lookup failed:", err);
          return null;
        })
        : Promise.resolve(null),
    ])
      .then(([brand, named]) => {
        const index = intelligence.brands.get(compositionId);
        const single = index?.brands ?? (brand ? [brand] : []);
        // A combination product carried straight in `payload.medicine` — a
        // ranked row's own combination alternate (RecommendationsCard), or a
        // companion — gets the same head-of-list treatment as one reached by
        // typing a brand name. Without this it opened the sheet correctly
        // selected but absent from its own Brand list, so nothing in that
        // list ever showed as chosen.
        const comboMedicine =
          !named && payload.medicine && (payload.medicine.compositionIds?.length ?? 0) > 1
            ? payload.medicine
            : null;
        const brands = named
          ? [named, ...single.filter((b) => b.id !== named.id)]
          : comboMedicine
            ? [comboMedicine, ...single.filter((b) => b.id !== comboMedicine.id)]
            : single;
        setPendingMedicine({
          payload,
          compositionId,
          brands,
          // Preference order: the product the doctor NAMED in search, then the
          // one the ranked row already chose and displayed, then the
          // resolver's default. A ranked row that shows "Crocin" must open the
          // sheet on Crocin, never on whatever the resolver would have picked
          // independently.
          initialBrand: named ?? payload.medicine ?? brand,
        });
      })
      .catch((err) => {
        // The ranking is unaffected — only the product lookup failed — so this
        // says which half broke rather than blaming the molecule.
        console.warn("brand resolution failed:", err);
        showToast(`Could not load a product for ${payload.label} — try again`);
      });
  }, [resolveBrandFor, intelligence.brands, commitAccept, showToast]);

  /** Confirmed in the sheet — now it becomes a prescription line. */
  const confirmPendingMedicine = useCallback((draft: MedicineDraft) => {
    if (!pendingMedicine) return;
    const { payload } = pendingMedicine;
    setPendingMedicine(null);
    commitAccept({ ...payload, medicine: draft.medicine });

    // Copied at confirm time, never read live again — the same principle
    // `doctors.consultation_fee` -> `visit_payments.fee` already uses. A
    // price change next month must never rewrite a prescription already
    // handed to a patient. `undefined` (billing off) stays undefined, never
    // coerced to null, so PrescriptionMedicine looks exactly as it always
    // did for a clinic that has never turned this on.
    const billingFields = medicineBillingPolicy.enabled
      ? {
        quantityDispensed: draft.quantityDispensed?.trim() ? Number(draft.quantityDispensed) : null,
        unitPrice: draft.medicine ? medicinePrices.get(draft.medicine.id)?.unitPrice ?? null : null,
      }
      : {};

    // The dose the doctor confirmed, applied over whatever the composition
    // defaulted to. Deferred one frame so it lands after commitAccept's own
    // state update rather than racing it.
    window.setTimeout(() => {
      setPrescription((curr) =>
        curr.map((m) =>
          m.intent_id === payload.intentId
            ? {
              ...m,
              dosage_mg: draft.dosageMg ? Number(draft.dosageMg) : m.dosage_mg,
              frequency: draft.frequency,
              duration_days: draft.durationDays ? Number(draft.durationDays) : m.duration_days,
              instructions: draft.instructions,
              is_sos: draft.isSos,
              ...billingFields,
            }
            : m
        )
      );
    }, 0);
  }, [pendingMedicine, commitAccept, medicineBillingPolicy.enabled, medicinePrices]);

  /** Swap the brand under an already-chosen molecule. Always deliberate. */
  const handleChangeBrand = useCallback((intentId: number, brand: SynapseBrand) => {
    setChosenBrands((curr) => new Map(curr).set(intentId, brand.id));
    setDeliberateBrands((curr) => new Map(curr).set(intentId, brand.id));
    setPrescription((curr) =>
      curr.map((m) =>
        m.intent_id === intentId
          ? { ...m, id: String(brand.id), medicine_id: brand.id, name: brand.name, route: brand.form ?? m.route }
          : m
      )
    );
  }, []);

  /** Pin (or unpin) the brand the whole clinic sees first for this molecule. */
  const handlePinClinicBrand = useCallback(async (brand: SynapseBrand, pinned: boolean) => {
    // A clinic default is a preference keyed on a MOLECULE
    // (`clinic_brand_preference`'s primary key) — meaningless for a
    // composition-less medicine, which has no molecule to prefer a brand
    // for. Guarded here rather than only in whatever surface renders the
    // pin control, so a composition-less medicine can never reach this
    // write regardless of which screen it was added from.
    if (brand.compositionId == null) {
      showToast(`${brand.name} has no composition on file, so it can't be set as a clinic default`);
      return;
    }
    try {
      if (pinned) {
        await setClinicBrandDefault({
          hospitalId,
          compositionId: brand.compositionId,
          medicineId: brand.id,
          form: brand.form,
          setBy: null,
        });
        showToast(`${brand.name} is now the clinic default`);
      } else {
        await clearClinicBrandDefault({
          hospitalId,
          compositionId: brand.compositionId,
          medicineId: brand.id,
        });
        showToast(`${brand.name} is no longer the clinic default`);
      }
      reloadSynapse();
    } catch (err: any) {
      showToast(`Clinic default failed: ${err.message}`);
    }
  }, [hospitalId, reloadSynapse, showToast]);

  const confirmStagedMedicine = useCallback(() => {
    if (!stagedMedicine) return;
    setPrescription((curr) => [...curr, { ...stagedMedicine, sort_order: curr.length }]);
    setStagedMedicine(null);
    setSelectedMedicineId(null);
  }, [stagedMedicine]);

  /**
   * The site is confirmed — now it becomes a plan line.
   *
   * Registers the accept in the ledger via `commitAccept` (whose own
   * `modality` case is now a no-op — see its comment) exactly the way
   * `confirmPendingMedicine` does, then appends the structured line itself.
   * No race to patch afterwards, unlike medicine's `setTimeout(0)`: nothing
   * else writes an intervention line, so there is nothing to patch.
   */
  const confirmPendingIntervention = useCallback((draft: { site: string; side: InterventionSide | null; notes: string }) => {
    if (!pendingIntervention) return;
    const { payload } = pendingIntervention;
    setPendingIntervention(null);
    commitAccept(payload);
    setInterventionPlan((curr) => [...curr, {
      id: `intv-${payload.intentId}-${Date.now()}`,
      intentId: payload.intentId || null,
      label: payload.label,
      site: draft.site,
      side: draft.side,
      notes: draft.notes,
      sortOrder: curr.length,
    }]);
  }, [pendingIntervention, commitAccept]);

  const cancelPendingIntervention = useCallback(() => {
    setPendingIntervention(null);
  }, []);

  /**
   * The site (and any details) are chosen — now it becomes a diagnosis.
   * A new line registers the accept through `commitAccept` with its
   * composed text, so the ledger, the decision log and the standing-fact
   * path all run exactly as for a one-tap assessment. An edit only swaps
   * the text in place, keeping its position (the first is PRIMARY).
   */
  const confirmPendingAssessment = useCallback((draft: { site: SiteRef | null; details: AssessmentDetails }) => {
    if (!pendingAssessment) return;
    const { payload, editId } = pendingAssessment;
    const family = familyFor(payload.label);
    if (!family) return;
    setPendingAssessment(null);
    const details = pruneDetails(family, draft.site, draft.details);
    const text = composeAssessmentText(payload.label, family, draft.site, details);

    if (editId) {
      const old = assessmentLines.find((l) => l.id === editId);
      if (!old) return;
      setAssessmentLines((curr) => curr.map((l) => (l.id === editId ? { ...l, site: draft.site, details, text } : l)));
      setDiagnoses((curr) => {
        if (old.text === text) return curr;
        // Two identical lines collapse to one rather than printing twice.
        if (curr.includes(text)) return curr.filter((d) => d !== old.text);
        return curr.map((d) => (d === old.text ? text : d));
      });
      return;
    }

    if (diagnoses.includes(text)) {
      showToast(`${text} is already in the assessment`);
      return;
    }
    if (payload.intentId && acceptedIntents.has(payload.intentId)) {
      // A second site of something already confirmed: the decision was
      // recorded once, only the line is new.
      setDiagnoses((curr) => [...curr, text]);
    } else {
      commitAccept({ ...payload, diagnosisText: text });
    }
    setAssessmentLines((curr) => [...curr, {
      id: `dx-${payload.intentId}-${Date.now()}`,
      intentId: payload.intentId || null,
      label: payload.label,
      family: family.key,
      site: draft.site,
      details,
      text,
    }]);
  }, [pendingAssessment, assessmentLines, diagnoses, acceptedIntents, commitAccept, showToast]);

  const cancelPendingAssessment = useCallback(() => {
    setPendingAssessment(null);
  }, []);

  const editAssessmentLine = useCallback((id: string) => {
    const line = assessmentLines.find((l) => l.id === id);
    if (!line) return;
    setPendingAssessment({
      payload: {
        intentId: line.intentId ?? 0, type: "finding", label: line.label,
        refTable: null, refId: null, medicine: null, viaSearch: false, overridden: false,
      },
      editId: id,
      initialSite: line.site,
      initialDetails: line.details,
    });
  }, [assessmentLines]);

  const addAnotherAssessmentSite = useCallback((intentId: number | null, label: string) => {
    setPendingAssessment({
      payload: {
        intentId: intentId ?? 0, type: "finding", label,
        refTable: null, refId: null, medicine: null, viaSearch: false, overridden: false,
      },
      editId: null,
      initialSite: null,
      initialDetails: {},
    });
  }, []);

  const removeIntervention = useCallback((id: string) => {
    let intentId: number | null = null;
    setInterventionPlan((curr) => {
      const found = curr.find((l) => l.id === id);
      intentId = found?.intentId ?? null;
      const rest = curr.filter((l) => l.id !== id);
      // Only release the ledger entry when this was the LAST line for that
      // intent — a bilateral pair is one accept with two sites, and taking
      // one side off the plan is not the doctor withdrawing the decision.
      if (intentId != null && !rest.some((l) => l.intentId === intentId)) {
        releaseIntent(intentId);
      }
      return rest;
    });
  }, [releaseIntent]);

  /**
   * The same intervention, at another site — a bilateral cast, or a second
   * fracture the ranked row already covers. Opens the inspector again
   * rather than cloning silently: a second site is as much a clinical
   * decision as the first, same reasoning as `duplicateExerciseForSide`
   * one column over, which clones without asking because a dose carries
   * forward safely and a site never should.
   */
  const addAnotherInterventionSite = useCallback((id: string) => {
    const src = interventionPlan.find((l) => l.id === id);
    if (!src) return;
    setPendingIntervention({
      payload: {
        intentId: src.intentId ?? 0,
        type: "modality",
        label: src.label,
        refTable: null,
        refId: null,
        medicine: null,
        viaSearch: false,
        overridden: false,
      },
      initialSite: "",
    });
  }, [interventionPlan]);

  const updateMedicine = useCallback((updated: PrescriptionMedicine) => {
    if (stagedMedicine && stagedMedicine.id === updated.id) {
      setStagedMedicine(updated);
      return;
    }
    setPrescription((curr) => curr.map((m) => (m.id === updated.id ? updated : m)));
  }, [stagedMedicine]);

  const removeMedicine = useCallback((id: string) => {
    const target = id.trim().toLowerCase();
    const line = prescription.find((m) => m.id === id || String(m.medicine_id) === id || m.name.trim().toLowerCase() === target);
    if (line?.intent_id != null) releaseIntent(line.intent_id);
    setPrescription((curr) => curr.filter((m) => m.id !== id && String(m.medicine_id) !== id && m.name.trim().toLowerCase() !== target));
    if (selectedMedicineId === id || (line && selectedMedicineId === line.id)) setSelectedMedicineId(null);
  }, [prescription, selectedMedicineId, releaseIntent]);

  const removeTest = useCallback((label: string) => {
    const target = label.trim().toLowerCase();
    setSelectedTests((curr) => curr.filter((t) => t.trim().toLowerCase() !== target));
    for (const [intentId, p] of acceptedIntents) {
      if (p.type === "test" && (p.label.trim().toLowerCase() === target || target.includes(p.label.trim().toLowerCase()))) {
        releaseIntent(intentId);
      }
    }
  }, [acceptedIntents, releaseIntent]);

  const removeDiagnosis = useCallback((label: string) => {
    const target = label.trim().toLowerCase();
    // A target is either one line's text ("Fracture — Left knee": that site
    // only) or the catalogue name ("Fracture", from the ranked row's undo:
    // every site of it).
    const hitLines = assessmentLines.filter(
      (l) => l.text.trim().toLowerCase() === target || l.label.trim().toLowerCase() === target
    );
    const keptLines = assessmentLines.filter((l) => !hitLines.includes(l));
    const removedTexts = new Set([target, ...hitLines.map((l) => l.text.trim().toLowerCase())]);
    if (hitLines.length) setAssessmentLines(keptLines);
    setDiagnoses((curr) => curr.filter((d) => !removedTexts.has(d.trim().toLowerCase())));

    // Found first, released after: `unconfirmCondition` needs to know which
    // OTHER finding intents are still confirmed so a chip shared by two
    // confirmed diagnoses is not pulled out from under the one that stays.
    // An intent with sites is released only when its LAST site goes — one
    // fracture healed is not the doctor withdrawing the other.
    const releasedIds = new Set<number>();
    for (const [intentId, p] of acceptedIntents) {
      if (p.type !== "finding") continue;
      const byLabel = p.label.trim().toLowerCase() === target
        || (p.diagnosisText ?? "").trim().toLowerCase() === target;
      const lostLastSite = hitLines.some((l) => l.intentId === intentId)
        && !keptLines.some((l) => l.intentId === intentId);
      if (byLabel || lostLastSite) releasedIds.add(intentId);
    }
    const stillConfirmed: number[] = [];
    for (const [intentId, p] of acceptedIntents) {
      if (p.type === "finding" && !releasedIds.has(intentId)) stillConfirmed.push(intentId);
    }
    for (const id of releasedIds) {
      releaseIntent(id);
      // The other half of the fix: taking the diagnosis chip off must also
      // take back whatever it silently put on the Case Sheet — see
      // useLongitudinalRecord.ts's doc comment on this function.
      unconfirmCondition(id, stillConfirmed);
    }
  }, [assessmentLines, acceptedIntents, releaseIntent, unconfirmCondition]);

  /**
   * The free-text fallback, chart-local half — §4, 2026-08-24, widened same
   * day to Test/Referral/Advice alongside Assessment. Every one of these
   * four targets was ALREADY a plain string with no catalogue intent behind
   * an entry (`diagnoses`, `selectedTests`, and advice/referral lines via
   * `appendAdvice`) — that is what makes this safe across all four: a free
   * label slots in exactly where a ranked accept already lands, no new
   * shape, no fake intent id to invent. The Supabase write that lets a term
   * come back for a similar chart next time is a separate, non-fatal call
   * the caller makes alongside these — see `lib/db/synapse.ts`'s
   * `saveDoctorFreeTerm` — because this hook never writes to the database
   * (header rule). Medicine and exercise are NOT here: medicine has its own
   * composition-anchored path (`AddMedicineSheet`), and exercise's plan
   * line is keyed on a real intent id in a way these four never were — see
   * `freeTerms.ts`'s header for the full scoping note.
   */
  const addFreeDiagnosis = useCallback((label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setDiagnoses((curr) => (curr.includes(trimmed) ? curr : [...curr, trimmed]));
  }, []);

  const addFreeTest = useCallback((label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setSelectedTests((curr) => (curr.includes(trimmed) ? curr : [...curr, trimmed]));
  }, []);

  const addFreeReferral = useCallback((label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    appendAdvice(`Refer to ${trimmed}`);
  }, [appendAdvice]);

  const addFreeAdvice = useCallback((label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    appendAdvice(trimmed);
  }, [appendAdvice]);

  const removeAdviceLine = useCallback((line: string) => {
    setAdviceNotes((curr) =>
      curr.split("\n").map((l) => l.trim()).filter((l) => l && l !== line).join("\n")
    );
    for (const [intentId, p] of acceptedIntents) {
      const asLine = p.type === "referral" ? `Refer to ${p.label}` : p.label;
      if ((p.type === "referral" || p.type === "advice" || p.type === "exercise") && asLine === line) {
        releaseIntent(intentId);
      }
    }
  }, [acceptedIntents, releaseIntent]);

  const updateExercise = useCallback((id: string, patch: Partial<ExerciseLine>) => {
    setExercisePlan((curr) => curr.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  const removeExercise = useCallback((id: string) => {
    let intentId: number | null = null;
    setExercisePlan((curr) => {
      const found = curr.find((l) => l.id === id);
      intentId = found?.intentId ?? null;
      return curr.filter((l) => l.id !== id);
    });
    // Releasing the intent matters for the same reason it does everywhere
    // else: an exercise taken off the plan must stop counting as accepted, or
    // the decision log learns a preference the doctor withdrew.
    if (intentId != null) {
      for (const [iid, p] of acceptedIntents) {
        if (p.type === "exercise" && iid === intentId) releaseIntent(iid);
      }
    }
  }, [acceptedIntents, releaseIntent]);

  /**
   * The same exercise, for the other side. A physiotherapist treating both
   * knees prescribes two lines and progresses them independently — see
   * `identityOf` in exercisePlan.ts.
   */
  const duplicateExerciseForSide = useCallback((id: string, side: ExerciseSide) => {
    setExercisePlan((curr) => {
      const src = curr.find((l) => l.id === id);
      if (!src) return curr;
      if (curr.some((l) => l.intentId === src.intentId && l.side === side)) return curr;
      return [...curr, { ...src, id: `ex-${src.intentId}-${side}-${Date.now()}`, side, sortOrder: curr.length }];
    });
  }, []);

  /**
   * Take ANYTHING already accepted straight back off, from wherever it was
   * accepted — the ranked row itself, or a search hit. §9, 2026-08-24.
   *
   * Before this, the only undo for an accepted row was the checkmark it
   * turned into — no click target, nothing — so taking something back meant
   * hunting it down a second time on the Plan rail on the right, which is a
   * different panel from the one the doctor was just looking at. Reported as
   * "after adding any field... there should be an instant clickable x button
   * to remove it."
   *
   * A thin dispatcher over the per-type removers that already existed,
   * rather than a sixth implementation of "how do I take this back off":
   * most of them are keyed on the LABEL already (removeTest,
   * removeDiagnosis, removeAdviceLine), which is exactly what a
   * ranked/searched row already has in hand. Medicine, exercise and
   * intervention are the exceptions — their plan lines are keyed on their
   * OWN id, not the intent id, so this looks that line up first.
   */
  const removeAcceptedIntent = useCallback(
    (intentId: number, type: AcceptPayload["type"], label: string) => {
      switch (type) {
        case "medicine": {
          const target = label.trim().toLowerCase();
          const line = prescription.find(
            (m) =>
              (intentId !== 0 && m.intent_id === intentId) ||
              m.name.trim().toLowerCase() === target ||
              m.category.trim().toLowerCase() === target
          );
          if (line) removeMedicine(line.id);
          else if (intentId !== 0) releaseIntent(intentId);
          else {
            setPrescription((curr) => curr.filter((m) => m.name.trim().toLowerCase() !== target));
          }
          break;
        }
        case "test":
          removeTest(label);
          break;
        case "finding":
          removeDiagnosis(label);
          break;
        case "referral":
          removeAdviceLine(`Refer to ${label}`);
          break;
        case "advice":
          removeAdviceLine(label);
          break;
        case "exercise": {
          const line = exercisePlan.find(
            (l) =>
              (intentId !== 0 && l.intentId === intentId && l.side === null) ||
              l.label.trim().toLowerCase() === label.trim().toLowerCase()
          );
          if (line) removeExercise(line.id);
          else if (intentId !== 0) releaseIntent(intentId);
          break;
        }
        case "modality": {
          // A ranked row's own undo takes off EVERY line this intent added
          // (see `removeIntervention`'s own comment on why one side alone
          // does not release the ledger entry) — the row asked for one
          // decision back, not a choice of which site to keep.
          const lines = interventionPlan.filter(
            (l) =>
              (intentId !== 0 && l.intentId === intentId) ||
              l.label.trim().toLowerCase() === label.trim().toLowerCase()
          );
          lines.forEach((l) => removeIntervention(l.id));
          break;
        }
        case "impairment":
          if (intentId !== 0) releaseIntent(intentId);
          break;
      }
    },
    [
      prescription, exercisePlan, interventionPlan, removeMedicine, removeTest, removeDiagnosis,
      removeAdviceLine, removeExercise, removeIntervention, releaseIntent,
    ]
  );

  const handleAcknowledge = useCallback((intentId: number, ack: boolean) => {
    setAcknowledgedIntents((curr) => {
      const next = new Set(curr);
      if (ack) next.add(intentId);
      else next.delete(intentId);
      return next;
    });
    // Un-acknowledging withdraws the accept it permitted — an override the
    // doctor took back must not stay on the prescription.
    if (!ack) {
      setPrescription((curr) => curr.filter((m) => m.intent_id !== intentId));
      releaseIntent(intentId);
    }
  }, [releaseIntent]);

  /**
   * What actually prints as Advice: the lines the doctor ACCEPTED, then
   * anything they typed freehand. Two inputs, one field on the prescription —
   * the Rx prints a single advice block and the doctor should not have to
   * decide which half a line belongs in.
   */
  const reviewAdvice = useMemo(
    () => [adviceNotes, visitNotes.trim()].filter(Boolean).join("\n"),
    [adviceNotes, visitNotes]
  );

  /** Advice notes are one string; the Plan column edits them as lines. */
  const adviceLines = useMemo(
    () => adviceNotes.split("\n").map((l) => l.trim()).filter(Boolean),
    [adviceNotes]
  );

  /** `interventionPlan`, formatted — the one shape the prescription's
   *  `therapy_notes` column and the print/review surfaces still read.
   *  Derived, never the source of truth: `interventionPlan` is. */
  const therapyNotes = useMemo(
    () => interventionPlan.map(formatIntervention).join("\n"),
    [interventionPlan]
  );

  const selectedMedicine = useMemo(
    () => prescription.find((m) => m.id === selectedMedicineId),
    [prescription, selectedMedicineId]
  );

  const inspectorMedicine = stagedMedicine
    ? stagedMedicine
    : selectedMedicineId && !stagedMedicine
      ? selectedMedicine ?? null
      : null;

  /**
   * The second half of the §14 gate.
   *
   * A hard warning attached to something in the ranked list is gated by its own
   * acknowledge button. Nothing gates an intent reached by SEARCH or from the
   * frequent list — those have no button to lock — so the close of the consult
   * is where that is caught: if the doctor is prescribing something a guard is
   * warning about and has not read the reason, review does not open.
   */
  const unreadPrescribedWarnings = useMemo(
    () => intelligence.hardWarned.filter(
      (i) => acceptedIntents.has(i.intentId) && !acknowledgedIntents.has(i.intentId)
    ),
    [intelligence.hardWarned, acceptedIntents, acknowledgedIntents]
  );

  /**
   * Which plan lines just arrived. The doctor accepts from a ranked panel two
   * columns away, so the summary has to show where it landed — otherwise the
   * rail is a box that silently grows.
   */
  const justAdded = useJustAdded([
    ...diagnoses,
    ...selectedTests,
    ...adviceLines,
    ...prescription.map((m) => m.id),
  ]);

  // ── Companions, indexed by the medicine that triggered them ─────────────
  // The Plan asks per line. Anything already on the plan, or waved off this
  // consultation, never reaches the slot.
  const companionsByTrigger = useMemo(() => {
    const m = new Map<number, CompanionSuggestion[]>();
    for (const c of intelligence.companions?.suggestions ?? []) {
      if (dismissedCompanions.has(c.companionIntentId)) continue;
      if (acceptedIntents.has(c.companionIntentId)) continue;
      for (const trigger of c.triggeredBy) {
        const list = m.get(trigger);
        if (list) list.push(c);
        else m.set(trigger, [c]);
      }
    }
    return m;
  }, [intelligence.companions, dismissedCompanions, acceptedIntents]);

  const companionsFor = useCallback(
    (intentId: number) => companionsByTrigger.get(intentId) ?? [],
    [companionsByTrigger]
  );

  const dismissCompanion = useCallback((companionIntentId: number) => {
    setDismissedCompanions((curr) => new Set(curr).add(companionIntentId));
  }, []);

  /**
   * Taking a companion.
   *
   * It routes through the same accept path as everything else, because the
   * decision log must not be able to tell a companion apart from a suggestion
   * the doctor reached any other way — it is a prescription either way. The
   * one thing that has to happen here is resolving the BRAND: a companion
   * carries an intent id and a label, not a product, so the brand index (which
   * now covers companion compositions) is consulted before handing it on.
   */
  const handleAddCompanion = useCallback((c: CompanionSuggestion) => {
    const intent = data?.ruleset.intents.get(c.companionIntentId);
    const compositionId =
      intent?.refTable === "compositions" ? intent.refId : null;
    const brand =
      c.type === "medicine" && compositionId != null
        ? intelligence.brands.get(compositionId)?.brands[0] ?? null
        : null;

    handleAcceptIntent({
      intentId: c.companionIntentId,
      type: c.type,
      label: c.label,
      refTable: intent?.refTable ?? null,
      refId: intent?.refId ?? null,
      medicine: brand,
      // It was offered by the pairing table, not by the ranking, so it is not
      // a ranked accept and must not be logged as one.
      viaSearch: true,
      overridden: c.status === "warn_hard",
    });
  }, [data, intelligence.brands, handleAcceptIntent]);

  /**
   * Back to an empty plan.
   *
   * NOTE: `stagedMedicine` and `pendingMedicine` are deliberately NOT cleared
   * here, because App.tsx's three reset paths did not clear them either. That
   * is a bug — an add sheet open across a patient switch can commit onto a
   * blank consult — and it is fixed separately so this move stays a move.
   */
  const reset = useCallback(() => {
    setPrescription([]);
    setSelectedMedicineId(null);
    setSelectedTests([]);
    setDiagnoses([]);
    setAssessmentLines([]);
    setPendingAssessment(null);
    setFollowUpDays(null);
    setAdviceNotes("");
    setInterventionPlan([]);
    setPendingIntervention(null);
    setExercisePlan([]);
    setVisitNotes("");
    resetLedger();
  }, [resetLedger]);

  const restorePlan = useCallback((draft: PlanDraft) => {
    setPrescription(draft.prescription);
    setSelectedTests(draft.selectedTests);
    setSelectedLabName(draft.selectedLabName);
    setDiagnoses(draft.diagnoses);
    // Drafts saved before assessment lines existed have none.
    setAssessmentLines((draft.assessmentLines ?? []).filter((l) => draft.diagnoses.includes(l.text)));
    setFollowUpDays(draft.followUpDays);
    setAdviceNotes(draft.adviceNotes);
    setInterventionPlan(draft.interventionPlan);
    setExercisePlan(draft.exercisePlan);
    setVisitNotes(draft.visitNotes);
  }, []);

  const loadRepeatRx = useCallback((medicines: PrescriptionMedicine[], tests?: string[], diagnoses?: string[]) => {
    setPrescription(medicines);
    if (tests && tests.length > 0) {
      setSelectedTests(tests);
    }
    if (diagnoses && diagnoses.length > 0) {
      setDiagnoses(diagnoses);
      // A repeated diagnosis comes back as plain text; its old site lines
      // do not describe this visit.
      setAssessmentLines([]);
    }
    setSelectedMedicineId(null);
    setStagedMedicine(null);
  }, []);

  return {
    prescription,
    selectedTests,
    selectedLabName,
    setSelectedLabName,
    diagnoses,
    adviceNotes,
    therapyNotes,
    visitNotes,
    setVisitNotes,
    followUpDays,
    setFollowUpDays,

    acceptedIntents,
    acceptedIntentIdSet,
    chosenBrands,
    deliberateBrands,
    searchedAccepts,
    acknowledgedIntents,

    adviceLines,
    interventionPlan,
    exercisePlan,
    reviewAdvice,
    justAdded,
    unreadPrescribedWarnings,

    selectedMedicineId,
    setSelectedMedicineId,
    stagedMedicine,
    setStagedMedicine,
    pendingMedicine,
    setPendingMedicine,
    inspectorMedicine,
    confirmPendingMedicine,
    confirmStagedMedicine,
    medicineBilling,
    medicineBillingPolicy,

    pendingIntervention,
    confirmPendingIntervention,
    cancelPendingIntervention,

    assessmentLines,
    pendingAssessment,
    confirmPendingAssessment,
    cancelPendingAssessment,
    editAssessmentLine,
    addAnotherAssessmentSite,

    handleAcceptIntent,
    handleAcknowledge,
    handleChangeBrand,
    handlePinClinicBrand,
    updateMedicine,
    removeMedicine,
    removeTest,
    removeDiagnosis,
    addFreeDiagnosis,
    addFreeTest,
    addFreeReferral,
    addFreeAdvice,
    removeAdviceLine,
    removeIntervention,
    addAnotherInterventionSite,
    removeAcceptedIntent,
    updateExercise,
    removeExercise,
    duplicateExerciseForSide,

    companionsFor,
    handleAddCompanion,
    dismissCompanion,

    reset,
    restorePlan,
    loadRepeatRx,
  };
}
