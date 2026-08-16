import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { resolveAuthedContext, type AuthedContext } from "../lib/auth";
import { setCurrentSession, clearCurrentSession } from "../lib/db";

export type AuthState =
    | { status: "loading" }
    | { status: "signed-out" }
    | { status: "signed-in"; context: AuthedContext }
    | { status: "unsupported-role"; role: string }
    | { status: "no-profile" };

/**
 * Session state for the whole app. Also the single place that calls
 * setCurrentSession — every db/*.ts function that reads DOCTOR_ID/
 * HOSPITAL_ID directly depends on this having run before anything else
 * mounts, which is why App.tsx gates its authenticated tree on
 * status === "signed-in" rather than rendering optimistically.
 */
export function useAuth(): AuthState {
    const [state, setState] = useState<AuthState>({ status: "loading" });

    useEffect(() => {
        let active = true;

        async function resolve(userId: string | undefined) {
            if (!userId) {
                clearCurrentSession();
                if (active) setState({ status: "signed-out" });
                return;
            }
            try {
                const result = await resolveAuthedContext(userId);
                if (!active) return;
                if (result.kind === "doctor") {
                    setCurrentSession(result.context);
                    setState({ status: "signed-in", context: result.context });
                } else if (result.kind === "not-a-doctor") {
                    clearCurrentSession();
                    setState({ status: "unsupported-role", role: result.role });
                } else {
                    clearCurrentSession();
                    setState({ status: "no-profile" });
                }
            } catch {
                if (active) { clearCurrentSession(); setState({ status: "signed-out" }); }
            }
        }

        supabase.auth.getSession().then(({ data }) => resolve(data.session?.user.id));

        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
            resolve(session?.user.id);
        });

        return () => { active = false; sub.subscription.unsubscribe(); };
    }, []);

    return state;
}
