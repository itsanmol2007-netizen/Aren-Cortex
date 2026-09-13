// ---------------------------------------------------------------------------
// WHICH app is this install — Cortex, or Front Desk.
//
// Anmol, 2026-09-12: "if you log in as a front desk receptionist by your
// front desk credential then the icon will automatically change to that
// white icon... and if you log in as a cortex then that's a dark icon...
// and it will write Front Desk".
//
// One origin serves both workspaces, so the answer cannot be baked into the
// build: it is whatever role the person signed in as. This swaps the
// document's `<link rel="manifest">` (and its title / theme colour) to the
// matching one the moment that is known, so an install started from a
// receptionist's session installs "AREN Front Desk", with the light mark and
// a start_url that opens straight onto the queue — while a doctor's install
// stays "AREN Cortex" on the dark mark.
//
// The two manifests declare DIFFERENT `id`s on purpose. Same id would make
// the browser treat them as one app that keeps changing its name; different
// ids let a shared clinic machine hold both, side by side in the launcher,
// each opening its own workspace.
//
// Caveat worth knowing rather than discovering: a browser reads the manifest
// when it installs. Pointing this at a different file changes what the NEXT
// install becomes; an app already on the dock updates its own name and icon
// only when the browser next re-reads the manifest, which Chrome does on its
// own schedule.
// ---------------------------------------------------------------------------

const CORTEX = {
    /** VitePWA emits this one from `vite.config.ts`'s `manifest` block. */
    href: "/manifest.webmanifest",
    title: "AREN Cortex",
    theme: "#0b1733",
} as const;

const FRONT_DESK = {
    href: "/manifest-frontdesk.webmanifest",
    title: "AREN Front Desk",
    // The dawn ink Front Desk's OWN header already opens on
    // (WorkspaceShell's gradient starts #0d1b35 / #120f28). A theme colour
    // is the strip the OS paints ABOVE the app, so it should continue the
    // app's band rather than announce itself: the light rose that was here
    // read as "a slightly pink header" sitting on top of a deep navy one.
    theme: "#120f28",
} as const;

export type AppFace = "cortex" | "frontdesk";

/** Reception gets the Front Desk face; every clinical/admin role keeps
 *  Cortex's. Unknown or signed-out stays on Cortex, the default the page
 *  already ships with. */
export function faceForRole(role?: string | null): AppFace {
    return role === "reception" ? "frontdesk" : "cortex";
}

/**
 * Settle the face BEFORE React's first paint, from the identity cache.
 *
 * Without this, a receptionist's window opened as "AREN Cortex" and then
 * flipped to "AREN Front Desk" a moment later, once the auth gate had
 * resolved and the effect below ran — visible every single launch:
 * "now it's writing AREN Cortex and then AREN Front Desk into the top bar"
 * (Anmol, 2026-09-13).
 *
 * `lib/auth.ts` already stashes the last verified identity in
 * localStorage for the offline gate, and that read is synchronous, so the
 * answer is available before anything renders. Read directly rather than
 * through `readCachedIdentity(userId)` — at this point in the boot there
 * is no resolved user id to check it against, and the only thing being
 * decided is a name and an icon. If it turns out to be the wrong face
 * (a different account signs in), the effect in AuthProvider corrects it
 * the moment the real identity lands.
 */
export function applyCachedAppIdentity(): void {
    try {
        const raw = localStorage.getItem("aren.identity.v1");
        if (!raw) return;
        const role = JSON.parse(raw)?.identity?.user?.role as string | undefined;
        applyAppIdentity(faceForRole(role));
    } catch {
        /* no cache, unreadable storage, or a shape we don't recognise —
           the page keeps the default face it shipped with. */
    }
}

let applied: AppFace | null = null;

export function applyAppIdentity(face: AppFace): void {
    if (applied === face) return;
    applied = face;
    const target = face === "frontdesk" ? FRONT_DESK : CORTEX;

    try {
        const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
        if (link) link.href = target.href;

        document.title = target.title;

        const theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
        if (theme) theme.content = target.theme;
    } catch {
        /* A missing <link> or a locked-down embed is not worth failing a
           sign-in over — the app works, it just keeps the default face. */
    }
}
