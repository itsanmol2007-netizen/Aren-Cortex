import type { Test } from "../types";

export const TEST_CATALOGUE: Test[] = [
    // Blood
    { id: "cbc", name: "Complete Blood Count (CBC)", category: "Blood", common: true },
    { id: "esr", name: "ESR", category: "Blood", common: true },
    { id: "bs-f", name: "Blood Sugar Fasting", category: "Blood", common: true },
    { id: "bs-pp", name: "Blood Sugar PP", category: "Blood", common: true },
    { id: "bs-r", name: "Blood Sugar Random", category: "Blood", common: true },
    { id: "hba1c", name: "HbA1c", category: "Blood", common: true },
    { id: "lft", name: "Liver Function Test (LFT)", category: "Blood", common: true },
    { id: "rft", name: "Renal Function Test (RFT)", category: "Blood", common: true },
    { id: "tsh", name: "TSH (Thyroid)", category: "Blood", common: true },
    { id: "t3-t4", name: "T3 / T4", category: "Blood" },
    { id: "lipid", name: "Lipid Profile", category: "Blood", common: true },
    { id: "uric-acid", name: "Uric Acid", category: "Blood" },
    { id: "crp", name: "CRP (C-Reactive Protein)", category: "Blood" },
    { id: "dengue-ns1", name: "Dengue NS1 Antigen", category: "Blood" },
    { id: "dengue-ab", name: "Dengue IgM / IgG", category: "Blood" },
    { id: "malaria", name: "Malaria Antigen / Smear", category: "Blood" },
    { id: "typhoid-widal", name: "Widal Test (Typhoid)", category: "Blood" },
    { id: "typhoid-card", name: "Typhoid Card Test", category: "Blood" },
    { id: "hiv", name: "HIV Screening", category: "Blood" },
    { id: "hbsag", name: "HBsAg (Hepatitis B)", category: "Blood" },
    { id: "anti-hcv", name: "Anti-HCV (Hepatitis C)", category: "Blood" },
    { id: "serum-iron", name: "Serum Iron / TIBC", category: "Blood" },
    { id: "ferritin", name: "Serum Ferritin", category: "Blood" },
    { id: "vit-d", name: "Vitamin D (25-OH)", category: "Blood" },
    { id: "vit-b12", name: "Vitamin B12", category: "Blood" },
    { id: "calcium", name: "Serum Calcium", category: "Blood" },
    { id: "electrolytes", name: "Serum Electrolytes", category: "Blood" },
    { id: "pt-inr", name: "PT / INR", category: "Blood" },

    // Urine
    { id: "urine-re", name: "Urine Routine & Microscopy", category: "Urine", common: true },
    { id: "urine-culture", name: "Urine Culture & Sensitivity", category: "Urine", common: true },
    { id: "urine-preg", name: "Urine Pregnancy Test (UPT)", category: "Urine" },
    { id: "urine-microalb", name: "Urine Microalbumin", category: "Urine" },

    // Stool
    { id: "stool-re", name: "Stool Routine & Microscopy", category: "Stool", common: true },
    { id: "stool-culture", name: "Stool Culture", category: "Stool" },
    { id: "stool-occult", name: "Stool Occult Blood", category: "Stool" },

    // Imaging
    { id: "xray-chest", name: "X-Ray Chest (PA)", category: "Imaging", common: true },
    { id: "xray-abdomen", name: "X-Ray Abdomen", category: "Imaging" },
    { id: "usg-abdomen", name: "USG Abdomen & Pelvis", category: "Imaging", common: true },
    { id: "usg-kub", name: "USG KUB", category: "Imaging" },
    { id: "usg-thyroid", name: "USG Thyroid", category: "Imaging" },
    { id: "ecg", name: "ECG (12-lead)", category: "Imaging", common: true },
    { id: "echo", name: "2D Echo", category: "Imaging" },
    { id: "ct-brain", name: "CT Scan Brain", category: "Imaging" },
    { id: "mri-brain", name: "MRI Brain", category: "Imaging" },
    { id: "ct-abdomen", name: "CT Abdomen", category: "Imaging" },

    // Swab / Culture
    { id: "throat-swab", name: "Throat Swab Culture", category: "Swab & Culture" },
    { id: "sputum-afb", name: "Sputum AFB (TB)", category: "Swab & Culture", common: true },
    { id: "sputum-culture", name: "Sputum Culture & Sensitivity", category: "Swab & Culture" },
    { id: "blood-culture", name: "Blood Culture & Sensitivity", category: "Swab & Culture" },
    { id: "wound-swab", name: "Wound Swab Culture", category: "Swab & Culture" },

    // Cardiac
    { id: "trop-i", name: "Troponin I", category: "Cardiac" },
    { id: "trop-t", name: "Troponin T", category: "Cardiac" },
    { id: "cpk-mb", name: "CPK-MB", category: "Cardiac" },
    { id: "bnp", name: "BNP / NT-proBNP", category: "Cardiac" },

    // Hormones
    { id: "fsh-lh", name: "FSH / LH", category: "Hormones" },
    { id: "prolactin", name: "Prolactin", category: "Hormones" },
    { id: "testosterone", name: "Testosterone", category: "Hormones" },
    { id: "cortisol", name: "Cortisol (Morning)", category: "Hormones" },
    { id: "insulin-fasting", name: "Insulin Fasting", category: "Hormones" },
];

export const COMMON_TESTS = TEST_CATALOGUE.filter((t) => t.common);

export const PREFERRED_LABS = [
    "Dr. Lal PathLabs",
    "SRL Diagnostics",
    "Thyrocare",
    "Metropolis",
    "NIPT / Local Lab",
];