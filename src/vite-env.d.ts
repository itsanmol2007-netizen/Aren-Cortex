/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** Short git SHA of the commit this bundle was built from, or "unknown".
 *  Injected by `vite.config.ts`'s `define` — see `buildStamp()` there. */
declare const __BUILD_SHA__: string;
/** ISO timestamp of when this bundle was built. */
declare const __BUILT_AT__: string;
