// ---------------------------------------------------------------------------
// Visit gateways — the token+QR handoff for "upload documents from your
// phone". SHARED with the separate arenode.com landing-page project, which
// owns the actual upload interface; this file's job stops at generating and
// managing the token+QR and reading live status back — see the
// `add_visit_gateways` migration for the full schema reasoning.
//
// One row per visit, for its whole lifecycle (visit_id is UNIQUE): expiring
// or cancelling a session never inserts a new row, it reactivates this one
// with a fresh token — `ensureActiveGatewaySession` is the one entry point
// both "Upload from phone" triggers (intake and the queue row's kebab menu)
// call, so they can never create two competing sessions for the same visit.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";

export type GatewayStatus = "active" | "expired" | "discarded";

/** A resumable session gets at most this many reactivations before the UI
 *  stops offering "Resume?" and offers "Start a new session" instead — see
 *  `canResume`. Not a DB constraint (see the migration) because it's a UX
 *  call, not a data-integrity one. */
const MAX_EXTENSIONS = 2;

const SESSION_MINUTES = 15;

export interface VisitGateway {
    id: number;
    visitId: string;
    patientId: string;
    hospitalId: string;
    token: string;
    status: GatewayStatus;
    createdAt: string;
    expiresAt: string;
    extensionCount: number;
    documentsUploadedCount: number;
    patientMarkedDone: boolean;
    revoked: boolean;
}

const GATEWAY_COLUMNS =
    "id, visit_id, patient_id, hospital_id, token, status, created_at, expires_at, extension_count, documents_uploaded_count, patient_marked_done, revoked";

function fromRow(r: {
    id: number;
    visit_id: string;
    patient_id: string;
    hospital_id: string;
    token: string;
    status: string;
    created_at: string;
    expires_at: string;
    extension_count: number;
    documents_uploaded_count: number;
    patient_marked_done: boolean;
    revoked: boolean;
}): VisitGateway {
    return {
        id: r.id,
        visitId: r.visit_id,
        patientId: r.patient_id,
        hospitalId: r.hospital_id,
        token: r.token,
        status: r.status as GatewayStatus,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
        extensionCount: r.extension_count,
        documentsUploadedCount: r.documents_uploaded_count,
        patientMarkedDone: r.patient_marked_done,
        revoked: r.revoked,
    };
}

/** `expires_at` passing is a fact about time, not something anything sweeps
 *  the `status` column for — nothing in this app runs a cron. A row can sit
 *  with `status='active'` and a past `expires_at` until the next thing reads
 *  it, so every reader treats "past its expiry" as expired regardless of
 *  what the column says, the same way a JWT is expired the instant its `exp`
 *  passes, not when something gets around to revoking it. */
export function isEffectivelyExpired(g: VisitGateway): boolean {
    return g.status === "active" && new Date(g.expiresAt).getTime() <= Date.now();
}

/** Past the extension cap, "Resume?" stops being offered — see MAX_EXTENSIONS. */
export function canResume(g: VisitGateway): boolean {
    return g.extensionCount < MAX_EXTENSIONS;
}

// Web Crypto, not Math.random — this token is a bearer credential the
// landing page's upload UI authorizes with, so it must be unpredictable, not
// merely unlikely to collide. 256 bits, base64url (no padding) so it drops
// straight into a URL path segment with no encoding.
function randomToken(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    let binary = "";
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function fetchGatewayForVisit(visitId: string): Promise<VisitGateway | null> {
    const { data, error } = await supabase
        .from("visit_gateways")
        .select(GATEWAY_COLUMNS)
        .eq("visit_id", visitId)
        .maybeSingle();
    if (error) throw new Error(`fetchGatewayForVisit: ${error.message}`);
    return data ? fromRow(data) : null;
}

/**
 * Reactivate an existing row — a resumed "expired" session, a reactivated
 * "discarded" one, or (rare) an "active" one whose `expires_at` has quietly
 * passed. Always a fresh token (the old one is dead the instant this runs),
 * always a full 15-minute window, always the SAME row (see the migration's
 * `visit_id unique`).
 *
 * `documents_uploaded_count` is deliberately NOT reset — those are real
 * files already sitting on the visit, uploaded under a token that is now
 * dead; zeroing the counter would make the badge lie about what is actually
 * there. `patient_marked_done` DOES reset: resuming is reception saying
 * "there's more to upload", which un-does whatever the patient signalled
 * about being finished with the old link.
 *
 * `resetExtensionCount` is only ever true from the "start a new session"
 * affordance past `canResume`'s cap — the same reactivation, deliberately
 * given a fresh lifecycle rather than staying capped forever.
 */
export async function resumeGatewaySession(
    g: VisitGateway,
    opts?: { resetExtensionCount?: boolean }
): Promise<VisitGateway> {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + SESSION_MINUTES * 60_000).toISOString();
    const { data, error } = await supabase
        .from("visit_gateways")
        .update({
            token,
            status: "active",
            expires_at: expiresAt,
            extension_count: opts?.resetExtensionCount ? 0 : g.extensionCount + 1,
            revoked: false,
            patient_marked_done: false,
            updated_at: new Date().toISOString(),
        })
        .eq("id", g.id)
        .select(GATEWAY_COLUMNS)
        .single();
    if (error) throw new Error(`resumeGatewaySession: ${error.message}`);
    return fromRow(data);
}

/**
 * The one entry point "Upload from phone" calls, from either entry point —
 * see this file's own header. Deliberately does NOT auto-resume an expired
 * or discarded row: the brief's own flow is two steps ("show 'This QR
 * session expired. Resume?' ... on click, flip status back to active"), so
 * an expired/discarded row is returned AS-IS and the QR modal itself
 * decides whether to show the resume prompt (see GatewayQrModal's
 * `useIsExpired`) — resuming only ever happens from that explicit button,
 * via `resumeGatewaySession`/`resumeCurrent`.
 *   none exists          -> insert fresh, status active, 15-minute window.
 *   any row already there -> return it untouched, whatever its status —
 *                            never regenerate a token for a still-live
 *                            session, never silently resume a dead one.
 */
export async function ensureActiveGatewaySession(opts: {
    visitId: string;
    patientId: string;
    hospitalId: string;
}): Promise<VisitGateway> {
    const existing = await fetchGatewayForVisit(opts.visitId);
    if (existing) return existing;

    const token = randomToken();
    const expiresAt = new Date(Date.now() + SESSION_MINUTES * 60_000).toISOString();
    const { data, error } = await supabase
        .from("visit_gateways")
        .insert({
            visit_id: opts.visitId,
            patient_id: opts.patientId,
            hospital_id: opts.hospitalId,
            token,
            status: "active",
            expires_at: expiresAt,
        })
        .select(GATEWAY_COLUMNS)
        .single();
    if (error) {
        // 23505 = unique_violation. Only reachable if another click (a second
        // entry point, or a double-click) won the race between our SELECT
        // above and this INSERT — visit_id is UNIQUE, so the loser here
        // re-reads the row the winner just created, rather than surfacing a
        // confusing "already exists" error for something the UI never
        // suggested was a conflict.
        if ((error as { code?: string }).code === "23505") {
            const raced = await fetchGatewayForVisit(opts.visitId);
            if (raced) return raced;
        }
        throw new Error(`ensureActiveGatewaySession: ${error.message}`);
    }
    return fromRow(data);
}

/** The receptionist's own deliberate "Cancel this link" — distinct from
 *  minimizing (which never touches this row) and from natural expiry. */
export async function cancelGatewaySession(id: number): Promise<void> {
    const { error } = await supabase
        .from("visit_gateways")
        .update({ status: "discarded", revoked: true, updated_at: new Date().toISOString() })
        .eq("id", id);
    if (error) throw new Error(`cancelGatewaySession: ${error.message}`);
}

/** One entry in the header badge's popover — resolved patient name and
 *  token number, never the raw token or row id (see the brief: "not raw
 *  tokens or IDs"). */
export interface GatewaySessionSummary {
    gateway: VisitGateway;
    patientName: string;
    tokenNumber: number | null;
}

/** Clinic-wide, not scoped to this receptionist's own computer — every
 *  signed-in reception session at this hospital sees the same list, which is
 *  the whole point of a shared badge. Effectively-expired rows are filtered
 *  out here even if their `status` column hasn't caught up yet (see
 *  `isEffectivelyExpired`), so the badge count is always honest. */
export async function fetchActiveGatewaySessions(hospitalId: string): Promise<GatewaySessionSummary[]> {
    const { data: rows, error } = await supabase
        .from("visit_gateways")
        .select(GATEWAY_COLUMNS)
        .eq("hospital_id", hospitalId)
        .eq("status", "active")
        .order("created_at", { ascending: false });
    if (error) throw new Error(`fetchActiveGatewaySessions: ${error.message}`);
    const gateways = (rows ?? []).map(fromRow).filter((g) => !isEffectivelyExpired(g));
    if (gateways.length === 0) return [];

    const patientIds = [...new Set(gateways.map((g) => g.patientId))];
    const visitIds = gateways.map((g) => g.visitId);

    const [{ data: patients }, { data: visits }] = await Promise.all([
        supabase.from("patients").select("id, name").in("id", patientIds),
        supabase.from("visits").select("id, token_number").in("id", visitIds),
    ]);
    const nameByPatient = new Map((patients ?? []).map((p: any) => [p.id, p.name as string]));
    const tokenByVisit = new Map((visits ?? []).map((v: any) => [v.id, v.token_number as number | null]));

    return gateways.map((gateway) => ({
        gateway,
        patientName: nameByPatient.get(gateway.patientId) ?? "Patient",
        tokenNumber: tokenByVisit.get(gateway.visitId) ?? null,
    }));
}

/** Realtime — identical mechanism to `subscribeDoctorRequests` (see
 *  lib/db/patients.ts): refetch on any insert/update/delete for this
 *  hospital's rows, polling stays on elsewhere as the safety net. */
export function subscribeGatewaySessions(hospitalId: string, onChange: () => void): () => void {
    const channel = supabase
        .channel(`visit_gateways:${hospitalId}:${Date.now()}`)
        .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "visit_gateways", filter: `hospital_id=eq.${hospitalId}` },
            () => onChange()
        )
        .subscribe();
    return () => {
        void supabase.removeChannel(channel);
    };
}

export { MAX_EXTENSIONS, SESSION_MINUTES };
