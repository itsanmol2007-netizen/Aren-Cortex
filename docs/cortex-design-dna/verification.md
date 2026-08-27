# Render it. Measure it. Then say it works.

Part of the Cortex Design DNA set — see `README.md` for the pre-flight
checklist and how these files fit together.

---

**This is the most expensive mistake this codebase makes, and it has now
been made four times.** Read this before you claim any UI change is done.

`tsc -b` clean, `npm run build` clean, and "I checked it against the
reference image carefully" are **not** evidence that a page looks right.
They have been reported as done and rejected on sight three separate
times on the Practice page alone (2026-08-25, 2026-08-26 ×2). On
2026-08-27 the page was finally rendered, and the FIRST screenshot showed
defects no amount of code-reading had caught in three passes:

- cards with a hard `height` holding one row of content, leaving **295px
  of measured dead space** (and `empty-states.md` had forbidden exactly
  this since 2026-08-25 — the rule existed, nobody checked it against
  pixels);
- a modal list squashed to **45px while holding 26 rows**, i.e. a
  scrollbar sliver and nothing readable;
- a medicine search where **no row had an add button at all**;
- a heart that wrote nothing because the lookup behind it could never
  match (a capped list; paracetamol carries thousands of brands).

Every one of those is invisible in the source and obvious in a screenshot.

## The browser works. Earlier handoffs said it didn't; they were wrong.

Previous notes concluded "browser → live Supabase is blocked in this
sandbox." That was an unconfigured browser, not a blocked network. The
working recipe, end to end:

1. `npm i -D playwright`. Browsers are pre-installed — do **not** run
   `playwright install`. The binary is at
   `/opt/pw-browsers/chromium-<version>/chrome-linux/chrome`
   (`.../chromium/...` without the version suffix does not exist).
2. Launch through the agent proxy:
   `args: ['--proxy-server=' + process.env.HTTPS_PROXY,
   '--proxy-bypass-list=127.0.0.1;localhost',
   '--ignore-certificate-errors']`.
3. Chromium still cannot CONNECT to `*.supabase.co` here (reset, and the
   proxy logs no failure) even though `curl` to the same host succeeds.
   Don't fight it — **relay through the dev server**: a temporary
   `vite.preview.config.ts` with
   `server.proxy['/sb'] = { target: SUPABASE_URL, changeOrigin: true,
   agent: new HttpsProxyAgent(process.env.HTTPS_PROXY),
   rewrite: p => p.replace(/^\/sb/, '') }`, plus a `.env.local` setting
   `VITE_SUPABASE_URL=http://127.0.0.1:5173/sb`. Node reaches Supabase
   fine. Neither file is ever committed.
4. Log in with the real test account (see `../SESSION-HANDOFF.md`), save
   `storageState`, reuse it on every later run.
5. The sidebar sits off-viewport, so `.click()` times out — use
   `page.locator('button.sidebar-nav-item:has-text("X")')
   .dispatchEvent('click')`.

Google Fonts also resets. That is cosmetic only (Geist is bundled).

## Measuring beats looking

A screenshot tells you something is wrong. `getBoundingClientRect()` tells
you *what*, and turns a taste argument into a number you can fix:

```js
// dead space = bottom of the card body - bottom of its last visible child
[...document.querySelectorAll('.prac-card')].map(e => { … })
```

"Looks empty" became "295px of dead space", which identified the actual
bug (a hard `height` instead of `max-height`). Do this for any card,
list, or modal you touch — before AND after, so the fix is proven, not
asserted.

## Also test the action, not just the pixels

Render the page, then **click the thing**. The heart on Preferred
Medicines rendered perfectly and saved nothing; that was only caught by
clicking it and watching the count stay at 1. For a write path, confirm
the row landed (`mcp__Supabase__execute_sql`) — and if you wrote test data
into a real clinic's account, **delete it afterwards and say so**.

## If you genuinely cannot render

Say so plainly, and say what that leaves unverified. Never let "builds
clean" stand in for "looks right".
