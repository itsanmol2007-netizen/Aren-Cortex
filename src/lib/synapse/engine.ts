/**
 * Synapse v2 — Engine
 *
 * INPUTS → SIGNALS → ENGINE → INTENTS → RENDER
 *
 * Contains zero medical knowledge. Every medical fact arrives as data
 * in the Ruleset. If you ever need to edit this file to add a specialty,
 * a boundary leaked — fix the boundary.
 */

// ============================================================
// TYPES
// ============================================================

/**
 * `modality` was added 2026-08-16, and it is the only type added since the
 * engine was written. It is what the CLINIC DELIVERS during the session —
 * ultrasound, IFT, TENS, traction, manual therapy, dry needling — as opposed
 * to `exercise`, which is what the patient takes home and does themselves.
 *
 * Filing the two together was considered and rejected. They are different
 * clinical objects: a modality is performed on a date, by a clinician, in the
 * building, and it is what a physiotherapy session actually consists of; an
 * exercise is a prescription the patient carries out for the days in between.
 * They land in different places on the plan, print as different sections, and
 * only one of them is progressed between visits. A single list holding
 * "Ultrasound 7 min" beside "3 sets of 12 at home" would force the doctor to
 * do that separation in their head on every read.
 *
 * The engine itself treats all seven as equal peers and always has — nothing
 * here changes a score, a rank or the shape of a result.
 */
export type IntentType =
    | 'medicine' | 'test' | 'exercise' | 'modality' | 'referral' | 'finding' | 'advice'
    // Added 2026-08-18 (Phase 4), following `modality`'s precedent exactly:
    // a union member and content rows, with nothing in the ranker changed.
    //
    // An impairment and a pathology answer different questions. "Meniscal
    // tear" is what is wrong with the tissue; "reduced knee flexion" is what
    // the patient cannot do about it. A physiotherapist treats the second
    // whether or not the first is ever named, so filing impairments under
    // `finding` would make the doctor separate the two in their head on
    // every read — the same argument that kept `modality` out of `advice`.
    | 'impairment';

export interface Signal {
    id: string;
    idfWeight: number;
}

export interface Intent {
    id: number;
    type: IntentType;
    label: string;
    refTable: string | null;
    refId: number | null;
}

export interface ObservableSignal {
    observableId: number;
    signalId: string;
    weight: number;
}

export interface MeasurementRule {
    measureKey: string;
    minValue: number | null;   // inclusive
    maxValue: number | null;   // exclusive
    signalId: string;
    weight: number;
}

export interface SignalIntentRule {
    signalId: string;
    intentId: number;
    weight: number;
    isSafetyCritical: boolean;
}

/**
 * A guard never hides an intent. It attaches a reason to it.
 *
 *   'warn'      — shown with the reason attached.
 *   'warn_hard' — shown with the reason attached, presented as a red flag, and
 *                 not prescribable until the doctor acknowledges the reason.
 *
 * There is deliberately no hiding action. A hidden option is a decision the
 * system made on the doctor's behalf without telling them, and this system
 * suggests and ranks — it never decides. Guards constrain what the ranking may
 * offer on its own initiative (see the promotion ceiling in
 * `learn_doctor_rules`); they never constrain what the doctor may reach.
 */
export interface Guard {
    signalId: string;
    action: GuardAction;
    targetType: IntentType | null;
    targetClassId: number | null;
    targetIntentId: number | null;
    reason: string;
}

export type GuardAction = 'warn' | 'warn_hard';

/** 'ok' -> no guard fired. See `Guard` for the other two. */
export type GuardStatus = 'ok' | 'warn' | 'warn_hard';

/** Everything the engine needs. Loaded once, passed in. */
export interface Ruleset {
    version: string;
    signals: Map<string, Signal>;
    intents: Map<number, Intent>;
    observableSignals: ObservableSignal[];
    measurementRules: MeasurementRule[];
    signalIntentRules: SignalIntentRule[];
    guards: Guard[];
    /** intentId -> classIds */
    intentClasses: Map<number, number[]>;
}

export interface EngineInput {
    observations: { observableId: number; isNegated: boolean }[];
    measurements: { measureKey: string; value: number }[];
}

export interface ActiveSignal {
    signalId: string;
    /** raw mapping weight, before idf */
    weight: number;
    /** weight * idfWeight — what scoring actually uses */
    strength: number;
}

export interface ScoredIntent {
    intentId: number;
    type: IntentType;
    label: string;
    refTable: string | null;
    refId: number | null;
    rawScore: number;
    score: number;               // rawScore / totalStrength, order-preserving
    isSafetyCritical: boolean;
    status: GuardStatus;
    guardReasons: string[];
    /** which signals contributed, largest first — for explainability */
    contributors: { signalId: string; delta: number }[];
}

export interface EngineResult {
    rulesetVersion: string;
    activeSignals: ActiveSignal[];
    /** every scored intent, ranked. Nothing is withheld — see `Guard`. */
    intents: ScoredIntent[];
    /**
     * The subset of `intents` carrying a hard warning — the SAME objects, not
     * copies, so there is no list to keep in sync and no way to render one
     * without the other. It exists only so the UI can summarise "2 suggestions
     * need your acknowledgment" without re-filtering.
     */
    hardWarned: ScoredIntent[];
}

// ============================================================
// STEP 1 — INPUTS → SIGNALS
// ============================================================

export function resolveSignals(rs: Ruleset, input: EngineInput): ActiveSignal[] {
    // signalId -> best raw weight seen
    const best = new Map<string, number>();

    const bump = (signalId: string, weight: number) => {
        if (!rs.signals.has(signalId)) return;      // unknown signal, ignore
        const prev = best.get(signalId);
        if (prev === undefined || weight > prev) best.set(signalId, weight);
    };

    // observations — negated chips emit nothing
    const picked = new Set(
        input.observations.filter(o => !o.isNegated).map(o => o.observableId),
    );
    for (const os of rs.observableSignals) {
        if (picked.has(os.observableId)) bump(os.signalId, os.weight);
    }

    // measurements — min inclusive, max exclusive
    for (const m of input.measurements) {
        for (const r of rs.measurementRules) {
            if (r.measureKey !== m.measureKey) continue;
            if (r.minValue !== null && m.value < r.minValue) continue;
            if (r.maxValue !== null && m.value >= r.maxValue) continue;
            bump(r.signalId, r.weight);
        }
    }

    return [...best.entries()].map(([signalId, weight]) => ({
        signalId,
        weight,
        strength: weight * (rs.signals.get(signalId)!.idfWeight),
    }));
}

// ============================================================
// STEP 2 — SIGNALS → SCORED INTENTS
// ============================================================

interface Accum {
    raw: number;
    safety: boolean;
    contributors: { signalId: string; delta: number }[];
}

function scoreIntents(rs: Ruleset, active: ActiveSignal[]): Map<number, Accum> {
    const strengthBySignal = new Map(active.map(a => [a.signalId, a.strength]));
    const acc = new Map<number, Accum>();

    for (const rule of rs.signalIntentRules) {
        const strength = strengthBySignal.get(rule.signalId);
        if (strength === undefined) continue;

        const delta = strength * rule.weight;
        let a = acc.get(rule.intentId);
        if (!a) {
            a = { raw: 0, safety: false, contributors: [] };
            acc.set(rule.intentId, a);
        }
        a.raw += delta;
        a.safety = a.safety || rule.isSafetyCritical;
        a.contributors.push({ signalId: rule.signalId, delta });
    }

    return acc;
}

// ============================================================
// STEP 3 — GUARDS
// ============================================================

export interface GuardVerdict {
    status: GuardStatus;
    /** the guards' own reason text, verbatim, in the order they fired */
    reasons: string[];
}

/**
 * The guard verdict for one intent under one set of active signals.
 *
 * EXPORTED, and that matters. Guards apply to anything that can end up in front
 * of a doctor, not only to what the engine ranked: a co-prescription companion
 * and an intent the doctor reached by SEARCH both need the same verdict from
 * the same data. Those two used to re-implement this predicate from
 * `Ruleset.guards`, which made three copies that had to agree.
 *
 * This is not a specialty leak (§0.1 / §10). It reads `rs.guards` and
 * `rs.intentClasses` and nothing else; it still has no idea what any of it
 * means. Only its visibility changed.
 *
 * A hard warning always wins over a soft one, and no verdict ever removes
 * anything — the caller shows the intent either way.
 */
export function guardIntent(
    rs: Ruleset,
    active: ActiveSignal[] | Set<string>,
    intent: Pick<Intent, 'id' | 'type'>,
): GuardVerdict {
    const activeIds = active instanceof Set
        ? active
        : new Set(active.map(a => a.signalId));
    const classIds = rs.intentClasses.get(intent.id) ?? [];

    let hard = false;
    let soft = false;
    const reasons: string[] = [];

    for (const g of rs.guards) {
        if (!activeIds.has(g.signalId)) continue;

        const hits =
            (g.targetType !== null && g.targetType === intent.type) ||
            (g.targetIntentId !== null && g.targetIntentId === intent.id) ||
            (g.targetClassId !== null && classIds.includes(g.targetClassId));

        if (!hits) continue;

        reasons.push(g.reason);
        if (g.action === 'warn_hard') hard = true;
        else soft = true;
    }

    return {
        status: hard ? 'warn_hard' : soft ? 'warn' : 'ok',
        reasons,
    };
}

/**
 * Every catalogued medicine intent, keyed by the composition it is FOR.
 *
 * `rs.intents` is keyed by intent id, and a combination product's other
 * molecules are reached by composition id, not intent id — this is the
 * lookup between the two. Built once per ruleset load and passed in, rather
 * than rebuilt per row: `rs.intents` holds every intent the catalogue knows
 * about (hundreds), not just the handful the engine scored this consult.
 */
export function medicineIntentIndex(rs: Ruleset): Map<number, Intent> {
    const index = new Map<number, Intent>();
    for (const intent of rs.intents.values()) {
        if (intent.type === 'medicine' && intent.refTable === 'compositions' && intent.refId != null) {
            index.set(intent.refId, intent);
        }
    }
    return index;
}

/**
 * The guard verdict for a PRODUCT that carries more than one composition —
 * a combination the engine only ever scored ONE molecule of.
 *
 * `guardIntent` answers for a single, already-ranked intent. Every other
 * molecule a combination carries was never scored and therefore never
 * guarded either, so checking only the intent it was ranked or searched
 * through would let a genuinely contraindicated ingredient reach a doctor
 * silently. Doctrine rule 11: nothing reached by any route may show a
 * weaker warning than the ranked list would have given it directly.
 *
 * Computed by finding the catalogued medicine intent for EVERY composition
 * the product contains (via `index`), running `guardIntent` on each, and
 * keeping the worst status and every reason that fired anywhere in the set.
 * A composition with no catalogued intent contributes nothing — it can only
 * ever make the verdict the same or harder than the strongest single
 * result, never softer.
 */
export function guardCombination(
    rs: Ruleset,
    active: ActiveSignal[] | Set<string>,
    index: Map<number, Intent>,
    compositionIds: number[],
): GuardVerdict {
    const activeIds = active instanceof Set ? active : new Set(active.map(a => a.signalId));

    let hard = false;
    let soft = false;
    const reasons = new Set<string>();

    for (const compositionId of compositionIds) {
        const intent = index.get(compositionId);
        if (!intent) continue;
        const v = guardIntent(rs, activeIds, intent);
        if (v.status === 'warn_hard') hard = true;
        else if (v.status === 'warn') soft = true;
        v.reasons.forEach((r) => reasons.add(r));
    }

    return { status: hard ? 'warn_hard' : soft ? 'warn' : 'ok', reasons: [...reasons] };
}

// ============================================================
// RUN
// ============================================================

export function runEngine(rs: Ruleset, input: EngineInput): EngineResult {
    const activeSignals = resolveSignals(rs, input);
    const acc = scoreIntents(rs, activeSignals);

    // normalisation constant — order-preserving, purely for readability
    const totalStrength = activeSignals.reduce((s, a) => s + Math.abs(a.strength), 0) || 1;

    const all: ScoredIntent[] = [];
    const activeIds = new Set(activeSignals.map(s => s.signalId));

    for (const [intentId, a] of acc) {
        const intent = rs.intents.get(intentId);
        if (!intent) continue;

        const verdict = guardIntent(rs, activeIds, intent);

        all.push({
            intentId,
            type: intent.type,
            label: intent.label,
            refTable: intent.refTable,
            refId: intent.refId,
            rawScore: a.raw,
            score: a.raw / totalStrength,
            isSafetyCritical: a.safety,
            status: verdict.status,
            guardReasons: verdict.reasons,
            contributors: a.contributors.sort((x, y) => y.delta - x.delta),
        });
    }

    const byScore = (x: ScoredIntent, y: ScoredIntent) => y.rawScore - x.rawScore;

    // A guard is not a filter. Everything scored is ranked and returned; what a
    // guard changes is the `status` and the reasons riding on it, never whether
    // the doctor gets to see it.
    const intents = all.filter(i => i.rawScore > 0).sort(byScore);

    return {
        rulesetVersion: rs.version,
        activeSignals: activeSignals.sort((x, y) => y.strength - x.strength),
        intents,
        hardWarned: intents.filter(i => i.status === 'warn_hard'),
    };
}

/** Convenience: split the ranked list by type for the renderers. */
export function groupByType(intents: ScoredIntent[]): Record<IntentType, ScoredIntent[]> {
    const out = {
        medicine: [], test: [], exercise: [], modality: [], referral: [], finding: [], advice: [],
        impairment: [],
    } as Record<IntentType, ScoredIntent[]>;
    for (const i of intents) out[i.type].push(i);
    return out;
}

// ============================================================
// LOADER — the only part that knows Supabase exists
// ============================================================

type Db = { from: (t: string) => any };

export async function loadRuleset(db: Db, version = 'mvp-1', doctorId?: string): Promise<Ruleset> {
    const page = async (table: string, cols: string) => {
        const rows: any[] = [];
        const size = 1000;
        for (let from = 0; ; from += size) {
            const { data, error } = await db.from(table).select(cols).range(from, from + size - 1);
            if (error) throw new Error(`${table}: ${error.message}`);
            rows.push(...(data ?? []));
            if (!data || data.length < size) break;
        }
        return rows;
    };

    const [sig, ints, obsSig, measRules, sirRules, guards, classMap] = await Promise.all([
        page('signals', 'id, idf_weight'),
        // `is_active` must be read and filtered here. Retiring an intent removes
        // it from `search_intents` (which does filter), but the ranking engine
        // reached it through signal_intent_rules regardless — so a retired row
        // that still had rules went on being SUGGESTED while being unsearchable.
        // The old `.filter(x => x)` looked like a guard and filtered nothing.
        page('intents', 'id, type, label, ref_table, ref_id, is_active')
            .then(r => r.filter((x: any) => x?.is_active)),
        page('observable_signals', 'observable_id, signal_id, weight'),
        page('measurement_rules', 'measure_key, min_value, max_value, signal_id, weight, is_active'),
        page('signal_intent_rules', 'signal_id, intent_id, weight, is_safety_critical, is_active'),
        page('intent_guards', 'signal_id, action, target_type, target_class_id, target_intent_id, reason, is_active'),
        page('intent_class_map', 'intent_id, class_id'),
    ]);

    const intentClasses = new Map<number, number[]>();
    for (const m of classMap) {
        const list = intentClasses.get(m.intent_id) ?? [];
        list.push(m.class_id);
        intentClasses.set(m.intent_id, list);
    }

    const signalIntentRules: SignalIntentRule[] = sirRules.filter((r: any) => r.is_active).map((r: any) => ({
        signalId: r.signal_id, intentId: r.intent_id,
        weight: Number(r.weight), isSafetyCritical: r.is_safety_critical,
    }));

    // Per-doctor overlay. Global knowledge is loaded above and is identical for
    // every doctor; this appends one doctor's own learned/manual rules so an
    // intent they repeatedly searched for earns a real clinical score FOR THEM.
    // The result is still a plain Ruleset — runEngine, guards and personalise are
    // unchanged and never learn that this overlay exists. Learned rules are never
    // safety-critical: a doctor's habit cannot mint a red flag.
    //
    // The rows arriving here have already passed the promotion ceiling in
    // `learn_doctor_rules`: an intent guarded in the context it was learned from
    // is never written in the first place. That check lives in SQL, not here,
    // because this loader must stay a loader — but it is the reason an overlay
    // rule can be trusted to be merely unranked, never guarded.
    if (doctorId) {
        const { data, error } = await db.from('doctor_signal_intent_rules')
            .select('signal_id, intent_id, weight, source, is_active')
            .eq('doctor_id', doctorId)
            .eq('is_active', true);
        if (error) throw new Error(`doctor_signal_intent_rules: ${error.message}`);
        for (const r of (data ?? [])) {
            signalIntentRules.push({
                signalId: r.signal_id,
                intentId: r.intent_id,
                // defence in depth: never let an overlay rule exceed the learned cap
                weight: Math.min(Number(r.weight), 0.5),
                isSafetyCritical: false,
            });
        }
    }

    return {
        version,
        signals: new Map(sig.map((s: any) => [s.id, { id: s.id, idfWeight: Number(s.idf_weight) }])),
        intents: new Map(ints.map((i: any) => [i.id, {
            id: i.id, type: i.type, label: i.label, refTable: i.ref_table, refId: i.ref_id,
        }])),
        observableSignals: obsSig.map((o: any) => ({
            observableId: o.observable_id, signalId: o.signal_id, weight: Number(o.weight),
        })),
        measurementRules: measRules.filter((r: any) => r.is_active).map((r: any) => ({
            measureKey: r.measure_key,
            minValue: r.min_value === null ? null : Number(r.min_value),
            maxValue: r.max_value === null ? null : Number(r.max_value),
            signalId: r.signal_id,
            weight: Number(r.weight),
        })),
        signalIntentRules,
        guards: guards.filter((g: any) => g.is_active).map((g: any) => ({
            signalId: g.signal_id, action: g.action,
            targetType: g.target_type, targetClassId: g.target_class_id,
            targetIntentId: g.target_intent_id, reason: g.reason,
        })),
        intentClasses,
    };
}