import type { Doctor, Medicine, Patient } from "../types";

export const doctors: Doctor[] = [
  { id: "dr-sharma", name: "Dr. Sharma", specialty: "General Physician" },
  { id: "dr-mehta", name: "Dr. Mehta", specialty: "Internal Medicine" },
];

export const existingPatients: Patient[] = [
  { name: "Anmol Pandey", age: "18", gender: "Male", phone: "9876543210" },
  { name: "Ritika Sharma", age: "32", gender: "Female", phone: "9988776655" },
  { name: "Mohit Verma", age: "45", gender: "Male", phone: "9123456780" },
  { name: "Saira Khan", age: "27", gender: "Female", phone: "9090909090" },
];

export const symptoms = [
  "Fever",
  "Cough",
  "Cold",
  "Sore throat",
  "Headache",
  "Body ache",
  "Acidity",
  "Vomiting",
  "Loose motions",
  "Abdominal pain",
  "Dizziness",
  "Breathlessness",
  "Burning micturition",
  "Back pain",
  "Rash",
  "Fatigue",
];

export const findings = [
  "Abdomen tenderness",
  "Dehydration signs",
  "Wheezing",
  "Throat congestion",
  "Fever on touch",
  "Pallor",
  "Pedal edema",
  "Sinus tenderness",
  "Chest clear",
  "No guarding",
];

export const medicines: Medicine[] = [
  { id: "med-1", name: "Paracetamol 500mg", category: "Analgesic", use: "Antipyretic", match: 92 },
  { id: "med-2", name: "Ibuprofen 400mg", category: "NSAID", use: "Pain relief", match: 87 },
  { id: "med-3", name: "Amoxicillin 500mg", category: "Antibiotic", use: "Broad spectrum", match: 78 },
  { id: "med-4", name: "Cetirizine 10mg", category: "Antihistamine", use: "Allergy", match: 65 },
  { id: "med-5", name: "Ondansetron 4mg", category: "Antiemetic", use: "Vomiting", match: 62 },
  { id: "med-6", name: "Pantoprazole 40mg", category: "PPI", use: "Acidity", match: 58 },
  { id: "med-7", name: "ORS Sachet", category: "Supportive", use: "Hydration", match: 54 },
];

export const tests = ["CBC", "CRP", "ESR", "LFT", "KFT", "HbA1c", "TSH", "Urine routine", "Chest X-ray", "Dengue NS1"];

export const labs = ["No preferred lab", "Apollo Diagnostics", "Thyrocare", "Dr Lal PathLabs", "Local partner lab"];
