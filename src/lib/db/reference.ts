import { supabase } from "../supabase";

// ── CONSTANTS ──────────────────────────────────────────────────────────────────
export const DOCTOR_ID = "5cd330d2-5a48-4098-b865-ed3393e08698";
export const DOCTOR_NAME = "SK Pandey";
export const DOCTOR_SPECIALIZATION = "general";
export const HOSPITAL_ID = "38bd8da3-0dd2-43a5-ad09-2d3194c95ba9";

// ── TYPES ──────────────────────────────────────────────────────────────────────
/**
 * The v1 symptom catalogue. Front Desk's intake picker and existing patient
 * history run on it; Cortex does NOT — it reads `observables`, which is the v2
 * catalogue (handoff §16). This dies with the rest of the v1 tables.
 */
export type DBSymptom = { id: number; name: string };
export type DBFinding = { id: number; name: string; group_name: string; is_abnormal: boolean };

// Frequency slot string → human label
// Format: morning-afternoon-evening-night (each 0 or 1)
export function freqSlotToLabel(slot: string): string {
    const map: Record<string, string> = {
        "1-1-1-1": "Four times a day",
        "1-1-1-0": "Morning, Afternoon & Evening",
        "1-1-0-1": "Morning, Afternoon & Night",
        "1-0-1-1": "Morning, Evening & Night",
        "0-1-1-1": "Afternoon, Evening & Night",
        "1-1-0-0": "Morning and Afternoon",
        "1-0-1-0": "Morning and Evening",
        "1-0-0-1": "Morning and Night",
        "0-1-0-1": "Afternoon and Night",
        "0-0-1-1": "Evening and Night",
        "1-0-0-0": "Once daily (Morning)",
        "0-1-0-0": "Once daily (Afternoon)",
        "0-0-1-0": "Once daily (Evening)",
        "0-0-0-1": "Once daily (Night)",
        "0-1-1-0": "Afternoon and Evening",
        "0-0-0-0": "SOS",
    };
    return map[slot] ?? slot;
}

// Human label → slot string (for saving back)
export function freqLabelToSlot(label: string): string {
    const map: Record<string, string> = {
        "Four times a day": "1-1-1-1",
        "Morning, Afternoon & Evening": "1-1-1-0",
        "Morning, Afternoon & Night": "1-1-0-1",
        "Morning, Evening & Night": "1-0-1-1",
        "Afternoon, Evening & Night": "0-1-1-1",
        "Morning and Afternoon": "1-1-0-0",
        "Morning and Evening": "1-0-1-0",
        "Morning and Night": "1-0-0-1",
        "Afternoon and Night": "0-1-0-1",
        "Evening and Night": "0-0-1-1",
        "Once daily (Morning)": "1-0-0-0",
        "Once daily (Afternoon)": "0-1-0-0",
        "Once daily (Evening)": "0-0-1-0",
        "Once daily (Night)": "0-0-0-1",
        "Afternoon and Evening": "0-1-1-0",
        "SOS": "0-0-0-0",
        // Legacy aliases. "Twice a day" used to map to 1-0-1-0 (morning +
        // EVENING) while every other path treated twice-daily as morning +
        // night — so a prescription written as BD silently printed a different
        // schedule than the one the doctor ticked. BD is morning + night and
        // TDS is morning + afternoon + night; both now agree with the slots.
        "Twice a day": "1-0-0-1",
        "Three times a day": "1-1-0-1",
    };
    return map[label] ?? label;
}

// ── Frequency, as the four dose slots ─────────────────────────────────────────
//
// The slot STRING ("1-0-0-1") is the canonical form — it is what
// `prescription_medicines.frequency` stores. Everything else (the human label,
// the M/A/E/N buttons in the editor) is derived from it here, in one place.
//
// This exists because the medicine editor used to parse the human label with a
// substring test, so "Morning and Night" lit three buttons: M from "MORNING",
// A from "AND", N from "NIGHT". The editor said three doses a day, the
// prescription said two, and nothing reconciled them.

export const FREQ_KEYS = ["M", "A", "E", "N"] as const;

const SLOT_STRING = /^[01]-[01]-[01]-[01]$/;

/** "1-0-0-1" → ["M","N"]. Anything that is not a slot string yields nothing. */
export function slotStringToKeys(slot: string): string[] {
    if (!SLOT_STRING.test(slot)) return [];
    const keys: string[] = [];
    slot.split("-").forEach((bit, i) => {
        if (bit === "1") keys.push(FREQ_KEYS[i]);
    });
    return keys;
}

/** ["M","N"] → "1-0-0-1" */
export function keysToSlotString(keys: string[]): string {
    return FREQ_KEYS.map((k) => (keys.includes(k) ? "1" : "0")).join("-");
}

/** Human label → the slots it lights. */
export function freqLabelToKeys(label: string): string[] {
    return slotStringToKeys(freqLabelToSlot(label));
}

/** Slots → the human label, via the same map the save path uses. */
export function keysToFreqLabel(keys: string[]): string {
    return freqSlotToLabel(keysToSlotString(keys));
}

// All frequency options for the inspector dropdown
export const FREQUENCY_OPTIONS = [
    "Once daily (Morning)",
    "Once daily (Night)",
    "Once daily (Evening)",
    "Morning and Night",
    "Morning and Evening",
    "Morning, Afternoon & Evening",
    "Four times a day",
    "Morning, Afternoon & Night",
    "Afternoon and Evening",
    "Afternoon and Night",
    "Evening and Night",
];

// ── SYMPTOMS ───────────────────────────────────────────────────────────────────
export async function fetchSymptoms(): Promise<DBSymptom[]> {
    const { data, error } = await supabase
        .from("symptoms")
        .select("id, name")
        .order("name");
    if (error) throw new Error(`fetchSymptoms: ${error.message}`);
    return data ?? [];
}

// ── FINDINGS ───────────────────────────────────────────────────────────────────
export async function fetchFindings(): Promise<DBFinding[]> {
    const { data, error } = await supabase
        .from("findings")
        .select("id, name, group_name, is_abnormal")
        .order("group_name");
    if (error) throw new Error(`fetchFindings: ${error.message}`);
    return data ?? [];
}

// Four v1 ranking helpers used to live below this line and are gone:
// fetchProbableFindings (rank_probable_findings), fetchRankedPanels
// (rank_panels), fetchSnapshotSuggestions (clinical_snapshots) and
// fetchDynamicTests (symptom_cluster_test_hints).
//
// All four keyed on v1 symptom/finding ids, which Cortex no longer picks — the
// engine ranks findings and tests as INTENTS from the same rule base, so a
// second parallel ranking path was both dead and misleading. The RPCs and their
// tables still exist in the database for the v1 teardown to remove.
