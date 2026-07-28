// ---------------------------------------------------------------------------
// Body systems — the browse order and the human labels.
//
// Handoff §16, Translator 1: these have NO database equivalent.
// `observables.system` holds the bare key (`ent`, `neuro`); the ordering and
// the readable names live here and only here.
//
// The engine has no concept of a system. This is purely how a ~374-entry
// catalogue is browsed — the same status as `domains`. It exists because a flat
// alphabetical list works at 117 chips and does not work at 374: with no query
// the doctor was shown the first 40 chips alphabetically, which is not a
// catalogue, it is an accident.
// ---------------------------------------------------------------------------

export const SYSTEM_ORDER = [
    "general", "infection", "respiratory", "cardiovascular", "gastrointestinal",
    "neuro", "ent", "eye", "urinary", "gynaecology", "andrology",
    "musculoskeletal", "skin", "endocrine", "allergy", "psychiatry",
    "paediatrics", "history",
] as const;

export const SYSTEM_LABEL: Record<string, string> = {
    general: "General",
    infection: "Infection patterns",
    respiratory: "Respiratory",
    cardiovascular: "Cardiovascular",
    gastrointestinal: "Gastrointestinal",
    neuro: "Neurological",
    ent: "ENT & mouth",
    eye: "Eyes",
    urinary: "Urinary",
    gynaecology: "Gynaecology",
    andrology: "Male reproductive",
    musculoskeletal: "Musculoskeletal",
    skin: "Skin",
    endocrine: "Endocrine",
    allergy: "Allergy",
    psychiatry: "Mental health",
    paediatrics: "Paediatric",
    history: "History & risk",
};

const RANK = new Map<string, number>(SYSTEM_ORDER.map((s, i) => [s as string, i]));

/** Sort key for a system key. Unknown systems sort last, never first. */
export const systemRank = (system: string): number => RANK.get(system) ?? 99;

export const systemLabel = (system: string): string => SYSTEM_LABEL[system] ?? system;

/**
 * The group headings, in reading order. A picker whose section order moves
 * under you is worse than no sections at all, so this is fixed rather than
 * derived from whatever happens to be in the current result set.
 */
export const SYSTEM_LABELS_IN_ORDER: string[] = SYSTEM_ORDER.map((s) => SYSTEM_LABEL[s]);
