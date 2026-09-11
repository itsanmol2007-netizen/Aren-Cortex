// ---------------------------------------------------------------------------
// MESSAGING — credits, packages, recharge requests, and the send seam.
//
// Standing rule 1: every query the Communication page makes lives here, not in
// the page. What the page is allowed to know is deliberately narrow — a
// balance, a price list, a request it can file, and two verbs ("send the
// prescription", "send the follow-up"). It does not know Meta exists.
//
// ── The three things this file will NOT do
//
// 1. **It cannot grant credits.** There is no INSERT policy on
//    `messaging_credit_ledger` for a signed-in user, so there is no function
//    here that could write one even by mistake. Credits arrive one of two
//    ways: the FREE_ALLOCATION trigger on `doctors`, or an admin approving a
//    recharge — both server-side. `createRechargeRequest` files a REQUEST,
//    and the table's WITH CHECK pins it to 'pending'.
//
// 2. **It cannot send.** Sending needs Meta credentials that must never reach
//    a browser bundle, so `sendPrescription`/`sendFollowUp` are HTTP calls to
//    `server/`, authenticated with the doctor's own Supabase session. They are
//    the only two verbs the UI has, and neither names a provider — see
//    `server/messaging/` for the adapter that does.
//
// 3. **It does not compute a balance in JavaScript.** `messaging_credit_
//    balances` is a view over the ledger. Summing rows here would mean two
//    definitions of "balance" that can disagree, and the one the doctor sees
//    would be the one nobody tested.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";
import type { RxLanguage } from "../i18n/prescriptionLabels";

/**
 * Below this, the doctor is warned and AREN is alerted. Mirrors the same
 * number in `messaging_credit_balances`'s CASE expression — the view is the
 * authority (support reads it directly), this is the copy the UI phrases its
 * warning against.
 */
export const LOW_CREDIT_THRESHOLD = 100;

/**
 * Below this — but still above `LOW_CREDIT_THRESHOLD` — the page nudges
 * without alarming. UI-only: it mirrors nothing in the database, triggers no
 * email, and does not touch `messaging_credit_balances`'s own CASE. That view
 * stays the authority AREN's support team and the low-credit email actually
 * fire against; this is a second, gentler rung the DOCTOR sees first, so a
 * balance drifting down reads as a heads-up before it reads as a warning.
 *
 * 500 rather than some fraction of the 5,000 starting grant: it is a round,
 * doctor-legible number and, at roughly a week's typical sending, gives real
 * lead time to recharge before `LOW_CREDIT_THRESHOLD` (and AREN's own email)
 * take over.
 */
export const SOFT_LOW_CREDIT_THRESHOLD = 500;

/** What one message costs. AREN's own unit, not Meta's — the doctor never
 *  sees a conversation category or a per-country rate.
 *
 *  Only messages AREN SENDS cost anything. A patient's reply is free, because
 *  Meta does not charge us for it — that is the whole rule, and the UI must
 *  never imply otherwise. */
export const CREDITS_PER_MESSAGE = 1;

/**
 * How long a doctor must wait before they may withdraw their own recharge
 * request and raise a fresh one.
 *
 * Mirrors the `interval '3 hours'` inside `cancel_credit_recharge()`. The
 * DATABASE is the authority — this copy only decides when the button appears,
 * because a button that is visible and then errors is worse than one that
 * arrives when it can work.
 */
export const RECHARGE_CANCEL_AFTER_MS = 3 * 60 * 60 * 1000;

/** Milliseconds until this request may be withdrawn; 0 once it may. */
export function msUntilCancellable(request: RechargeRequest): number {
    const age = Date.now() - new Date(request.createdAt).getTime();
    return Math.max(0, RECHARGE_CANCEL_AFTER_MS - age);
}

/** "in 2h 10m" — how long a doctor still has to wait. */
export function formatWait(ms: number): string {
    if (ms <= 0) return "";
    const mins = Math.ceil(ms / 60000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Balance ────────────────────────────────────────────────────────────────

export type CreditStatus = "OK" | "LOW_CREDITS" | "EXHAUSTED";

export interface CreditBalance {
    doctorId: string;
    doctorName: string | null;
    /** Spendable right now. */
    balance: number;
    /** Everything ever granted — free allocation plus purchases. The
     *  denominator in "used 301 of 5,000". */
    granted: number;
    /** Lifetime MESSAGE_DEBITs, refunds NOT deducted — this is "messages you
     *  paid for", and a refunded failure was not one of them. */
    spent: number;
    refunded: number;
    lastMovementAt: string | null;
    status: CreditStatus;
}

const ZERO_BALANCE = (doctorId: string): CreditBalance => ({
    doctorId,
    doctorName: null,
    balance: 0,
    granted: 0,
    spent: 0,
    refunded: 0,
    lastMovementAt: null,
    status: "EXHAUSTED",
});

/**
 * One doctor's wallet.
 *
 * Returns a zeroed balance rather than throwing when the view has no row —
 * that happens for a signed-in user with no `doctors` row (the MVP-constant
 * fallback in `useClinicalIdentity`), and a Communication page that throws
 * for them would be worse than one that honestly shows nothing to spend.
 */
export async function fetchCreditBalance(doctorId: string): Promise<CreditBalance> {
    const { data, error } = await supabase
        .from("messaging_credit_balances")
        .select("doctor_id, doctor_name, balance, granted, spent, refunded, last_movement_at, status")
        .eq("doctor_id", doctorId)
        .maybeSingle();

    if (error) throw new Error(`fetchCreditBalance: ${error.message}`);
    if (!data) return ZERO_BALANCE(doctorId);

    return {
        doctorId: data.doctor_id as string,
        doctorName: (data.doctor_name as string | null) ?? null,
        balance: Number(data.balance ?? 0),
        granted: Number(data.granted ?? 0),
        spent: Number(data.spent ?? 0),
        refunded: Number(data.refunded ?? 0),
        lastMovementAt: (data.last_movement_at as string | null) ?? null,
        status: (data.status as CreditStatus) ?? "OK",
    };
}

/**
 * Every doctor at one clinic, for the owner-doctor's and Parallax's view of
 * "who is running out". Sorted lowest first — the only order this list is
 * ever read in is "who do we need to call".
 */
export async function fetchClinicCreditBalances(hospitalId: string): Promise<CreditBalance[]> {
    const { data, error } = await supabase
        .from("messaging_credit_balances")
        .select("doctor_id, doctor_name, balance, granted, spent, refunded, last_movement_at, status")
        .eq("hospital_id", hospitalId)
        .order("balance", { ascending: true });

    if (error) throw new Error(`fetchClinicCreditBalances: ${error.message}`);
    return (data ?? []).map((d) => ({
        doctorId: d.doctor_id as string,
        doctorName: (d.doctor_name as string | null) ?? null,
        balance: Number(d.balance ?? 0),
        granted: Number(d.granted ?? 0),
        spent: Number(d.spent ?? 0),
        refunded: Number(d.refunded ?? 0),
        lastMovementAt: (d.last_movement_at as string | null) ?? null,
        status: (d.status as CreditStatus) ?? "OK",
    }));
}

// ── The ledger, read ───────────────────────────────────────────────────────

export type LedgerKind =
    | "FREE_ALLOCATION" | "PURCHASE" | "MESSAGE_DEBIT" | "REFUND" | "ADMIN_ADJUSTMENT";

export interface LedgerEntry {
    id: number;
    kind: LedgerKind;
    delta: number;
    note: string | null;
    messageId: number | null;
    createdAt: string;
}

/** Doctor-facing words for a ledger kind. The doctor should never read
 *  "MESSAGE_DEBIT" — that is the schema's vocabulary, not theirs. */
export const LEDGER_LABEL: Record<LedgerKind, string> = {
    FREE_ALLOCATION: "Included with your plan",
    PURCHASE: "Credits added",
    MESSAGE_DEBIT: "Message sent",
    REFUND: "Refunded — message not delivered",
    ADMIN_ADJUSTMENT: "Adjusted by AREN",
};

/**
 * Recent movements on one wallet. Capped: this is a "where did my credits
 * go" panel, not an accounting export, and an uncapped read of a year of
 * sends is a slow page for a question nobody asked.
 */
export async function fetchCreditLedger(doctorId: string, limit = 40): Promise<LedgerEntry[]> {
    const { data, error } = await supabase
        .from("messaging_credit_ledger")
        .select("id, kind, delta, note, message_id, created_at")
        .eq("doctor_id", doctorId)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (error) throw new Error(`fetchCreditLedger: ${error.message}`);
    return (data ?? []).map((r) => ({
        id: Number(r.id),
        kind: r.kind as LedgerKind,
        delta: Number(r.delta),
        note: (r.note as string | null) ?? null,
        messageId: r.message_id === null ? null : Number(r.message_id),
        createdAt: r.created_at as string,
    }));
}

// ── Packages ───────────────────────────────────────────────────────────────

export interface CreditPackage {
    id: number;
    code: string;
    label: string;
    credits: number;
    amount: number;
    currency: string;
}

/**
 * The price list, from the database.
 *
 * Deliberately not a constant in this bundle: AREN changes a price with an
 * UPDATE and every doctor sees it on their next load, with no release. The
 * RLS policy already filters to `is_active`, so a retired package disappears
 * from the buy sheet while every old request still names what it was sold as.
 */
export async function fetchCreditPackages(): Promise<CreditPackage[]> {
    const { data, error } = await supabase
        .from("messaging_credit_packages")
        .select("id, code, label, credits, amount, currency")
        .order("sort_order", { ascending: true });

    if (error) throw new Error(`fetchCreditPackages: ${error.message}`);
    return (data ?? []).map((p) => ({
        id: Number(p.id),
        code: p.code as string,
        label: p.label as string,
        credits: Number(p.credits),
        amount: Number(p.amount),
        currency: (p.currency as string) ?? "INR",
    }));
}

// ── Recharge requests ──────────────────────────────────────────────────────

export type RechargeStatus = "pending" | "approved" | "rejected" | "expired";

export interface RechargeRequest {
    id: number;
    /** "RC_12345" — what support quotes back to the doctor. */
    reference: string;
    doctorId: string;
    packageCode: string;
    packageLabel: string;
    credits: number;
    amount: number;
    currency: string;
    balanceAtRequest: number;
    status: RechargeStatus;
    note: string | null;
    decisionNote: string | null;
    createdAt: string;
    decidedAt: string | null;
}

/** The one place the human-readable request id is formed. Support, the email
 *  and the UI all quote the same string because they all call this. */
export function rechargeReference(id: number): string {
    return `RC_${id}`;
}

function toRechargeRequest(r: Record<string, unknown>): RechargeRequest {
    const id = Number(r.id);
    return {
        id,
        reference: rechargeReference(id),
        doctorId: r.doctor_id as string,
        packageCode: r.package_code as string,
        packageLabel: r.package_label as string,
        credits: Number(r.credits),
        amount: Number(r.amount),
        currency: (r.currency as string) ?? "INR",
        balanceAtRequest: Number(r.balance_at_request ?? 0),
        status: r.status as RechargeStatus,
        note: (r.note as string | null) ?? null,
        decisionNote: (r.decision_note as string | null) ?? null,
        createdAt: r.created_at as string,
        decidedAt: (r.decided_at as string | null) ?? null,
    };
}

/**
 * This doctor's recharge history, newest first.
 *
 * Every status, not just pending: the doctor's question is "what happened to
 * the recharge I asked for last Tuesday", and a list that drops answered
 * requests cannot answer it. Nothing here is ever deleted — these rows are
 * the billing history until a payment gateway exists.
 */
export async function fetchRechargeRequests(doctorId: string, limit = 20): Promise<RechargeRequest[]> {
    const { data, error } = await supabase
        .from("credit_recharge_requests")
        .select("id, doctor_id, package_code, package_label, credits, amount, currency, balance_at_request, status, note, decision_note, created_at, decided_at")
        .eq("doctor_id", doctorId)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (error) throw new Error(`fetchRechargeRequests: ${error.message}`);
    return (data ?? []).map(toRechargeRequest);
}

export class DuplicateRechargeError extends Error {
    constructor() {
        super("You already have a recharge request waiting. We'll be in touch about that one.");
        this.name = "DuplicateRechargeError";
    }
}

/**
 * File a recharge request. Does NOT add credits — nothing here can.
 *
 * `balance_at_request` is captured now rather than derived later because it
 * is the number that makes the request urgent or routine to whoever reads it,
 * and by the time a human opens the email it will have moved.
 *
 * A second request while one is pending is a UNIQUE violation (23505) by
 * design, translated here into something the page can show. Pressing the
 * button twice must not create two things for support to reconcile.
 */
export async function createRechargeRequest(opts: {
    hospitalId: string;
    doctorId: string;
    userId: string | null;
    pack: CreditPackage;
    currentBalance: number;
    note?: string;
}): Promise<RechargeRequest> {
    const { data, error } = await supabase
        .from("credit_recharge_requests")
        .insert({
            hospital_id: opts.hospitalId,
            doctor_id: opts.doctorId,
            requested_by: opts.userId,
            package_id: opts.pack.id,
            package_code: opts.pack.code,
            package_label: opts.pack.label,
            credits: opts.pack.credits,
            amount: opts.pack.amount,
            currency: opts.pack.currency,
            balance_at_request: opts.currentBalance,
            status: "pending",
            note: opts.note?.trim() || null,
        })
        .select("id, doctor_id, package_code, package_label, credits, amount, currency, balance_at_request, status, note, decision_note, created_at, decided_at")
        .single();

    if (error) {
        if (error.code === "23505") throw new DuplicateRechargeError();
        throw new Error(`createRechargeRequest: ${error.message}`);
    }

    const request = toRechargeRequest(data as Record<string, unknown>);

    // Tell AREN. Fire-and-forget on purpose: the request is already durably
    // in the database, and a doctor must not see "could not submit" because
    // an SMTP hop was slow. A notification that never sent is recoverable
    // from `credit_recharge_requests` itself — support's list is the table,
    // and the email is only the nudge that makes them look at it.
    void notifySupport("recharge_request", { requestId: request.id }).catch((e) => {
        console.error("[messaging] recharge notification failed (non-fatal):", e);
    });

    return request;
}

/**
 * Withdraw a pending recharge request.
 *
 * The three-hour wait is enforced by `cancel_credit_recharge()` itself, not
 * here — this only surfaces the refusal. A doctor with a browser console can
 * call the RPC early and will simply be told no.
 *
 * Cancelling frees the unique partial index that allows one pending request
 * per doctor, which is the entire point: a request nobody actioned used to
 * block the doctor from raising a fresh one.
 */
export async function cancelRechargeRequest(requestId: number): Promise<void> {
    const { error } = await supabase.rpc("cancel_credit_recharge", { p_request_id: requestId });
    if (error) {
        // Postgres RAISE messages arrive readable and are written for the
        // doctor ("A request can only be withdrawn after 3 hours."), so they
        // are shown rather than replaced with something vaguer.
        throw new Error(error.message.replace(/^.*?:\s*/, ""));
    }

    void notifySupport("recharge_cancelled", { requestId }).catch((e) => {
        console.error("[messaging] cancellation notice failed (non-fatal):", e);
    });
}

// ── Usage over time ────────────────────────────────────────────────────────

export interface UsageDay {
    /** yyyy-mm-dd, clinic-local. */
    date: string;
    /** Credits spent that day — MESSAGE_DEBITs, net of refunds, so a day
     *  whose only send failed reads as 0 rather than 1. */
    credits: number;
}

/**
 * Credits spent per day, oldest first, gaps filled with zeros.
 *
 * Zero-filled deliberately: a quiet Sunday must draw as a dip, not vanish and
 * pull the bar chart's shape out of true. Same rule `DayPoint[]` follows in
 * the admin analytics.
 *
 * Refunds are netted into the day the REFUND was written, not the day of the
 * debit it reverses. That is a day or two out on a late provider failure, and
 * the alternative — reaching back to rewrite a past day's total — would make
 * a chart the doctor already looked at change underneath them.
 */
export async function fetchCreditUsage(doctorId: string, days = 14): Promise<UsageDay[]> {
    // IST, spelled out. `new Date().toISOString()` is wrong here: until
    // 05:30 IST the UTC date is still yesterday, so "today" would be empty
    // every morning. Same reasoning as lib/db/admin.ts's date helpers.
    const dayOf = (iso: string) =>
        new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
        }).format(new Date(iso));

    const buckets = new Map<string, number>();
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
        buckets.set(dayOf(new Date(now.getTime() - i * 86400000).toISOString()), 0);
    }

    const since = new Date(now.getTime() - days * 86400000).toISOString();
    const { data, error } = await supabase
        .from("messaging_credit_ledger")
        .select("delta, kind, created_at")
        .eq("doctor_id", doctorId)
        .in("kind", ["MESSAGE_DEBIT", "REFUND"])
        .gte("created_at", since)
        .order("created_at", { ascending: true });

    if (error) throw new Error(`fetchCreditUsage: ${error.message}`);

    for (const row of (data ?? []) as { delta: number; kind: LedgerKind; created_at: string }[]) {
        const day = dayOf(row.created_at);
        if (!buckets.has(day)) continue;
        // A debit is negative and a refund positive, so spend is the negated
        // sum of both — one expression rather than a branch per kind.
        buckets.set(day, buckets.get(day)! - Number(row.delta));
    }

    return [...buckets.entries()].map(([date, credits]) => ({ date, credits: Math.max(0, credits) }));
}

// ── The send seam ──────────────────────────────────────────────────────────
//
// Sending needs provider credentials that never reach a browser bundle, so
// this crosses into the `messaging-send` Supabase Edge Function
// (`supabase/functions/messaging-send/`) — the hosted replacement for the old
// `server/messaging` Express routes. `supabase.functions.invoke` attaches the
// caller's session automatically; the function resolves the doctor from that
// token and ignores anything identity-shaped in the body.

export interface SendResult {
    ok: true;
    messageId: number;
    /** Balance AFTER this send, so the header updates without a second read. */
    balance: number;
    status: string;
}

/**
 * Invoke `messaging-send`. Doctor-actionable failures (no credits, no phone,
 * rate limit) come back as HTTP 200 `{ ok: false, message }` — surfaced to the
 * caller as an Error carrying that exact message. A 5xx / transport failure
 * collapses to a generic line.
 */
async function invokeSend(
    purpose: "prescription" | "follow_up",
    body: Record<string, unknown>,
): Promise<SendResult> {
    const { data, error } = await supabase.functions.invoke("messaging-send", {
        body: { purpose, ...body },
    });
    if (error) {
        let message = "Something went wrong sending that message. Please try again.";
        try {
            const b = await (error as { context?: Response }).context?.json?.();
            if (b && typeof b.message === "string") message = b.message;
        } catch {
            /* keep the generic message */
        }
        throw new Error(message);
    }
    const res = data as SendResult | { ok: false; error: string; message?: string };
    if (!res || (res as { ok?: boolean }).ok !== true) {
        throw new Error((res as { message?: string })?.message || "That message could not be sent.");
    }
    return res as SendResult;
}

/**
 * Send a prescription over WhatsApp.
 *
 * The frontend's entire vocabulary for messaging, together with
 * `sendFollowUp`. It names no provider, no template, no phone number
 * formatting and no credit arithmetic — all of that lives in the
 * `messaging-send` Edge Function, which is what makes swapping Meta for a BSP
 * a change to one file rather than to this page.
 */
export function sendPrescription(opts: {
    prescriptionId: string;
    patientId: string;
    doctorId: string;
    /** Which approved WhatsApp template to send — "en" until the doctor
     *  picks otherwise on ReviewModal's language control. `messaging-send`
     *  refuses (cleanly, no send attempted) if the matching template for
     *  that language hasn't been configured yet — see its own comment. */
    language?: RxLanguage;
}): Promise<SendResult> {
    return invokeSend("prescription", {
        patientId: opts.patientId,
        prescriptionId: opts.prescriptionId,
        language: opts.language ?? "en",
    });
}

/** Send a follow-up reminder. Same seam, same silence about the provider. */
export function sendFollowUp(opts: {
    patientId: string;
    doctorId: string;
    visitId?: string;
    followUpDate?: string;
}): Promise<SendResult> {
    return invokeSend("follow_up", {
        patientId: opts.patientId,
        visitId: opts.visitId,
        followUpDate: opts.followUpDate,
    });
}

/**
 * Ask the server to email AREN about something operational.
 *
 * The page never composes an email, never names a recipient and never sees a
 * credential — it names an EVENT and the ids behind it, and the
 * `support-notify` Supabase Edge Function
 * (`supabase/functions/support-notify/index.ts`) owns what that event's
 * email says. That is the whole point of a centralized email service:
 * changing the wording of a low-credit alert must not be a frontend change.
 *
 * 2026-09-08: moved off `server/`'s `/api/support/notify` onto that Edge
 * Function — same reasoning as `createStaffMember` in `lib/db/staff.ts`.
 * `supabase.functions.invoke` attaches the caller's session automatically.
 */
export async function notifySupport(
    kind: "recharge_request" | "recharge_cancelled" | "low_credit" | "support_request",
    payload: Record<string, unknown>
): Promise<{ ok: true }> {
    const { error } = await supabase.functions.invoke("support-notify", { body: { kind, ...payload } });
    if (error) {
        // Matches the old route's own contract: a failed or unconfigured
        // email is never the caller's problem to retry (their recharge
        // request already succeeded in the database before this ever
        // runs) — so this is logged, not thrown.
        console.error("[messaging] support-notify failed (non-fatal):", error.message);
    }
    return { ok: true };
}

/** What the Help & Support page collects. See `SupportPage.tsx`. */
export interface SupportRequest {
    /** the chosen topic's label — "Something isn't working", etc. */
    topic: string;
    /** which parts of the app it's about; empty when the topic has no areas */
    areas: string[];
    /** the doctor's own words. Always allowed, sometimes the only thing said. */
    message: string;
    /** how to reach them back, prefilled from their profile */
    replyTo: string;
    /** browser/session facts, gathered by the page — see `collectDiagnostics` */
    diagnostics: Record<string, string>;
}

/**
 * File a support request — and, unlike `notifySupport` above, TELL THE CALLER
 * whether it actually went.
 *
 * The difference is not stylistic. Every other kind this function family
 * sends is an alert ABOUT something that already happened in the database:
 * the doctor's recharge request is filed whether or not AREN's mailbox is
 * reachable, so swallowing a mail failure is right — it is AREN's problem to
 * notice in `support_email_log`, not a failure to report back to a doctor
 * whose action succeeded.
 *
 * A support request has no such database row behind it. **The email IS the
 * action.** Swallowing the error here would show a doctor "we've got it"
 * over a message that was never sent, which is the one outcome a support
 * form must never produce — they would sit and wait for an answer to a
 * message nobody received. So this one throws, and the page says so.
 */
export async function sendSupportRequest(req: SupportRequest): Promise<{ reference: string | null }> {
    const { data, error } = await supabase.functions.invoke("support-notify", {
        body: { kind: "support_request", ...req },
    });
    if (error) {
        // `error.message` here is the Supabase SDK's own wording — "Edge
        // Function returned a non-2xx status code" — which is true, useless to
        // a doctor, and slightly alarming. It goes to the console, where the
        // person who can act on it will look; the doctor gets a sentence that
        // tells them what to do instead.
        console.error("[messaging] support request failed:", error.message);
        throw new Error("We couldn't get that through just now.");
    }
    // The function answers `{ ok: true, skipped: "not_configured" }` when the
    // mailbox credentials are missing on the server. That is a silent
    // non-delivery, which for this kind is a failure like any other.
    if (data && typeof data === "object" && "skipped" in data) {
        throw new Error("Support email is not configured on the server yet.");
    }
    // `SR_41` — the row in `support_requests`. Worth showing the doctor: it
    // turns "we got it" from a reassurance into something they can quote.
    return { reference: (data as { reference?: string | null } | null)?.reference ?? null };
}

// ── Formatting ─────────────────────────────────────────────────────────────

/** "4,999" — credits are always grouped; a bare 4999 reads as a reference
 *  number rather than an amount. */
export function formatCredits(n: number): string {
    return new Intl.NumberFormat("en-IN").format(Math.max(0, Math.round(n)));
}

/** "₹300" — whole rupees, because every package is priced in them and
 *  "₹300.00" on a pricing card reads as a bill, not a price. */
export function formatPrice(amount: number, currency = "INR"): string {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency,
        maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
}
