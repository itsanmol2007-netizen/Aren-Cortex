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

/**
 * Narrows every number on this page to ONE doctor.
 *
 * Added 2026-09-06 for the doctor's own Overview page. Deliberately an
 * optional filter on the existing read rather than a second
 * `fetchDoctorAnalytics`: the series bucketing, the IST day arithmetic, the
 * previous-period split and the `Metric` shape are the load-bearing parts,
 * and a parallel implementation of them would drift the first time one is
 * fixed. What changes with a `doctorId` is five `.eq()` clauses and how
 * "new patients" is counted — nothing else.
 */
export interface AnalyticsScope {
    /** `doctors.id`. Omitted means the whole clinic, which is what Parallax
     *  and an admin-doctor's Overview both want. */
    doctorId?: string | null;
}

export async function fetchClinicAnalytics(
    hospitalId: string,
    range: DateRange,
    scope: AnalyticsScope = {}
): Promise<ClinicAnalytics> {
    const prev = previousRange(range);
    const doctorId = scope.doctorId || null;

    // ONE window covering both periods, split in memory afterwards. Two round
    // trips per table would double the latency to compute a delta that is
    // arithmetic over rows already being fetched.
    const windowStart = startInstant(prev.from);
    const windowEnd = endInstantExclusive(range.to);

    // ── The doctor filter ──────────────────────────────────────────────────
    //
    // Three of these reads narrow to one bench and three deliberately do not.
    // Each query is built and then conditionally narrowed on its own line
    // rather than through a shared helper: a generic wrapper around
    // supabase-js's builder defeats its type inference outright (TS2589,
    // measured), and spelling the filter out is also what makes the three
    // that are NOT scoped visibly a decision rather than an omission.
    const visitsQuery = supabase.from("visits")
        .select("id, status, assigned_doctor_id, patient_id, created_at")
        .eq("hospital_id", hospitalId)
        .gte("created_at", windowStart).lt("created_at", windowEnd)
        .order("created_at", { ascending: true });

    const rxQuery = supabase.from("prescriptions")
        .select("id, created_at, assigned_doctor_id")
        .eq("hospital_id", hospitalId)
        .gte("created_at", windowStart).lt("created_at", windowEnd);

    // status = "paid" ONLY. This feeds "Collected" (the KPI tile, its
    // sparkline, and every bench's own revenue share below) — money the
    // clinic actually has, not money it's owed. Used to fetch "paid" AND
    // "pending" and sum both without ever branching on `status` (not even
    // selected), so a clinic with, say, ₹500 collected and ₹500 still
    // pending showed "₹1,000 collected" — the exact bug PaymentDetailsModal
    // /`fetchDoctorPaymentSummary` below never had, because that one always
    // split on status. 2026-09-11.
    const payQuery = supabase.from("visit_payments")
        .select("total, fee, discount, method, split_method, split_amount, collected_at, doctor_id")
        .eq("hospital_id", hospitalId)
        .gte("collected_at", windowStart).lt("collected_at", windowEnd)
        .eq("status", "paid");

    // Live counts ignore the range entirely: "who is waiting right now" is
    // not a question about last month.
    const liveQuery = supabase.from("visits")
        .select("status, assigned_doctor_id")
        .eq("hospital_id", hospitalId)
        .gte("created_at", startInstant(clinicToday()));

    const [visitsRes, rxRes, payRes, doctorsRes, newPatRes, liveRes, everPaidRes] = await Promise.all([
        doctorId ? visitsQuery.eq("assigned_doctor_id", doctorId) : visitsQuery,
        doctorId ? rxQuery.eq("assigned_doctor_id", doctorId) : rxQuery,
        doctorId ? payQuery.eq("doctor_id", doctorId) : payQuery,
        // NOT scoped: `benches` is built from this roster, and a scoped call
        // still needs its own doctor's row present in the map rather than
        // falling through as an unknown id.
        supabase.from("doctors")
            .select("id, name, specialization, consultation_fee")
            .eq("hospital_id", hospitalId),
        // NOT scoped: a registration belongs to the CLINIC, not to a bench.
        // The doctor-scoped meaning is resolved in memory below, against the
        // visits already fetched.
        supabase.from("patients")
            .select("id, created_at")
            .eq("hospital_id", hospitalId)
            .gte("created_at", windowStart).lt("created_at", windowEnd),
        doctorId ? liveQuery.eq("assigned_doctor_id", doctorId) : liveQuery,
        // NOT scoped: `revenueTracked` answers "has this CLINIC ever recorded
        // a payment". A doctor who has personally collected nothing at a
        // clinic that bills every day should see ₹0, not "not set up".
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
    for (const p of (payRes.data ?? []) as { total: number | string | null; fee: number | string | null; discount: number | string | null; method: string | null; split_method: string | null; split_amount: number | string | null; collected_at: string; doctor_id: string | null }[]) {
        const amount = Number(p.total ?? 0);
        const splitAmount = p.split_amount === null ? 0 : Number(p.split_amount);
        const ymd = ymdOf(p.collected_at);
        if (inRange(ymd)) {
            curRev += amount;
            const pt = series.get(ymd);
            if (pt) {
                pt.revenue += amount;
                pt.gross += Number(p.fee ?? 0);
                pt.discount += Number(p.discount ?? 0);
                // A split's first portion is `amount - splitAmount` — the
                // amount never stored directly, see `visit_payments`'s
                // `split_method` column comment.
                const firstPortion = splitAmount ? amount - splitAmount : amount;
                if (p.method === "cash") pt.cash += firstPortion;
                else if (p.method === "upi") pt.upi += firstPortion;
                else if (p.method === "card") pt.card += firstPortion;
                if (p.split_method === "cash") pt.cash += splitAmount;
                else if (p.split_method === "upi") pt.upi += splitAmount;
                else if (p.split_method === "card") pt.card += splitAmount;
            }
            const b = p.doctor_id ? bench.get(p.doctor_id) : undefined;
            if (b) b.revenue += amount;
        } else if (inPrev(ymd)) prevRev += amount;
    }

    // ── New registrations ──────────────────────────────────────────────────
    // "New patient" is a REGISTRATION, not a first visit: it is the number a
    // clinic owner actually watches for growth, and it is one cheap query
    // rather than a first-visit-date lookup per patient.
    //
    // Scoped to a doctor, "new patient" has to mean something slightly
    // different, because a registration belongs to the clinic and not to a
    // bench: it becomes "registered in this window AND seen by me". Built
    // from the visits already in hand, so it costs no extra query — and it
    // is the number a doctor actually means by "new patients I saw".
    const seenByScope = doctorId
        ? new Set(visits.map((v) => v.patient_id).filter((id): id is string => !!id))
        : null;

    let curNew = 0, prevNew = 0;
    for (const p of (newPatRes.data ?? []) as { id: string; created_at: string }[]) {
        if (seenByScope && !seenByScope.has(p.id)) continue;
        const ymd = ymdOf(p.created_at);
        if (inRange(ymd)) {
            curNew++;
            const pt = series.get(ymd);
            if (pt) pt.newPatients++;
        } else if (inPrev(ymd)) prevNew++;
    }

    // ── Live ───────────────────────────────────────────────────────────────
    let liveWaiting = 0, liveActive = 0;
    for (const v of (liveRes.data ?? []) as { status: string | null; assigned_doctor_id: string | null }[]) {
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

/**
 * How many patients the WHOLE clinic has seen today.
 *
 * Context on the doctor's own Overview page, and deliberately nothing more
 * than that. It is not rendered next to the doctor's own number as a
 * comparison — "you: 12, clinic: 41" invites a doctor to read their own
 * page as a scoreboard, which is exactly what the bench table in Parallax is
 * for and exactly what this page is not. It is one line of context so a solo
 * doctor's page and a five-bench doctor's page say something true about where
 * they are standing.
 *
 * `head: true` — the count is the whole answer, no rows cross the wire.
 * Returns 0 on error rather than throwing: a missing context line must not
 * take a doctor's own numbers down with it.
 */
export async function countClinicVisitsToday(hospitalId: string): Promise<number> {
    const { count, error } = await supabase
        .from("visits")
        .select("id", { count: "exact", head: true })
        .eq("hospital_id", hospitalId)
        .gte("created_at", `${clinicToday()}T00:00:00.000${IST_OFFSET}`);
    if (error) {
        console.error("countClinicVisitsToday:", error.message);
        return 0;
    }
    return count ?? 0;
}

// ── Who administers this clinic ────────────────────────────────────────────

/**
 * How many people at this clinic hold an administration role.
 *
 * One of two inputs to `resolveAdminAccess` beyond the caller's own role (the
 * other being `doctors.is_clinic_admin` for the signed-in doctor, read
 * straight off their identity) — together they're the reason a doctor's
 * Overview grows or loses its admin layer on its own as a clinic hires or
 * loses an office manager, or as a doctor is promoted/demoted. `head: true` —
 * the count is the entire answer, no rows need to cross the wire.
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

/** One row per doctor, for the admin-doctor's own bench-management card in
 *  Overview (and Parallax's People page, which writes the same column). Kept
 *  separate from `fetchClinicAnalytics`'s `benches` — that read is about
 *  PERFORMANCE in a date range; this one is about WHO can be managed and
 *  what authority they currently hold, which has no range. */
export interface DoctorRosterRow {
    doctorId: string;
    /** `users.id` — null for a `doctors` row nobody has registered a login
     *  against yet, in which case there is no account to activate/deactivate
     *  or promote. */
    userId: string | null;
    name: string;
    specialization: string | null;
    isClinicAdmin: boolean;
    /** From the linked `users` row; true when there is none (nothing to
     *  deactivate, so nothing reads as already-off). */
    isActive: boolean;
}

export async function fetchDoctorRoster(hospitalId: string): Promise<DoctorRosterRow[]> {
    const { data, error } = await supabase
        .from("doctors")
        .select("id, name, specialization, is_clinic_admin, user_id, users(is_active)")
        .eq("hospital_id", hospitalId)
        .order("name", { ascending: true });
    if (error) throw new Error(`fetchDoctorRoster: ${error.message}`);
    return (data ?? []).map((d) => {
        // A to-one embed comes back as an object with the inferred FK, but
        // supabase-js's generic types see the relationship as possibly a
        // list — narrow defensively rather than fighting the generated type.
        const linkedUser = Array.isArray(d.users) ? d.users[0] : d.users;
        return {
            doctorId: d.id,
            userId: d.user_id,
            name: d.name ?? "Unnamed doctor",
            specialization: d.specialization ?? null,
            isClinicAdmin: !!d.is_clinic_admin,
            isActive: linkedUser?.is_active ?? true,
        };
    });
}

/**
 * Grants or revokes a DOCTOR's clinic-admin authority. Additive to
 * `users.role`, which this never touches — see the migration's own comment
 * and `adminAccess.ts`'s file header for why.
 *
 * Callable from two places: Parallax's People page (a non-doctor admin
 * managing doctors) and an admin-doctor's own Overview (managing a
 * colleague) — both go through this one function so the write is in exactly
 * one place. Neither caller may target THEMSELVES; enforce that at the call
 * site the same way PeoplePage already guards against self-deactivation
 * (`is_active`) — irreversible from here for the same reason: the surface
 * that could undo it is the one they just lost.
 */
export async function setDoctorClinicAdmin(doctorId: string, isClinicAdmin: boolean): Promise<void> {
    const { error } = await supabase.from("doctors")
        .update({ is_clinic_admin: isClinicAdmin })
        .eq("id", doctorId);
    if (error) throw new Error(`setDoctorClinicAdmin: ${error.message}`);
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

// ── The doctor's own Payment Details ────────────────────────────────────────
//
// Everything below is scoped to ONE doctor, for Overview's "Collected" tile —
// a different shape of question than Parallax's Money page, which is
// clinic-wide and run by whoever owns the till. This never reads a diagnosis
// or a prescription's contents, same rule `fetchPendingPayments` above
// already states: money and a patient's name, never clinical detail.

export interface PaymentTransaction {
    id: number;
    patientId: string | null;
    patientName: string | null;
    /** `collected_at` — when this row was actually recorded, which is the
     *  date a doctor means by "when did this get paid". */
    at: string;
    amount: number;
    status: string;
    method: string | null;
    /** Set only for a split payment — the second method, and how much of
     *  `amount` went through it (see `visit_payments.split_method`'s own
     *  comment). The first portion is `amount - splitAmount`. */
    splitMethod: string | null;
    splitAmount: number | null;
}

export interface DoctorPaymentSummary {
    totalCollected: number;
    pendingAmount: number;
    paidCount: number;
    pendingCount: number;
    /** `totalCollected`, split by how it came in — PAID rows only, same rule
     *  `totalCollected` itself follows. "in what and which way these payments
     *  has been collected — it should be very clearly shown" (Anmol,
     *  2026-09-11): a total alone answers "how much", not "how". `other`
     *  catches anything that isn't one of the three the payment rail offers
     *  today, so a future method never silently vanishes from the sum. */
    byMethod: { cash: number; upi: number; card: number; other: number };
    transactions: PaymentTransaction[];
}

/**
 * One doctor's money, over one range — the numbers behind Overview's
 * "Collected" tile once it is clicked open.
 *
 * Scoped to the SAME range the tile itself is showing, not "all time": a
 * doctor who just picked "This month" on the KPI and then opens Payment
 * Details expects the transactions under that number, not a different and
 * larger question.
 */
export async function fetchDoctorPaymentSummary(
    hospitalId: string,
    doctorId: string,
    range: DateRange,
    limit = 40
): Promise<DoctorPaymentSummary> {
    const { data, error } = await supabase
        .from("visit_payments")
        .select("id, visit_id, total, status, method, split_method, split_amount, collected_at, visits ( patients ( id, name ) )")
        .eq("hospital_id", hospitalId)
        .eq("doctor_id", doctorId)
        .gte("collected_at", startInstant(range.from))
        .lt("collected_at", endInstantExclusive(range.to))
        .in("status", ["paid", "pending"])
        .order("collected_at", { ascending: false })
        .limit(limit);
    if (error) throw new Error(`fetchDoctorPaymentSummary: ${error.message}`);

    const rows = (data ?? []).map((r) => {
        const row = r as unknown as {
            id: number; total: number | string | null; status: string; method: string | null;
            split_method: string | null; split_amount: number | string | null;
            collected_at: string;
            visits?: { patients?: { id?: string; name?: string } | null } | null;
        };
        return {
            id: Number(row.id),
            patientId: row.visits?.patients?.id ?? null,
            patientName: row.visits?.patients?.name ?? null,
            at: row.collected_at,
            amount: Number(row.total ?? 0),
            status: row.status,
            method: row.method,
            splitMethod: row.split_method,
            splitAmount: row.split_amount === null ? null : Number(row.split_amount),
        };
    });

    let totalCollected = 0, pendingAmount = 0, paidCount = 0, pendingCount = 0;
    const byMethod = { cash: 0, upi: 0, card: 0, other: 0 };
    const bumpMethod = (m: string | null, amt: number) => {
        if (m === "cash") byMethod.cash += amt;
        else if (m === "upi") byMethod.upi += amt;
        else if (m === "card") byMethod.card += amt;
        else byMethod.other += amt;
    };
    for (const r of rows) {
        if (r.status === "paid") {
            totalCollected += r.amount; paidCount++;
            // A split's first portion is never stored directly — it's
            // whatever `amount` didn't go through `splitMethod`.
            const firstPortion = r.splitAmount ? r.amount - r.splitAmount : r.amount;
            bumpMethod(r.method, firstPortion);
            if (r.splitMethod && r.splitAmount) bumpMethod(r.splitMethod, r.splitAmount);
        }
        else if (r.status === "pending") { pendingAmount += r.amount; pendingCount++; }
    }

    return { totalCollected, pendingAmount, paidCount, pendingCount, byMethod, transactions: rows };
}

// ── The doctor's own activity — visits and prescriptions ────────────────────
//
// The other two clickable KPI tiles ("Patients seen", "Prescriptions") open
// onto the same shape: who, and when. `kind` carries just enough to phrase a
// row's second line without a second component per tile.

export interface DoctorActivityRow {
    id: string;
    patientId: string | null;
    patientName: string | null;
    at: string;
    /** "Completed" / "Waiting" / … for a visit row; null for a prescription
     *  row, which has nothing else to say about itself. */
    detail: string | null;
}

const VISIT_STATUS_LABEL: Record<ReturnType<typeof visitStatusKind>, string> = {
    done: "Completed",
    active: "In progress",
    waiting: "Waiting",
    inactive: "Discarded",
};

/**
 * Every visit this doctor had in `range` that actually counts — the list
 * behind "Patients seen".
 *
 * Excludes `inactive` (discarded) visits, the SAME rule
 * `fetchClinicAnalytics` states for the KPI this list is opened FROM: "a
 * discarded visit is not work the clinic did, so it counts toward nothing
 * anywhere on this page." Missed this the first time (caught live 2026-09-07
 * by actually opening the modal: the tile said 17, the list said 18 — one
 * discarded row the tile correctly ignored and the list didn't). Filtered
 * after the fetch rather than in SQL, so a very active doctor's discards can
 * in principle push the visible count under `limit` below their true total —
 * an acceptable approximation for a capped "recent activity" list, not for
 * the number on the tile itself.
 */
export async function fetchDoctorVisitRows(
    hospitalId: string,
    doctorId: string,
    range: DateRange,
    limit = 60
): Promise<DoctorActivityRow[]> {
    const { data, error } = await supabase
        .from("visits")
        .select("id, patient_id, created_at, status, patients ( name )")
        .eq("hospital_id", hospitalId)
        .eq("assigned_doctor_id", doctorId)
        .gte("created_at", startInstant(range.from))
        .lt("created_at", endInstantExclusive(range.to))
        .order("created_at", { ascending: false })
        .limit(limit);
    if (error) throw new Error(`fetchDoctorVisitRows: ${error.message}`);

    return (data ?? [])
        .map((r) => {
            const row = r as unknown as {
                id: string; patient_id: string | null; created_at: string; status: string | null;
                patients?: { name?: string } | null;
            };
            return {
                id: row.id,
                patientId: row.patient_id,
                patientName: row.patients?.name ?? null,
                at: row.created_at,
                kind: visitStatusKind(row.status ?? ""),
            };
        })
        .filter((r) => r.kind !== "inactive")
        .map((r) => ({
            id: r.id, patientId: r.patientId, patientName: r.patientName, at: r.at,
            detail: VISIT_STATUS_LABEL[r.kind],
        }));
}

/**
 * Every prescription this doctor wrote in `range` — the list behind
 * "Prescriptions". `prescriptions` carries no `patient_id` of its own (only
 * `visit_id`); the nested select below reaches the patient through the same
 * visit the prescription belongs to, in one round trip rather than a second
 * query per row.
 */
export async function fetchDoctorPrescriptionRows(
    hospitalId: string,
    doctorId: string,
    range: DateRange,
    limit = 60
): Promise<DoctorActivityRow[]> {
    const { data, error } = await supabase
        .from("prescriptions")
        .select("id, created_at, visits ( patient_id, patients ( name ) )")
        .eq("hospital_id", hospitalId)
        .eq("assigned_doctor_id", doctorId)
        .gte("created_at", startInstant(range.from))
        .lt("created_at", endInstantExclusive(range.to))
        .order("created_at", { ascending: false })
        .limit(limit);
    if (error) throw new Error(`fetchDoctorPrescriptionRows: ${error.message}`);

    return (data ?? []).map((r) => {
        const row = r as unknown as {
            id: string; created_at: string;
            visits?: { patient_id?: string | null; patients?: { name?: string } | null } | null;
        };
        return {
            id: row.id,
            patientId: row.visits?.patient_id ?? null,
            patientName: row.visits?.patients?.name ?? null,
            at: row.created_at,
            detail: null,
        };
    });
}

/**
 * Every patient who first registered in `range` — the list behind
 * "New patients" (2026-09-08: that tile used to be a plain read with
 * nothing behind it, "there is no deeper screen it would open onto that
 * Patients Seen doesn't already cover" — Anmol asked for one anyway, with
 * the date they came and what they paid).
 *
 * "New" means the same thing `fetchClinicAnalytics` already counts:
 * registered in the window, and — when scoped to one doctor — actually SEEN
 * by that doctor within it (a registration belongs to the clinic, not a
 * bench). `detail` is the first paid amount found for a visit of theirs in
 * the same window, or null when nothing was ever marked paid — never a
 * guess at "the" fee, since a patient can have more than one visit type.
 */
export async function fetchNewPatientRows(
    hospitalId: string,
    range: DateRange,
    scope: AnalyticsScope = {},
    limit = 100
): Promise<DoctorActivityRow[]> {
    const windowStart = startInstant(range.from);
    const windowEnd = endInstantExclusive(range.to);

    const patRes = await supabase
        .from("patients")
        .select("id, name, created_at")
        .eq("hospital_id", hospitalId)
        .gte("created_at", windowStart).lt("created_at", windowEnd)
        .order("created_at", { ascending: false })
        .limit(limit);
    if (patRes.error) throw new Error(`fetchNewPatientRows: ${patRes.error.message}`);
    let patients = patRes.data ?? [];

    if (scope.doctorId) {
        const seenRes = await supabase
            .from("visits")
            .select("patient_id")
            .eq("hospital_id", hospitalId)
            .eq("assigned_doctor_id", scope.doctorId)
            .gte("created_at", windowStart).lt("created_at", windowEnd);
        if (seenRes.error) throw new Error(`fetchNewPatientRows (seen): ${seenRes.error.message}`);
        const seen = new Set((seenRes.data ?? []).map((v) => v.patient_id));
        patients = patients.filter((p) => seen.has(p.id));
    }
    if (!patients.length) return [];

    // First paid amount per patient, resolved through their visits in the
    // same window — `visit_payments` has no `patient_id` of its own.
    const patientIds = patients.map((p) => p.id);
    const visitsRes = await supabase
        .from("visits")
        .select("id, patient_id")
        .in("patient_id", patientIds)
        .gte("created_at", windowStart).lt("created_at", windowEnd);
    const visitToPatient = new Map((visitsRes.data ?? []).map((v) => [v.id as string, v.patient_id as string]));
    const amountByPatient = new Map<string, number>();
    if (visitToPatient.size) {
        const payRes = await supabase
            .from("visit_payments")
            .select("visit_id, total, status")
            .in("visit_id", [...visitToPatient.keys()])
            .eq("status", "paid");
        for (const row of payRes.data ?? []) {
            const pid = visitToPatient.get(row.visit_id);
            if (pid && !amountByPatient.has(pid)) amountByPatient.set(pid, Number(row.total));
        }
    }

    return patients.map((p) => ({
        id: p.id,
        patientId: p.id,
        patientName: p.name,
        at: p.created_at,
        detail: amountByPatient.has(p.id) ? formatMoney(amountByPatient.get(p.id)!) : null,
    }));
}

// ── The patient-safe ledger behind a trend chart — CSV export ───────────────
//
// 2026-09-08, Anmol, on the Patient-flow/Collections chart: "you should be
// able to click on this graph, and it will open... a complete list... also
// an option of exporting that thing as a CSV." What the CSV holds was its
// own explicit requirement: "just like this patient came into this clinic
// on this date, paid this much amount or some basic detail, not their
// actual clinical details which are sensitive."
//
// So this is deliberately NOT `fetchDoctorVisitRows` reused — that one
// exists to answer "who did I see", this one exists to leave the building
// as a spreadsheet, and the columns a doctor is willing to click a button
// and hand to someone are narrower than the ones a doctor is willing to
// glance at on their own screen. One row per visit (a patient who came
// twice in the window is two rows, same as the chart itself counts them);
// `amount` is null rather than 0 when nothing was ever marked paid, so a
// free consultation and an unrecorded one stay visibly different in the
// export.
export interface PatientLedgerRow {
    id: string;
    patientId: string | null;
    patientName: string | null;
    at: string;
    amount: number | null;
}

export async function fetchPatientLedgerRows(
    hospitalId: string,
    range: DateRange,
    scope: AnalyticsScope = {},
    limit = 1000
): Promise<PatientLedgerRow[]> {
    let query = supabase
        .from("visits")
        .select("id, patient_id, created_at, status, patients ( name )")
        .eq("hospital_id", hospitalId)
        .gte("created_at", startInstant(range.from))
        .lt("created_at", endInstantExclusive(range.to))
        .order("created_at", { ascending: false })
        .limit(limit);
    if (scope.doctorId) query = query.eq("assigned_doctor_id", scope.doctorId);

    const { data, error } = await query;
    if (error) throw new Error(`fetchPatientLedgerRows: ${error.message}`);

    // Same "a discarded visit is not work the clinic did" rule
    // `fetchClinicAnalytics`/`fetchDoctorVisitRows` already state — a
    // discarded visit belongs in nothing derived from this page, the export
    // included.
    const rows = (data ?? [])
        .map((r) => {
            const row = r as unknown as {
                id: string; patient_id: string | null; created_at: string; status: string | null;
                patients?: { name?: string } | null;
            };
            return {
                id: row.id,
                patientId: row.patient_id,
                patientName: row.patients?.name ?? null,
                at: row.created_at,
                kind: visitStatusKind(row.status ?? ""),
            };
        })
        .filter((r) => r.kind !== "inactive");
    if (!rows.length) return [];

    const payRes = await supabase
        .from("visit_payments")
        .select("visit_id, total, status")
        .in("visit_id", rows.map((r) => r.id))
        .eq("status", "paid");
    if (payRes.error) throw new Error(`fetchPatientLedgerRows (payments): ${payRes.error.message}`);
    const amountByVisit = new Map<string, number>();
    for (const p of payRes.data ?? []) {
        // First paid row wins — same "don't guess at a total, take the first
        // recorded payment" convention `fetchNewPatientRows` uses.
        if (!amountByVisit.has(p.visit_id)) amountByVisit.set(p.visit_id, Number(p.total));
    }

    return rows.map((r) => ({
        id: r.id,
        patientId: r.patientId,
        patientName: r.patientName,
        at: r.at,
        amount: amountByVisit.get(r.id) ?? null,
    }));
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
