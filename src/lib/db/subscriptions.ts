// ---------------------------------------------------------------------------
// SUBSCRIPTIONS — Plan → Subscription → Clinic.
//
// The read side of the subscription foundation (migration
// `subscription_foundation`, 2026-08-31). Settings needs four facts today —
// plan name, billing interval, status, renewal date — and this is deliberately
// the whole of what it asks for.
//
// ── Nothing about pricing is hard-coded here, on purpose
//
// The plan's NAME, its interval, its price, its trial length and its
// per-feature entitlements are all rows in the database. "Polaris" is a
// placeholder an Admin can rename without touching this file, so nothing in
// the app may branch on it. The one thing code may reference is `plan.code`
// (a stable machine key like `solo`), and even that only for entitlement
// checks, never for display.
//
// ── A missing subscription is a real state, not an error
//
// Most hospital rows have no subscription yet (Admin assigns them). Every
// reader gets `null` and renders a truthful "no subscription on file" rather
// than inventing a plan — the same rule `prescription_settings` already
// follows for an un-configured clinic.
//
// ── Entitlements
//
// `limit_value: null` means UNLIMITED and must be read that way, never
// coerced to 0. The base plan carries no artificial patient or consult
// ceiling, so those rows are genuinely null. Nothing in the app enforces an
// entitlement today; `hasEntitlement` exists so the first feature that needs
// to gate on one has a single correct place to ask.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";

/** Free text, not a TS enum — Admin can introduce a status without a deploy. */
export type SubscriptionStatus =
    | "trialing" | "active" | "past_due" | "cancelled" | "expired" | (string & {});

export interface PlanEntitlement {
    featureKey: string;
    enabled: boolean;
    /** `null` means unlimited. Never treat it as zero. */
    limitValue: number | null;
}

export interface Plan {
    id: string;
    /** Stable machine key (`solo`). The ONLY plan field code may branch on. */
    code: string;
    /** Display name. Renameable from Admin — never assert on it. */
    name: string;
    description: string | null;
    billingInterval: string;
    /** `null` while pricing is undecided — which is not the same as free. */
    priceAmount: number | null;
    priceCurrency: string;
    trialDays: number;
}

export interface ClinicSubscription {
    id: string;
    status: SubscriptionStatus;
    startedAt: string;
    currentPeriodEnd: string | null;
    trialEndsAt: string | null;
    cancelAtPeriodEnd: boolean;
    isFounding: boolean;
    plan: Plan;
    entitlements: PlanEntitlement[];
}

/** Shape of the nested select below — Supabase types the join as an object. */
interface PlanRow {
    id: string;
    code: string;
    name: string;
    description: string | null;
    billing_interval: string;
    price_amount: number | string | null;
    price_currency: string;
    trial_days: number;
    plan_entitlements: {
        feature_key: string;
        enabled: boolean;
        limit_value: number | null;
    }[] | null;
}

interface SubscriptionRow {
    id: string;
    status: string;
    started_at: string;
    current_period_end: string | null;
    trial_ends_at: string | null;
    cancel_at_period_end: boolean;
    is_founding: boolean;
    plans: PlanRow | null;
}

/**
 * The clinic's live subscription, or `null` when it has none.
 *
 * "Live" is `active` or `trialing` — the same pair the partial unique index
 * on `subscriptions` enforces one of, so this can never legitimately match
 * two rows. Cancelled and expired rows stay in the table as history and are
 * deliberately not returned: a clinic whose subscription lapsed should read
 * as having none, not as having a cancelled one.
 */
export async function fetchClinicSubscription(hospitalId: string): Promise<ClinicSubscription | null> {
    const { data, error } = await supabase
        .from("subscriptions")
        .select(`
            id, status, started_at, current_period_end, trial_ends_at,
            cancel_at_period_end, is_founding,
            plans (
                id, code, name, description, billing_interval,
                price_amount, price_currency, trial_days,
                plan_entitlements ( feature_key, enabled, limit_value )
            )
        `)
        .eq("hospital_id", hospitalId)
        .in("status", ["active", "trialing"])
        .maybeSingle<SubscriptionRow>();

    if (error) throw new Error(`fetchClinicSubscription: ${error.message}`);
    if (!data || !data.plans) return null;

    const plan = data.plans;
    return {
        id: data.id,
        status: data.status,
        startedAt: data.started_at,
        currentPeriodEnd: data.current_period_end,
        trialEndsAt: data.trial_ends_at,
        cancelAtPeriodEnd: data.cancel_at_period_end,
        isFounding: data.is_founding,
        plan: {
            id: plan.id,
            code: plan.code,
            name: plan.name,
            description: plan.description,
            billingInterval: plan.billing_interval,
            // `numeric` comes back as a string from PostgREST; null stays null
            // because "no price set" is a different fact from "free".
            priceAmount: plan.price_amount == null ? null : Number(plan.price_amount),
            priceCurrency: plan.price_currency,
            trialDays: plan.trial_days,
        },
        entitlements: (plan.plan_entitlements ?? []).map((e) => ({
            featureKey: e.feature_key,
            enabled: e.enabled,
            limitValue: e.limit_value,
        })),
    };
}

/**
 * Is a capability switched on for this subscription?
 *
 * The single place a feature gate should ask, so entitlement semantics
 * (including "no subscription yet") live in one function rather than being
 * re-derived at each call site. No feature gates on this today — it exists so
 * the first one that does has somewhere correct to go.
 */
export function hasEntitlement(
    subscription: ClinicSubscription | null,
    featureKey: string
): boolean {
    if (!subscription) return false;
    return subscription.entitlements.some((e) => e.featureKey === featureKey && e.enabled);
}

/** The seat/usage ceiling for a capability. `null` means unlimited — which is
 *  both the base plan's real answer and the reason this returns `number |
 *  null` rather than defaulting to 0. */
export function entitlementLimit(
    subscription: ClinicSubscription | null,
    featureKey: string
): number | null {
    return subscription?.entitlements.find((e) => e.featureKey === featureKey)?.limitValue ?? null;
}

/** "Annual subscription", "Monthly subscription" — display copy derived from
 *  the row, so a new interval added in Admin renders sensibly without a
 *  deploy. */
export function billingIntervalLabel(interval: string): string {
    switch (interval) {
        case "annual": return "Annual subscription";
        case "monthly": return "Monthly subscription";
        case "lifetime": return "Lifetime access";
        default: return `${interval.charAt(0).toUpperCase()}${interval.slice(1)} subscription`;
    }
}
