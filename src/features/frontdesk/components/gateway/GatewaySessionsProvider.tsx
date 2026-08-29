import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
    cancelGatewaySession, ensureActiveGatewaySession, fetchActiveGatewaySessions, fetchGatewayForVisit,
    isEffectivelyExpired, resumeGatewaySession, subscribeGatewaySessions,
    type GatewaySessionSummary, type VisitGateway,
} from "@/lib/db/gateways";
import { useHospitalId } from "../../hooks/useHospitalId";

// ---------------------------------------------------------------------------
// The one place "upload from phone" state lives — mounted once by
// WorkspaceShell, so it survives navigating between Front Desk, Patients,
// etc. (each of which remounts its OWN copy of WorkspaceShell — see that
// file's header) for as long as this reception session is on ONE of those
// pages. The active-sessions LIST itself needs no client-side persistence
// across that remount at all: it's a straight read of `visit_gateways`,
// refreshed on mount + Realtime + a 30s poll safety net (same shape as
// subscribeDoctorRequests), so "app-level state or refetched from Supabase"
// (the brief's own words) is satisfied by the refetch half, not a store.
//
// What DOES need a home above any one page's own modals: the QR modal a
// receptionist just minimized. Rendering GatewayQrModal here, once, as a
// sibling of every page's `children` — rather than inside CreateVisitModal
// or VisitAttachmentsModal, which is where the two "Upload from phone"
// BUTTONS live — is what lets minimizing survive those buttons' own modal
// closing, or even a full page navigation.
// ---------------------------------------------------------------------------

/** What the modal is currently showing — a state machine, not a boolean,
 *  because "loading" means two different things depending on entry point:
 *  intake (no visit yet at all) vs. an existing visit (just fetching/
 *  creating its gateway row). See CreateVisitModal / VisitAttachmentsModal's
 *  own "Upload from phone" handlers for which one calls which. */
export type GatewayModalState =
    | { phase: "creating_visit"; patientLabel: string }
    | { phase: "loading"; visitId: string; patientLabel: string; visitLabel: string }
    | { phase: "ready"; session: VisitGateway; patientLabel: string; visitLabel: string }
    | { phase: "error"; patientLabel: string; message: string };

interface GatewaySessionsValue {
    /** Clinic-wide active sessions — the header badge/popover's data. */
    sessions: GatewaySessionSummary[];
    /** The gateway session for one visit, if this visit has an active one —
     *  lets a caller (VisitAttachmentsModal, the intake field) show "already
     *  active for this visit" without its own fetch. */
    sessionForVisit: (visitId: string) => GatewaySessionSummary | null;
    modal: GatewayModalState | null;
    /** Entry point 2 (a visit already exists), and the second half of entry
     *  point 1 once CreateVisitModal's onSuccess hands back a real visit id. */
    openForVisit: (args: { visitId: string; patientId: string; patientLabel: string; visitLabel: string }) => void;
    /** Entry point 1's first half — shows the loading modal immediately,
     *  before any visit exists to attach a gateway to. */
    beginCreatingVisit: (patientLabel: string) => void;
    /** Reopening a session from the badge popover — the row already carries
     *  everything the modal needs, so this never re-fetches. */
    reopen: (summary: GatewaySessionSummary) => void;
    /** X button — never touches the DB (see the brief: minimizing must not
     *  affect the underlying row). */
    minimize: () => void;
    cancelCurrent: () => Promise<void>;
    resumeCurrent: (opts?: { resetExtensionCount?: boolean }) => Promise<void>;
}

const GatewaySessionsContext = createContext<GatewaySessionsValue | null>(null);

export function useGatewaySessions(): GatewaySessionsValue {
    const ctx = useContext(GatewaySessionsContext);
    if (!ctx) throw new Error("useGatewaySessions must be used inside GatewaySessionsProvider");
    return ctx;
}

const POLL_MS = 30_000;

export function GatewaySessionsProvider({ children }: { children: React.ReactNode }) {
    const hospitalId = useHospitalId();
    const [sessions, setSessions] = useState<GatewaySessionSummary[]>([]);
    const [modal, setModal] = useState<GatewayModalState | null>(null);
    // Read inside the Realtime callback / async continuations below, which
    // outlive any single render — a plain closure over `modal` would see a
    // stale phase/session the instant two events land close together.
    const modalRef = useRef<GatewayModalState | null>(null);
    modalRef.current = modal;

    const loadSessions = useCallback(() => {
        if (!hospitalId) return;
        fetchActiveGatewaySessions(hospitalId)
            .then(setSessions)
            .catch((err) => console.warn("fetchActiveGatewaySessions failed (non-fatal):", err));
    }, [hospitalId]);

    // Realtime (instant on a real write) + a 30s poll (the same safety-net
    // shape as doctor_requests, and the ONLY thing that notices a session's
    // `expires_at` has quietly passed with no write to trigger a Realtime
    // event — see isEffectivelyExpired's own comment).
    useEffect(() => {
        if (!hospitalId) return;
        loadSessions();
        const unsubscribe = subscribeGatewaySessions(hospitalId, () => {
            loadSessions();
            // The row a receptionist is actively looking at deserves fresher
            // truth than "wait for the next poll" — re-read it directly.
            const m = modalRef.current;
            const openVisitId = m?.phase === "ready" ? m.session.visitId : m?.phase === "loading" ? m.visitId : null;
            if (!openVisitId) return;
            fetchGatewayForVisit(openVisitId)
                .then((fresh) => {
                    if (!fresh) return;
                    setModal((curr) => {
                        if (!curr || (curr.phase !== "ready" && curr.phase !== "loading")) return curr;
                        const currVisitId = curr.phase === "ready" ? curr.session.visitId : curr.visitId;
                        return currVisitId === openVisitId
                            ? { phase: "ready", session: fresh, patientLabel: curr.patientLabel, visitLabel: curr.visitLabel }
                            : curr;
                    });
                })
                .catch(() => { /* the poll below self-corrects */ });
        });
        const poll = setInterval(loadSessions, POLL_MS);
        return () => {
            unsubscribe();
            clearInterval(poll);
        };
    }, [hospitalId, loadSessions]);

    const sessionForVisit = useCallback(
        (visitId: string) => sessions.find((s) => s.gateway.visitId === visitId) ?? null,
        [sessions]
    );

    const openForVisit = useCallback(
        ({ visitId, patientId, patientLabel, visitLabel }: { visitId: string; patientId: string; patientLabel: string; visitLabel: string }) => {
            if (!hospitalId) return;
            setModal({ phase: "loading", visitId, patientLabel, visitLabel });
            ensureActiveGatewaySession({ visitId, patientId, hospitalId })
                .then((session) => {
                    setModal((curr) =>
                        curr && curr.phase === "loading" && curr.visitId === visitId
                            ? { phase: "ready", session, patientLabel, visitLabel }
                            : curr
                    );
                    loadSessions();
                })
                .catch((err) => {
                    console.error("ensureActiveGatewaySession failed:", err);
                    setModal({ phase: "error", patientLabel, message: err instanceof Error ? err.message : String(err) });
                });
        },
        [hospitalId, loadSessions]
    );

    const beginCreatingVisit = useCallback((patientLabel: string) => {
        setModal({ phase: "creating_visit", patientLabel });
    }, []);

    const reopen = useCallback((summary: GatewaySessionSummary) => {
        setModal({
            phase: "ready",
            session: summary.gateway,
            patientLabel: summary.patientName,
            visitLabel: summary.tokenNumber != null ? `#${String(summary.tokenNumber).padStart(3, "0")}` : "",
        });
    }, []);

    const minimize = useCallback(() => setModal(null), []);

    const cancelCurrent = useCallback(async () => {
        const m = modalRef.current;
        if (!m || m.phase !== "ready") return;
        await cancelGatewaySession(m.session.id);
        setModal(null);
        loadSessions();
    }, [loadSessions]);

    const resumeCurrent = useCallback(async (opts?: { resetExtensionCount?: boolean }) => {
        const m = modalRef.current;
        if (!m || m.phase !== "ready") return;
        const fresh = await resumeGatewaySession(m.session, opts);
        setModal({ phase: "ready", session: fresh, patientLabel: m.patientLabel, visitLabel: m.visitLabel });
        loadSessions();
    }, [loadSessions]);

    const value = useMemo<GatewaySessionsValue>(
        () => ({ sessions, sessionForVisit, modal, openForVisit, beginCreatingVisit, reopen, minimize, cancelCurrent, resumeCurrent }),
        [sessions, sessionForVisit, modal, openForVisit, beginCreatingVisit, reopen, minimize, cancelCurrent, resumeCurrent]
    );

    return <GatewaySessionsContext.Provider value={value}>{children}</GatewaySessionsContext.Provider>;
}

/** Re-exported so a session summary's own status is computed in one place —
 *  the badge dot, the popover row, and the modal's own "is this actually
 *  still good" check must never independently reinvent this. */
export { isEffectivelyExpired };
