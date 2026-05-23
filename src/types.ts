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
  composition_id: number;
  name: string;
  category: string;
  use: string;
  match: number;
  composition: string;
};

export type PrescriptionMedicine = Medicine & {
  // ── UI display fields (shown to doctor) ──
  dosage: string;        // e.g. "500mg" — display string
  frequency: string;     // e.g. "Morning and Night" — human label
  duration: string;      // e.g. "5 days" — display string
  notes: string;         // e.g. "After food"

  // ── DB persistence fields (saved to prescription_medicines) ──
  dosage_mg: number | null;       // integer mg value
  duration_days: number | null;   // integer days
  route: string;                  // "oral" | "tablet" | "syrup" | "topical" | etc.
  instructions: string;           // additional instructions text
  is_sos: boolean;                // SOS/as-needed flag
  sort_order: number;             // display order in prescription
};