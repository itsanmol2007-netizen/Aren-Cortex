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
};

export type Medicine = {
  id: string;
  medicine_id: number;
  composition_ids: number[];        // all compositions (1 or 2+)
  primary_composition_id: number;   // for dosage lookup
  name: string;
  category: string;
  use: string;
  match: number;
  composition: string;
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
};