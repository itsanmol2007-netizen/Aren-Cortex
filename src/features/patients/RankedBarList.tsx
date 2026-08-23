// ---------------------------------------------------------------------------
// RANKED BAR LIST — one small "top N, by count, as a bar" component, shared
// between the Patients Overview sidebar (Common Conditions / Complaints /
// Medicines) and the Patient Detail page (Frequent Complaints / Common
// Medicines). Extracted 2026-08-23 rather than left as a second copy inside
// PatientRecord.tsx — rule 19: two places computing the same "rank by count"
// shape independently is a shape that goes out of sync the first time one of
// them is edited and the other isn't.
// ---------------------------------------------------------------------------

/**
 * Generic over the row type — the Patients Overview ranks across many
 * patients' `PatientRecordRow`s, the Patient Detail page ranks across one
 * patient's own `RealVisit`s. Same "count occurrences, sort, top 5" shape
 * either way, so this stays the one place it's computed.
 */
export function deriveRanked<T>(
    rows: T[],
    pick: (r: T) => string[]
): { name: string; count: number }[] {
    const map = new Map<string, number>();
    for (const row of rows) {
        for (const s of pick(row)) map.set(s, (map.get(s) ?? 0) + 1);
    }
    return Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));
}

export function RankedBarList({
    items,
    onSelect,
}: {
    items: { name: string; count: number }[];
    onSelect?: (name: string) => void;
}) {
    if (!items.length) {
        return <span style={{ fontSize: 12, color: "#94a3b8" }}>No data yet.</span>;
    }
    const max = items[0]?.count ?? 1;
    return (
        <div className="prec-complaint-list">
            {items.map((c, i) => {
                const inner = (
                    <>
                        <span className="prec-complaint-rank">{i + 1}</span>
                        <span className="prec-complaint-name">{c.name}</span>
                        <div className="prec-complaint-bar-wrap">
                            <div className="prec-complaint-bar-fill" style={{ width: `${Math.round((c.count / max) * 100)}%` }} />
                        </div>
                        <span className="prec-complaint-count">{c.count}</span>
                    </>
                );
                return onSelect ? (
                    <button key={c.name} type="button" className="prec-complaint-row prec-complaint-row--clickable" onClick={() => onSelect(c.name)}>
                        {inner}
                    </button>
                ) : (
                    <div key={c.name} className="prec-complaint-row">{inner}</div>
                );
            })}
        </div>
    );
}
