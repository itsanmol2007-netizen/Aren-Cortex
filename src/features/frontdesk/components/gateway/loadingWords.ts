import type { IntakeChip } from "@/lib/db/synapse";

// The rotating word shown on the "creating your link…" loading state — see
// GatewayQrModal. Deliberately reuses the SAME cached observable catalogue
// the symptom picker already has in memory (useCachedIntakeChips) rather
// than inventing a second hardcoded word list: it's already medical,
// already cached for offline use, and already the vocabulary this
// receptionist's screen is full of all day.
const FALLBACK_WORDS = ["Fever", "Cough", "Headache", "Fatigue", "Nausea"];

export function randomMedicalWord(catalog: IntakeChip[]): string {
    const pool = catalog.length ? catalog.map((c) => c.label) : FALLBACK_WORDS;
    return pool[Math.floor(Math.random() * pool.length)];
}
