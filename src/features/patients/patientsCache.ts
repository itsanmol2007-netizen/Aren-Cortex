// ---------------------------------------------------------------------------
// PATIENTS CACHE — instant local caching for Patients Page.
//
// Caches today's patient rows and recent patient rows per doctor in memory
// and localStorage. Allows PatientsPage to load synchronously on frame 1 without
// blank flashes or layout re-structuring, while fetching fresh data in the background.
// ---------------------------------------------------------------------------

const KEY_PREFIX = "aren.patients.cache.v1.";
const TTL_MS = 15 * 60 * 1000; // 15 minutes TTL

interface Entry<T> {
    at: number;
    value: T;
}

const memory = new Map<string, Entry<unknown>>();

function isFresh(entry: Entry<unknown> | undefined): boolean {
    return !!entry && Date.now() - entry.at < TTL_MS;
}

export function getPatientsCache<T>(key: string): T | null {
    const inMemory = memory.get(key);
    if (isFresh(inMemory)) {
        return inMemory!.value as T;
    }

    try {
        const raw = localStorage.getItem(KEY_PREFIX + key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Entry<T>;
        if (parsed && typeof parsed.at === "number" && isFresh(parsed)) {
            memory.set(key, parsed);
            return parsed.value;
        }
    } catch {
        /* fallback */
    }

    return null;
}

export function setPatientsCache<T>(key: string, value: T): void {
    const entry: Entry<T> = { at: Date.now(), value };
    memory.set(key, entry);
    try {
        localStorage.setItem(KEY_PREFIX + key, JSON.stringify(entry));
    } catch {
        /* ignore write errors */
    }
}

export function clearPatientsCache(): void {
    memory.clear();
    try {
        for (const key of Object.keys(localStorage)) {
            if (key.startsWith(KEY_PREFIX)) {
                localStorage.removeItem(key);
            }
        }
    } catch {
        /* ignore */
    }
}
