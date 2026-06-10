export type Gender = "Male" | "Female" | "Other" | "";

export type Patient = {
  id?: string;
  name: string;
  age: string;
  gender: Gender;
  phone: string;
  address?: string;
};

export type Doctor = {
  id: string;
  name: string;
  specialty: string;
};

export type Vitals = {
  bp: string;
  pulse: string;
  temp: string;
  spo2: string;
  weight: string;
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
};