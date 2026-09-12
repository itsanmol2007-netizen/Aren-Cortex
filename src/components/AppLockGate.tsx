// ---------------------------------------------------------------------------
// Decides WHEN the PIN lock shows, and renders it above everything else when
// it should. Mounted once, near the top of the tree (inside `AuthProvider`,
// so it can read the signed-in identity) — see main.tsx.
//
// The resting state is LOCKED, not unlocked: a PIN is "configured" the
// moment a doctor sets one up, and from then on every fresh page load,
// reload, or brand-new login starts with no DEK in memory (it only ever
// lives there, never on disk decrypted) — so it starts locked every time,
// same as a phone that was rebooted. This is deliberate, not a rough edge:
// treating a reload as an automatic unlock would make the reload button
// itself a bypass for anyone with physical access. The idle timer
// (idleTimer.ts) is what RE-locks an already-unlocked session; it has no
// say over this initial state.
//
// A doctor who has never set up a PIN is never locked — this is an opt-in
// feature layered on top of an already-working app, not a new gate every
// account has to clear.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "../features/auth/AuthProvider";
import { hasPinConfigured, isUnlockedFor, onLockStateChange } from "../lib/security/deviceKey";
import { LockScreen } from "./LockScreen";

export function AppLockGate({ children }: { children: ReactNode }) {
    const auth = useAuth();
    const userId = auth.status === "authed" ? auth.identity.user.id : null;

    const [pinConfigured, setPinConfigured] = useState<boolean | null>(null);
    const [unlocked, setUnlocked] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!userId) {
            setPinConfigured(null);
            setUnlocked(false);
            return;
        }
        let cancelled = false;
        hasPinConfigured(userId).then((v) => {
            if (!cancelled) setPinConfigured(v);
        });
        setUnlocked(isUnlockedFor(userId));
        return () => {
            cancelled = true;
        };
    }, [userId]);

    useEffect(() => {
        // Re-checks `pinConfigured`, not just `unlocked`, on every
        // transition — `setupPin` (Settings' App Lock card) fires this
        // exact same notification the instant a PIN is created, and until
        // just now this gate only ever learned that a PIN existed from its
        // OWN mount-time check, so a doctor who set one up mid-session saw
        // nothing change: `locked` stayed false because `pinConfigured`
        // was still the stale "false" from before Settings was opened.
        return onLockStateChange(() => {
            if (!userId) return;
            setUnlocked(isUnlockedFor(userId));
            void hasPinConfigured(userId).then(setPinConfigured);
        });
    }, [userId]);

    const locked = !!userId && pinConfigured === true && !unlocked;

    // `inert` (a standard HTML attribute, not React-special) strips the
    // covered content from both the tab order and assistive tech while
    // locked — the lock screen's own opaque background already hides it
    // visually, this is what stops a screen reader or Tab key from
    // reaching a "Start Consultation" button sitting right underneath.
    useEffect(() => {
        const el = contentRef.current;
        if (!el) return;
        if (locked) el.setAttribute("inert", "");
        else el.removeAttribute("inert");
    }, [locked]);

    return (
        <>
            <div ref={contentRef}>{children}</div>
            {locked && auth.status === "authed" && (
                <LockScreen
                    userId={auth.identity.user.id}
                    doctorName={auth.identity.user.full_name ?? "Signed in"}
                    clinicName={auth.identity.hospital.name ?? "AREN Cortex"}
                    phone={auth.identity.user.phone ?? ""}
                    role={auth.identity.user.role ?? "doctor"}
                />
            )}
        </>
    );
}
