// ---------------------------------------------------------------------------
// ADMIN ANALYTICS — the reads behind the clinic owner's workspace.
//
// The first version of this file answered exactly one question ("what happened
// today") and was correctly called hollow. A clinic manager does not manage by
// looking at today. They COMPARE — this week against last, this bench against
// that one, this month's collections against the month before. So everything
// here is built around a RANGE and the equally-long range before it, because a
// number with nothing to compare it to is trivia, not management.
//
// Per standing rule 1, every Supabase call the admin workspace makes lives
// here; the pages do no querying of their own.
//
// ── Why every boundary carries +05:30
//
// `new Date().toISOString()` is wrong for an Indian clinic. Until 05:30 IST
// the UTC date is still yesterday, so "today" would quietly include the
// previous evening's visits and a month boundary would sit in the wrong month
// for five and a half hours every day. IST has no daylight saving, so a
// literal offset is exact rather than an approximation — a clinic in a DST
// zone would need real zone arithmetic, and this is the paragraph that would
// have to change.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";
import { visitStatusKind } from "../../features/patients/visitStatus";

const IST_OFFSET = "+05:30";
const IST_ZONE = "Asia/Kolkata";

// ── Dates ──────────────────────────────────────────────────────────────────

/** Today in the clinic's zone, as yyyy-mm-dd. */
export function clinicToday(now: Date = new Date()): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: IST_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(now);
}

/** Date arithmetic on a yyyy-mm-dd string. UTC is used purely as a calendar
 *  with no DST — the string never becomes a local instant, so no offset can
 *  shift the day out from under it. */
export function addDays(ymd: string, days: number): string {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d) + days * 86400000).toISOString().slice(0, 10);
}

export function daysBetween(fromYmd: string, toYmd: string): number {
    const [y1, m1, d1] = fromYmd.split("-").map(Number);
    const [y2, m2, d2] = toYmd.split("-").map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

const startInstant = (ymd: string) => `${ymd}T00:00:00.000${IST_OFFSET}`;

/** Exclusive upper bound — the start of the NEXT day. Safer than 23:59:59.999,
 *  which silently drops anything stamped in a day's final millisecond. */
const endInstantExclusive = (ymd: string) => `${addDays(ymd, 1)}T00:00:00.000${IST_OFFSET}`;

export interface DateRange {
    /** yyyy-mm-dd, inclusive */
    from: string;
    /** yyyy-mm-dd, inclusive */
    to: string;
    label: string;
}

export type RangePreset = "today" | "yesterday" | "7d" | "30d" | "month" | "custom";

export function buildRange(preset: RangePreset, custom?: { from: string; to: string }): DateRange {
    const today = clinicToday();
    switch (preset) {
        case "today":
            return { from: today, to: today, label: "Today" };
        case "yesterday": {
            const y = addDays(today, -1);
            return { from: y, to: y, label: "Yesterday" };
        }
        case "7d":
            return { from: addDays(today, -6), to: today, label: "Last 7 days" };
        case "30d":
            return { from: addDays(today, -29), to: today, label: "Last 30 days" };
        case "month":
            return { from: `${today.slice(0, 8)}01`, to: today, label: "This month" };
        case "custom":
            return { from: custom?.from ?? today, to: custom?.to ?? today, label: "Custom" };
    }
}

/** The equally-long window immediately before `range`. Every delta on the page
 *  measures against this, so "last 7 days" is compared with the 7 days before
 *  it rather than against some arbitrary week. */
export function previousRange(range: DateRange): DateRange {
    const span = daysBetween(range.from, range.to) + 1;
    return { from: addDays(range.from, -span), to: addDays(range.from, -1), label: "Previous period" };
}

// ── Shapes ─────────────────────────────────────────────────────────────────

export interface Metric {
    value: number;
    previous: number;
    /**
     * Percent change, or null when the previous period was zero. A jump from
     * nothing is not "+100%" — it has no percentage at all, and printing one
     * is exactly the sort of confident nonsense that makes a manager stop
     * trusting a dashboard.
     */
    changePct: number | null;
}

export interface DayPoint {
    date: string;
    visits: number;
    completed: number;
    /** Cancelled or abandoned. Excluded from every headline count — it is not
     *  work the clinic did — but a report that hides it entirely stops an
     *  owner ever noticing a bench that abandons a fifth of its queue. */
    discarded: number;
    newPatients: number;
    prescriptions: number;
    revenue: number;
    /** Gross before discount, so the report can show what was given away. */
    gross: number;
    discount: number;
    cash: number;
    upi: number;
    card: number;
}

export interface BenchRow {
    doctorId: string;
    name: string;
    specialization: string | null;
    consultationFee: number | null;
    visits: number;
    completed: number;
    prescriptions: number;
    revenue: number;
    /** Share of the clinic's visits in this range, 0–1. */
    share: number;
}

export interface ClinicAnalytics {
    range: DateRange;
    patients: Metric;
    newPatients: Metric;
    prescriptions: Metric;
    revenue: Metric;
    /** Percent of non-discarded visits that reached "completed". */
    completionRate: Metric;
    /** One point per day, gaps filled with zeros — a quiet Sunday should draw
     *  as a dip, not vanish and pull the line's shape out of shape. */
    series: DayPoint[];
    benches: BenchRow[];
    /** Visits per hour of day, 0–23. */
    byHour: number[];
    /** Right now, independent of the range — a manager glancing at the page
     *  wants to know the clinic is moving. */
    liveWaiting: number;
    liveActive: number;
    /** False when no payment has ever been recorded, so money panels can say
     *  "not set up" instead of claiming the clinic earned nothing. */
    revenueTracked: boolean;
}

function metric(value: number, previous: number): Metric {
    return { value, previous, changePct: previous === 0 ? null : ((value - previous) / previous) * 100 };
}

// ── The one read the admin workspace makes ─────────────────────────────────

interface VisitRow {
    id: string;
    status: string | null;
    assigned_doctor_id: string | null;
    patient_id: string | null;
    created_at: string;
}

/** Which clinic-local day an instant falls on. */
function ymdOf(iso: string): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: IST_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date(iso));
}

function hourOf(iso: string): number {
    return Number(new Intl.DateTimeFormat("en-GB", {
        timeZone: IST_ZONE, hour: "2-digit", hour12: false,
    }).format(new Date(iso)));
}

export async function fetchClinicAnalytics(
    hospitalId: string,
    range: DateRange
): Promise<ClinicAnalytics> {
    const prev = previousRange(range);

    // ONE window covering both periods, split in memory afterwards. Two round
    // trips per table would double the latency to compute a delta that is
    // arithmetic over rows already being fetched.
    const windowStart = startInstant(prev.from);
    const windowEnd = endInstantExclusive(range.to);

    const [visitsRes, rxRes, payRes, doctorsRes, newPatRes, liveRes, everPaidRes] = await Promise.all([
        supabase.from("visits")
            .select("id, status, assigned_doctor_id, patient_id, created_at")
            .eq("hospital_id", hospitalId)
            .gte("created_at", windowStart).lt("created_at", windowEnd)
            .order("created_at", { ascending: true }),
        supabase.from("prescriptions")
            .select("id, created_at, assigned_doctor_id")
            .eq("hospital_id", hospitalId)
            .gte("created_at", windowStart).lt("created_at", windowEnd),
        supabase.from("visit_payments")
            .select("total, fee, discount, method, collected_at, doctor_id")
            .eq("hospital_id", hospitalId)
            .gte("collected_at", windowStart).lt("collected_at", windowEnd)
            .in("status", ["paid", "pending"]),
        supabase.from("doctors")
            .select("id, name, specialization, consultation_fee")
            .eq("hospital_id", hospitalId),
        supabase.from("patients")
            .select("id, created_at")
            .eq("hospital_id", hospitalId)
            .gte("created_at", windowStart).lt("created_at", windowEnd),
        // Live counts ignore the range entirely: "who is in the clinic right
        // now" is not a question about last month.
        supabase.from("visits")
            .select("status")
            .eq("hospital_id", hospitalId)
            .gte("created_at", startInstant(clinicToday())),
        supabase.from("visit_payments")
            .select("id", { count: "exact", head: true })
            .eq("hospital_id", hospitalId),
    ]);

    if (visitsRes.error) throw new Error(`analytics visits: ${visitsRes.error.message}`);
    if (doctorsRes.error) throw new Error(`analytics doctors: ${doctorsRes.error.message}`);

    const visits = (visitsRes.data ?? []) as VisitRow[];
    const doctors = doctorsRes.data ?? [];

    const inRange = (ymd: string) => ymd >= range.from && ymd <= range.to;
    const inPrev = (ymd: string) => ymd >= prev.from && ymd <= prev.to;

    // ── Visits ─────────────────────────────────────────────────────────────
    // A discarded visit is not work the clinic did, so it counts toward
    // nothing anywhere on this page.
    let cur = 0, prevCount = 0, curDone = 0, prevDone = 0;

    const series = new Map<string, DayPoint>();
    for (let d = range.from; d <= range.to; d = addDays(d, 1)) {
        series.set(d, {
            date: d, visits: 0, completed: 0, discarded: 0, newPatients: 0,
            prescriptions: 0, revenue: 0, gross: 0, discount: 0, cash: 0, upi: 0, card: 0,
        });
    }

    const byHour: number[] = new Array(24).fill(0);
    const bench = new Map<string, { visits: number; completed: number; prescriptions: number; revenue: number }>();
    for (const d of doctors) bench.set(d.id, { visits: 0, completed: 0, prescriptions: 0, revenue: 0 });

    for (const v of visits) {
        const kind = visitStatusKind(v.status ?? "");
        const vYmd = ymdOf(v.created_at);
        if (kind === "inactive") {
            const pt = series.get(vYmd);
            if (pt) pt.discarded++;
            continue;
        }
        const ymd = vYmd;
        const done = kind === "done";

        if (inRange(ymd)) {
            cur++;
            if (done) curDone++;
            const pt = series.get(ymd);
            if (pt) { pt.visits++; if (done) pt.completed++; }
            byHour[hourOf(v.created_at)]++;
            const b = v.assigned_doctor_id ? bench.get(v.assigned_doctor_id) : undefined;
            if (b) { b.visits++; if (done) b.completed++; }
        } else if (inPrev(ymd)) {
            prevCount++;
            if (done) prevDone++;
        }
    }

    // ── Prescriptions ──────────────────────────────────────────────────────
    let curRx = 0, prevRx = 0;
    for (const r of (rxRes.data ?? []) as { created_at: string; assigned_doctor_id: string | null }[]) {
        const ymd = ymdOf(r.created_at);
        if (inRange(ymd)) {
            curRx++;
            const pt = series.get(ymd);
            if (pt) pt.prescriptions++;
            const b = r.assigned_doctor_id ? bench.get(r.assigned_doctor_id) : undefined;
            if (b) b.prescriptions++;
        } else if (inPrev(ymd)) prevRx++;
    }

    // ── Money ──────────────────────────────────────────────────────────────
    let curRev = 0, prevRev = 0;
    for (const p of (payRes.data ?? []) as { total: number | string | null; fee: number | string | null; discount: number | string | null; method: string | null; collected_at: string; doctor_id: string | null }[]) {
        const amount = Number(p.total ?? 0);
        const ymd = ymdOf(p.collected_at);
        if (inRange(ymd)) {
            curRev += amount;
            const pt = series.get(ymd);
            if (pt) {
                pt.revenue += amount;
                pt.gross += Number(p.fee ?? 0);
                pt.discount += Number(p.discount ?? 0);
                if (p.method === "cash") pt.cash += amount;
                else if (p.method === "upi") pt.upi += amount;
                else if (p.method === "card") pt.card += amount;
            }
            const b = p.doctor_id ? bench.get(p.doctor_id) : undefined;
            if (b) b.revenue += amount;
        } else if (inPrev(ymd)) prevRev += amount;
    }

    // ── New registrations ──────────────────────────────────────────────────
    // "New patient" is a REGISTRATION, not a first visit: it is the number a
    // clinic owner actually watches for growth, and it is one cheap query
    // rather than a first-visit-date lookup per patient.
    let curNew = 0, prevNew = 0;
    for (const p of (newPatRes.data ?? []) as { created_at: string }[]) {
        const ymd = ymdOf(p.created_at);
        if (inRange(ymd)) {
            curNew++;
            const pt = series.get(ymd);
            if (pt) pt.newPatients++;
        } else if (inPrev(ymd)) prevNew++;
    }

    // ── Live ───────────────────────────────────────────────────────────────
    let liveWaiting = 0, liveActive = 0;
    for (const v of (liveRes.data ?? []) as { status: string | null }[]) {
        const kind = visitStatusKind(v.status ?? "");
        if (kind === "waiting") liveWaiting++;
        else if (kind === "active") liveActive++;
    }

    const benches: BenchRow[] = doctors
        .map((d) => {
            const t = bench.get(d.id)!;
            return {
                doctorId: d.id,
                name: d.name ?? "Unnamed doctor",
                specialization: d.specialization ?? null,
                consultationFee: d.consultation_fee == null ? null : Number(d.consultation_fee),
                visits: t.visits,
                completed: t.completed,
                prescriptions: t.prescriptions,
                revenue: t.revenue,
                share: cur > 0 ? t.visits / cur : 0,
            };
        })
        .sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name));

    return {
        range,
        patients: metric(cur, prevCount),
        newPatients: metric(curNew, prevNew),
        prescriptions: metric(curRx, prevRx),
        revenue: metric(curRev, prevRev),
        completionRate: metric(
            cur > 0 ? (curDone / cur) * 100 : 0,
            prevCount > 0 ? (prevDone / prevCount) * 100 : 0
        ),
        series: [...series.values()],
        benches,
        byHour,
        liveWaiting,
        liveActive,
        revenueTracked: !everPaidRes.error && (everPaidRes.count ?? 0) > 0,
    };
}

// ── Who administers this clinic ────────────────────────────────────────────

/**
 * How many people at this clinic hold an administration role.
 *
 * The single input to `resolveAdminAccess` beyond the caller's own role, and
 * the reason a doctor's Clinic Control page appears and disappears on its own
 * as a clinic hires or loses an office manager. `head: true` — the count is
 * the entire answer, no rows need to cross the wire.
 *
 * Fails CLOSED (returns a positive count on error) is NOT what this does, and
 * that is deliberate: an unreadable count returning 0 would hand a doctor the
 * embedded page they may not be entitled to, which is a strictly smaller
 * problem than hiding a clinic's dashboard from its actual owner because one
 * query timed out. Neither answer is harmful — no clinical data is gated by
 * this — so it optimises for the surface still working.
 */
export async function countDedicatedAdmins(hospitalId: string): Promise<number> {
    const { count, error } = await supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("hospital_id", hospitalId)
        .eq("is_active", true)
        .in("role", ["admin", "owner"]);
    if (error) {
        console.error("[admin] countDedicatedAdmins:", error.message);
        return 0;
    }
    return count ?? 0;
}

// ── Clinic setup — "what am I actually running, and paying for" ────────────

export interface ClinicSetup {
    name: string;
    clinicMode: string | null;
    /** Human label. The raw enum never reaches the screen. */
    modeLabel: string;
    /** Consultation benches = doctors on file. */
    benches: number;
    seats: number | null;
    planName: string | null;
    planStatus: string | null;
    periodEnd: string | null;
    isFounding: boolean;
    staffCount: number;
    /**
     * True when the clinic runs more benches than its plan has seats. Surfaced
     * rather than silently ignored: it is the single most likely billing
     * mismatch in a growing clinic, and the owner is the only person who can
     * fix it.
     */
    seatsExceeded: boolean;
}

const MODE_LABEL: Record<string, string> = {
    solo: "Solo practice",
    solo_reception: "Single bench, with front desk",
    multi_doctor: "Multi-bench clinic",
};

export async function fetchClinicSetup(hospitalId: string): Promise<ClinicSetup> {
    const [hRes, docRes, staffRes, subRes] = await Promise.all([
        supabase.from("hospitals").select("name, clinic_mode").eq("id", hospitalId).maybeSingle(),
        supabase.from("doctors").select("id", { count: "exact", head: true }).eq("hospital_id", hospitalId),
        supabase.from("users").select("id", { count: "exact", head: true })
            .eq("hospital_id", hospitalId).eq("is_active", true),
        supabase.from("subscriptions")
            .select("status, seats, current_period_end, is_founding, plans ( name )")
            .eq("hospital_id", hospitalId).maybeSingle(),
    ]);

    const mode = hRes.data?.clinic_mode ?? null;
    // A failed billing read is not fatal — an owner must not lose their bench
    // count because the plan join hiccuped.
    const sub = (subRes.error ? null : subRes.data) as
        | { status?: string; seats?: number; current_period_end?: string; is_founding?: boolean; plans?: { name?: string } | null }
        | null;

    const benches = docRes.count ?? 0;
    const seats = sub?.seats ?? null;

    return {
        name: hRes.data?.name ?? "This clinic",
        clinicMode: mode,
        modeLabel: (mode && MODE_LABEL[mode]) || "Clinic",
        benches,
        seats,
        planName: sub?.plans?.name ?? null,
        planStatus: sub?.status ?? null,
        periodEnd: sub?.current_period_end ?? null,
        isFounding: Boolean(sub?.is_founding),
        staffCount: staffRes.count ?? 0,
        seatsExceeded: seats !== null && benches > seats,
    };
}

// ── Fees ───────────────────────────────────────────────────────────────────

export interface DoctorFee {
    id: string;
    name: string;
    specialization: string | null;
    /** NULL means "not set", never "free" — see the column comment. */
    consultationFee: number | null;
    followUpFee: number | null;
}

export interface BillingPolicy {
    currency: string;
    gstEnabled: boolean;
    gstPercent: number;
    allowDiscount: boolean;
}

export interface FeeSettings {
    policy: BillingPolicy;
    doctors: DoctorFee[];
}

export async function fetchFeeSettings(hospitalId: string): Promise<FeeSettings> {
    const [hospitalRes, doctorsRes] = await Promise.all([
        supabase.from("hospitals")
            .select("currency, gst_enabled, gst_percent, allow_discount")
            .eq("id", hospitalId).maybeSingle(),
        supabase.from("doctors")
            .select("id, name, specialization, consultation_fee, follow_up_fee")
            .eq("hospital_id", hospitalId).order("name", { ascending: true }),
    ]);

    if (hospitalRes.error) throw new Error(`fetchFeeSettings policy: ${hospitalRes.error.message}`);
    if (doctorsRes.error) throw new Error(`fetchFeeSettings doctors: ${doctorsRes.error.message}`);

    const h = hospitalRes.data;
    return {
        // These defaults mirror the column defaults deliberately: a clinic row
        // that somehow reads back empty must behave like a fresh clinic (no
        // GST, discounts allowed), never like one with tax switched on.
        policy: {
            currency: h?.currency ?? "INR",
            gstEnabled: h?.gst_enabled ?? false,
            gstPercent: Number(h?.gst_percent ?? 18),
            allowDiscount: h?.allow_discount ?? true,
        },
        doctors: (doctorsRes.data ?? []).map((d) => ({
            id: d.id,
            name: d.name ?? "Unnamed doctor",
            specialization: d.specialization ?? null,
            // `== null` catches null and undefined but NOT 0 — an explicit 0
            // fee is a real answer ("this doctor does not charge") and has to
            // survive the round trip.
            consultationFee: d.consultation_fee == null ? null : Number(d.consultation_fee),
            followUpFee: d.follow_up_fee == null ? null : Number(d.follow_up_fee),
        })),
    };
}

export async function updateDoctorFees(
    doctorId: string,
    fees: { consultationFee: number | null; followUpFee: number | null }
): Promise<void> {
    const { error } = await supabase.from("doctors")
        .update({ consultation_fee: fees.consultationFee, follow_up_fee: fees.followUpFee })
        .eq("id", doctorId);
    if (error) throw new Error(`updateDoctorFees: ${error.message}`);
}

export async function updateBillingPolicy(
    hospitalId: string,
    policy: Partial<BillingPolicy>
): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (policy.currency !== undefined) patch.currency = policy.currency;
    if (policy.gstEnabled !== undefined) patch.gst_enabled = policy.gstEnabled;
    if (policy.gstPercent !== undefined) patch.gst_percent = policy.gstPercent;
    if (policy.allowDiscount !== undefined) patch.allow_discount = policy.allowDiscount;
    if (!Object.keys(patch).length) return;

    const { error } = await supabase.from("hospitals").update(patch).eq("id", hospitalId);
    if (error) throw new Error(`updateBillingPolicy: ${error.message}`);
}

// ── Money: what has not been collected ─────────────────────────────────────

export interface PendingPayment {
    id: number;
    visitId: string;
    patientName: string | null;
    doctorName: string | null;
    total: number;
    collectedAt: string;
}

/**
 * Payments recorded but not settled. This is the only place in Parallax that
 * reads a patient NAME — Anmol, 2026-09-04, confirmed an admin may see names
 * and money but never clinical detail, and "who still owes ₹400" is unusable
 * as a list of visit ids. No diagnosis, no prescription, no chart is fetched
 * here or anywhere else in this file.
 */
export async function fetchPendingPayments(hospitalId: string, limit = 40): Promise<PendingPayment[]> {
    const { data, error } = await supabase
        .from("visit_payments")
        .select("id, visit_id, total, collected_at, visits ( patients ( name ) ), doctors ( name )")
        .eq("hospital_id", hospitalId)
        .eq("status", "pending")
        .order("collected_at", { ascending: false })
        .limit(limit);
    if (error) throw new Error(`fetchPendingPayments: ${error.message}`);

    return (data ?? []).map((r) => {
        const row = r as unknown as {
            id: number; visit_id: string; total: number | string | null; collected_at: string;
            visits?: { patients?: { name?: string } | null } | null;
            doctors?: { name?: string } | null;
        };
        return {
            id: Number(row.id),
            visitId: row.visit_id,
            patientName: row.visits?.patients?.name ?? null,
            doctorName: row.doctors?.name ?? null,
            total: Number(row.total ?? 0),
            collectedAt: row.collected_at,
        };
    });
}

/** Settle one pending payment. The only write Parallax makes against money
 *  that has already been recorded — it changes status, never an amount, so a
 *  receipt can never be rewritten from this screen. */
export async function markPaymentPaid(paymentId: number): Promise<void> {
    const { error } = await supabase
        .from("visit_payments")
        .update({ status: "paid", updated_at: new Date().toISOString() })
        .eq("id", paymentId);
    if (error) throw new Error(`markPaymentPaid: ${error.message}`);
}

// ── Catalogue ──────────────────────────────────────────────────────────────

export interface ClinicLab {
    id: number;
    name: string;
    contactNote: string | null;
    sortOrder: number;
}

export async function fetchClinicLabs(hospitalId: string): Promise<ClinicLab[]> {
    const { data, error } = await supabase
        .from("clinic_preferred_labs")
        .select("id, name, contact_note, sort_order")
        .eq("hospital_id", hospitalId)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });
    if (error) throw new Error(`fetchClinicLabs: ${error.message}`);
    return (data ?? []).map((r) => ({
        id: Number(r.id),
        name: r.name,
        contactNote: r.contact_note ?? null,
        sortOrder: Number(r.sort_order ?? 0),
    }));
}

export async function addClinicLab(
    hospitalId: string, name: string, contactNote?: string | null
): Promise<void> {
    const clean = name.trim();
    if (!clean) throw new Error("Lab name is required");
    const { error } = await supabase.from("clinic_preferred_labs").insert({
        hospital_id: hospitalId,
        name: clean,
        contact_note: contactNote?.trim() || null,
    });
    // The unique constraint is the duplicate check — asking first would race
    // two admins adding the same lab, and the constraint cannot.
    if (error) {
        if (error.code === "23505") throw new Error(`"${clean}" is already on the clinic list.`);
        throw new Error(`addClinicLab: ${error.message}`);
    }
}

export async function removeClinicLab(id: number): Promise<void> {
    const { error } = await supabase.from("clinic_preferred_labs").delete().eq("id", id);
    if (error) throw new Error(`removeClinicLab: ${error.message}`);
}

/**
 * Copies the clinic list into every doctor's own list.
 *
 * The one action here that reaches into a doctor's personal preferences, which
 * is exactly why it is a deliberate, confirmed button and never a side effect
 * of saving the clinic list. It SKIPS any lab a doctor already has (matched on
 * name) and never sets `is_default` — a doctor's own default must survive, or
 * an admin tidying the house list silently re-points where that doctor sends
 * patients.
 *
 * Returns how many rows it actually added, so the UI can report a real number
 * instead of a shrug.
 */
export async function applyClinicLabsToAllDoctors(hospitalId: string): Promise<number> {
    const [labsRes, docsRes, existingRes] = await Promise.all([
        supabase.from("clinic_preferred_labs").select("name, contact_note, sort_order").eq("hospital_id", hospitalId),
        supabase.from("doctors").select("id").eq("hospital_id", hospitalId),
        supabase.from("doctor_preferred_labs").select("doctor_id, name, sort_order").eq("hospital_id", hospitalId),
    ]);
    if (labsRes.error) throw new Error(`applyClinicLabs (labs): ${labsRes.error.message}`);
    if (docsRes.error) throw new Error(`applyClinicLabs (doctors): ${docsRes.error.message}`);

    const labs = labsRes.data ?? [];
    const doctors = docsRes.data ?? [];
    if (!labs.length || !doctors.length) return 0;

    const existing = existingRes.data ?? [];
    const have = new Set(existing.map((r) => `${r.doctor_id}::${(r.name ?? "").toLowerCase()}`));
    // Clinic labs land BELOW everything a doctor already has — Anmol's rule.
    const maxOrder = new Map<string, number>();
    for (const r of existing) {
        const cur = maxOrder.get(r.doctor_id) ?? -1;
        maxOrder.set(r.doctor_id, Math.max(cur, Number(r.sort_order ?? 0)));
    }

    const rows: Record<string, unknown>[] = [];
    for (const d of doctors) {
        let next = (maxOrder.get(d.id) ?? -1) + 1;
        for (const lab of labs) {
            if (have.has(`${d.id}::${(lab.name ?? "").toLowerCase()}`)) continue;
            rows.push({
                doctor_id: d.id,
                hospital_id: hospitalId,
                name: lab.name,
                contact_note: lab.contact_note ?? null,
                is_default: false,
                sort_order: next++,
            });
        }
    }
    if (!rows.length) return 0;

    const { error } = await supabase.from("doctor_preferred_labs").insert(rows);
    if (error) throw new Error(`applyClinicLabs (insert): ${error.message}`);
    return rows.length;
}

export interface CompositionRequest {
    id: number;
    requestedName: string;
    notes: string | null;
    status: string;
    createdAt: string;
    doctorName: string | null;
}

/**
 * The salts doctors have asked for. Read-only here on purpose: standing rule
 * 22 says a composition is minted through the compositions → gates → rules
 * pipeline by a human, never from the UI, and an admin is not an exception.
 * Anmol, 2026-09-04: "if you start adding random compositions from there it
 * will fuck up our rank." So Parallax shows the queue and its status; it
 * cannot approve anything.
 */
export async function fetchCompositionRequests(hospitalId: string): Promise<CompositionRequest[]> {
    const { data, error } = await supabase
        .from("composition_requests")
        .select("id, requested_name, notes, status, created_at, doctors ( name )")
        .eq("hospital_id", hospitalId)
        .order("created_at", { ascending: false })
        .limit(50);
    if (error) throw new Error(`fetchCompositionRequests: ${error.message}`);
    return (data ?? []).map((r) => {
        const row = r as unknown as {
            id: number; requested_name: string; notes: string | null; status: string;
            created_at: string; doctors?: { name?: string } | null;
        };
        return {
            id: Number(row.id),
            requestedName: row.requested_name,
            notes: row.notes ?? null,
            status: row.status,
            createdAt: row.created_at,
            doctorName: row.doctors?.name ?? null,
        };
    });
}

export interface ClinicMedicine {
    id: number;
    name: string;
    manufacturer: string | null;
    strengthMg: number | null;
    createdAt: string;
}

/** Brands this clinic has added itself. The national catalogue is not shown —
 *  it is tens of thousands of rows and not this clinic's to manage. */
export async function fetchClinicMedicines(hospitalId: string): Promise<ClinicMedicine[]> {
    const { data, error } = await supabase
        .from("medicines")
        .select("id, name, manufacturer, strength_mg, created_at")
        .eq("hospital_id", hospitalId)
        .order("created_at", { ascending: false })
        .limit(100);
    if (error) throw new Error(`fetchClinicMedicines: ${error.message}`);
    return (data ?? []).map((r) => ({
        id: Number(r.id),
        name: r.name,
        manufacturer: r.manufacturer ?? null,
        strengthMg: r.strength_mg === null || r.strength_mg === undefined ? null : Number(r.strength_mg),
        createdAt: r.created_at,
    }));
}

export interface CompositionHit {
    /** `compositions.id` — the salt this brand is attached to. */
    id: number;
    name: string;
}

/**
 * The salt library, searched by name. This is the ONLY search the Catalogue's
 * "Add medicine" flow allows — a brand must name an existing composition, per
 * rule 22. Deliberately a plain `ilike` against `compositions` rather than the
 * `search_intents` RPC the consult screen uses: the admin does not need
 * ranking, synonyms or intent resolution, just "does this salt exist and what
 * is its id".
 */
export async function searchCompositions(query: string): Promise<CompositionHit[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    const { data, error } = await supabase
        .from("compositions")
        .select("id, name")
        .ilike("name", `%${q}%`)
        .order("name", { ascending: true })
        .limit(12);
    if (error) throw new Error(`searchCompositions: ${error.message}`);
    return (data ?? []).map((r) => ({ id: Number(r.id), name: r.name }));
}

/**
 * Adds a brand to the clinic's catalogue, linked to one or more EXISTING
 * compositions. A thin pass-through to the `add_medicine` RPC — which is where
 * every guard lives (rule 22's "composition must exist", the case-insensitive
 * duplicate check, the dosage-form whitelist, the concurrent view refresh).
 *
 * The RPC was widened 2026-09-04 so an admin with no `doctors` row can call it;
 * the row it creates carries a NULL `created_by_doctor_id` because an admin
 * genuinely is not the prescriber. An embedded owner-doctor keeps their
 * attribution as before.
 *
 * The RPC's own RAISE text ("a medicine named … already exists", "unknown
 * composition id(s): …") IS the user-facing message — surfaced verbatim.
 */
export async function addClinicMedicine(opts: {
    name: string;
    compositionIds: number[];
    route?: string | null;
    strengthMg?: number | null;
    manufacturer?: string | null;
}): Promise<void> {
    const { error } = await supabase.rpc("add_medicine", {
        p_name: opts.name.trim(),
        p_composition_ids: opts.compositionIds,
        p_route: opts.route ?? null,
        p_strength_mg: opts.strengthMg ?? null,
        p_manufacturer: opts.manufacturer ?? null,
    });
    if (error) throw new Error(error.message);
}

// ── Plan ───────────────────────────────────────────────────────────────────

/** Asks AREN for something about the subscription — more seats, usually.
 *  A request, not a change: nobody edits their own plan from inside the app. */
export async function createSubscriptionRequest(opts: {
    hospitalId: string;
    requestedBy: string | null;
    kind: string;
    message: string;
    contactEmail?: string | null;
}): Promise<void> {
    const { error } = await supabase.from("subscription_requests").insert({
        hospital_id: opts.hospitalId,
        requested_by: opts.requestedBy,
        kind: opts.kind,
        message: opts.message.trim(),
        contact_email: opts.contactEmail?.trim() || null,
        status: "open",
    });
    if (error) throw new Error(`createSubscriptionRequest: ${error.message}`);
}

// ── Formatting ─────────────────────────────────────────────────────────────

/** Indian digit grouping, no decimals on a whole rupee. Clinics quote round
 *  numbers; "500.00" everywhere is accounting-software texture this product
 *  deliberately does not have. */
export function formatMoney(amount: number, currency = "INR"): string {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
}

/** Compact money for a chart axis, where a full number cannot fit. Lakh and
 *  crore rather than millions — an Indian clinic owner reads "1.2L". */
export function formatMoneyShort(amount: number): string {
    const R = "₹";
    if (amount >= 1e7) return `${R}${(amount / 1e7).toFixed(1)}Cr`;
    if (amount >= 1e5) return `${R}${(amount / 1e5).toFixed(1)}L`;
    if (amount >= 1000) return `${R}${Math.round(amount / 1000)}k`;
    return `${R}${Math.round(amount)}`;
}

/** "4 Sep" — the axis label a manager reads, never an ISO string. Parsed and
 *  formatted in UTC so the label cannot slip a day the way
 *  `new Date("2026-09-04")` does in a negative-offset zone. */
export function formatDayShort(ymd: string): string {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {
        day: "numeric", month: "short", timeZone: "UTC",
    });
}

export function formatRangeLabel(range: DateRange): string {
    if (range.from === range.to) return formatDayShort(range.from);
    return `${formatDayShort(range.from)} – ${formatDayShort(range.to)}`;
}
