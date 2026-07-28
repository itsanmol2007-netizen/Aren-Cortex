import { useCallback, useEffect, useRef, useState } from 'react'
import { loadRuleset, type Ruleset } from '@engine'
import { supabase } from '@/lib/supabase'
import type { Specialty } from './measures'
import { loadPreferences } from './decisions'
import { buildPreferenceModel, type PreferenceModel } from './personalize'
import { loadBrandPreferences } from './brandLookup'
import { buildBrandModel, type BrandPreferenceModel } from './brands'
import { loadFrequentMedicines, type FrequentMedicine } from './frequent'

export interface Observable {
  id: number
  slug: string
  label: string
  kind: 'symptom' | 'finding' | 'history'
  domains: Specialty[]
  searchText: string
  /** body-system grouping for the picker. UI only — the engine never reads it. */
  system: string
}

export interface SynapseData {
  ruleset: Ruleset
  /** all pickable input chips, active only */
  observables: Observable[]
  /** signalId -> human label, for explaining "why" */
  signalLabels: Map<string, string>
  /** signals that at least one active rule points at — i.e. can produce output */
  signalsWithRules: Set<string>
  /** observableId -> the signals it emits, for coverage checks */
  signalsByObservable: Map<number, string[]>
  /** this doctor's learned preferences — local to them, never global */
  preferences: PreferenceModel
  /**
   * this doctor's brand habits. Separate model from `preferences` on purpose:
   * picking a brand inside an already-chosen composition is a habit, so it
   * learns ~6x faster (§10b).
   */
  brandPreferences: BrandPreferenceModel
  /**
   * This doctor's most-prescribed medicines. Not a model and not ranked — a
   * flat count, deliberately independent of the consultation. See frequent.ts.
   */
  frequent: FrequentMedicine[]
  loadedAt: Date
}

type Status = 'loading' | 'ready' | 'error'

const RULESET_VERSION = 'mvp-1'

/**
 * Loads the ruleset + reference data once, and exposes reload() so rule-weight
 * edits made directly in Supabase can be pulled in without a page refresh.
 */
export function useSynapse() {
  const [status, setStatus] = useState<Status>('loading')
  const [data, setData] = useState<SynapseData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloading, setReloading] = useState(false)
  const mounted = useRef(true)

  const load = useCallback(async (isReload: boolean) => {
    isReload ? setReloading(true) : setStatus('loading')
    setError(null)
    try {
      const [ruleset, obsRes, sigRes, prefRows, brandPrefRows, frequent] = await Promise.all([
        loadRuleset(supabase, RULESET_VERSION),
        supabase
          .from('observables')
          .select('id, slug, label, kind, domains, search_text, system')
          .eq('is_active', true),
        supabase.from('signals').select('id, label'),
        loadPreferences(),
        loadBrandPreferences(),
        loadFrequentMedicines(),
      ])

      if (obsRes.error) throw new Error(`observables: ${obsRes.error.message}`)
      if (sigRes.error) throw new Error(`signals: ${sigRes.error.message}`)

      const observables: Observable[] = (obsRes.data ?? []).map((o) => ({
        id: o.id,
        slug: o.slug,
        label: o.label,
        kind: o.kind,
        domains: (o.domains ?? []) as Specialty[],
        searchText: o.search_text ?? '',
        system: o.system ?? 'general',
      }))

      const signalLabels = new Map<string, string>()
      for (const s of sigRes.data ?? []) signalLabels.set(s.id, s.label ?? s.id)

      // Rule coverage. A chip can be perfectly wired to a signal and still
      // produce nothing, because no rule points at that signal yet. That is a
      // gap in the knowledge base, not an empty result, and the two must not
      // look the same to whoever is calibrating.
      const signalsWithRules = new Set(ruleset.signalIntentRules.map((r) => r.signalId))
      const signalsByObservable = new Map<number, string[]>()
      for (const os of ruleset.observableSignals) {
        const list = signalsByObservable.get(os.observableId)
        if (list) list.push(os.signalId)
        else signalsByObservable.set(os.observableId, [os.signalId])
      }

      if (!mounted.current) return
      setData({
        ruleset,
        observables,
        signalLabels,
        signalsWithRules,
        signalsByObservable,
        preferences: buildPreferenceModel(prefRows),
        brandPreferences: buildBrandModel(brandPrefRows),
        frequent,
        loadedAt: new Date(),
      })
      setStatus('ready')
    } catch (e) {
      if (!mounted.current) return
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    } finally {
      if (mounted.current) setReloading(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    void load(false)
    return () => {
      mounted.current = false
    }
  }, [load])

  const reload = useCallback(() => load(true), [load])

  return { status, data, error, reloading, reload }
}
