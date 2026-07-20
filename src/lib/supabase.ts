import { createClient } from '@supabase/supabase-js'

// Session persistence is load-bearing for the clinic: a receptionist who loses
// Wi-Fi must NOT be logged out. supabase-js keeps the session in localStorage
// and reads it synchronously (getSession never needs the network), so a refresh
// while offline still finds a valid session. Token refresh happens in the
// background and simply retries once connectivity returns. These options are
// the library defaults, made explicit so the behaviour is never silently lost.
export const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL as string,
    import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
        },
    }
)
