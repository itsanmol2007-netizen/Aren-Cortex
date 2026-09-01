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
    /** One line of positioning. Copy, from a row — never matched on. */
    tagline: string | null;
    /** Ordered "what you get" lines. Prose for humans; ENTITLEMENTS, not
     *  these, decide what is actually switched on. The two can legitimately
     *  disagree while an Admin is mid-edit, and when they do the entitlement
     *  is the truth. */
    highlights: string[];
    supportResponse: string | null;
    ctaNote: string | null;
}

export interface ClinicSubscription {
    id: string;
    status: SubscriptionStatus;
    startedAt: string;
    currentPeriodEnd: string | null;
    trialEndsAt: string | null;
    cancelAtPeriodEnd: boolean;
    isFounding: boolean;
    /** Commercial seat count — deliberately not the `doctors` entitlement
     *  limit. That one gates the product; this describes the agreement. */
    seats: number;
    billingEmail: string | null;
    billingName: string | null;
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
    tagline: string | null;
    highlights: string[] | null;
    support_response: string | null;
    cta_note: string | null;
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
    seats: number;
    billing_email: string | null;
    billing_name: string | null;
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
            cancel_at_period_end, is_founding, seats, billing_email, billing_name,
            plans (
                id, code, name, description, billing_interval,
                price_amount, price_currency, trial_days,
                tagline, highlights, support_response, cta_note,
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
        seats: data.seats ?? 1,
        billingEmail: data.billing_email,
        billingName: data.billing_name,
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
            tagline: plan.tagline,
            highlights: plan.highlights ?? [],
            supportResponse: plan.support_response,
            ctaNote: plan.cta_note,
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

// ── Managing a subscription, before there is billing ────────────────────────
//
// There is no payment provider wired up. "Manage subscription" therefore
// cannot open a portal, and a button that opens a toast admitting that is a
// button that does nothing. What it CAN do is record the ask against the
// clinic, in the doctor's own words, where the team already looks — which is
// what `subscription_requests` is for (migration
// `subscription_plan_content_and_requests`).
//
// RLS lets a clinic file and read its own requests and nothing else; it
// cannot resolve one. Triage is service-role work, deliberately, so a clinic
// can never mark its own upgrade as done.

/** Constrained by a CHECK on the table — a kind not in this union is
 *  rejected by Postgres, not silently stored. */
export type SubscriptionRequestKind =
    | "upgrade" | "add_seats" | "billing_details" | "invoice" | "cancel" | "question";

export interface SubscriptionRequest {
    id: string;
    kind: SubscriptionRequestKind;
    message: string | null;
    status: string;
    createdAt: string;
    handledAt: string | null;
}

export const REQUEST_KIND_LABEL: Record<SubscriptionRequestKind, string> = {
    upgrade: "Change my plan",
    add_seats: "Add a doctor to the plan",
    billing_details: "Update billing details",
    invoice: "Send me an invoice",
    cancel: "Cancel this subscription",
    question: "Something else",
};

/** File a change request against this clinic's subscription.
 *
 *  `contactEmail` is whatever address the doctor wants to be reached on —
 *  their profile email if they have one. It is never derived from the auth
 *  identity, which is a phone-shaped placeholder nobody can receive mail at. */
export async function submitSubscriptionRequest(input: {
    hospitalId: string;
    subscriptionId: string | null;
    requestedBy: string;
    kind: SubscriptionRequestKind;
    message: string | null;
    contactEmail: string | null;
}): Promise<void> {
    const { error } = await supabase.from("subscription_requests").insert({
        hospital_id: input.hospitalId,
        subscription_id: input.subscriptionId,
        requested_by: input.requestedBy,
        kind: input.kind,
        message: input.message?.trim() || null,
        contact_email: input.contactEmail,
        // The insert policy requires this — a client may only file an OPEN
        // request, never one that arrives pre-resolved.
        status: "open",
    });
    if (error) throw new Error(`submitSubscriptionRequest: ${error.message}`);
}

/** Requests this clinic has already filed, newest first. Shown so a doctor
 *  who asked yesterday sees that it landed instead of asking again. */
export async function fetchSubscriptionRequests(hospitalId: string): Promise<SubscriptionRequest[]> {
    const { data, error } = await supabase
        .from("subscription_requests")
        .select("id, kind, message, status, created_at, handled_at")
        .eq("hospital_id", hospitalId)
        .order("created_at", { ascending: false })
        .limit(5);
    if (error) throw new Error(`fetchSubscriptionRequests: ${error.message}`);
    return (data ?? []).map((r) => ({
        id: r.id,
        kind: r.kind as SubscriptionRequestKind,
        message: r.message,
        status: r.status,
        createdAt: r.created_at,
        handledAt: r.handled_at,
    }));
}

/** The plan's price as a doctor would read it, or `null` when no price is set
 *  — which is NOT "free" and must not render as ₹0. A founding clinic on an
 *  un-priced plan should see the arrangement described, not a fake number. */
export function formatPlanPrice(plan: Plan): string | null {
    if (plan.priceAmount == null) return null;
    const amount = new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: plan.priceCurrency,
        maximumFractionDigits: 0,
    }).format(plan.priceAmount);
    const per =
        plan.billingInterval === "annual" ? "/year" :
        plan.billingInterval === "monthly" ? "/month" :
        plan.billingInterval === "lifetime" ? "" : `/${plan.billingInterval}`;
    return `${amount}${per}`;
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
