// Tolerant matching for fast receptionist typing: prefix beats substring beats
// small-typo matches. Distance is classic Levenshtein against each word of the
// term (and its prefix, so partial typing stays fuzzy too); terms and queries
// are short, so the DP cost is negligible.
//
// Extracted from CreateVisitModal (2026-09-03) so the shared ObservablePicker
// and any future intake surface rank the observable catalogue identically.

/** Lower is better; `null` means no match. `name` and `q` must already be lowercased. */
export function matchScore(name: string, q: string): number | null {
    const n = name.toLowerCase();
    if (n.startsWith(q)) return 0;
    if (n.includes(q)) return 1;
    if (q.length < 3) return null;
    const budget = q.length <= 5 ? 1 : 2;
    let best = Infinity;
    for (const w of n.split(/[^a-z0-9]+/)) {
        if (!w) continue;
        best = Math.min(best, editDistance(q, w), editDistance(q, w.slice(0, q.length)));
    }
    return best <= budget ? 2 + best : null;
}

export function editDistance(a: string, b: string): number {
    const row = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        let prev = row[0];
        row[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const tmp = row[j];
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
            prev = tmp;
        }
    }
    return row[b.length];
}

/**
 * Best score for a chip whose searchable strings are `terms` (all lowercased):
 * the label, the catalogue's colloquial `search_text`, and every regional
 * alias. Returns `null` when nothing matches.
 */
export function bestTermScore(terms: string[], q: string): number | null {
    let best: number | null = null;
    for (const term of terms) {
        const sc = matchScore(term, q);
        if (sc !== null && (best === null || sc < best)) best = sc;
    }
    return best;
}
