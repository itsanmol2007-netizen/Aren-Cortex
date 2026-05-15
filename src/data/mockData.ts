import type { Doctor, Medicine, Patient, TestGroup } from "../types";

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
  "Fever", "Cough", "Cold", "Sore throat", "Headache",
  "Body ache", "Acidity", "Vomiting", "Loose motions",
  "Abdominal pain", "Dizziness", "Breathlessness",
  "Burning micturition", "Back pain", "Rash", "Fatigue",
];

export const findings = [
  "Abdomen tenderness", "Dehydration signs", "Wheezing",
  "Throat congestion", "Fever on touch", "Pallor",
  "Pedal edema", "Sinus tenderness", "Chest clear", "No guarding",
];

export const medicines: Medicine[] = [
  {
    id: "med-1", name: "Paracetamol 500mg",
    category: "Analgesic", use: "Antipyretic", match: 92,
    composition: "Paracetamol 500mg",
  },
  {
    id: "med-2", name: "Ibuprofen 400mg",
    category: "NSAID", use: "Pain relief", match: 87,
    composition: "Ibuprofen 400mg",
  },
  {
    id: "med-3", name: "Amoxicillin 500mg",
    category: "Antibiotic", use: "Broad spectrum", match: 78,
    composition: "Amoxicillin trihydrate 500mg",
  },
  {
    id: "med-4", name: "Cetirizine 10mg",
    category: "Antihistamine", use: "Allergy", match: 65,
    composition: "Cetirizine hydrochloride 10mg",
  },
  {
    id: "med-5", name: "Ondansetron 4mg",
    category: "Antiemetic", use: "Vomiting", match: 62,
    composition: "Ondansetron hydrochloride 4mg",
  },
  {
    id: "med-6", name: "Pantoprazole 40mg",
    category: "PPI", use: "Acidity", match: 58,
    composition: "Pantoprazole sodium sesquihydrate 40mg",
  },
  {
    id: "med-7", name: "ORS Sachet",
    category: "Supportive", use: "Hydration", match: 54,
    composition: "Sodium chloride 2.6g, Glucose 13.5g, Potassium chloride 1.5g",
  },
];

// Flat tests array removed — replaced by testGroups below.
// If App.tsx still imports `tests`, update it to import `testGroups`.

export const testGroups: TestGroup[] = [
  {
    id: "fever",
    label: "Fever Panel",
    icon: "🌡️",
    tests: [
      { name: "CBC" },
      { name: "CRP" },
      { name: "ESR" },
      { name: "Dengue NS1" },
      { name: "Malarial Antigen" },
      { name: "Widal" },
      { name: "Typhidot", rare: true },
      { name: "Leptospira IgM", rare: true },
    ],
  },
  {
    id: "haematology",
    label: "Haematology",
    icon: "🩸",
    tests: [
      { name: "Haemoglobin" },
      { name: "PCV" },
      { name: "Platelet count" },
      { name: "Peripheral smear", rare: true },
      { name: "Reticulocyte count", rare: true },
      { name: "Coagulation profile", rare: true },
    ],
  },
  {
    id: "metabolic",
    label: "Metabolic & Organ",
    icon: "⚗️",
    tests: [
      { name: "LFT" },
      { name: "KFT" },
      { name: "RBS" },
      { name: "HbA1c" },
      { name: "Urine routine" },
      { name: "Urine culture", rare: true },
      { name: "Urine microscopy", rare: true },
      { name: "Lipid profile", rare: true },
    ],
  },
  {
    id: "thyroid",
    label: "Thyroid & Hormonal",
    icon: "🦋",
    tests: [
      { name: "TSH" },
      { name: "T3 T4 TSH" },
      { name: "Vitamin D" },
      { name: "Vitamin B12" },
      { name: "Iron studies", rare: true },
      { name: "Cortisol", rare: true },
      { name: "Prolactin", rare: true },
    ],
  },
  {
    id: "cardiac",
    label: "Cardiac & Imaging",
    icon: "❤️",
    tests: [
      { name: "Chest X-ray" },
      { name: "ECG" },
      { name: "2D Echo", rare: true },
      { name: "Troponin I", rare: true },
      { name: "CPK-MB", rare: true },
      { name: "BNP", rare: true },
    ],
  },
  {
    id: "micro",
    label: "Microbiology & Other",
    icon: "🔬",
    tests: [
      { name: "Blood culture" },
      { name: "Sputum AFB", rare: true },
      { name: "CBNAAT", rare: true },
      { name: "HIV Ag/Ab" },
      { name: "HBsAg" },
      { name: "Anti-HCV", rare: true },
      { name: "RPR/VDRL", rare: true },
    ],
  },
];

export const labs = [
  "No preferred lab",
  "Apollo Diagnostics",
  "Thyrocare",
  "Dr Lal PathLabs",
  "Local partner lab",
];