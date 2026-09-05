// ---------------------------------------------------------------------------
// FEES AT THE DESK — reading what to charge, and recording what was taken.
//
// The admin side (Parallax → Money) decides what a doctor charges. This file is
// the other half: front desk reads that number, applies a discount if the
// clinic allows one, and records the result against the visit.
//
// ── Three rules this file exists to enforce
//
//  1. RECEPTION NEVER SETS THE FEE. There is no parameter here for a base fee
//     typed by a human. It always comes from `doctors.consultation_fee` /
//     `follow_up_fee`. Reception can discount, and that is all — Anmol,
//     2026-09-05: "they should have option of giving discount... I don't think
//     so [they should change the fee]."
//
//  2. NO FEE SET MEANS SHOW NOTHING. A doctor with a NULL fee is not free and
//     is not ₹0 — the desk simply has no money question to answer, so the whole
//     section disappears rather than rendering an empty form. `resolveFee`
//     returns null for exactly this, and the UI is built around that null.
//
//  3. EVERY ACTION IS WRITTEN DOWN. Recording a payment writes a
//     `visit_payment_events` row alongside it. The trail is append-only at the
//     policy level; nothing here updates or deletes one.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";

/** How long after a visit a returning patient still defaults to "follow-up".
 *  A DEFAULT, never a decision — reception always overrides. Anmol: "right now
 *  we have something like if the patient is coming within two weeks, that would
 *  be considered as follow-up, and by default that would be set there, but a
 *  receptionist will have full authority to cancel it or check it." */
export const FOLLOW_UP_WINDOW_DAYS = 14;

export type VisitType = "new" | "follow_up";
export type DiscountKind = "none" | "percent" | "amount";
export type PaymentMethod = "cash" | "upi" | "card" | "other";

export interface DoctorFeeCard {
    consultationFee: number | null;
    followUpFee: number | null;
}

export interface BillingPolicy {
    currency: string;
    gstEnabled: boolean;
    gstPercent: number;
    allowDiscount: boolean;
}

export interface FeeContext {
    policy: BillingPolicy;
    /** Keyed by `doctors.id`. Only doctors at this clinic. */
    feesByDoctor: Map<string, DoctorFeeCard>;
}

/**
 * Everything the intake modal needs to price a visit, in one read.
 *
 * Fetched once when the modal opens rather than per doctor-change: a clinic has
 * a handful of doctors and the receptionist may switch between them twice
 * before saving, which should not be two more round trips mid-form.
 */
export async function fetchFeeContext(hospitalId: string): Promise<FeeContext> {
    const [hospitalRes, doctorsRes] = await Promise.all([
        supabase
            .from("hospitals")
            .select("currency, gst_enabled, gst_percent, allow_discount")
            .eq("id", hospitalId)
            .maybeSingle(),
        supabase
            .from("doctors")
            .select("id, consultation_fee, follow_up_fee")
            .eq("hospital_id", hospitalId),
    ]);

    if (doctorsRes.error) throw new Error(`fetchFeeContext: ${doctorsRes.error.message}`);

    const h = hospitalRes.data;
    const feesByDoctor = new Map<string, DoctorFeeCard>();
    for (const d of doctorsRes.data ?? []) {
        feesByDoctor.set(d.id, {
            // `?? null` not `|| null` — an explicit 0 is "this doctor does not
            // charge", a real answer that must survive.
            consultationFee: d.consultation_fee === null || d.consultation_fee === undefined ? null : Number(d.consultation_fee),
            followUpFee: d.follow_up_fee === null || d.follow_up_fee === undefined ? null : Number(d.follow_up_fee),
        });
    }

    return {
        policy: {
            currency: h?.currency ?? "INR",
            gstEnabled: h?.gst_enabled ?? false,
            gstPercent: Number(h?.gst_percent ?? 18),
            allowDiscount: h?.allow_discount ?? true,
        },
        feesByDoctor,
    };
}

/**
 * What this doctor charges for this kind of visit.
 *
 * `null` means no fee configured — the caller shows nothing at all. A follow-up
 * with no follow-up rate falls back to the consultation fee rather than to
 * nothing: a clinic that set one number meant it to apply to every visit.
 */
export function resolveFee(card: DoctorFeeCard | undefined, visitType: VisitType): number | null {
    if (!card) return null;
    if (visitType === "follow_up") return card.followUpFee ?? card.consultationFee;
    return card.consultationFee;
}

/** Whether a returning patient's last visit is recent enough to DEFAULT to
 *  follow-up. Pure, so the rule is testable and lives in one place. */
export function defaultVisitType(lastVisitAt: string | null | undefined): VisitType {
    if (!lastVisitAt) return "new";
    const days = (Date.now() - new Date(lastVisitAt).getTime()) / 86_400_000;
    return days <= FOLLOW_UP_WINDOW_DAYS ? "follow_up" : "new";
}

export interface FeeBreakdown {
    base: number;
    discount: number;
    gstAmount: number;
    total: number;
}

/**
 * The arithmetic, in one pure function so the modal, the receipt and the
 * report cannot disagree.
 *
 * GST applies AFTER the discount — you are taxed on what you actually paid,
 * not on the list price. Discount is clamped to the fee so a fat-fingered
 * "5000" off a ₹500 consultation becomes a free visit, never a negative total
 * (the DB's own CHECK constraint refuses that anyway; clamping here means the
 * receptionist sees the clamp before they submit rather than getting an error).
 */
export function computeFee(opts: {
    base: number;
    discountKind: DiscountKind;
    /** Percent when kind is 'percent', rupees when 'amount', ignored otherwise. */
    discountValue: number;
    gstEnabled: boolean;
    gstPercent: number;
}): FeeBreakdown {
    const base = Math.max(0, opts.base);

    let discount = 0;
    if (opts.discountKind === "percent") {
        discount = (base * Math.min(100, Math.max(0, opts.discountValue))) / 100;
    } else if (opts.discountKind === "amount") {
        discount = Math.max(0, opts.discountValue);
    }
    discount = Math.min(discount, base);
    // Rupees, not paise. Clinics quote and collect whole numbers, and a
    // rounded total that does not match the sum of its parts is the classic
    // way a receipt stops adding up.
    discount = Math.round(discount);

    const net = base - discount;
    const gstAmount = opts.gstEnabled ? Math.round((net * opts.gstPercent) / 100) : 0;

    return { base, discount, gstAmount, total: net + gstAmount };
}

// ── Writing ────────────────────────────────────────────────────────────────

export interface RecordPaymentInput {
    visitId: string;
    hospitalId: string;
    doctorId: string | null;
    visitType: VisitType;
    breakdown: FeeBreakdown;
    discountKind: DiscountKind;
    discountPercent: number | null;
    gstPercent: number;
    status: "paid" | "pending";
    method: PaymentMethod | null;
    actor: { id: string | null; name: string | null; role: string | null };
}

/**
 * Writes the payment row and its first audit event.
 *
 * Deliberately NOT a transaction — PostgREST has no client-side transaction and
 * the alternative is an RPC. If the audit insert fails the payment still stands,
 * which is the right way round: losing the money record because a log line
 * failed would be worse than a trail with a gap, and the gap is logged.
 *
 * Called fire-and-forget from intake, same contract as observations and
 * measurements: a fee that fails to write must never fail the visit.
 */
export async function recordVisitPayment(input: RecordPaymentInput): Promise<void> {
    const { data, error } = await supabase
        .from("visit_payments")
        .insert({
            visit_id: input.visitId,
            hospital_id: input.hospitalId,
            doctor_id: input.doctorId,
            visit_type: input.visitType,
            fee: input.breakdown.base,
            discount: input.breakdown.discount,
            discount_kind: input.discountKind,
            discount_percent: input.discountPercent,
            gst_percent: input.breakdown.gstAmount > 0 ? input.gstPercent : 0,
            gst_amount: input.breakdown.gstAmount,
            status: input.status,
            method: input.method,
            collected_by: input.actor.id,
        })
        .select("id")
        .single();

    if (error) throw new Error(`recordVisitPayment: ${error.message}`);

    await logPaymentEvent({
        paymentId: Number(data.id),
        visitId: input.visitId,
        hospitalId: input.hospitalId,
        // A discount given at the moment of recording is its own fact worth
        // naming in the trail — an owner scanning for "who is discounting"
        // should not have to compare two numbers on every row.
        action: input.breakdown.discount > 0 ? "discounted" : "recorded",
        fee: input.breakdown.base,
        discount: input.breakdown.discount,
        total: input.breakdown.total,
        status: input.status,
        method: input.method,
        note: input.discountKind === "percent" && input.discountPercent
            ? `${input.discountPercent}% off`
            : null,
        actor: input.actor,
    });
}

export async function logPaymentEvent(opts: {
    paymentId: number | null;
    visitId: string;
    hospitalId: string;
    action: "recorded" | "discounted" | "marked_paid" | "marked_unpaid" | "method_changed" | "waived";
    fee?: number | null;
    discount?: number | null;
    total?: number | null;
    status?: string | null;
    method?: string | null;
    note?: string | null;
    actor: { id: string | null; name: string | null; role: string | null };
}): Promise<void> {
    const { error } = await supabase.from("visit_payment_events").insert({
        payment_id: opts.paymentId,
        visit_id: opts.visitId,
        hospital_id: opts.hospitalId,
        action: opts.action,
        fee: opts.fee ?? null,
        discount: opts.discount ?? null,
        total: opts.total ?? null,
        status: opts.status ?? null,
        method: opts.method ?? null,
        note: opts.note ?? null,
        actor_id: opts.actor.id,
        actor_name: opts.actor.name,
        actor_role: opts.actor.role,
    });
    // Non-fatal by design — see recordVisitPayment's comment.
    if (error) console.warn("[payments] audit event failed (non-fatal):", error.message);
}

// ── Reading the trail (Parallax) ───────────────────────────────────────────

export interface PaymentEvent {
    id: number;
    visitId: string;
    action: string;
    fee: number | null;
    discount: number | null;
    total: number | null;
    status: string | null;
    method: string | null;
    note: string | null;
    actorName: string | null;
    actorRole: string | null;
    createdAt: string;
    patientName: string | null;
}

/** The clinic's fee actions, newest first. Patient names are joined in because
 *  "₹100 off" is unreadable without knowing whose visit it was — the one place
 *  an admin sees a name, same allowance the outstanding list already has. */
export async function fetchPaymentAudit(hospitalId: string, limit = 60): Promise<PaymentEvent[]> {
    const { data, error } = await supabase
        .from("visit_payment_events")
        .select("id, visit_id, action, fee, discount, total, status, method, note, actor_name, actor_role, created_at, visits ( patients ( name ) )")
        .eq("hospital_id", hospitalId)
        .order("created_at", { ascending: false })
        .limit(limit);
    if (error) throw new Error(`fetchPaymentAudit: ${error.message}`);

    return (data ?? []).map((r) => {
        const row = r as unknown as {
            id: number; visit_id: string; action: string;
            fee: number | string | null; discount: number | string | null; total: number | string | null;
            status: string | null; method: string | null; note: string | null;
            actor_name: string | null; actor_role: string | null; created_at: string;
            visits?: { patients?: { name?: string } | null } | null;
        };
        const num = (v: number | string | null) => (v === null || v === undefined ? null : Number(v));
        return {
            id: Number(row.id),
            visitId: row.visit_id,
            action: row.action,
            fee: num(row.fee),
            discount: num(row.discount),
            total: num(row.total),
            status: row.status,
            method: row.method,
            note: row.note,
            actorName: row.actor_name,
            actorRole: row.actor_role,
            createdAt: row.created_at,
            patientName: row.visits?.patients?.name ?? null,
        };
    });
}
