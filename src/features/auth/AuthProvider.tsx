// The single authority on "is this app allowed to render". Mounted above the
// router; every /app route sits behind RequireAuth (see RequireAuth.tsx),
// which reads this context.
//
// On every app load the provider verifies, before any real UI exists:
//   1. a Supabase session is present (and refreshable),
//   2. the users row exists and is_active,
//   3. the hospital row exists and is_active.
//
// Failures are split by KIND, because "offline" and "rejected" are not the
// same event:
//   • a DEFINITIVE rejection (inactive user/hospital, no user row) fails closed
//     — session cleared, redirect to login.
//   • a NETWORK failure (offline / timeout) with a valid session + a cached
//     identity keeps the receptionist working in an OFFLINE-authed state — it
//     never ejects them to login for losing Wi-Fi — and silently re-verifies
//     the moment connectivity returns.

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "../../lib/supabase";
import {
    loadIdentity,
    signOutLocal,
    withTimeout,
    cacheIdentity,
    readCachedIdentity,
    clearCachedIdentity,
} from "../../lib/auth";
import type { Identity, IdentityFailure } from "../../lib/auth";
import { touchThisDevice } from "../../lib/db/devices";

export type GateNotice = IdentityFailure | "signed-out" | "device-revoked";

type AuthState =
    | { status: "checking" }
    | { status: "anon"; notice: GateNotice | null }
    // `offline` = admitted on a cached identity we could not re-verify because
    // the network was down. Still fully authed for routing; consumers may show
    // an offline affordance. Cleared to false once a live re-verify succeeds.
    | { status: "authed"; identity: Identity; offline: boolean };

type AuthContextValue = AuthState & {
    // Called by the login screen after it has run the full post-login check
    // sequence itself — avoids a second round of identity queries.
    adoptIdentity: (identity: Identity) => void;
    signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
    return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<AuthState>({ status: "checking" });
    // Suppresses the SIGNED_OUT listener while we sign out deliberately
    // (gate cleanup / explicit logout) so state changes stay single-sourced.
    const deliberateSignOut = useRef(false);
    // The signed-in auth user id, remembered so a reconnect can re-verify the
    // right identity without another getSession round-trip.
    const userIdRef = useRef<string | null>(null);

    // Resolve identity for a live session. Shared by the initial check and the
    // reconnect re-verify. Returns how it resolved so callers can react.
    async function resolve(userId: string): Promise<"ok" | "offline" | "rejected"> {
        userIdRef.current = userId;
        const result = await loadIdentity(userId);
        if (result.ok) {
            cacheIdentity(result.identity);
            setState({ status: "authed", identity: result.identity, offline: false });
            return "ok";
        }
        if (result.reason === "unreachable") {
            // Network problem — trust the last-known-good identity if we have
            // one for THIS user rather than ejecting to login.
            const cached = readCachedIdentity(userId);
            if (cached) {
                setState({ status: "authed", identity: cached, offline: true });
                return "offline";
            }
            setState({ status: "anon", notice: "unreachable" });
            return "rejected";
        }
        // Definitive rejection — invalidate everything and fail closed.
        clearCachedIdentity();
        deliberateSignOut.current = true;
        await signOutLocal();
        deliberateSignOut.current = false;
        setState({ status: "anon", notice: result.reason });
        return "rejected";
    }

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const { data, error } = await withTimeout(supabase.auth.getSession());
                if (cancelled) return;
                const session = data?.session;
                if (error || !session) {
                    setState({ status: "anon", notice: null });
                    return;
                }
                await resolve(session.user.id);
            } catch {
                if (!cancelled) setState({ status: "anon", notice: "unreachable" });
            }
        })();

        const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === "SIGNED_OUT" && !deliberateSignOut.current) {
                userIdRef.current = null;
                clearCachedIdentity();
                setState({ status: "anon", notice: "signed-out" });
            }
            // A background token refresh that finally lands (e.g. right after
            // reconnecting) is a good moment to confirm the identity is current.
            if (event === "TOKEN_REFRESHED" && session) {
                void resolve(session.user.id);
            }
        });

        // Reconnect: the instant the browser regains connectivity, re-verify.
        // A still-valid account clears the offline flag; a since-revoked one is
        // now caught and ejected — offline never hid a real rejection forever.
        const onOnline = () => {
            const uid = userIdRef.current;
            if (uid) void resolve(uid);
        };
        window.addEventListener("online", onOnline);

        return () => {
            cancelled = true;
            sub.subscription.unsubscribe();
            window.removeEventListener("online", onOnline);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Device register ─────────────────────────────────────────────────────
    // Records that this browser install is in use, so Settings can answer
    // "where am I signed in" (see lib/db/devices.ts). Runs once per signed-in
    // account, never while offline — a bookkeeping write is not worth a
    // request from a device that has no network.
    //
    // The one thing it can act on is its OWN row being revoked from another
    // device, which is what makes that button a real remote sign-out rather
    // than a list entry disappearing. Every other outcome, failures included,
    // leaves the session exactly as it was.
    const registeredDeviceFor = useRef<string | null>(null);
    useEffect(() => {
        if (state.status !== "authed" || state.offline) return;
        const uid = state.identity.user.id;
        if (registeredDeviceFor.current === uid) return;
        registeredDeviceFor.current = uid;

        let cancelled = false;
        void touchThisDevice(uid, state.identity.hospital.id).then(({ revoked }) => {
            if (cancelled || !revoked) return;
            deliberateSignOut.current = true;
            userIdRef.current = null;
            clearCachedIdentity();
            void signOutLocal().finally(() => {
                deliberateSignOut.current = false;
                setState({ status: "anon", notice: "device-revoked" });
            });
        });
        return () => { cancelled = true; };
    }, [state]);

    const adoptIdentity = (identity: Identity) => {
        userIdRef.current = identity.user.id;
        cacheIdentity(identity);
        setState({ status: "authed", identity, offline: false });
    };

    const signOut = async () => {
        deliberateSignOut.current = true;
        registeredDeviceFor.current = null;
        userIdRef.current = null;
        clearCachedIdentity();
        await signOutLocal();
        deliberateSignOut.current = false;
        setState({ status: "anon", notice: null });
    };

    return (
        <AuthContext.Provider value={{ ...state, adoptIdentity, signOut }}>
            {children}
        </AuthContext.Provider>
    );
}
