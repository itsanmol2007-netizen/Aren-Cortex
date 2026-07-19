// The one logout path for every workspace. Signs out of Supabase, drops the
// in-memory identity (AuthProvider), clears any cached server state, and
// lands on /login. After this runs there is no session anywhere — the route
// guards reject any back-button or direct-URL return on their own.

import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./AuthProvider";

export function useLogout(): () => Promise<void> {
    const { signOut } = useAuth();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    return useCallback(async () => {
        await signOut(); // supabase.auth.signOut + identity dropped from context
        queryClient.clear(); // no cached user/hospital/queue data survives
        navigate("/login", { replace: true });
    }, [signOut, queryClient, navigate]);
}
