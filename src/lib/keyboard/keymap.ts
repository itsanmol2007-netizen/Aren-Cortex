// ---------------------------------------------------------------------------
// THE KEY MAP — one declaration, two consumers.
//
// Before this file the bindings lived in `useConsultKeyboard.ts` and their
// documentation lived in `ShortcutsSheet.tsx`, and the atlas's §13 row for
// keyboard work said "keep both in step". They were not in step: the sheet
// advertised arrow-key list navigation, severity digits, a Delete that removed
// the focused chip and left/right through brands, and NONE of those four were
// implemented. A doctor who read the help was told about a keyboard that did
// not exist.
//
// So the map is data now. `useConsultKeyboard` dispatches from this table and
// `ShortcutsSheet` prints it, which makes drift structural rather than a matter
// of remembering — a binding that is not in this table cannot be documented,
// and one that is in it cannot be silently dropped from the sheet.
//
// ── Choosing keys a browser will actually deliver ──────────────────────────
//
// Cortex runs in a tab today and is meant to be an installed PWA later, and
// those two are NOT the same keyboard. Three tiers:
//
//   * Never delivered to a tab: Ctrl+N, Ctrl+T, Ctrl+W, Ctrl+Shift+N/T,
//     Ctrl+Tab, Alt+F4. The browser eats them before any listener runs, and
//     `preventDefault` cannot reach them because the event never arrives.
//     An installed PWA does receive most of them.
//   * Delivered, but with a default we must cancel: Ctrl+K (address bar),
//     Ctrl+P (print), Ctrl+S, Ctrl+D, Ctrl+F, Tab, "/" in some browsers.
//     These are safe as long as the handler calls `preventDefault`.
//   * Free: Alt+letter, bare digits, arrows, Enter, Escape, "?".
//
// The rule this file follows: **every action has at least one binding from the
// second or third tier.** Ctrl+N is kept for "next patient" because it is the
// one every doctor already expects and it works the moment Cortex is installed
// — but Alt+N is bound to the same action, so nothing is unreachable in a tab.
// Anything marked `pwaOnly` is documented with that caveat rather than
// pretending it works everywhere.
//
// ⌘ counts as Ctrl throughout (`matches` accepts either), so a Mac is not a
// second map. Labels say "Ctrl" because the clinics are on Windows.
// ---------------------------------------------------------------------------

/** One physical chord. `key` is compared against `KeyboardEvent.key`. */
export interface Chord {
    /** `KeyboardEvent.key`; single letters are written lower case */
    key: string;
    /** Ctrl on Windows/Linux, ⌘ on macOS — either satisfies it */
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    /**
     * Overrides the binding's own `whileTyping`, for the case where one action
     * has two chords that do NOT agree about it.
     *
     * There are exactly two, and both are the same shape: a modified chord that
     * must work mid-word (Ctrl+K, Ctrl+/) sitting beside a bare printable one
     * that must not ("/" and "?"). Without this, "/" typed into the medicine
     * search would jump focus to the case sheet and leave a stray slash behind.
     */
    whileTyping?: boolean;
}

/**
 * Where a binding applies.
 *
 * Not decoration: `useConsultKeyboard` only ever dispatches `global` and the
 * consult stops, and every other scope is owned by the surface named — an
 * overlay owns the keyboard for as long as it is up. The scope is also what
 * groups the shortcuts sheet, so it has to read as a place the doctor
 * recognises, not as a module name.
 */
export type Scope =
    | "global"
    | "patient"
    | "chart"
    | "measurements"
    | "assessment"
    | "medicines"
    | "addsheet"
    | "plan"
    | "review";

export const SCOPE_TITLE: Record<Scope, string> = {
    global: "Anywhere",
    patient: "Starting a patient",
    chart: "Building the case sheet",
    measurements: "Measurements",
    assessment: "Assessment",
    medicines: "Choosing a medicine",
    addsheet: "The add-medicine sheet",
    plan: "The consultation plan",
    review: "Review, print and finish",
};

/** The order the sheet prints the groups in — the order a consult happens in. */
export const SCOPE_ORDER: Scope[] = [
    "global", "patient", "chart", "measurements", "assessment",
    "medicines", "addsheet", "plan", "review",
];

export type BindingId =
    // global
    | "shortcuts" | "newPatient" | "focusChart" | "focusMeasurements" | "nextStop" | "prevStop"
    | "review" | "escape"
    // patient intake
    | "patientMove" | "patientPick" | "patientNew" | "patientSearch" | "patientNext"
    // the case sheet
    | "chartMove" | "chartTake" | "chartClear" | "severity"
    | "chartRelatedMove" | "chartRelatedTake"
    // measurements
    | "measFieldNext" | "measMenuMove" | "measMenuPick" | "measModalEnter"
    // assessment
    | "conditionMove" | "conditionTake"
    // medicines
    | "medMove" | "medPrescribe" | "medBrands" | "medWhy"
    // the add sheet
    | "sheetBrand" | "sheetStrength" | "sheetSlot" | "sheetSos" | "sheetConfirm" | "sheetCancel"
    // the plan
    | "planMove" | "planOpen" | "planRemove"
    // review
    | "reviewSave" | "reviewPrint" | "reviewBack";

export interface Binding {
    id: BindingId;
    keys: Chord[];
    scope: Scope;
    /** what it does, in the doctor's words — printed verbatim in the sheet */
    what: string;
    /**
     * Fires even while the doctor is typing into a field.
     *
     * Off by default, and that default is the important one: a bare letter or
     * digit that fires mid-word would make the search box unusable.
     */
    whileTyping?: boolean;
    /**
     * A caveat printed under the row in the shortcuts sheet.
     *
     * Free text rather than a `pwaOnly` flag because the caveat is almost
     * always about ONE of the two chords — "Ctrl N is the browser's" is true
     * and "this shortcut doesn't work" is not, and a boolean can only say the
     * second. A shortcut that silently does nothing is worse than one the
     * doctor was warned about.
     */
    note?: string;
}

// ── chord constructors, so the table below reads as a table ────────────────
const k = (key: string): Chord => ({ key });
const ctrl = (key: string): Chord => ({ key, ctrl: true });
const alt = (key: string): Chord => ({ key, alt: true });

export const BINDINGS: Binding[] = [
    // ── anywhere ───────────────────────────────────────────────────────────
    {
        id: "shortcuts",
        // Ctrl+/ has to survive being typed into, or the one key that answers
        // "what can I press" is unavailable exactly when a doctor is stuck
        // mid-search wondering that. Bare "?" must not — it is a character.
        keys: [{ key: "?", whileTyping: false }, ctrl("/")],
        scope: "global",
        what: "Show this keyboard map",
        whileTyping: true,
    },
    {
        id: "newPatient",
        keys: [alt("n"), ctrl("n")],
        scope: "global",
        what: "Next patient — open patient intake",
        whileTyping: true,
        note: "Ctrl N belongs to the browser in a tab; it reaches Cortex once installed. Alt N always works.",
    },
    {
        id: "focusChart",
        keys: [ctrl("k"), { key: "/", whileTyping: false }],
        scope: "global",
        what: "Jump to the case sheet search",
        whileTyping: true,
    },
    {
        id: "focusMeasurements",
        keys: [alt("m")],
        scope: "global",
        what: "Jump to Measurements",
        whileTyping: true,
    },
    {
        id: "nextStop",
        // `shift: false` is load-bearing, not tidiness. An unspecified `shift`
        // is NOT compared (see `chordMatches`), so a bare `Tab` chord matches
        // Shift+Tab too — this binding and `prevStop` would both claim it, and
        // which one won would come down to the order the handler happens to
        // test them in. Stated, it cannot.
        keys: [{ key: "Tab", shift: false }],
        scope: "global",
        what: "Case sheet → measurements → assessment → medicines → plan",
        whileTyping: true,
    },
    {
        id: "prevStop",
        keys: [{ key: "Tab", shift: true }],
        scope: "global",
        what: "Back a panel",
        whileTyping: true,
    },
    {
        id: "review",
        keys: [ctrl("Enter"), ctrl("p")],
        scope: "global",
        what: "Review and print the prescription",
        whileTyping: true,
    },
    {
        id: "escape",
        keys: [k("Escape")],
        scope: "global",
        what: "Close, clear, or step out of the field",
        whileTyping: true,
    },

    // ── patient intake ─────────────────────────────────────────────────────
    {
        id: "patientMove",
        keys: [k("ArrowDown"), k("ArrowUp")],
        scope: "patient",
        what: "Move through the matching patients",
        whileTyping: true,
    },
    {
        id: "patientPick",
        keys: [k("Enter")],
        scope: "patient",
        what: "Start the consult with the highlighted patient",
        whileTyping: true,
    },
    {
        id: "patientNext",
        keys: [k("Enter")],
        scope: "patient",
        what: "On the new-patient form: next field, and save on the last one",
        whileTyping: true,
    },
    {
        id: "patientNew",
        keys: [alt("n")],
        scope: "patient",
        what: "Switch to the new-patient form",
        whileTyping: true,
    },
    {
        id: "patientSearch",
        keys: [alt("f")],
        scope: "patient",
        what: "Back to searching existing patients",
        whileTyping: true,
    },

    // ── the case sheet ─────────────────────────────────────────────────────
    {
        id: "chartMove",
        keys: [k("ArrowDown"), k("ArrowUp")],
        scope: "chart",
        what: "Move through the matches",
        whileTyping: true,
    },
    {
        id: "chartTake",
        keys: [k("Enter")],
        scope: "chart",
        what: "Record the highlighted entry and keep typing",
        whileTyping: true,
    },
    {
        id: "chartClear",
        keys: [k("Escape")],
        scope: "chart",
        what: "Clear what you typed",
        whileTyping: true,
    },
    {
        id: "severity",
        keys: [alt("1"), alt("2"), alt("3")],
        scope: "chart",
        what: "Mild · moderate · severe, on the symptom you just recorded",
        whileTyping: true,
    },
    {
        id: "chartRelatedMove",
        keys: [k("ArrowDown"), k("ArrowUp")],
        scope: "chart",
        what: "With nothing typed: browse the related findings this chart has surfaced",
        whileTyping: true,
    },
    {
        id: "chartRelatedTake",
        keys: [k("Enter")],
        scope: "chart",
        what: "With nothing typed: record the highlighted related finding",
        whileTyping: true,
    },

    // ── measurements ───────────────────────────────────────────────────────
    {
        id: "measFieldNext",
        keys: [k("Enter")],
        scope: "measurements",
        what: "Move to the next measurement field",
    },
    {
        id: "measMenuMove",
        keys: [k("ArrowDown"), k("ArrowUp")],
        scope: "measurements",
        what: "Move through Add Measurement",
    },
    {
        id: "measMenuPick",
        keys: [k("Enter")],
        scope: "measurements",
        what: "Add the highlighted measurement",
    },
    {
        id: "measModalEnter",
        keys: [k("ArrowDown")],
        scope: "measurements",
        what: "Right after opening “More”: jump into the first reading",
    },

    // ── assessment ─────────────────────────────────────────────────────────
    {
        id: "conditionMove",
        keys: [k("ArrowDown"), k("ArrowUp")],
        scope: "assessment",
        what: "Move through the ranked conditions",
        whileTyping: true,
    },
    {
        id: "conditionTake",
        keys: [k("Enter")],
        scope: "assessment",
        what: "Confirm the highlighted condition",
        whileTyping: true,
    },

    // ── medicines ──────────────────────────────────────────────────────────
    {
        id: "medMove",
        keys: [k("ArrowDown"), k("ArrowUp")],
        scope: "medicines",
        what: "Move through the ranked medicines",
        whileTyping: true,
    },
    {
        id: "medPrescribe",
        keys: [k("Enter")],
        scope: "medicines",
        what: "Prescribe the highlighted one — opens the add sheet",
        whileTyping: true,
    },
    {
        id: "medBrands",
        keys: [k("ArrowRight"), k("ArrowLeft")],
        scope: "medicines",
        what: "Open and close its other brands",
        whileTyping: true,
    },
    {
        id: "medWhy",
        keys: [alt("e")],
        scope: "medicines",
        what: "Why was this ranked?",
        whileTyping: true,
    },

    // ── the add sheet ──────────────────────────────────────────────────────
    {
        id: "sheetBrand",
        keys: [k("ArrowDown"), k("ArrowUp")],
        scope: "addsheet",
        what: "Move through the brands",
    },
    {
        id: "sheetStrength",
        keys: [k("ArrowLeft"), k("ArrowRight")],
        scope: "addsheet",
        what: "Cycle the strengths of the selected brand, when it has more than one",
    },
    {
        id: "sheetSlot",
        keys: [k("1"), k("2"), k("3"), k("4")],
        scope: "addsheet",
        what: "Morning · noon · evening · night",
    },
    {
        id: "sheetSos",
        keys: [k("0")],
        scope: "addsheet",
        what: "SOS — only when needed",
    },
    {
        id: "sheetConfirm",
        keys: [k("Enter"), ctrl("Enter")],
        scope: "addsheet",
        what: "Add it to the plan",
        whileTyping: true,
    },
    {
        id: "sheetCancel",
        keys: [k("Escape")],
        scope: "addsheet",
        what: "Cancel without prescribing",
        whileTyping: true,
    },

    // ── the plan ───────────────────────────────────────────────────────────
    {
        id: "planMove",
        keys: [k("ArrowDown"), k("ArrowUp")],
        scope: "plan",
        what: "Move through what you have taken",
    },
    {
        id: "planOpen",
        keys: [k("Enter")],
        scope: "plan",
        what: "Open dose, days and timing on that line",
    },
    {
        id: "planRemove",
        keys: [k("Delete"), k("Backspace")],
        scope: "plan",
        what: "Take that line off the plan",
    },

    // ── review ─────────────────────────────────────────────────────────────
    {
        id: "reviewSave",
        keys: [ctrl("Enter")],
        scope: "review",
        what: "Confirm and save — finishes the consult",
        whileTyping: true,
    },
    {
        id: "reviewPrint",
        keys: [ctrl("p")],
        scope: "review",
        what: "Print or save as PDF",
        whileTyping: true,
    },
    {
        id: "reviewBack",
        keys: [k("Escape")],
        scope: "review",
        what: "Back to editing",
        whileTyping: true,
    },
];

const BY_ID = new Map<BindingId, Binding>(BINDINGS.map((b) => [b.id, b]));

export function binding(id: BindingId): Binding {
    const b = BY_ID.get(id);
    // A missing id is a programming error, not a runtime condition: the union
    // type means it can only happen if the table and the type drift apart.
    if (!b) throw new Error(`Unknown key binding: ${id}`);
    return b;
}

/** True when the keystroke belongs to whatever the doctor is typing into. */
export function isTyping(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

function chordMatches(e: KeyboardEvent | React.KeyboardEvent, c: Chord): boolean {
    // ⌘ and Ctrl are the same modifier here; a Mac is not a second key map.
    const wantsMod = !!c.ctrl;
    const hasMod = e.ctrlKey || e.metaKey;
    if (wantsMod !== hasMod) return false;
    if (!!c.alt !== e.altKey) return false;
    // Shift is only compared when the chord asks for it. "?" already IS
    // Shift+/ on every layout we ship to, so demanding `shift: false` on the
    // other bindings would make half the table unreachable.
    if (c.shift !== undefined && c.shift !== e.shiftKey) return false;

    const key = e.key;
    return key === c.key || (c.key.length === 1 && key.toLowerCase() === c.key);
}

/**
 * Does this event fire this binding?
 *
 * `whileTyping` is enforced HERE rather than at each call site, so a new
 * binding cannot accidentally steal a keystroke from a search box by being
 * wired up in a hurry.
 */
export function matches(e: KeyboardEvent | React.KeyboardEvent, id: BindingId): boolean {
    return firedChord(e, id) !== null;
}

/**
 * Which of a binding's chords fired — for the bindings whose KEY is the
 * argument (which arrow, which digit), and the one place `whileTyping` is
 * enforced.
 */
export function firedChord(
    e: KeyboardEvent | React.KeyboardEvent, id: BindingId
): Chord | null {
    const b = binding(id);
    const typing = isTyping(e.target);
    for (const c of b.keys) {
        if (typing && !(c.whileTyping ?? b.whileTyping)) continue;
        if (chordMatches(e, c)) return c;
    }
    return null;
}

// ── how a chord is printed ─────────────────────────────────────────────────

const KEY_LABEL: Record<string, string> = {
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Enter: "Enter",
    Escape: "Esc",
    Delete: "Del",
    Backspace: "⌫",
    Tab: "Tab",
    " ": "Space",
};

export function chordLabel(c: Chord): string {
    const parts: string[] = [];
    if (c.ctrl) parts.push("Ctrl");
    if (c.alt) parts.push("Alt");
    if (c.shift) parts.push("Shift");
    parts.push(KEY_LABEL[c.key] ?? (c.key.length === 1 ? c.key.toUpperCase() : c.key));
    return parts.join(" ");
}

/**
 * A binding as one printable string.
 *
 * Adjacent arrow keys are collapsed ("↑ ↓" rather than "↑ or ↓") because they
 * are one gesture, and everything else is joined with "or" because it is a
 * genuine choice of two keys.
 */
export function bindingLabel(b: Binding): string {
    const labels = b.keys.map(chordLabel);
    const allArrows = b.keys.every((c) => c.key.startsWith("Arrow") && !c.ctrl && !c.alt);
    const allDigits = b.keys.every((c) => /^\d$/.test(c.key) && !c.ctrl);
    if (allArrows || allDigits) return labels.join(" ");
    return labels.join("  or  ");
}
