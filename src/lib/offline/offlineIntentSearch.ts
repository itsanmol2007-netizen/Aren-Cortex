// ---------------------------------------------------------------------------
// Offline replica of the `search_intents` RPC.
//
// Anmol, 2026-09-14: "The medicines are unfetchable when the internet is not
// there... the whole point of the AWS server and downloading the catalogue
// locally was to fetch the medicine offline. The ranking is working, so the
// medicines sitting local in the database are definitely fine — it's just
// something at the fetching level still trying to fetch from the server."
//
// Exactly right. `searchIntents` went straight to `supabase.rpc` with no
// local path at all, so the one surface a doctor uses to reach a medicine the
// engine did NOT rank — the search box — was the single part of the consult
// that still hard-required a connection. Ranking already reads the cached
// ruleset and the mirrored catalogue; search simply never learned to.
//
// ── WHAT THIS CAN AND CANNOT DO ────────────────────────────────────────────
// The RPC reaches an intent three ways, and only two of them survive offline:
//
//   label   ✓ `ruleset.intents` is in the Synapse cache, labels and all.
//   brand   ✓ `medicinesCatalogue` + `medicineCompositionMap` are mirrored,
//             so a brand name resolves to its molecule and then to the intent
//             that molecule IS.
//   symptom ✗ typing "fever" to reach paracetamol goes through signal LABELS,
//             and `Signal` carries only `id` and `idfWeight` — the labels live
//             in a table that is not mirrored. Rather than fake it from signal
//             ids (slugs, not clinical language), this route is simply absent
//             offline and the UI says so. Overstating coverage is worse than
//             a doctor knowing to type the molecule instead.
//
// Brand matching is PREFIX-only, not substring: `name` is a Dexie index and a
// prefix scan uses it, where a substring scan would pull ~525k catalogue rows
// through the main thread on every keystroke. Prefix is also what the typing
// actually looks like — "croc" for Crocin — so the practical loss is close to
// nothing. Labels are matched by substring because the ruleset is a few
// thousand rows already in memory, where that cost is real but tiny.
// ---------------------------------------------------------------------------

import { localDB } from "./db";
import type { Ruleset, Intent, IntentType } from "../synapse/engine";
import type { IntentSearchHit } from "../db/synapse";

/**
 * The last ruleset this device successfully loaded, live or from cache.
 *
 * A module-level registry rather than a parameter because `searchIntents` is
 * called from twelve places, only some of which have a ruleset in scope, and
 * threading one through all of them to serve an offline fallback would put
 * the offline concern into a dozen signatures that have no other reason to
 * know about it. `useSynapse` publishes here on every successful load —
 * including the from-cache load, which is the one that matters here.
 */
let vocabulary: Ruleset | null = null;

export function rememberIntentVocabulary(ruleset: Ruleset | null): void {
    if (ruleset) vocabulary = ruleset;
}

/** Whether an offline search could return anything at all on this device. */
export function hasIntentVocabulary(): boolean {
    return vocabulary != null;
}

/** Prefix beats word-start beats substring; shorter labels win ties. */
function labelScore(label: string, q: string): number {
    const l = label.toLowerCase();
    const at = l.indexOf(q);
    if (at < 0) return 0;
    if (at === 0) return 1;
    // A match that starts a word reads as intentional; one inside a word is
    // usually incidental ("ace" inside "paracetamol").
    return /\s|[-(/]/.test(l[at - 1]) ? 0.75 : 0.4;
}

export async function offlineSearchIntents(opts: {
    query: string;
    types?: IntentType[];
    limit?: number;
}): Promise<IntentSearchHit[]> {
    const q = opts.query.trim().toLowerCase();
    if (q.length < 2 || !vocabulary) return [];

    const limit = opts.limit ?? 24;
    const wanted = opts.types && opts.types.length > 0 ? new Set(opts.types) : null;
    const allowed = (i: Intent) => !wanted || wanted.has(i.type);

    // Indexed by the molecule an intent IS, for the brand route below.
    const byComposition = new Map<number, Intent>();
    const hits = new Map<number, IntentSearchHit>();

    for (const intent of vocabulary.intents.values()) {
        if (intent.refTable === "compositions" && intent.refId != null && allowed(intent)) {
            byComposition.set(intent.refId, intent);
        }
        if (!allowed(intent)) continue;
        const score = labelScore(intent.label, q);
        if (score === 0) continue;
        hits.set(intent.id, {
            intentId: intent.id,
            type: intent.type,
            label: intent.label,
            refTable: intent.refTable,
            refId: intent.refId,
            matchKind: "label",
            viaLabel: null,
            // Shortest label first within a tier, the same instinct
            // `offlineResolveProductByName` uses to break its own ties.
            score: score + 1 / (intent.label.length + 10),
        });
    }

    // ---- the brand route -------------------------------------------------
    // Only worth walking when a medicine intent could be returned at all.
    if ((!wanted || wanted.has("medicine")) && byComposition.size > 0) {
        try {
            const meds = await localDB.medicinesCatalogue
                .where("name")
                .startsWithIgnoreCase(q)
                .limit(limit * 4)
                .toArray();

            if (meds.length > 0) {
                meds.sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name));
                const mapRows = await localDB.medicineCompositionMap
                    .where("medicineId")
                    .anyOf(meds.map((m) => m.id))
                    .toArray();

                const compsOf = new Map<number, number[]>();
                for (const r of mapRows) {
                    const list = compsOf.get(r.medicineId) ?? [];
                    list.push(r.compositionId);
                    compsOf.set(r.medicineId, list);
                }

                for (const med of meds) {
                    for (const compositionId of compsOf.get(med.id) ?? []) {
                        const intent = byComposition.get(compositionId);
                        // A label hit already names this intent directly and
                        // is the stronger provenance — never demote it to
                        // "reached via a brand".
                        if (!intent || hits.has(intent.id)) continue;
                        hits.set(intent.id, {
                            intentId: intent.id,
                            type: intent.type,
                            label: intent.label,
                            refTable: intent.refTable,
                            refId: intent.refId,
                            matchKind: "brand",
                            viaLabel: med.name,
                            score: 0.9 + 1 / (med.name.length + 10),
                        });
                    }
                }
            }
        } catch (e) {
            // The catalogue mirror being absent or unreadable must not turn a
            // working label search into a failed one.
            console.warn("offline brand search unavailable:", e);
        }
    }

    return [...hits.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
