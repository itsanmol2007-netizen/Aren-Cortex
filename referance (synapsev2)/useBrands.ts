import { useEffect, useRef, useState } from 'react'
import type { Intent } from '@engine'
import { fetchCompositionBrands, type BrandIndex, type CompositionBrands } from './brandLookup'
import type { BrandPreferenceModel } from './brands'

/**
 * The minimum an intent must carry to be resolved to brands. Both a ranked
 * `ScoredIntent` and a plain catalogue `Intent` satisfy it — a medicine the
 * doctor reached by searching needs its brands exactly as much as a ranked one.
 */
export type BrandableIntent = Pick<Intent, 'type' | 'refTable' | 'refId'>

/**
 * Brands for the compositions the engine just ranked.
 *
 * Runs AFTER ranking and cannot influence it — the lookup does not exist until
 * the engine has already decided what to show. Blocked intents are never passed
 * in, so a guarded composition is never resolved to a brand at all.
 *
 * Results are cached for the session. The catalogue is frozen (§0.4) and chips
 * come and go constantly during a consultation, so re-fetching paracetamol
 * every time a chip is toggled is pure waste. The paediatric flag is part of
 * the cache key because it changes the candidate ORDER, not just the set.
 */
export function useBrands(
  intents: BrandableIntent[],
  prefs: BrandPreferenceModel,
  isPediatric: boolean,
): { brands: BrandIndex; loading: boolean; error: string | null } {
  const [brands, setBrands] = useState<BrandIndex>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cache = useRef(new Map<string, CompositionBrands>())
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // The preference model is rebuilt on reload; anything cached under the old
  // one was ordered by it, so it has to go.
  useEffect(() => {
    cache.current.clear()
  }, [prefs])

  const wanted = compositionIdsOf(intents)
  const key = `${isPediatric ? 'p' : 'a'}:${wanted.join(',')}`

  useEffect(() => {
    const ck = (id: number) => `${isPediatric ? 'p' : 'a'}:${id}`
    const missing = wanted.filter((id) => !cache.current.has(ck(id)))

    if (missing.length === 0) {
      setBrands(new Map(wanted.map((id) => [id, cache.current.get(ck(id))!])))
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    fetchCompositionBrands(missing, prefs, isPediatric)
      .then((fetched) => {
        for (const [id, cb] of fetched) cache.current.set(ck(id), cb)
        if (cancelled || !mounted.current) return
        setBrands(
          new Map(
            wanted
              .map((id) => [id, cache.current.get(ck(id))] as const)
              .filter((e): e is [number, CompositionBrands] => e[1] != null),
          ),
        )
        setError(null)
      })
      .catch((e) => {
        if (cancelled || !mounted.current) return
        // A brand lookup failure must not blank the ranking. The composition
        // ranking is the clinical output and stands on its own; the UI falls
        // back to showing it, and says why.
        setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled && mounted.current) setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // `key` is the identity of the request — the array itself is rebuilt on
    // every render and would loop forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, prefs, isPediatric])

  return { brands, loading, error }
}

/** The compositions behind these medicine intents, deduped and stable. */
export function compositionIdsOf(intents: BrandableIntent[]): number[] {
  const ids = new Set<number>()
  for (const i of intents) {
    if (i.type === 'medicine' && i.refTable === 'compositions' && i.refId != null) {
      ids.add(i.refId)
    }
  }
  return [...ids].sort((a, b) => a - b)
}
