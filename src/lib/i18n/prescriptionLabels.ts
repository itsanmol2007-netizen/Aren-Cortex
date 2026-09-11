// ---------------------------------------------------------------------------
// PRESCRIPTION LOCALIZATION — structured keys, not string translation.
//
// Three modes: "en", "hi" (Devanagari), "hi-Latn" (the same everyday Hindi,
// spelled in Roman letters — extremely common on WhatsApp, for a patient who
// reads Hindi faster than Devanagari). The goal is LOCALIZATION, not literal
// translation: a Hindi prescription should read like it was designed for a
// Hindi-speaking patient from the start, not like an English PDF pushed
// through a translator. Every string below is conversational, everyday
// Hindi — the words a receptionist actually says out loud — never the
// formal/Sanskritised register of a government form.
//
// ── What this file localizes
// The document's own fixed chrome (section headings, the M/A/E/N legend, the
// QR caption, the footer) AND two SYSTEM-GENERATED, STRUCTURED pieces:
//   - the food-timing instruction on a medicine row — a closed 4-value enum
//     (`TimingInstruction` in features/consult/dosing.ts: "After food" |
//     "Before food" | "With food" | "Empty stomach"), never free text
//   - the duration line — always built as `${duration_days} days`
//     (useConsultLifecycle.ts / lib/db/prescriptions.ts / PlanCard.tsx), never
//     doctor-typed
// `localizeTiming`/`localizeDuration` below read the STRUCTURED VALUE
// (duration_days as a number; the timing string matched exactly against the
// 4 known values) and compose the localized sentence from it — never an LLM
// translating whatever text happened to render. An unrecognised timing value
// (should not occur, but a defensive fallback) prints verbatim rather than
// guessing, per the same rule that protects doctor free text.
//
// ── What this file NEVER touches
// Medicine/brand names, generic names, strengths/units, test names, medical
// abbreviations, lab values, numbers/dates/IDs/registration numbers, QR data,
// and every word of doctor-written free text (advice notes, therapy notes).
// Those print byte-for-byte identical in every language.
//
// ── Doctor / clinic names
// Never transliterated on the fly. `doctors.name_hi` / `hospitals.name_hi`
// (migration `20260911_hindi_display_names`) hold a Devanagari name the
// doctor/admin typed and confirmed ONCE, edited from the Clinic page. `NULL`
// falls back to the Latin name — a wrong guess on a person's own name is
// worse than leaving it in English. See `hiName()` below.
// ---------------------------------------------------------------------------

export type RxLanguage = "en" | "hi" | "hi-Latn";

/** `doctors.name_hi` / `hospitals.name_hi` — falls back to the Latin name
 *  outside Hindi, and inside Hindi when nothing has been confirmed yet. */
export function hiName(language: RxLanguage, latin: string, nameHi: string | null | undefined): string {
    if (language === "hi" && nameHi && nameHi.trim()) return nameHi.trim();
    return latin;
}

export interface RxLabels {
    patient: string;
    ageSex: string;
    phone: string;
    date: string;
    ref: string;
    /** "Reg." / "Reg. No." — the label before the registration number. */
    regNo: string;
    measurements: string;
    complaints: string;
    findings: string;
    /** The ℞ section heading — print keeps the symbol, this is the word after it. */
    prescription: string;
    colMedicine: string;
    colDuration: string;
    colInstructions: string;
    freqLegend: string;
    /** Combined one-line legend for the printed page: "● = Take   ○ = Skip". */
    dotLegend: string;
    /** The same two words, split, for a UI that already draws its own dots
     *  (ReviewModal's icon-based legend) and just needs the words. */
    takeLabel: string;
    skipLabel: string;
    investigations: string;
    advice: string;
    therapyPerformed: string;
    homeExercise: string;
    qrCaption: string;
    /** n -> "Follow-up in 5 days" / the localised equivalent. */
    followUp: (days: number) => string;
    /** n -> "5 days" / "5 दिनों तक" / "5 din tak" — the DURATION line, from
     *  the raw `duration_days` number, never from the pre-formatted string. */
    durationDays: (days: number) => string;
    /** The brand line — deliberately authored per language, not a mechanical
     *  translation. Two lines (`\n`-joined); render with `white-space:
     *  pre-line` and give it room, don't collapse it to one line. */
    footerCredit: string;
}

/** The 4 closed values `TimingInstruction` (features/consult/dosing.ts) can
 *  ever hold, mapped to a natural phrase per language. Exact-match only —
 *  anything else is printed as-is (see `localizeTiming`). */
const TIMING: Record<RxLanguage, Record<string, string>> = {
    en: {
        "After food": "After food",
        "Before food": "Before food",
        "With food": "With food",
        "Empty stomach": "Empty stomach",
    },
    hi: {
        "After food": "खाने के बाद",
        "Before food": "खाने से पहले",
        "With food": "खाने के साथ",
        "Empty stomach": "खाली पेट",
    },
    "hi-Latn": {
        "After food": "Khaane ke baad",
        "Before food": "Khaane se pehle",
        "With food": "Khaane ke saath",
        "Empty stomach": "Khaali pet",
    },
};

/** `medicine.instructions` is one of the 4 keys above in practice (a closed
 *  picker on the add sheet, never free text) — but if a value doesn't match
 *  (a future free-text path, an old row), it prints exactly as stored rather
 *  than being mistaken for something else. Same rule that protects doctor
 *  free text, applied defensively. */
export function localizeTiming(instructions: string, language: RxLanguage): string {
    const trimmed = (instructions ?? "").trim();
    if (!trimmed) return trimmed;
    return TIMING[language]?.[trimmed] ?? trimmed;
}

const en: RxLabels = {
    patient: "Patient",
    ageSex: "Age / Sex",
    phone: "Phone",
    date: "Date",
    ref: "Ref",
    regNo: "Reg.",
    measurements: "Measurements",
    complaints: "Presenting Complaints",
    findings: "Clinical Findings",
    prescription: "Prescription",
    colMedicine: "Medicine",
    colDuration: "Duration",
    colInstructions: "Instructions",
    freqLegend: "M = Morning · A = Afternoon · E = Evening · N = Night",
    dotLegend: "● = Take   ○ = Skip",
    takeLabel: "Take",
    skipLabel: "Skip",
    investigations: "Investigations",
    advice: "Advice",
    therapyPerformed: "Therapy Performed",
    homeExercise: "Home Exercise Programme",
    qrCaption: "Scan to verify this prescription",
    followUp: (n) => `Follow-up in ${n} day${n === 1 ? "" : "s"}`,
    durationDays: (n) => `${n} day${n === 1 ? "" : "s"}`,
    footerCredit: "Generated with care, through Arenode",
};

// Everyday spoken Hindi, Devanagari script — the words a clinic receptionist
// actually says, never the formal/Sanskritised register.
const hi: RxLabels = {
    patient: "मरीज़",
    ageSex: "उम्र / लिंग",
    phone: "फ़ोन",
    date: "तारीख़",
    ref: "रेफ़",
    regNo: "रजि. नं.",
    measurements: "रीडिंग",
    complaints: "शिकायत",
    findings: "जांच में क्या मिला",
    prescription: "पर्ची",
    colMedicine: "दवाई",
    colDuration: "कितने दिन",
    colInstructions: "कैसे लें",
    freqLegend: "सुबह (M) · दोपहर (A) · शाम (E) · रात (N)",
    dotLegend: "● = लेनी है   ○ = मत लें",
    takeLabel: "लेनी है",
    skipLabel: "मत लें",
    investigations: "जांच",
    advice: "सलाह",
    therapyPerformed: "आज की थेरेपी",
    homeExercise: "घर पर करने वाली एक्सरसाइज़",
    qrCaption: "पर्ची चेक करने के लिए स्कैन करें",
    followUp: (n) => `${n} दिन बाद दोबारा दिखाएं`,
    durationDays: (n) => (n === 1 ? "1 दिन तक" : `${n} दिनों तक`),
    // Deliberately authored brand copy — not a translation of the English
    // line. Anmol's own words; keep this exact text, don't "improve" it into
    // a generic "care" phrase.
    footerCredit: "हर जीवन ख़ास है।\nहम बस उसे सँभालने का ज़रिया हैं। ~ Arenode",
};

// Same everyday Hindi, spelled in Roman letters — for a patient who reads
// Hindi faster than Devanagari. Common English loanwords ("Patient", "Date",
// "Advice") stay as a Hinglish speaker would actually write them; content
// words get the Hindi word, transliterated, not the English one.
const hiLatn: RxLabels = {
    patient: "Patient",
    ageSex: "Age / Gender",
    phone: "Phone",
    date: "Date",
    ref: "Ref",
    regNo: "Reg. No.",
    measurements: "Reading",
    complaints: "Shikayat",
    findings: "Jaanch mein kya mila",
    prescription: "Parchi",
    colMedicine: "Dawai",
    colDuration: "Kitne din",
    colInstructions: "Kaise lein",
    freqLegend: "Subah (M) · Dopahar (A) · Shaam (E) · Raat (N)",
    dotLegend: "● = Leni hai   ○ = Mat lein",
    takeLabel: "Leni hai",
    skipLabel: "Mat lein",
    investigations: "Jaanch",
    advice: "Advice",
    therapyPerformed: "Aaj ki Therapy",
    homeExercise: "Ghar par karne wali Exercise",
    qrCaption: "Parchi check karne ke liye scan karein",
    followUp: (n) => `${n} din baad dobara dikhayein`,
    durationDays: (n) => `${n} din tak`,
    // The same sentiment as the Hindi line, in the same words — Hinglish IS
    // that line spoken in Roman letters, not a separate composition.
    footerCredit: "Har zindagi khaas hai.\nHum bas use sambhalne ka zariya hain. ~ Arenode",
};

const ALL: Record<RxLanguage, RxLabels> = { en, hi, "hi-Latn": hiLatn };

export function rxLabels(language: RxLanguage | null | undefined): RxLabels {
    return ALL[language ?? "en"] ?? en;
}

export const RX_LANGUAGE_OPTIONS: { value: RxLanguage; label: string }[] = [
    { value: "en", label: "English" },
    { value: "hi", label: "हिंदी" },
    { value: "hi-Latn", label: "Hinglish" },
];

// ── Measurement labels (vitals row) ────────────────────────────────────────
// Another STRUCTURED, system-generated piece, same rule as timing/duration:
// `MEASURE_FIELDS` (features/consult/measures.ts) is a closed 34-entry
// catalogue keyed by `key`, each already carrying its own English `rxLabel`
// ("Temp", "BP", "FBS"…) — never doctor free text. Keyed on `key`, not the
// English label, so this can't silently mismatch if the English wording
// changes. A handful of validated clinical instrument/scale names (SpO2,
// HbA1c, ROM%, LEFS, ODI, QuickDASH, G-P-L-A) are proper names, not English
// words, and stay identical in every language — translating "QuickDASH"
// would misname the instrument, not localize it.
const MEASURE_LABELS_HI: Partial<Record<string, string>> = {
    bp: "बीपी",
    pulse: "पल्स",
    respRate: "सांस दर",
    temp: "तापमान",
    weight: "वज़न",
    height: "लंबाई",
    bloodGroup: "ब्लड ग्रुप",
    glucoseFasting: "फास्टिंग शुगर",
    glucoseRandom: "रैंडम शुगर",
    painVas: "दर्द",
    cervicalRotL: "गर्दन घुमाव (बाएं)",
    cervicalRotR: "गर्दन घुमाव (दाएं)",
    shoulderFlexL: "कंधा मोड़ (बाएं)",
    shoulderFlexR: "कंधा मोड़ (दाएं)",
    shoulderAbdL: "कंधा फैलाव (बाएं)",
    shoulderAbdR: "कंधा फैलाव (दाएं)",
    hipFlexL: "कूल्हा मोड़ (बाएं)",
    hipFlexR: "कूल्हा मोड़ (दाएं)",
    kneeFlexL: "घुटना मोड़ (बाएं)",
    kneeFlexR: "घुटना मोड़ (दाएं)",
    kneeExtLagL: "घुटना सीधा न होना (बाएं)",
    kneeExtLagR: "घुटना सीधा न होना (दाएं)",
    ankleDorsiL: "टखना मोड़ (बाएं)",
    ankleDorsiR: "टखना मोड़ (दाएं)",
    kneeGirthL: "घुटने की मोटाई (बाएं)",
    kneeGirthR: "घुटने की मोटाई (दाएं)",
    lmp: "आख़िरी माहवारी",
};

const MEASURE_LABELS_HI_LATN: Partial<Record<string, string>> = {
    bp: "BP",
    pulse: "Pulse",
    respRate: "Saans Rate",
    temp: "Tapman",
    weight: "Wazan",
    height: "Lambai",
    bloodGroup: "Blood Group",
    glucoseFasting: "Fasting Sugar",
    glucoseRandom: "Random Sugar",
    painVas: "Dard",
    cervicalRotL: "Gardan Ghumav (Left)",
    cervicalRotR: "Gardan Ghumav (Right)",
    shoulderFlexL: "Kandha Mod (Left)",
    shoulderFlexR: "Kandha Mod (Right)",
    shoulderAbdL: "Kandha Failav (Left)",
    shoulderAbdR: "Kandha Failav (Right)",
    hipFlexL: "Kulha Mod (Left)",
    hipFlexR: "Kulha Mod (Right)",
    kneeFlexL: "Ghutna Mod (Left)",
    kneeFlexR: "Ghutna Mod (Right)",
    kneeExtLagL: "Ghutna Seedha Na Hona (Left)",
    kneeExtLagR: "Ghutna Seedha Na Hona (Right)",
    ankleDorsiL: "Takhna Mod (Left)",
    ankleDorsiR: "Takhna Mod (Right)",
    kneeGirthL: "Ghutne ki Motai (Left)",
    kneeGirthR: "Ghutne ki Motai (Right)",
    lmp: "Aakhri Mahwari",
};

/** `f.rxLabel` (English) unless this key has a localized entry for the
 *  language — spo2/hba1c/romPct/lefs/odi/quickdash/gpla have none on purpose
 *  (see the block comment above) and always fall through to the English
 *  instrument name, in every language. */
export function localizeMeasureLabel(key: string, rxLabelEn: string, language: RxLanguage): string {
    if (language === "hi") return MEASURE_LABELS_HI[key] ?? rxLabelEn;
    if (language === "hi-Latn") return MEASURE_LABELS_HI_LATN[key] ?? rxLabelEn;
    return rxLabelEn;
}
