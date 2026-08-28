# Session handoff — 2026-08-29 (Add New Medicine duplicate check + Practice keyboard)

**Temporary, self-replacing. REWRITE THE WHOLE FILE, not append a new dated
section.** `cortex-design-dna/*.md` and `context/*.md` are stable reference
material — touch them only when a rule or fact in them is actually wrong.

## What this round did

1. **Add New Medicine now actually verifies the brand isn't already in the
   library.** The "Brand name" field never triggered any search before this
   — a doctor could type "Dolo 650" and create a duplicate with zero
   warning, the only guard being a static sentence of instructional text.
   A second `useIntentSearch(["medicine"])` instance is now kept in sync
   with the typed name (`useEffect` → `nameSearch.setQuery(name)`) and its
   `matchKind === "brand"` hits render as an amber "Already in our
   library:" block naming every match and its composition. Deliberately
   NOT wired through `medicines.name ilike` — `resolveProductByName`'s own
   doc comment already measured that against the live 213k-row catalogue
   and it's cancelled by the statement timeout every time, no supporting
   index. `search_intents` is the fast path every other search box on this
   page already uses, reused rather than inventing a second, slower one.
   Advisory only — `canSubmit` is untouched, since a same-name different
   pack/strength is a legitimate reason to still create it.
2. **The Practice page now has real keyboard bindings, same system as
   Consult.** New `"practice"` scope in `src/lib/keyboard/keymap.ts`
   (`practiceFocusSearch`, `practiceMove`, `practiceTake`) — Ctrl+K or "/"
   jumps to Preferred Medicines' search from anywhere on the page, ↑↓ walks
   the search results (the same `useRovingList` mechanism
   `ConditionsCard`/`RecommendationsCard` already use — a DOM-attribute
   cursor, not React state, because these lists can re-rank), Enter takes
   the highlighted one. Escape-to-clear needed no new binding —
   `IntentSearchField` already clears its query on Escape for every card
   that uses it. The Practice group shows up in the SAME "?"/Ctrl+/
   shortcuts sheet Consult uses — that sheet renders straight off the
   shared table, so a new scope's bindings appear there automatically.
   See `docs/context/consult-ui.md`'s "keyboard system" note for how this
   sits beside (not inside) `useConsultKeyboard`/`App.tsx`'s global hook.

## Verified live (Ekanki Solo Clinic account)

- Ctrl+K from an arbitrary point on the Practice page focused Preferred
  Medicines' search input (`document.activeElement`'s placeholder
  confirmed).
- Typing "Dolo" and pressing ↓ landed the roving cursor on the first hit,
  a second ↓ moved it without duplicating the cursor (`[data-cx-cursor]`
  count stayed exactly 1).
- Pressing Enter on the highlighted hit ("Dolo Drops") actually added it
  as preferred (count 7→8, confirmed after reload); removed again via its
  own X button, count back to 7 after a reload — no residue left on the
  live account.
- "?" opened the shortcuts sheet with a new "PRACTICE — PREFERRED
  MEDICINES" group listing all three bindings correctly.
- Typing "Dolo 650" into Add New Medicine's brand-name field surfaced
  "Already in our library: Dolo 650 Tablet — paracetamol" within about a
  second, screenshotted.
- Zero page errors across every check. `tsc -b` and `npm run build` clean.

## Environment / recipe (unchanged from prior rounds)

1. `node_modules/playwright` + pre-installed Chromium at
   `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (do NOT run
   `playwright install`). Launch with `--proxy-server=$HTTPS_PROXY
   --proxy-bypass-list=127.0.0.1;localhost --ignore-certificate-errors`.
2. Chromium cannot CONNECT to `*.supabase.co` directly here — relay
   through the dev server: a temporary `vite.preview.config.ts` copying
   `vite.config.ts`'s `@` alias + `tailwindcss()` plugin plus
   `server.proxy['/sb']` to the real Supabase URL via `HttpsProxyAgent`,
   and `.env.local` setting `VITE_SUPABASE_URL=http://127.0.0.1:5173/sb`.
   Delete both (and any `scratch-*.mjs` scripts) before committing — never
   tracked. **Check for a stray dev server left running from an earlier
   session before starting a new one** (`ps aux | grep vite`) — one was
   found still bound to :5173 from a prior round this session; killing it
   is safe, it's disposable.
3. Log in with the real test account: phone `9999999999` /
   `Gigabyte@Test` (Ekanki Solo Clinic, Dr Anmol Pandey,
   `hospital_id 64c26e24-3668-49c6-8b99-6ddb8c14883e`).
4. Sidebar nav buttons are off-viewport — `.dispatchEvent('click')`, not
   `.click()`.
5. **`page.keyboard.press(...)` sends to whatever has OS-level page focus
   and is unreliable right after `locator.fill()`** in this harness — two
   verification scripts in this round showed a `[data-cx-cursor]` count of
   0 after an `ArrowDown` that should have worked, purely because of this.
   `locator.press(...)` (e.g. `searchBox.press("ArrowDown")`) explicitly
   focuses the element via CDP first and is reliable — prefer it over
   `page.keyboard.press` whenever the previous step was a `.fill()`, not a
   real click.
6. Any write made while testing is REAL data on a REAL account — verify
   with `mcp__Supabase__execute_sql` before deleting anything, and check
   for downstream FK references (`prescription_medicines`, etc.) before
   deleting a `medicines` row.

## Environment

- No `supabase/migrations/`; schema changes apply live via Supabase MCP.
  Project `ieimvjprtltancxapuzg` (org `arenod`, `ap-south-1`).
- `main` and `master` are unrelated histories. Work here is on
  `claude/cortex-practice-implementation-knrjcj`, fast-forwarded to
  `master`.
