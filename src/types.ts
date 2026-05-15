export type Gender = "Female" | "Male" | "Other" | "";

export type Patient = {
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

export type Medicine = {
  id: string;
  name: string;
  category: string;
  use: string;
  match: number;
  composition: string;
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