import { supabase } from "../supabase";

// ── CONSTANTS ──────────────────────────────────────────────────────────────────
export const DOCTOR_ID = "5cd330d2-5a48-4098-b865-ed3393e08698";
export const DOCTOR_NAME = "SK Pandey";
export const DOCTOR_SPECIALIZATION = "general";
export const HOSPITAL_ID = "38bd8da3-0dd2-43a5-ad09-2d3194c95ba9";

// ── TYPES ──────────────────────────────────────────────────────────────────────
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
        "Twice a day": "1-0-1-0",
        "Three times a day": "1-1-0-1",
    };
    return map[label] ?? label;
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

// ── PROBABLE FINDINGS RANKING ─────────────────────────────────────────────────
export interface ProbableFinding {
    finding_id: number;
    finding_name: string;
    group_name: string;
    is_abnormal: boolean;
    score: number;
}

export async function fetchProbableFindings(
    symptomIds: number[]
): Promise<ProbableFinding[]> {
    if (!symptomIds.length) return [];
    const { data, error } = await supabase.rpc(
        "rank_probable_findings",
        { p_symptom_ids: symptomIds }
    );
    if (error) {
        console.error("fetchProbableFindings error:", error);
        return [];
    }
    return (data as ProbableFinding[]) ?? [];
}

// ── RANKED PANELS (TEST RECOMMENDATIONS) ─────────────────────────────────────
export interface RankedPanel {
    panel_id: number;
    panel_name: string;
    panel_tier: number;
    score: number;
    test_ids: number[];
    test_names: string[];
}

export async function fetchRankedPanels(
    symptomIds: number[],
    findingIds: number[]
): Promise<RankedPanel[]> {
    if (!symptomIds.length && !findingIds.length) return [];
    const { data, error } = await supabase.rpc(
        "rank_panels",
        {
            p_symptom_ids: symptomIds,
            p_finding_ids: findingIds,
        }
    );
    if (error) {
        console.error("fetchRankedPanels error:", error);
        return [];
    }
    return (data as RankedPanel[]) ?? [];
}

// ── CLINICAL SNAPSHOTS ────────────────────────────────────────────────────────
export interface ClinicalSnapshot {
    id: number;
    name: string;
    description: string;
    tags: string[];
    symptoms: { id: number; name: string }[];
    findings: {
        id: number;
        name: string;
        group_name: string;
        is_abnormal: boolean;
    }[];
}

export async function fetchSnapshotSuggestions(
    query: string
): Promise<ClinicalSnapshot[]> {
    if (query.length < 2) return [];
    const { data, error } = await supabase
        .from("clinical_snapshots")
        .select(`
      id, name, description, tags,
      snapshot_symptoms (
        symptom_id,
        symptoms ( id, name )
      ),
      snapshot_findings (
        finding_id,
        findings ( id, name, group_name, is_abnormal )
      )
    `)
        .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
        .limit(3);

    if (error) {
        console.error("fetchSnapshotSuggestions error:", error);
        return [];
    }

    return (data ?? []).map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        tags: s.tags ?? [],
        symptoms: (s.snapshot_symptoms ?? []).map((ss: any) => ss.symptoms).filter(Boolean),
        findings: (s.snapshot_findings ?? []).map((sf: any) => sf.findings).filter(Boolean),
    }));
}

// ── SYNAPSE: DYNAMIC TEST HINTS ────────────────────────────────────────────────
export type DynamicTestHint = {
    test_name: string;
    test_group: string;
    clinical_reason: string;
    priority: number;
};

export async function fetchDynamicTests(activeTagIds: number[]): Promise<DynamicTestHint[]> {
    if (!activeTagIds.length) return [];

    const { data, error } = await supabase
        .from("symptom_cluster_test_hints")
        .select("test_name, test_group, clinical_reason, priority")
        .in("trigger_tag_id", activeTagIds)
        .eq("is_global", true)
        .order("priority", { ascending: true })
        .limit(20);

    if (error) {
        console.warn("fetchDynamicTests (non-fatal):", error.message);
        return [];
    }

    const seen = new Map<string, DynamicTestHint>();
    for (const row of (data ?? [])) {
        if (!seen.has(row.test_name)) seen.set(row.test_name, row as DynamicTestHint);
    }

    return Array.from(seen.values());
}