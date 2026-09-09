// ---------------------------------------------------------------------------
// OVERVIEW CACHE — instant local caching for Doctor Overview landing page.
//
// Caches roster, setup context, date-ranged analytics, and recent patient rows
// in memory (tab lifetime) and localStorage (persisted across reloads).
// Allows the Doctor Overview page to load synchronously on frame 1 without
// flashing empty screens, refetching unchanged clinic rosters, or causing
// late layout pops.
// ---------------------------------------------------------------------------

const KEY_PREFIX = "aren.overview.cache.v1.";
const TTL_MS = 15 * 60 * 1000; // 15 minutes TTL

interface Entry<T> {
  at: number;
  value: T;
}

const memory = new Map<string, Entry<unknown>>();

function isFresh(entry: Entry<unknown> | undefined): boolean {
  return !!entry && Date.now() - entry.at < TTL_MS;
}

export function getOverviewCache<T>(key: string): T | null {
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
    /* localStorage quota / private browsing fallback */
  }

  return null;
}

export function setOverviewCache<T>(key: string, value: T): void {
  const entry: Entry<T> = { at: Date.now(), value };
  memory.set(key, entry);
  try {
    localStorage.setItem(KEY_PREFIX + key, JSON.stringify(entry));
  } catch {
    /* ignore write errors */
  }
}

export function clearOverviewCache(): void {
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
