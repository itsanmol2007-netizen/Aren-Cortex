import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { VitePWA } from "vite-plugin-pwa"

/**
 * Which code is this, exactly.
 *
 * Stamped into the bundle so a support request can say it without asking the
 * doctor to know — "it's broken" and "it's broken on build 7a82341, four days
 * old" are different tickets. Read by `lib/diagnostics/`.
 *
 * Falls back rather than failing: a build from a tarball with no `.git`, or a
 * machine without git on PATH, still builds — it just reports "unknown".
 */
function buildStamp(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  define: {
    __BUILD_SHA__: JSON.stringify(buildStamp()),
    __BUILT_AT__: JSON.stringify(new Date().toISOString()),
    // The PUBLISHED version, read straight from package.json so there is
    // exactly one place to bump it. `__BUILD_SHA__` above says which commit;
    // this says which release that commit belongs to, which is the thing a
    // support conversation actually needs ("you're on 1.0.0-beta.1").
    __APP_VERSION__: JSON.stringify(
      JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version
    ),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // `prompt`, NOT `autoUpdate`: a new build must never reload the tab from
      // under a doctor mid-consult. The service worker installs quietly, then
      // `src/pwa.ts` shows a toast and the reload happens only when they tap it.
      registerType: "prompt",
      includeAssets: ["apple-icon.png", "icon.svg", "aren-nebula.svg"],
      // No service worker under `npm run dev` — it fights Vite's HMR and adds
      // nothing to day-to-day work. Test the real thing with `npm run build &&
      // npm run preview` (or on the deployed origin), where `dist/sw.js` is
      // served for real.
      devOptions: { enabled: false },
      manifest: {
        name: "AREN Cortex",
        short_name: "Cortex",
        description:
          "Consultation, prescription and clinical intelligence — one window.",
        id: "/",
        start_url: "/",
        scope: "/",
        // Front Desk gets its OWN manifest, name, icon and id
        // (`public/manifest-frontdesk.webmanifest`); which of the two the
        // page advertises is decided at runtime by the signed-in role —
        // see `src/lib/pwa/appIdentity.ts`.
        //
        // `fullscreen` with a `standalone` fallback: Anmol asked for the
        // installed app to open full-screen ("whenever you open it by
        // default it will open in full screen when clicking on icon").
        // Desktop browsers may honour only the fallback, which is why the
        // fallback is named rather than left to chance.
        display: "fullscreen",
        display_override: ["fullscreen", "standalone"],
        background_color: "#eef3f8",
        theme_color: "#0b1733",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          // Reuses the 512 for the maskable slot. If the Arenode mark ends up
          // clipped inside the launcher's safe circle, drop in a padded
          // `icon-512-maskable.png` and point this entry at it.
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Precache the app shell. Everything the built bundle emits, plus the
        // fonts we self-reference — NOT any Supabase / API response.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2}"],
        // The bundle is large (rich clinical UI); default 2 MiB drops chunks
        // from the precache and they then fail offline.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: "/index.html",
        // Auth lives on Supabase's own origin, and gateway/preview routes are
        // server-rendered elsewhere — none of that should be served the SPA
        // shell from cache.
        navigateFallbackDenylist: [/^\/api\//, /^\/functions\//],
        runtimeCaching: [
          {
            // Google Fonts stylesheet — refresh in the background, serve fast.
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "google-fonts-stylesheets" },
          },
          {
            // The font files themselves — immutable, cache hard so the shell
            // renders in its real typefaces offline.
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "127.0.0.1",
    proxy: {
      // The Express process in `server/` (npm run server). Sending a WhatsApp
      // message and emailing AREN both need credentials that must never reach
      // this bundle, so the browser calls same-origin `/api/...` and Vite
      // forwards it. Outside dev, set VITE_AREN_API_URL to wherever `server/`
      // is actually hosted — see src/lib/db/messaging.ts.
      "/api": "http://localhost:4000",
    },
  },
})
