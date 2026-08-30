// The one logout path for every workspace. Signs out of Supabase, drops the
// in-memory identity (AuthProvider), clears any cached server state, and
// lands on /login. After this runs there is no session anywhere — the route
// guards reject any back-button or direct-URL return on their own.

import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./AuthProvider";
import { clearAllConsultDrafts } from "../../lib/consultDraft";

export function useLogout(): () => Promise<void> {
    const { signOut } = useAuth();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    return useCallback(async () => {
        await signOut(); // supabase.auth.signOut + identity dropped from context
        queryClient.clear(); // no cached user/hospital/queue data survives
        // Cortex's mid-consult reload/crash recovery (lib/consultDraft.ts) is
        // deliberately NOT cleared by a reload or a dropped connection — only
        // by this, the one INTENTIONAL exit ("except literally logging out...
        // means intentional", per that file's own header). Harmless to call
        // from a Front Desk session logging out too — there is nothing under
        // this prefix to find there.
        clearAllConsultDrafts();
        navigate("/login", { replace: true });
    }, [signOut, queryClient, navigate]);
}
