// ---------------------------------------------------------------------------
// THE CHART — what the doctor has recorded about this patient, and everything
// derived from it.
//
// Extracted 2026-08-15 from App.tsx as Stage 2, step 1 of the split whose
// first stage produced GeneralOpdInputs.tsx / SoapInputs.tsx (atlas §14.19).
// Stage 1 moved the RENDER of the input surface; this moves the STATE behind
// it. The two input components already take exactly what this hook returns,
// which is why this slice went first: it is the one a future specialty needs
// in order to own both its own input file and its own chart state.
//
// The boundary, stated once so it is not re-litigated:
//
//   IN  — the four pieces of chart state (symptoms, their intensities,
//         findings, vitals), the handlers that mutate them, and every value
//         derived from them or from the observables catalogue.
//   OUT — anything downstream of the chart. Ranking is useConsultIntelligence's
//         job, the prescription is useConsultPlan's, and the patient/visit this
//         chart belongs to is useConsultSession's. This hook does not know a
//         patient exists.
//
// It takes the catalogue and returns state. No Supabase import, no fetch, no
// effect — the one write that the chart triggers (the v1 compatibility write
// to visit_symptoms / visit_findings) needs a visitId and therefore lives in
// useConsultSession, not here.
// ---------------------------------------------------------------------------

import { useCallback, useMemo, useState } from "react";
import { systemLabel } from "../lib/synapse/systems";
import type { Observable } from "../lib/db/synapse";
import type { DBFinding } from "../lib/db";
import type { SelectedSymptom, Vitals } from "../types";
import type { CaseSheetEntry } from "../features/consult/CaseSheet";
import type { ChartDraft } from "../lib/consultDraft";
import { clinicalSiteLabel, sameSite, type SiteRef } from "../lib/body/clinicalSite";

export const emptyVitals: Vitals = { bp: "", pulse: "", temp: "", spo2: "", weight: "" };

/**
 * Where a chip came from, when it was not the doctor tapping it.
 *
 * 'confirmed' — the doctor confirmed a condition THIS visit and the map turned
 *               it into an input.
 * 'carried'   — it was confirmed at an earlier visit and follows the patient.
 * 'reception' — the front desk recorded it at intake, before the doctor opened
 *               the visit (Consult, 2026-09-03). A real chip on a real chart —
 *               fully editable, fully removable, ranked exactly like any other
 *               — that simply says who wrote it down. It matters twice: the
 *               doctor should be able to see at a glance what they are being
 *               handed versus what they have added themselves, and
 *               `visit_observations.source` should keep telling the truth
 *               after the doctor's own write re-inserts the row.
 */
export type ChipOrigin = "confirmed" | "carried" | "reception";

export interface ConsultChart {
  // ── The state itself ──────────────────────────────────────────────────
  vitals: Vitals;
  setVitals: React.Dispatch<React.SetStateAction<Vitals>>;
  /** Complaints AND context, as one array — see the split note below. */
  selectedSymptoms: string[];
  selectedSymptomsWithIntensity: SelectedSymptom[];
  selectedFindings: string[];

  // ── The catalogue, indexed ────────────────────────────────────────────
  /** Everything that may legitimately sit in `selectedSymptoms`. */
  reportableLabels: Set<string>;
  observableByLabel: Map<string, number>;
  /** The finding observables in the shape ReviewModal and the past-visit rail expect. */
  findingsAsDb: DBFinding[];

  // ── The chart, as each surface needs it ───────────────────────────────
  symptomChips: string[];
  contextChips: string[];
  onChartSet: Set<string>;
  caseSheetEntries: CaseSheetEntry[];
  /** The chart in the engine's vocabulary. */
  chartObservableIds: number[];

  // ── How long, per complaint ───────────────────────────────────────────
  /**
   * label -> days. Sparse on purpose: only the complaints where a duration
   * changes what the doctor does are ever asked (`features/consult/
   * duration.ts`'s `ASKS_DURATION`), and a skipped question stores nothing
   * rather than storing zero.
   */
  symptomDurations: Map<string, number>;
  /** The same thing keyed the way `visit_observations.duration_days` needs it. */
  observableDurations: Map<number, number>;
  /** Record — or, with `null`, clear — how long one complaint has been going on. */
  setSymptomDuration: (label: string, days: number | null) => void;

  // ── Cardiac History enrichment, Project Pulse Point (2026-09-21) ─────────
  /**
   * label -> free text, for the curated "detail-worthy" history chips (Previous
   * MI, PCI, CABG, pacemaker, ICD — see `conditionDetail.ts`). Sparse like
   * `symptomDurations`: most history chips never earn one.
   */
  onsetNotes: Map<string, string>;
  /** Record — or, with `""`/`null`, clear — a history chip's "since when". */
  setOnsetNote: (label: string, note: string | null) => void;

  // ── Sited findings (2026-09-25) ──────────────────────────────────────────
  /**
   * label -> where it was found, for the local findings (`localizable`):
   * "Joint swelling / effusion" at the right knee. Sparse: a finding with
   * no place yet has no entry, and prints bare exactly as before.
   */
  findingSites: Map<string, SiteRef[]>;
  /** The same keyed the way `visit_observation_sites` needs it. */
  observableSites: Map<number, SiteRef[]>;
  /** Replace where one finding was found; an empty list clears it. */
  setFindingSites: (label: string, sites: SiteRef[]) => void;
  /**
   * The body map's chip: a finding AT a place. Not on the chart → added
   * there; on the chart elsewhere → this place joins; already here → this
   * place goes, and the chip with it once it has no place left.
   */
  toggleObservableAt: (o: Observable, site: SiteRef) => void;
  /**
   * The chart as it is WRITTEN — on the review, the printed prescription
   * and the visit's findings text: "Joint swelling / effusion - Right knee".
   * A finding with no place reads exactly as its label.
   */
  symptomsForRecord: string[];
  findingsForRecord: string[];

  // ── The longitudinal record ───────────────────────────────────────────
  /**
   * How each chip got onto the chart, for the chips that did not get there by
   * the doctor tapping them. Absent from this map means 'doctor'.
   *
   * Two consumers, and both matter: `visit_observations.source`, so a ranking
   * re-derived from the permanent record does not claim the doctor typed
   * something they never touched; and the Case Sheet, which must show a
   * carried-forward chip differently — a doctor has to be able to tell that
   * "Known diabetic" came from a confirmation three visits ago rather than
   * from the patient in front of them, or a wrong confirmation propagates
   * forever and looks fresh every time.
   */
  chipOrigins: Map<string, ChipOrigin>;
  /** The same provenance keyed the way `visit_observations` needs it. */
  observableSources: Map<number, ChipOrigin>;
  /**
   * Put a condition's mapped observable on the chart as context.
   *
   * This is the whole of "confirming a condition reranks the consultation":
   * the label joins `selectedSymptoms`, which `chartObservableIds` derives
   * from, so the engine re-runs in the same frame with no new plumbing, no
   * debounce and no loading state.
   */
  addContextObservable: (label: string, origin: ChipOrigin) => void;
  /**
   * Seed carried-forward conditions at the start of a consult. `onsetNote`
   * rides the same entry when the standing fact has one on record (Previous
   * MI · 2019) — see `conditionDetail.ts`.
   */
  carryForward: (entries: { label: string; onsetNote?: string | null }[]) => void;
  /**
   * Put the front desk's intake onto a fresh chart — the whole opening
   * move. See `useIntakePrefill`.
   *
   * Additive like `carryForward`, never a replace: it runs alongside
   * carried-forward conditions on the same fresh chart, and neither may wipe
   * the other. A label already present keeps whatever provenance it has.
   */
  seedIntake: (entries: {
    label: string;
    kind: "symptom" | "finding" | "history";
    durationDays: number | null;
    /** absent = the doctor's own entry, so it wears no marker */
    origin?: ChipOrigin;
  }[]) => void;

  // ── Pertinent negatives (2026-09-27) ──────────────────────────────────
  /**
   * What was asked about and is ABSENT: "no fever", "no redness", "no
   * recent trauma". A list of its own, never a flag on the chart above, so
   * nothing that reads the chart as present (the engine, Related, the
   * printed complaints) can mistake an absent fever for a fever. Saved as
   * `visit_observations.is_negated`.
   */
  negatedLabels: string[];
  /** The same keyed the way `visit_observations` needs it. */
  negatedObservableIds: number[];
  /** Mark absent (or take back). Marking a present chip absent moves it. */
  setNegated: (o: Observable, on: boolean) => void;
  /** Put a reopened visit's recorded negatives back (additive). */
  seedNegated: (labels: string[]) => void;

  // ── Mutating it ───────────────────────────────────────────────────────
  handleSymptomToggle: (label: string) => void;
  handleFindingToggle: (label: string) => void;
  handleContextToggle: (label: string) => void;
  handleIntensityChange: (label: string, intensity: SelectedSymptom["intensity"]) => void;
  handleObservableToggle: (o: Observable) => void;
  handleCaseSheetRemove: (label: string) => void;

  // ── Lifecycle ─────────────────────────────────────────────────────────
  /** Back to an empty chart. Called when a consult starts, ends or is cancelled. */
  reset: () => void;
  /**
   * Replace the chart wholesale, for Repeat Rx.
   *
   * Deliberately does NOT touch vitals or intensities: a repeated
   * prescription carries the previous visit's complaints forward, not the
   * previous visit's blood pressure.
   */
  replaceChart: (symptoms: string[], findings: string[]) => void;
  /**
   * Reload/crash recovery (lib/consultDraft.ts) — restores the RAW state
   * wholesale, unlike `replaceChart` above: a resume is not a repeat, so
   * vitals, intensities and provenance all come back too, not just the two
   * label lists a fresh Repeat Rx cares about.
   */
  restoreChart: (draft: ChartDraft) => void;
}

/** "Joint swelling / effusion - Right knee, Left knee"; the bare label with no place. */
function sitedText(label: string, sites: SiteRef[] | undefined): string {
  return sites?.length ? `${label} - ${sites.map(clinicalSiteLabel).join(", ")}` : label;
}

/**
 * @param observables the v2 catalogue — symptoms, examination findings and
 *   patient history are one table split by `kind`, not three.
 */
export function useConsultChart(observables: Observable[]): ConsultChart {
  const [vitals, setVitals] = useState<Vitals>(emptyVitals);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [selectedSymptomsWithIntensity, setSelectedSymptomsWithIntensity] =
    useState<SelectedSymptom[]>([]);
  const [selectedFindings, setSelectedFindings] = useState<string[]>([]);
  const [chipOrigins, setChipOrigins] = useState<Map<string, ChipOrigin>>(new Map());
  const [symptomDurations, setSymptomDurations] = useState<Map<string, number>>(new Map());
  const [onsetNotes, setOnsetNotes] = useState<Map<string, string>>(new Map());
  const [findingSites, setFindingSitesMap] = useState<Map<string, SiteRef[]>>(new Map());
  const [negatedLabels, setNegatedLabels] = useState<string[]>([]);

  /** Patient context — pregnancy, comorbidities, exposures. */
  const historyLabels = useMemo(
    () => new Set(observables.filter((o) => o.kind === "history").map((o) => o.label)),
    [observables]
  );

  /** Everything that may legitimately sit in `selectedSymptoms`. */
  const reportableLabels = useMemo(
    () => new Set(
      observables
        .filter((o) => o.kind === "symptom" || o.kind === "history")
        .map((o) => o.label)
    ),
    [observables]
  );

  /** Seen on examination. */
  const findingObservables = useMemo(
    () => observables.filter((o) => o.kind === "finding"),
    [observables]
  );

  const observableByLabel = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of observables) m.set(o.label, o.id);
    return m;
  }, [observables]);

  /** The findings that happen at a place, so a chip can ask "where?". */
  const localizableLabels = useMemo(
    () => new Set(observables.filter((o) => o.localizable).map((o) => o.label)),
    [observables]
  );

  /**
   * ReviewModal and the past-visit rail are typed against `DBFinding`, so the
   * finding observables are presented in that shape rather than rewriting them.
   * Every finding observable is an abnormal sign — the catalogue has no "chest
   * clear", because a normal finding emits no signal and is represented by
   * absence.
   */
  const findingsAsDb: DBFinding[] = useMemo(
    () => findingObservables.map((o) => ({
      id: o.id,
      name: o.label,
      group_name: systemLabel(o.system),
      is_abnormal: true,
    })),
    [findingObservables]
  );

  // ── One chart, two surfaces ─────────────────────────────────────────────
  // `selectedSymptoms` stays the single array it has always been — the engine,
  // the v1 compatibility write and the review modal all read it unchanged. It
  // is only SPLIT for rendering: complaints go to the picker, context to the
  // bar. Showing a chip in both places would let a doctor remove it twice and
  // wonder which surface won.
  const symptomChips = useMemo(
    () => selectedSymptoms.filter((l) => !historyLabels.has(l)),
    [selectedSymptoms, historyLabels]
  );

  const contextChips = useMemo(
    () => selectedSymptoms.filter((l) => historyLabels.has(l)),
    [selectedSymptoms, historyLabels]
  );

  /** Everything on the chart, for the ✓ in a search result or the browse sheet. */
  const onChartSet = useMemo(
    () => new Set([...selectedSymptoms, ...selectedFindings]),
    [selectedSymptoms, selectedFindings]
  );

  /**
   * The same chart as ONE list, each entry carrying its own classification.
   *
   * `CaseSheet` renders these grouped, but the split is a readout: this is one
   * collection with a `kind` on each, not three collections drawn next to each
   * other. Built from the existing three sets rather than replacing them,
   * because `selectedSymptoms` stays the single array the engine, the v1
   * compatibility write and the review modal all read.
   */
  const caseSheetEntries = useMemo<CaseSheetEntry[]>(
    () => [
      ...symptomChips.map((label) => ({
        label,
        kind: "symptom" as const,
        origin: chipOrigins.get(label),
        durationDays: symptomDurations.get(label),
        localizable: localizableLabels.has(label),
        sites: findingSites.get(label),
      })),
      ...selectedFindings.map((label) => ({
        label,
        kind: "finding" as const,
        origin: chipOrigins.get(label),
        localizable: localizableLabels.has(label),
        sites: findingSites.get(label),
      })),
      // Only the history group can carry provenance today — a confirmed
      // condition always maps to a `kind='history'` observable — but the origin
      // is attached generically rather than assumed, so a future mapping to
      // another kind renders honestly instead of silently looking hand-entered.
      ...contextChips.map((label) => ({
        label,
        kind: "history" as const,
        origin: chipOrigins.get(label),
        onsetNote: onsetNotes.get(label),
      })),
    ],
    [symptomChips, selectedFindings, contextChips, chipOrigins, symptomDurations, onsetNotes, localizableLabels, findingSites]
  );

  // The chart, as observable ids. Both panels hold display LABELS; this is the
  // one place they become the engine's vocabulary — and since the catalogue IS
  // the engine's vocabulary now, it is a lookup rather than a translation.
  const chartObservableIds = useMemo(
    () => [...selectedSymptoms, ...selectedFindings]
      .map((label) => observableByLabel.get(label))
      .filter((id): id is number => id !== undefined),
    [selectedSymptoms, selectedFindings, observableByLabel]
  );

  /** The symptoms picker owns the complaints half; context survives its edits. */
  const handleSymptomToggle = useCallback((label: string) => {
    setSelectedSymptoms((curr) =>
      curr.includes(label) ? curr.filter((l) => l !== label) : [...curr, label]
    );
    setSelectedSymptomsWithIntensity((curr) =>
      curr.some((i) => i.name === label)
        ? curr.filter((i) => i.name !== label)
        : [...curr, { name: label, intensity: "moderate" }]
    );
  }, []);

  const handleFindingToggle = useCallback((label: string) => {
    setSelectedFindings((curr) =>
      curr.includes(label) ? curr.filter((l) => l !== label) : [...curr, label]
    );
  }, []);

  const handleIntensityChange = useCallback(
    (label: string, intensity: SelectedSymptom["intensity"]) => {
      setSelectedSymptomsWithIntensity((curr) =>
        curr.some((i) => i.name === label)
          ? curr.map((i) => (i.name === label ? { ...i, intensity } : i))
          : [...curr, { name: label, intensity }]
      );
    },
    []
  );

  const handleContextToggle = useCallback((label: string) => {
    setSelectedSymptoms((curr) =>
      curr.includes(label) ? curr.filter((l) => l !== label) : [...curr, label]
    );
    // Context is never graded mild/moderate/severe. If an intensity row exists
    // for this label — a chart built before the bar existed — drop it.
    setSelectedSymptomsWithIntensity((curr) => curr.filter((s) => s.name !== label));
  }, []);

  // ── The Case Sheet, one input surface ───────────────────────────────────
  // Three handlers above, one entry point below. `CaseSheet` does not know
  // which state an entry belongs in, and must not: the observable's own
  // `kind` is the answer, and it is the same answer the engine already uses.
  // The doctor stops choosing a container, and the routing that used to be
  // their decision becomes a lookup on data that was always there.
  const handleObservableToggle = useCallback((o: Observable) => {
    // Present now, so no longer absent.
    setNegatedLabels((curr) => (curr.includes(o.label) ? curr.filter((l) => l !== o.label) : curr));
    if (o.kind === "finding") handleFindingToggle(o.label);
    else if (o.kind === "history") handleContextToggle(o.label);
    else handleSymptomToggle(o.label);
    // A toggle that takes the chip off takes its place with it; one that
    // puts it on finds no entry to clear. Either way nothing stale survives.
    setFindingSitesMap((curr) => {
      if (!curr.has(o.label)) return curr;
      const next = new Map(curr);
      next.delete(o.label);
      return next;
    });
  }, [handleFindingToggle, handleContextToggle, handleSymptomToggle]);

  /**
   * Remove by label alone, which is all a rendered chip knows.
   *
   * Kept separate from the toggle rather than folded into it. A chip on
   * screen has already been classified, so re-deriving its kind from the
   * catalogue in order to decide how to delete it would be a lookup that can
   * miss. Removing from both sets is unconditional and cannot.
   */
  const handleCaseSheetRemove = useCallback((label: string) => {
    setSelectedSymptoms((curr) => curr.filter((l) => l !== label));
    setSelectedSymptomsWithIntensity((curr) => curr.filter((s) => s.name !== label));
    setSelectedFindings((curr) => curr.filter((l) => l !== label));
    // The chip is gone, so its provenance goes with it. Leaving the origin
    // behind would re-mark the chip as carried-forward if the doctor typed the
    // same label back in by hand, which would be a lie about where it came from.
    setChipOrigins((curr) => {
      if (!curr.has(label)) return curr;
      const next = new Map(curr);
      next.delete(label);
      return next;
    });
    // Same argument for the duration: it qualified a chip that is no longer
    // on the chart, and leaving it behind would silently re-attach "18 days"
    // to a complaint typed back in later that may be nothing of the sort.
    setSymptomDurations((curr) => {
      if (!curr.has(label)) return curr;
      const next = new Map(curr);
      next.delete(label);
      return next;
    });
    // And its place: "Right knee" belonged to that chip, not to whatever
    // chip of the same name is typed back in later.
    setFindingSitesMap((curr) => {
      if (!curr.has(label)) return curr;
      const next = new Map(curr);
      next.delete(label);
      return next;
    });
  }, []);

  // ── Duration ────────────────────────────────────────────────────────────

  const setSymptomDuration = useCallback((label: string, days: number | null) => {
    setSymptomDurations((curr) => {
      if (days === null) {
        if (!curr.has(label)) return curr;
        const next = new Map(curr);
        next.delete(label);
        return next;
      }
      if (curr.get(label) === days) return curr;
      return new Map(curr).set(label, days);
    });
  }, []);

  const setOnsetNote = useCallback((label: string, note: string | null) => {
    setOnsetNotes((curr) => {
      if (!note) {
        if (!curr.has(label)) return curr;
        const next = new Map(curr);
        next.delete(label);
        return next;
      }
      if (curr.get(label) === note) return curr;
      return new Map(curr).set(label, note);
    });
  }, []);

  // ── Sited findings ──────────────────────────────────────────────────────

  const setFindingSites = useCallback((label: string, sites: SiteRef[]) => {
    setFindingSitesMap((curr) => {
      const next = new Map(curr);
      if (sites.length) next.set(label, sites);
      else next.delete(label);
      return next;
    });
  }, []);

  const toggleObservableAt = useCallback((o: Observable, site: SiteRef) => {
    const onChart = selectedSymptoms.includes(o.label) || selectedFindings.includes(o.label);
    const here = findingSites.get(o.label) ?? [];
    if (!onChart) {
      handleObservableToggle(o);
      setFindingSitesMap((curr) => new Map(curr).set(o.label, [site]));
      return;
    }
    if (here.some((s) => sameSite(s, site))) {
      const rest = here.filter((s) => !sameSite(s, site));
      // The last place going takes the chip with it: a body-map chip that
      // un-ticks and leaves "Swelling" behind somewhere else would be a
      // finding nobody can see where it came from.
      if (rest.length) setFindingSitesMap((curr) => new Map(curr).set(o.label, rest));
      else handleObservableToggle(o);
      return;
    }
    // On the chart with no place yet (typed in the case sheet) — this is
    // its place now; with a place, this one joins it.
    setFindingSitesMap((curr) => new Map(curr).set(o.label, [...here, site]));
  }, [selectedSymptoms, selectedFindings, findingSites, handleObservableToggle]);

  const symptomsForRecord = useMemo(
    () => selectedSymptoms.map((l) => sitedText(l, findingSites.get(l))),
    [selectedSymptoms, findingSites]
  );
  const findingsForRecord = useMemo(
    () => selectedFindings.map((l) => sitedText(l, findingSites.get(l))),
    [selectedFindings, findingSites]
  );

  const observableSites = useMemo(() => {
    const m = new Map<number, SiteRef[]>();
    for (const [label, sites] of findingSites) {
      const id = observableByLabel.get(label);
      if (id !== undefined && sites.length) m.set(id, sites);
    }
    return m;
  }, [findingSites, observableByLabel]);

  // ── The longitudinal record ─────────────────────────────────────────────

  const observableSources = useMemo(() => {
    const m = new Map<number, ChipOrigin>();
    for (const [label, origin] of chipOrigins) {
      const id = observableByLabel.get(label);
      if (id !== undefined) m.set(id, origin);
    }
    return m;
  }, [chipOrigins, observableByLabel]);

  const observableDurations = useMemo(() => {
    const m = new Map<number, number>();
    for (const [label, days] of symptomDurations) {
      const id = observableByLabel.get(label);
      if (id !== undefined) m.set(id, days);
    }
    return m;
  }, [symptomDurations, observableByLabel]);

  const addContextObservable = useCallback((label: string, origin: ChipOrigin) => {
    setSelectedSymptoms((curr) => (curr.includes(label) ? curr : [...curr, label]));
    // A chip the doctor had already ticked themselves stays theirs. Confirming
    // a condition that only restates context they entered is not grounds for
    // relabelling their own entry as machine-derived.
    setChipOrigins((curr) => (curr.has(label) ? curr : new Map(curr).set(label, origin)));
  }, []);

  const carryForward = useCallback((entries: { label: string; onsetNote?: string | null }[]) => {
    if (!entries.length) return;
    const labels = entries.map((e) => e.label);
    setSelectedSymptoms((curr) => {
      const missing = labels.filter((l) => !curr.includes(l));
      return missing.length ? [...curr, ...missing] : curr;
    });
    setChipOrigins((curr) => {
      const next = new Map(curr);
      for (const l of labels) if (!next.has(l)) next.set(l, "carried");
      return next;
    });
    setOnsetNotes((curr) => {
      const next = new Map(curr);
      for (const e of entries) if (e.onsetNote && !next.has(e.label)) next.set(e.label, e.onsetNote);
      return next;
    });
  }, []);

  /**
   * The opening state — what the front desk already recorded.
   *
   * Routed by the observable's own `kind`, exactly the way
   * `handleObservableToggle` routes a doctor's own pick: a history chip
   * entered at the desk belongs in the context bar and a symptom in the
   * complaints group, and reception's entry is not a different KIND of fact
   * just because a different person typed it.
   *
   * Each entry keeps the provenance the ROW carried, not a blanket
   * "reception" — the same read is what restores a consult being resumed, and
   * relabelling the doctor's own chips as the front desk's would be a lie the
   * permanent record then keeps. A label already on the chart is left alone: a
   * carried-forward condition reception also happened to tick stays
   * carried-forward, because that is the older and more informative
   * provenance.
   */
  const seedIntake = useCallback((entries: {
    label: string;
    kind: "symptom" | "finding" | "history";
    durationDays: number | null;
    origin?: ChipOrigin;
  }[]) => {
    if (!entries.length) return;
    const reportable = entries.filter((e) => e.kind !== "finding").map((e) => e.label);
    const findings = entries.filter((e) => e.kind === "finding").map((e) => e.label);

    if (reportable.length) {
      setSelectedSymptoms((curr) => {
        const missing = reportable.filter((l) => !curr.includes(l));
        return missing.length ? [...curr, ...missing] : curr;
      });
    }
    if (findings.length) {
      setSelectedFindings((curr) => {
        const missing = findings.filter((l) => !curr.includes(l));
        return missing.length ? [...curr, ...missing] : curr;
      });
    }
    setChipOrigins((curr) => {
      const next = new Map(curr);
      // Each row's OWN provenance, not a blanket "reception". The same read
      // restores a consult the doctor is resuming, and relabelling their own
      // chips as the front desk's would be a lie the record then keeps.
      for (const e of entries) if (e.origin && !next.has(e.label)) next.set(e.label, e.origin);
      return next;
    });
    setSymptomDurations((curr) => {
      const next = new Map(curr);
      for (const e of entries) {
        if (e.durationDays != null && !next.has(e.label)) next.set(e.label, e.durationDays);
      }
      return next;
    });
  }, []);

  const negatedObservableIds = useMemo(
    () => negatedLabels.map((l) => observableByLabel.get(l)).filter((id): id is number => id !== undefined),
    [negatedLabels, observableByLabel],
  );

  const setNegated = useCallback((o: Observable, on: boolean) => {
    if (on) {
      // Absent now: off the chart as present, with its place and duration.
      setSelectedSymptoms((curr) => curr.filter((l) => l !== o.label));
      setSelectedSymptomsWithIntensity((curr) => curr.filter((x) => x.name !== o.label));
      setSelectedFindings((curr) => curr.filter((l) => l !== o.label));
      setFindingSitesMap((curr) => {
        if (!curr.has(o.label)) return curr;
        const next = new Map(curr);
        next.delete(o.label);
        return next;
      });
      setNegatedLabels((curr) => (curr.includes(o.label) ? curr : [...curr, o.label]));
    } else {
      setNegatedLabels((curr) => curr.filter((l) => l !== o.label));
    }
  }, []);

  const seedNegated = useCallback((labels: string[]) => {
    setNegatedLabels((curr) => [...curr, ...labels.filter((l) => !curr.includes(l))]);
  }, []);

  const reset = useCallback(() => {
    setNegatedLabels([]);
    setSelectedSymptomsWithIntensity([]);
    setVitals(emptyVitals);
    setSelectedSymptoms([]);
    setSelectedFindings([]);
    setChipOrigins(new Map());
    setSymptomDurations(new Map());
    setOnsetNotes(new Map());
    setFindingSitesMap(new Map());
  }, []);

  const replaceChart = useCallback((symptoms: string[], findings: string[]) => {
    setSelectedSymptoms(symptoms);
    setSelectedFindings(findings);
    // Repeat Rx rebuilds the chart from a past visit's v1 names, which carry no
    // provenance. Anything previously marked carried-forward is no longer on
    // this chart by that route, so the origins go with the chart they described.
    setChipOrigins(new Map());
    // And with them the durations, for the same reason: a repeated
    // prescription carries the previous visit's complaints forward, not how
    // long they had been going on THEN.
    setSymptomDurations(new Map());
    setOnsetNotes(new Map());
    setFindingSitesMap(new Map());
    setNegatedLabels([]);
  }, []);

  const restoreChart = useCallback((draft: ChartDraft) => {
    setNegatedLabels(draft.negated ?? []);
    setVitals(draft.vitals);
    setSelectedSymptoms(draft.selectedSymptoms);
    setSelectedSymptomsWithIntensity(draft.selectedSymptomsWithIntensity);
    setSelectedFindings(draft.selectedFindings);
    setChipOrigins(new Map(draft.chipOrigins));
    setSymptomDurations(new Map(draft.symptomDurations ?? []));
    setFindingSitesMap(new Map(draft.findingSites ?? []));
  }, []);

  return {
    vitals,
    setVitals,
    selectedSymptoms,
    selectedSymptomsWithIntensity,
    selectedFindings,

    reportableLabels,
    observableByLabel,
    findingsAsDb,

    symptomChips,
    contextChips,
    onChartSet,
    caseSheetEntries,
    chartObservableIds,

    symptomDurations,
    observableDurations,
    setSymptomDuration,
    onsetNotes,
    setOnsetNote,

    findingSites,
    observableSites,
    setFindingSites,
    toggleObservableAt,
    symptomsForRecord,
    findingsForRecord,

    negatedLabels,
    negatedObservableIds,
    setNegated,
    seedNegated,

    chipOrigins,
    observableSources,
    addContextObservable,
    carryForward,
    seedIntake,

    handleSymptomToggle,
    handleFindingToggle,
    handleContextToggle,
    handleIntensityChange,
    handleObservableToggle,
    handleCaseSheetRemove,

    reset,
    replaceChart,
    restoreChart,
  };
}
