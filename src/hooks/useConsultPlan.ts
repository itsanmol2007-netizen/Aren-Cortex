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

import { useCallback, useMemo, useRef, useState } from "react";
import type { PrescriptionMedicine } from "../types";
import type { AcceptPayload } from "../features/consult/types";
import type { MedicineDraft } from "../features/consult/MedicineAddSheet";
import { useJustAdded } from "../features/consult/useJustAdded";
import type { Medicine as SynapseBrand } from "../lib/synapse/brands";
import type { CompanionSuggestion } from "../lib/synapse/companions";
import { doseFor, type ExerciseLine, type ExerciseSide } from "../features/consult/exercisePlan";
import type { PersonalizedIntent } from "../lib/synapse/personalize";
import { guardIntent } from "../lib/synapse/engine";
import { resolveProductByName } from "../lib/db/medicines";
import {
  setClinicBrandDefault, clearClinicBrandDefault,
  fetchCompositionBrands, resolvePanelTests,
  type SearchedAccept,
} from "../lib/db/synapse";
import type { SynapseData } from "./useSynapse";
import type { ConsultIntelligence } from "./useConsultIntelligence";
import type { AcceptLedger } from "./useAcceptLedger";

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
    // single-molecule, where the fallback is exactly correct.
    composition_ids: brand.compositionIds ?? [brand.compositionId],
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
    // is what the doctor and the patient actually see on the page.
    composition: brand.compositionLabels?.length
      ? brand.compositionLabels.join(" + ")
      : payload.label,
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
  /** The inverse — see useLongitudinalRecord.ts's doc comment. */
  unconfirmCondition: (intentId: number, stillConfirmedIntentIds: Iterable<number>) => void;
}

export interface ConsultPlan {
  // ── What has been taken ───────────────────────────────────────────────
  prescription: PrescriptionMedicine[];
  selectedTests: string[];
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
  /** what was delivered in the clinic today — see `therapyNotes` in the body */
  therapyLines: string[];
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
  removeAdviceLine: (line: string) => void;
  removeTherapyLine: (line: string) => void;
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
  /** Replace the prescription wholesale, for Repeat Rx. */
  loadRepeatRx: (medicines: PrescriptionMedicine[]) => void;
}

export interface PendingMedicine {
  payload: AcceptPayload;
  compositionId: number;
  brands: SynapseBrand[];
  initialBrand: SynapseBrand | null;
}

export function useConsultPlan({
  data,
  reloadSynapse,
  intelligence,
  ledger,
  hospitalId,
  showToast,
  confirmCondition,
  unconfirmCondition,
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

  /** Impressions the doctor agreed with — the working diagnosis. */
  const [diagnoses, setDiagnoses] = useState<string[]>([]);

  const [stagedMedicine, setStagedMedicine] = useState<PrescriptionMedicine | null>(null);
  const [followUpDays, setFollowUpDays] = useState<number | null>(null);
  const [adviceNotes, setAdviceNotes] = useState<string>("");
  const [visitNotes, setVisitNotes] = useState("");
  const [pendingMedicine, setPendingMedicine] = useState<PendingMedicine | null>(null);

  /**
   * What was DELIVERED in the clinic today — ultrasound, IFT, manual therapy.
   *
   * Its own collection rather than more lines in `adviceNotes`, which is where
   * referrals, advice and exercises all land. That merge is fine for those
   * three: they are all instructions the patient leaves with. A modality is
   * not an instruction, it is a record of something that was done to them, and
   * a physiotherapy session largely CONSISTS of these. Collapsing them into
   * advice would print "Ultrasound 7 min" under the heading "Advice" on a
   * prescription, and would make "what did we do in session 4" unanswerable
   * without a human reading prose.
   *
   * Stored as one newline-joined string for exactly the same reason
   * `adviceNotes` is: it is one text field on the prescription, and the Plan
   * column edits it as lines.
   */
  const [therapyNotes, setTherapyNotes] = useState<string>("");

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

  const appendAdvice = useCallback((line: string) => {
    setAdviceNotes((curr) => {
      const existing = curr.split("\n").map((l) => l.trim()).filter(Boolean);
      if (existing.includes(line)) return curr;
      return [...existing, line].join("\n");
    });
  }, []);

  const appendTherapy = useCallback((line: string) => {
    setTherapyNotes((curr) => {
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
    const compositionIds = brand.compositionIds ?? [brand.compositionId];
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
      // Delivered here, today. See `therapyNotes` above and IntentType in
      // engine.ts for why this does not join the three above.
      case "modality":
        appendTherapy(payload.label);
        break;
      case "finding": {
        // The engine's reading of the chart, taken as the working diagnosis.
        // It lands on the Plan and prints on the Rx — and, the part that was
        // missing until now, it is finally RECORDED as an accept, so the
        // decision log sees which impression the doctor actually agreed with.
        setDiagnoses((curr) =>
          curr.includes(payload.label) ? curr : [...curr, payload.label]
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
            }
            : m
        )
      );
    }, 0);
  }, [pendingMedicine, commitAccept]);

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

  const updateMedicine = useCallback((updated: PrescriptionMedicine) => {
    if (stagedMedicine && stagedMedicine.id === updated.id) {
      setStagedMedicine(updated);
      return;
    }
    setPrescription((curr) => curr.map((m) => (m.id === updated.id ? updated : m)));
  }, [stagedMedicine]);

  const removeMedicine = useCallback((id: string) => {
    const line = prescription.find((m) => m.id === id);
    if (line?.intent_id != null) releaseIntent(line.intent_id);
    setPrescription((curr) => curr.filter((m) => m.id !== id));
    if (selectedMedicineId === id) setSelectedMedicineId(null);
  }, [prescription, selectedMedicineId, releaseIntent]);

  const removeTest = useCallback((label: string) => {
    setSelectedTests((curr) => curr.filter((t) => t !== label));
    for (const [intentId, p] of acceptedIntents) {
      if (p.type === "test" && p.label === label) releaseIntent(intentId);
    }
  }, [acceptedIntents, releaseIntent]);

  const removeDiagnosis = useCallback((label: string) => {
    setDiagnoses((curr) => curr.filter((d) => d !== label));
    // Found first, released after: `unconfirmCondition` needs to know which
    // OTHER finding intents are still confirmed so a chip shared by two
    // confirmed diagnoses is not pulled out from under the one that stays.
    let removedIntentId: number | null = null;
    const stillConfirmed: number[] = [];
    for (const [intentId, p] of acceptedIntents) {
      if (p.type !== "finding") continue;
      if (p.label === label) removedIntentId = intentId;
      else stillConfirmed.push(intentId);
    }
    if (removedIntentId != null) {
      releaseIntent(removedIntentId);
      // The other half of the fix: taking the diagnosis chip off must also
      // take back whatever it silently put on the Case Sheet — see
      // useLongitudinalRecord.ts's doc comment on this function.
      unconfirmCondition(removedIntentId, stillConfirmed);
    }
  }, [acceptedIntents, releaseIntent, unconfirmCondition]);

  /**
   * The Assessment free-text fallback, chart-local half — §4, 2026-08-24.
   * `diagnoses` has always been a plain string array with no catalogue
   * intent behind an entry (see `handleAcceptIntent`'s `finding` case, which
   * pushes `payload.label` the same way) — that is what makes this safe: a
   * free label slots in exactly where a ranked confirm already lands, no new
   * shape, no fake intent id to invent. The Supabase write that lets this
   * term come back for a similar chart next time is a separate, non-fatal
   * call the caller makes alongside this — see `lib/db/synapse.ts`'s
   * `saveDoctorFreeFinding` — because this hook never writes to the
   * database (header rule).
   */
  const addFreeDiagnosis = useCallback((label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setDiagnoses((curr) => (curr.includes(trimmed) ? curr : [...curr, trimmed]));
  }, []);

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

  const removeTherapyLine = useCallback((line: string) => {
    setTherapyNotes((curr) =>
      curr.split("\n").map((l) => l.trim()).filter((l) => l && l !== line).join("\n")
    );
    // Releasing the intent matters as much here as it does for advice: a
    // therapy taken off the plan must stop counting as accepted, or the
    // decision log learns that the doctor wanted something they removed.
    for (const [intentId, p] of acceptedIntents) {
      if (p.type === "modality" && p.label === line) releaseIntent(intentId);
    }
  }, [acceptedIntents, releaseIntent]);

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
   * every one of them is keyed on the LABEL already (removeTest,
   * removeDiagnosis, removeAdviceLine, removeTherapyLine), which is exactly
   * what a ranked/searched row already has in hand. Medicine and exercise are
   * the two exceptions — their plan lines are keyed on their OWN id, not the
   * intent id, so this looks that line up first.
   */
  const removeAcceptedIntent = useCallback(
    (intentId: number, type: AcceptPayload["type"], label: string) => {
      switch (type) {
        case "medicine": {
          const line = prescription.find((m) => m.intent_id === intentId);
          if (line) removeMedicine(line.id);
          else releaseIntent(intentId); // staged but never confirmed in the sheet
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
          const line = exercisePlan.find((l) => l.intentId === intentId && l.side === null);
          if (line) removeExercise(line.id);
          else releaseIntent(intentId);
          break;
        }
        case "modality":
          removeTherapyLine(label);
          break;
        // Not persisted anywhere queryable yet (docs §7, "Accepted impairments
        // are not persisted") — releasing the intent is the whole of "taken
        // back" until that lands.
        case "impairment":
          releaseIntent(intentId);
          break;
      }
    },
    [
      prescription, exercisePlan, removeMedicine, removeTest, removeDiagnosis,
      removeAdviceLine, removeExercise, removeTherapyLine, releaseIntent,
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

  /** Same shape, for what was delivered in the clinic. */
  const therapyLines = useMemo(
    () => therapyNotes.split("\n").map((l) => l.trim()).filter(Boolean),
    [therapyNotes]
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
    setFollowUpDays(null);
    setAdviceNotes("");
    setTherapyNotes("");
    setExercisePlan([]);
    setVisitNotes("");
    resetLedger();
  }, [resetLedger]);

  const loadRepeatRx = useCallback((medicines: PrescriptionMedicine[]) => {
    setPrescription(medicines);
    setSelectedMedicineId(null);
    setStagedMedicine(null);
  }, []);

  return {
    prescription,
    selectedTests,
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
    therapyLines,
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

    handleAcceptIntent,
    handleAcknowledge,
    handleChangeBrand,
    handlePinClinicBrand,
    updateMedicine,
    removeMedicine,
    removeTest,
    removeDiagnosis,
    addFreeDiagnosis,
    removeAdviceLine,
    removeTherapyLine,
    removeAcceptedIntent,
    updateExercise,
    removeExercise,
    duplicateExerciseForSide,

    companionsFor,
    handleAddCompanion,
    dismissCompanion,

    reset,
    loadRepeatRx,
  };
}
