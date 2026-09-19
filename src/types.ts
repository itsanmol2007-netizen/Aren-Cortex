export type Gender = "Male" | "Female" | "Other" | "";

export type Patient = {
  id?: string;
  name: string;
  age: string;
  gender: Gender;
  phone: string;
  address?: string;
  /**
   * ISO yyyy-mm-dd, optional. `age` stays the field everything reads; this is
   * captured only because paediatric growth standards need age in months.
   * See lib/growth/age.ts — the one place it becomes a number.
   */
  dateOfBirth?: string;
};

export type Doctor = {
  id: string;
  name: string;
  specialty: string;
};

/**
 * This visit's measurements, as the doctor typed them.
 *
 * The five original fields stay REQUIRED because `visits.vitals` (jsonb) has
 * been written with exactly those keys since the first release, and the print,
 * the review modal and Front Desk all read them positionally. Everything added
 * since is OPTIONAL, so a vitals object built anywhere else in the codebase
 * still type-checks and an old row still hydrates.
 *
 * The measure key each field becomes is declared once, in
 * `features/consult/measures.ts` — never inferred from the name here.
 */
export type Vitals = {
  bp: string;
  pulse: string;
  temp: string;
  spo2: string;
  /** respiratory rate, breaths/min (RR) */
  respRate?: string;
  /** body weight, kg */
  weight: string;
  /** height, cm */
  height?: string;
  /** A+, O−, … — the one non-numeric measurement, stored as text */
  bloodGroup?: string;
  /** pain visual analogue scale, 0–10 (PAIN_VAS) */
  painVas?: string;
  /** range of motion achieved ÷ expected, % (ROM_PCT) */
  romPct?: string;
  // ── Physiotherapy, added 2026-08-16 ──────────────────────────────────
  // Function and per-joint range, left and right kept apart. See the block
  // comment above these fields in features/consult/measures.ts for why they
  // are separate fields rather than one ROM box with a side attached, and
  // why they carry no measurement rules.
  /** lower extremity functional scale, 0–80 (LEFS) */
  lefs?: string;
  odi?: string;
  quickdash?: string;
  /** cervical rotation, degrees */
  cervicalRotL?: string;
  cervicalRotR?: string;
  /** shoulder flexion, degrees */
  shoulderFlexL?: string;
  shoulderFlexR?: string;
  /** shoulder abduction, degrees */
  shoulderAbdL?: string;
  shoulderAbdR?: string;
  /** hip flexion, degrees */
  hipFlexL?: string;
  hipFlexR?: string;
  /** knee flexion, degrees */
  kneeFlexL?: string;
  kneeFlexR?: string;
  /** knee extension lag — shortfall from straight, degrees. Zero is the goal. */
  kneeExtLagL?: string;
  kneeExtLagR?: string;
  /** ankle dorsiflexion, degrees */
  ankleDorsiL?: string;
  ankleDorsiR?: string;
  /** knee girth, cm */
  kneeGirthL?: string;
  kneeGirthR?: string;
  /** last menstrual period, ISO yyyy-mm-dd. Emitted as LMP_DAYS, not as a date. */
  lmp?: string;
  /** obstetric history as "G/P/L/A" — one control, four measurements, like bp */
  gpla?: string;
  /** fasting blood glucose, mg/dL (GLUCOSE_FASTING) */
  glucoseFasting?: string;
  /** random / post-prandial blood glucose, mg/dL (GLUCOSE_RANDOM) */
  glucoseRandom?: string;
  /** glycated haemoglobin, % (HBA1C) */
  hba1c?: string;
  // ── CBC / hematology panel (added 2026-09-19) ────────────────────────
  // The catalogue had no way to record the basic complete-blood-count
  // values a fever workup actually runs on — Hb, TLC, platelets — despite
  // dengue and malaria (the two most common fever presentations this app
  // already tracks via DENGUE_SUSPICION/MALARIA_CONFIRMED) being diagnosed
  // and MONITORED on exactly these three numbers. See measures.ts for the
  // field definitions and warning bands.
  /** hemoglobin, g/dL */
  hb?: string;
  /** total leukocyte count, /µL */
  tlc?: string;
  /** platelet count, ×10³/µL — the dengue severity marker */
  plateletCount?: string;
  // ── CBC differential + ESR/RBC (added 2026-09-19) ────────────────────
  /** differential leukocyte count, percent of TLC */
  neutrophilsPct?: string;
  lymphocytesPct?: string;
  eosinophilsPct?: string;
  monocytesPct?: string;
  basophilsPct?: string;
  esr?: string;
  rbcCount?: string;
  // ── LFT / RFT / electrolytes / thyroid / lipid / CRP (added 2026-09-19) —
  // "everything measured in blood test, from WBC to other stuff" (Anmol).
  // See measures.ts's "labs" group for the reference ranges each of these
  // warns against.
  totalBilirubin?: string;
  sgot?: string;
  sgpt?: string;
  alkPhosphatase?: string;
  totalProtein?: string;
  albumin?: string;
  bloodUrea?: string;
  creatinine?: string;
  uricAcid?: string;
  sodium?: string;
  potassium?: string;
  tsh?: string;
  totalCholesterol?: string;
  triglycerides?: string;
  hdl?: string;
  ldl?: string;
  crp?: string;
  // ── Ultrasound abdomen — general (added 2026-09-19) ───────────────────
  // "Suppose a doctor orders abdomen ultrasound, now how will he record the
  // findings" (Anmol) — the numeric findings an abdomen USG report actually
  // gives, not the whole report, which stays free text in Findings.
  liverSpan?: string;
  spleenSize?: string;
  gbWallThickness?: string;
  cbdDiameter?: string;
  rightKidneySize?: string;
  leftKidneySize?: string;
  postVoidResidual?: string;
  // ── Obstetric ultrasound biometry (added 2026-09-19) ──────────────────
  /** gestational age as read off the scan, weeks — separate from LMP_DAYS,
   *  which is the calculated age; a doctor records what the report says. */
  gestationalAgeUsg?: string;
  /** estimated fetal weight, grams */
  efw?: string;
  /** amniotic fluid index, cm */
  afi?: string;
  /** biparietal diameter, mm */
  bpd?: string;
  /** femur length, mm */
  fl?: string;
  /** head circumference, mm */
  hc?: string;
  /** abdominal circumference, mm */
  ac?: string;
  /**
   * The fallback for everything the catalogue above still doesn't have —
   * "there should also be a fallback option that if that measurement is not
   * in your thing, we should encourage a doctor to create a new measurement
   * field and then enter its value" (Anmol). Doctor-typed label, value and
   * unit, kept exactly as entered. See consultInput.ts's `CUSTOM_` handling
   * for how this reaches `visit_measurements` and can still be picked up by
   * an admin-authored measurement_rule later, using the same normalised key.
   */
  customMeasurements?: CustomMeasurement[];
};

export interface CustomMeasurement {
  /** stable per-entry id — also the basis of its measure key, see consultInput.ts */
  id: string;
  /** exactly what the doctor typed — never relabelled */
  label: string;
  /** numeric, typed as a string like every other measurement box */
  value: string;
  /** free-typed, may be empty — not every ad hoc measurement has an obvious unit */
  unit: string;
}

export type Medicine = {
  id: string;
  medicine_id: number;
  composition_ids: number[];        // all compositions (1 or 2+), empty for a composition-less add
  /**
   * For dosage lookup. `null` when this medicine has no structured
   * composition behind it at all — added 2026-09-19, when doctrine rule 22
   * ("a brand must attach to an existing composition, never mint one") was
   * relaxed: "you really can't do anything... make the composition
   * optional... let them complete the consult with just medicine name and
   * a freeform for composition" (Anmol). A composition-less medicine has
   * no dosage default to look up, no brand ranking, no personalisation —
   * it is prescribed on the name and `compositionNote` alone.
   */
  primary_composition_id: number | null;
  name: string;
  category: string;
  use: string;
  match: number;
  composition: string;
  /** the doctor's own free-text description, when there is no structured
   *  composition to show instead — e.g. "combination, exact salts unknown". */
  compositionNote?: string | null;
};

export type SelectedSymptom = {
  name: string;
  intensity: "mild" | "moderate" | "severe";
};

export type Test = {
  id: string;
  name: string;
  category: string;
  common?: boolean;
};

export type TestGroup = {
  id: string;
  label: string;
  icon: string;
  tests: Test[];
};

export type PrescriptionMedicine = Medicine & {
  // ── UI display fields ──
  dosage: string;
  frequency: string;
  duration: string;
  notes: string;

  // ── DB persistence fields ──
  dosage_mg: number | null;
  duration_days: number | null;
  route: string;
  instructions: string;
  is_sos: boolean;
  sort_order: number;

  // ── Synapse link ──
  // Which ranked intent this medicine came from, so the decision log can record
  // the brand actually prescribed against the molecule that was ranked. Absent
  // on medicines imported from a past prescription (Repeat Rx), which were
  // never ranked in this consultation and must not be logged as if they were.
  intent_id?: number;
  /** the doctor reached this by searching, outside the ranked list */
  via_search?: boolean;
  /** this was hard-warned and the doctor acknowledged it before prescribing */
  overridden?: boolean;

  // ── Medicine dispensing billing (added 2026-09-19, opt-in) ──
  // Present only when the clinic has `medicine_billing_enabled` on — see
  // lib/db/medicinePricing.ts. `unitPrice` is copied from
  // `clinic_medicine_prices` at the moment the doctor confirms the dose,
  // the same principle `doctors.consultation_fee` -> `visit_payments.fee`
  // already uses: a price change next month must never rewrite a
  // prescription already handed to a patient.
  /** how many units were handed over — tablets, capsules, mL, whatever the
   *  pack is priced in. Absent when medicine billing is off. */
  quantityDispensed?: number | null;
  /** this clinic's price per unit, at the moment this was confirmed */
  unitPrice?: number | null;
};