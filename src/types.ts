export type Gender = "Female" | "Male" | "Other" | "";

export type Patient = {
  id?: string;        // DB uuid — present after save, absent for fresh draft
  name: string;
  age: string;
  gender: Gender;
  phone: string;
  address?: string;
};

export type Vitals = {
  bp: string;
  pulse: string;
  temp: string;
  spo2: string;
  weight: string;
};

// UI medicine type — used in MedicineSuggestions
export type Medicine = {
  id: string;           // stringified medicine_id from DB e.g. "4521"
  medicine_id: number;  // raw DB integer
  composition_id: number;
  name: string;
  category: string;     // composition_names from ranking engine
  use: string;          // kept for UI compat — will be empty string from DB
  match: number;        // score normalised to 0–100
  composition: string;  // composition_names
};

export type PrescriptionMedicine = Medicine & {
  dosage: string;
  frequency: string;
  duration: string;
  notes: string;
};

export type Doctor = {
  id: string;
  name: string;
  specialty: string;
};

export type TestGroup = {
  id: string;
  label: string;
  icon: string;
  tests: { name: string; rare?: boolean }[];
};