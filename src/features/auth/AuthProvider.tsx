// The single authority on "is this app allowed to render". Mounted above the
// router; every /app route sits behind RequireAuth (see RequireAuth.tsx),
// which reads this context.
//
// On every app load the provider verifies, before any real UI exists:
//   1. a Supabase session is present (and refreshable),
//   2. the users row exists and is_active,
//   3. the hospital row exists and is_active.
// Any miss — including network failure or timeout — resolves to "anon" and
// the gate redirects to /login. Fail closed, never open.

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "../../lib/supabase";
import { loadIdentity, signOutLocal, withTimeout } from "../../lib/auth";
import type { Identity, IdentityFailure } from "../../lib/auth";

export type GateNotice = IdentityFailure | "signed-out";

type AuthState =
    | { status: "checking" }
    | { status: "anon"; notice: GateNotice | null }
    | { status: "authed"; identity: Identity };

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
                const result = await loadIdentity(session.user.id);
                if (cancelled) return;
                if (result.ok) {
                    setState({ status: "authed", identity: result.identity });
                } else {
                    // Definitive rejections invalidate the stored session.
                    // "unreachable" keeps it so a reload can recover once the
                    // network returns — but the gate still fails closed now.
                    if (result.reason !== "unreachable") {
                        deliberateSignOut.current = true;
                        await signOutLocal();
                        deliberateSignOut.current = false;
                    }
                    if (!cancelled) setState({ status: "anon", notice: result.reason });
                }
            } catch {
                if (!cancelled) setState({ status: "anon", notice: "unreachable" });
            }
        })();

        const { data: sub } = supabase.auth.onAuthStateChange((event) => {
            if (event === "SIGNED_OUT" && !deliberateSignOut.current) {
                setState({ status: "anon", notice: "signed-out" });
            }
        });

        return () => {
            cancelled = true;
            sub.subscription.unsubscribe();
        };
    }, []);

    const adoptIdentity = (identity: Identity) => setState({ status: "authed", identity });

    const signOut = async () => {
        deliberateSignOut.current = true;
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
