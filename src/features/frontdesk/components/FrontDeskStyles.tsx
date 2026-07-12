// Keyframe definitions for the motion the §9 table requires but that cannot be
// expressed as pure Tailwind utilities (keyframes need a definition somewhere).
// Kept inline in this .tsx — no separate .css file — and scoped to `aren-*`
// classes so nothing leaks into the rest of the app. All motion collapses to
// none under prefers-reduced-motion.
//
//   aren-breath  — Patient Launcher dawn-wash drift (§6), 8s ambient loop
//   aren-pulse   — unacknowledged doctor-request ring (§9), 1.4s ambient loop
//   aren-rise    — empty-state entrance (§9): fade + 8px rise, 300ms, once

const CSS = `
/* ── Field classes ─────────────────────────────────────────────────────────
   Cortex's legacy CSS (src/styles/base.css) styles raw input/select/label
   elements UNLAYERED, while Tailwind v4 utilities live in cascade layers —
   so utilities like bg-transparent / h-11 silently lose on those elements.
   These unlayered, higher-specificity classes are Front Desk's counterweight;
   use them (not utilities) for any input/select/label styling in this feature. */

/* Bare input: launcher + symptom-picker search boxes (chrome lives on the wrapper) */
.fd-bare {
  width: 100%; height: auto; border: none; border-radius: 0;
  background: transparent; padding: 0; font-size: 14px; color: #161d29;
  outline: none; box-shadow: none;
}
.fd-bare:hover { border: none; }
.fd-bare:focus { border: none; background: transparent; box-shadow: none; }
.fd-bare-lg { font-size: 16px; padding: 6px 0; }
.fd-bare::placeholder { color: #8a91a0; }

/* Standard modal field (§10.2, premium treatment since s36): soft-filled at
   rest, lifts to white with the violet focus ring — screenshot-inherited. */
.fd-field {
  width: 100%; height: 46px; border: 1.5px solid #e9ebf2; border-radius: 11px;
  background: #f7f8fb; padding: 0 14px; font-size: 14px; color: #161d29;
  outline: none; box-shadow: none;
  transition: border-color 150ms, box-shadow 150ms, background-color 150ms;
}
.fd-field:hover { border-color: #dde1ea; }
.fd-field:focus {
  border-color: #7c5cf0; background: #ffffff;
  box-shadow: 0 0 0 3px rgba(99,102,241,0.22);
}
.fd-field::placeholder { color: #8a91a0; }
.fd-field-error, .fd-field-error:hover { border-color: #d23b34; background: #fffafa; }
select.fd-field { cursor: pointer; }

/* base.css forces label { display:grid } + uppercases label spans */
.fd-label { display: flex; align-items: center; gap: 6px; }
.fd-label span { text-transform: none; font-size: inherit; font-weight: inherit; color: inherit; }
/* Label ornaments (s36) — unlayered classes because the label-span element
   rule above would silently beat Tailwind utilities on these spans. */
.fd-label .fd-ico { color: #8b5cf6; opacity: 0.85; display: inline-flex; }
.fd-label .fd-tag {
  margin-left: 2px; font-size: 9.5px; font-weight: 800;
  letter-spacing: 0.07em; text-transform: uppercase; color: #a3aab8;
}

@keyframes aren-breath {
  0%, 100% { transform: translateX(-6%); }
  50%      { transform: translateX(6%); }
}
.aren-breath { animation: aren-breath 8s ease-in-out infinite; }

@keyframes aren-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(201,121,26,0); }
  50%      { box-shadow: 0 0 0 4px rgba(201,121,26,0.18); }
}
.aren-pulse { animation: aren-pulse 1.4s ease-in-out infinite; }

@keyframes aren-rise {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.aren-rise { animation: aren-rise 300ms cubic-bezier(0.2, 0.8, 0.3, 1) both; }

@media (prefers-reduced-motion: reduce) {
  .aren-breath, .aren-pulse, .aren-rise { animation: none !important; }
}
`;

export function FrontDeskStyles() {
    return <style>{CSS}</style>;
}
