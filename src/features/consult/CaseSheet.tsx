// ---------------------------------------------------------------------------
// THE CLINICAL COMMAND BAR, and the CASE SHEET it fills.
//
// Two exports, one idea. The bar is where the doctor types; the sheet is what
// the consultation has become. Splitting them is what took the search out of
// the card and up to the top of the page, which is both the reference's shape
// and the cheapest vertical space on the screen: the sheet no longer has to
// reserve a 48px field plus its padding before it can show a single chip.
//
// ── Why one box at all ─────────────────────────────────────────────────────
// docs/aren-cortex-ui-doctrine.md §1 and §4.1. The engine does not share the
// history / symptom / finding distinction: `consultInput.ts` flattens all
// three into one set of observations and cannot tell which card a chip came
// from. So three boxes bought the doctor nothing analytically while costing
// them a decision ("is this a symptom or a finding?") that they had to make
// BEFORE they could type, and that the observable's own `kind` already
// answers.
//
// ── Reading order ──────────────────────────────────────────────────────────
// History, then Reported, then On examination. That is the order a
// consultation actually happens in: you know who they are, they tell you what
// is wrong, then you examine them. The groups used to read Reported first,
// which put the frame after the complaint.
//
// ── Colour ─────────────────────────────────────────────────────────────────
// Violet = history, rose = reported, teal = examined. History moved off blue
// on 2026-08-12 because blue is declared "the action" colour by the standing
// rules and was being spent on a chip category; it is reserved here for
// things you click.
//
// ── Gloss ──────────────────────────────────────────────────────────────────
// consult.css says "no gradients on content surfaces". Overridden here,
// deliberately and narrowly: gloss belongs to the OBJECTS (chips, badges,
// glyph tiles) and the ground stays flat paper. If the card were glossy too,
// nothing would read as foreground.
//
// ── Motion ─────────────────────────────────────────────────────────────────
// Not decoration, and explicitly not a loading state. There are no skeletons
// here because nothing is being waited on: the engine is a pure function over
// data already in memory and re-ranks in the same frame a chip lands. A blip
// hides that. A short spring, staggered across the arriving items, shows the
// doctor that something reasoned in response to what they just typed. Every
// animation in this file is under 300ms and every one of them is disabled
// under `prefers-reduced-motion`.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ClipboardList, Plus, Search } from "lucide-react";
import type { Observable } from "../../lib/db/synapse";
import type { SelectedSymptom } from "../../types";

/** Every character of `q`, in order, somewhere in `text`. Cheap typo tolerance. */
function isSubsequence(q: string, text: string): boolean {
    let i = 0;
    for (let j = 0; j < text.length && i < q.length; j++) {
        if (text[j] === q[i]) i++;
    }
    return i === q.length;
}

/**
 * How well one observable answers a query. Lower is better; 99 is no match.
 *
 * `searchText` carries the colloquial and Hindi terms and MUST beat a slug
 * match, or a doctor typing what the patient actually said ("bukhar", "बुखार")
 * gets a worse answer than one typing English.
 */
function rankOf(o: Observable, q: string): number {
    const label = o.label.toLowerCase();
    if (label.startsWith(q)) return 0;
    if (label.includes(q)) return 1;
    if ((o.searchText ?? "").toLowerCase().includes(q)) return 2;
    if (o.slug.includes(q)) return 3;
    if (isSubsequence(q, label)) return 4;
    return 99;
}

/**
 * One box searches three kinds, so ties have to break somewhere. Symptoms
 * first: that is what the doctor is typing most of the time. This orders
 * EQUALLY good text matches only, and never promotes a worse match over a
 * better one.
 */
const KIND_ORDER: Record<Observable["kind"], number> = {
    symptom: 0,
    finding: 1,
    history: 2,
};

const KIND_BADGE: Record<Observable["kind"], string> = {
    symptom: "reported",
    finding: "examined",
    history: "history",
};

/**
 * Chip skins: a soft vertical gradient with an inset highlight along the top
 * edge, which reads as gloss without becoming a bubble. Text sits a shade
 * darker than the raw token because the chip ground is tinted, and those
 * tokens were contrast-measured against white.
 */
const TONE: Record<Observable["kind"], { chip: string; badge: string; group: string }> = {
    history: {
        chip:
            "border-[#d9c9fb] bg-[linear-gradient(180deg,#faf7ff_0%,#eee5fe_100%)] text-[#6127c9] " +
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_1px_1.5px_rgba(124,58,237,0.10)]",
        badge: "bg-[#eee5fe] text-[#6127c9]",
        group: "History",
    },
    symptom: {
        chip:
            "border-[#f6c3cd] bg-[linear-gradient(180deg,#fff8f9_0%,#ffe6ea_100%)] text-[#b3103b] " +
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_1px_1.5px_rgba(190,18,60,0.10)]",
        badge: "bg-[#ffe6ea] text-[#b3103b]",
        group: "Reported",
    },
    finding: {
        chip:
            "border-[#a4e3d1] bg-[linear-gradient(180deg,#f4fdfa_0%,#dbf4eb_100%)] text-[#0b6a62] " +
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_1px_1.5px_rgba(15,118,110,0.10)]",
        badge: "bg-[#dbf4eb] text-[#0b6a62]",
        group: "On examination",
    },
};

/** History frames, the patient reports, then you examine. See the header note. */
const GROUP_ORDER: Observable["kind"][] = ["history", "symptom", "finding"];

const MAX_RESULTS = 12;

/**
 * ── THE HEIGHT BUDGET ──────────────────────────────────────────────────────
 *
 * This card has a FIXED height and does not grow. That is the whole point of
 * the 2026-08-13 pass: it sits beside Measurements and Attachments, and a card
 * that grows with its contents pushes the Assessment off the screen exactly
 * when the consultation gets interesting enough to need it.
 *
 * So each group gets a budget in CHIP ROWS, and anything past it goes behind
 * "More" rather than down the page. The budgets are not arbitrary:
 *
 *   history  1 row  — usually zero or one thing, and it frames rather than
 *                     accumulates
 *   reported 2 rows — the complaint list is the one that genuinely grows
 *   finding  2 rows — same, once an examination has happened
 *   related  2 rows — a prompt, not a checklist
 *
 * Overflow is never hidden. It moves to the browse modal, which has room.
 */
const ROW_BUDGET: Record<Observable["kind"], number> = {
    history: 1,
    symptom: 2,
    finding: 2,
};

/** Chips that fit on one row at this card width, measured rather than guessed. */
const PER_ROW = 3;

/**
 * Four, not six.
 *
 * Six was PER_ROW x 2 on the assumption that a suggestion chip is a third of
 * the column. Measured in the browser: they are not. "Throat exudate /
 * tonsillar" and "Abdominal tenderness" are half a column each, so six wrapped
 * to three rows and ate the row the budget was protecting. Four holds two rows
 * at the widths these labels actually have.
 */
const RELATED_VISIBLE = 4;

export interface CaseSheetEntry {
    label: string;
    kind: Observable["kind"];
    /**
     * Set only when this chip did NOT come from the doctor tapping it.
     *
     * 'confirmed' — they confirmed a condition this visit and it became input.
     * 'carried'   — it was confirmed at an EARLIER visit and follows the patient.
     *
     * The second one has to look different, and this is not decoration. A
     * doctor reading a chart must be able to tell that "Known diabetic" came
     * from a confirmation three visits ago rather than from the patient sitting
     * in front of them — otherwise one wrong confirmation propagates forever
     * and looks freshly entered every single time.
     */
    origin?: "confirmed" | "carried";
}

/**
 * Carried-forward chips: same hue, drained of the gloss, on a dashed edge.
 *
 * Deliberately NOT a different colour. The colour still has to say what KIND of
 * entry it is; what changes is the confidence of the surface it sits on, which
 * is the honest signal — this is real, and it is not from today.
 *
 * A full replacement rather than extra classes appended to `TONE[kind].chip`,
 * for two reasons found the hard way:
 *   · Two utilities setting the same property (`bg-*` over `bg-*`) resolve by
 *     their order in the GENERATED stylesheet, not in the class string, so
 *     layering an override is a coin flip.
 *   · `opacity-*` loses outright — the chips animate in, and motion writes an
 *     inline `opacity` that beats any class.
 * So the muting is baked into flat colours here, and nothing has to win a
 * specificity fight.
 */
const TONE_CARRIED: Record<Observable["kind"], string> = {
    history: "border-dashed border-[#c4b5e8] bg-[#f6f3fd] text-[#7c60b8] shadow-none",
    symptom: "border-dashed border-[#e8b9c4] bg-[#fdf5f6] text-[#b5697f] shadow-none",
    finding: "border-dashed border-[#9dcfc3] bg-[#f2fbf8] text-[#4a8b84] shadow-none",
};

// ── shared search ──────────────────────────────────────────────────────────

function useCatalogueSearch(observables: Observable[], query: string) {
    return useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        return observables
            .map((o) => ({ o, r: rankOf(o, q) }))
            .filter((x) => x.r < 99)
            .sort((a, b) =>
                a.r - b.r ||
                KIND_ORDER[a.o.kind] - KIND_ORDER[b.o.kind] ||
                a.o.label.localeCompare(b.o.label)
            )
            .slice(0, MAX_RESULTS)
            .map((x) => x.o);
    }, [observables, query]);
}

// ── the command bar ────────────────────────────────────────────────────────

interface BarProps {
    observables: Observable[];
    /** labels already on the sheet, so a result shows a tick */
    onSheet: Set<string>;
    onToggle: (o: Observable) => void;
    disabled?: boolean;
    searchRef?: React.RefObject<HTMLInputElement>;
    /**
     * ↓ ↑ Enter, but only with an EMPTY query — the catalogue dropdown is not
     * open and there is nothing here for those keys to do on their own, which
     * is what made them free to repurpose. `GeneralOpdInputs.tsx` wires these
     * to walk the Related suggestions sitting right below this bar; a future
     * specialty's own input layout can wire them to whatever fills the same
     * role there, or leave them out.
     */
    onEmptyDown?: () => void;
    onEmptyUp?: () => void;
    onEmptyEnter?: () => void;
}

/**
 * The page's one input. It sits above every card rather than inside one,
 * because it belongs to the consultation and not to any single module.
 */
export function ClinicalCommandBar({
    observables, onSheet, onToggle, disabled = false, searchRef,
    onEmptyDown, onEmptyUp, onEmptyEnter,
}: BarProps) {
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const [rect, setRect] = useState<DOMRect | null>(null);
    const reduce = useReducedMotion();

    const internalRef = useRef<HTMLInputElement>(null);
    const inputRef = (searchRef ?? internalRef) as React.RefObject<HTMLInputElement>;
    const boxRef = useRef<HTMLDivElement>(null);

    const results = useCatalogueSearch(observables, query);
    const open = query.trim().length > 0;

    useEffect(() => { setActive(0); }, [query]);

    const updateRect = useCallback(() => {
        if (boxRef.current) setRect(boxRef.current.getBoundingClientRect());
    }, []);

    useEffect(() => {
        if (!open) return;
        updateRect();
        window.addEventListener("resize", updateRect);
        window.addEventListener("scroll", updateRect, true);
        return () => {
            window.removeEventListener("resize", updateRect);
            window.removeEventListener("scroll", updateRect, true);
        };
    }, [open, updateRect]);

    const take = (o: Observable) => {
        onToggle(o);
        setQuery("");
        inputRef.current?.focus();
    };

    const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        // With nothing typed, the catalogue dropdown is not open and these
        // three keys have nothing of THIS bar's to act on — handed to
        // Related instead, if the parent wired anything there. Genuinely a
        // no-op if it did not: `open` stays false either way.
        if (!open) {
            if (e.key === "ArrowDown" && onEmptyDown) { e.preventDefault(); onEmptyDown(); }
            else if (e.key === "ArrowUp" && onEmptyUp) { e.preventDefault(); onEmptyUp(); }
            else if (e.key === "Enter" && onEmptyEnter) { e.preventDefault(); onEmptyEnter(); }
            return;
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            const pick = results[active];
            if (pick) take(pick);
        } else if (e.key === "Escape") {
            e.preventDefault();
            setQuery("");
        }
    };

    const dropdown = open && rect ? createPortal(
        <AnimatePresence>
            <motion.div
                initial={reduce ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.13, ease: "easeOut" }}
                className="fixed z-50 max-h-[19rem] overflow-y-auto rounded-[10px] border border-[var(--cs-line-strong)] bg-white py-1 shadow-[0_12px_32px_rgba(16,28,46,0.16)]"
                style={{ top: rect.bottom + 6, left: rect.left, width: rect.width }}
                role="listbox"
            >
                {results.length === 0 ? (
                    <p className="px-3.5 py-2.5 text-[13px] text-[var(--cs-faint)]">
                        Nothing matches “{query.trim()}”
                    </p>
                ) : (
                    results.map((o, i) => {
                        const on = onSheet.has(o.label);
                        return (
                            <button
                                key={o.id}
                                type="button"
                                role="option"
                                aria-selected={i === active}
                                onMouseEnter={() => setActive(i)}
                                onClick={() => take(o)}
                                className={
                                    "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[14px] " +
                                    "font-medium text-[var(--cs-ink)] " +
                                    (i === active ? "bg-[var(--cs-blue-soft)] " : "") +
                                    (on ? "opacity-55 " : "")
                                }
                            >
                                <span className="min-w-0 flex-1 truncate">
                                    {on && <span aria-hidden="true">✓ </span>}
                                    {o.label}
                                </span>
                                {/* The kind, stated BEFORE it is committed, so the
                                    doctor sees the system's reading while
                                    disagreeing with it is still cheap. */}
                                <span
                                    className={
                                        "flex-none rounded-[5px] px-[7px] py-[2px] text-[11px] font-semibold " +
                                        TONE[o.kind].badge
                                    }
                                >
                                    {KIND_BADGE[o.kind]}
                                </span>
                            </button>
                        );
                    })
                )}
            </motion.div>
        </AnimatePresence>,
        document.body
    ) : null;

    return (
        <div className="mb-1">
            <div
                ref={boxRef}
                className="flex h-[52px] items-center gap-3 rounded-[var(--cs-radius)] border border-[var(--cs-line-strong)] bg-white px-4 shadow-[0_1px_2px_rgba(16,28,46,0.04)] transition-[border-color,box-shadow] duration-150 focus-within:border-[rgba(18,104,232,0.5)] focus-within:shadow-[0_0_0_3px_rgba(18,104,232,0.1)]"
            >
                <Search size={19} className="flex-none text-[var(--cs-faint)]" />
                <input
                    ref={inputRef}
                    value={query}
                    disabled={disabled}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={onKey}
                    placeholder="Add clinical information (symptoms, findings, history…)"
                    aria-label="Add clinical information"
                    className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[16px] font-medium text-[var(--cs-ink)] outline-none placeholder:font-normal placeholder:text-[var(--cs-faint)]"
                />
                <kbd className="flex-none rounded-md border border-[var(--cs-line-strong)] bg-[#f7f8fa] px-2 py-1 text-[11px] font-semibold text-[var(--cs-faint)]">
                    Ctrl K
                </kbd>
            </div>
            {/* The helper line that used to sit here — "Type or search
                anything. Cortex will place it in the right context." — is
                gone. It was 19px of grey plus its margin saying, at the top of
                the page, exactly what the empty Case Sheet says 200px below
                it, and it said it on every consult forever rather than only
                while the doctor needs telling. The Case Sheet's own blank
                state is the right place for it: it is attached to the thing
                being explained, and it disappears the moment the first chip
                lands. */}
            {dropdown}
        </div>
    );
}

// ── blank-state art ────────────────────────────────────────────────────────

/**
 * The empty Case Sheet.
 *
 * Drawn rather than described. A blank panel that shows something still reads
 * as a designed surface; one that only prints an apology in grey reads as an
 * unfinished screen, which is exactly the complaint this pass exists to
 * answer. Built as inline SVG so it inherits the page's colour tokens, costs
 * no request, and scales without a second asset.
 *
 * The subject is a clipboard with three empty rules and a cursor at the first
 * one: the card is waiting for a line, and the line arrives from the bar above.
 *
 * ── Why this one is bigger than the rest of the family ─────────────────────
 * BlankArt.tsx caps its drawings at 44-62px, and that cap is right for the
 * panels it serves: those are content-driven, so an empty one is a short card
 * and a large drawing would be the loudest thing on the screen.
 *
 * This card is the exception, because it is the one blank state whose height
 * is NOT its own. The row-1 contract locks it to whatever Measurements plus
 * Attachments comes to (~330px), so on a fresh consult there is a void here
 * that cannot be removed by tightening anything. A 62px drawing floating in
 * the middle of it is what makes the void read as an accident. Filling the
 * space is the honest response to a space that has to exist.
 */
function EmptySheetArt() {
    return (
        <svg width="104" height="90" viewBox="0 0 62 54" fill="none" aria-hidden="true">
            <rect x="17" y="7" width="28" height="38" rx="4"
                fill="#fbfcfe" stroke="#d9e0ec" strokeWidth="1.5" />
            <rect x="24.5" y="3.5" width="13" height="7" rx="2.2"
                fill="#eef2f9" stroke="#d0d9e8" strokeWidth="1.4" />
            <path d="M23 20h16M23 27h16M23 34h9" stroke="#dde4ef"
                strokeWidth="1.7" strokeLinecap="round" />
            {/* the caret, sitting on the first empty line */}
            <path d="M23 17.5v5" stroke="#1268e8" strokeWidth="1.8" strokeLinecap="round" />
            {/* three quiet sparks, the three kinds an entry can become */}
            <path d="M53 14l.85 2 2 .85-2 .85L53 19.7l-.85-2-2-.85 2-.85z" fill="#f9a8c0" />
            <path d="M8 26l.7 1.65 1.65.7-1.65.7L8 30.7l-.7-1.65-1.65-.7 1.65-.7z" fill="#a7ddcb" />
            <path d="M50 34l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" fill="#c9b8f7" />
        </svg>
    );
}

// ── the sheet ──────────────────────────────────────────────────────────────

/**
 * What removing a carried-forward condition MEANS.
 *
 * Added 2026-08-16 to close atlas §14.21's "most important gap". Before it,
 * the × on a carried chip took it off today's chart and left the standing fact
 * active, so it returned at the next visit — while the chip's own tooltip said
 * "remove it if it no longer applies". The doctor was told they had taken
 * something back and they had not.
 *
 * Three answers, because there are genuinely three, and only the first is what
 * the × used to do:
 *
 *   Not today          — off this consult; the patient still has it
 *   No longer has it   — it was true and has resolved
 *   Recorded in error  — it was never true
 *
 * "Not today" is first and reads as the safe one, because it is: it changes
 * nothing durable. The two below it are the ones that alter the patient's
 * record, and they are worded as clinical statements rather than as database
 * states — a doctor is saying what happened to the patient, not choosing
 * between 'resolved' and 'refuted'.
 *
 * Nothing here is destructive in the delete sense. A resolved condition stays
 * in the record as history; only its carrying-forward stops.
 */
function RetireMenu({ label, onPick, onDismiss }: {
    label: string;
    onPick: (choice: "today" | "resolved" | "refuted") => void;
    onDismiss: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);

    // Escape and click-away, same as every other small popup on this screen.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDismiss(); };
        const onDown = (e: MouseEvent) => {
            if (!ref.current?.contains(e.target as Node)) onDismiss();
        };
        window.addEventListener("keydown", onKey);
        // Deferred a frame: the click that OPENED this menu is still
        // propagating, and without the delay it closes itself immediately.
        const t = window.setTimeout(() => window.addEventListener("mousedown", onDown), 0);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("mousedown", onDown);
            window.clearTimeout(t);
        };
    }, [onDismiss]);

    return (
        <div
            ref={ref}
            className="cx-retire absolute left-0 top-[calc(100%+6px)] z-50 w-[232px] rounded-[10px] border border-[var(--cs-line-strong)] bg-white p-1 shadow-[0_12px_28px_rgba(16,28,46,0.16)]"
            role="menu"
            aria-label={`Remove ${label}`}
        >
            <p className="px-2 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--cs-faint)]">
                Remove “{label}”
            </p>
            <button
                type="button"
                role="menuitem"
                className="cx-retire-opt block w-full rounded-[7px] px-2 py-[7px] text-left text-[12.5px] font-semibold text-[var(--cs-ink)] hover:bg-[var(--cs-blue-soft)]"
                onClick={() => onPick("today")}
            >
                Not today
                <span className="block text-[11px] font-medium text-[var(--cs-faint)]">
                    Still has it — just not relevant now
                </span>
            </button>
            <button
                type="button"
                role="menuitem"
                className="cx-retire-opt block w-full rounded-[7px] px-2 py-[7px] text-left text-[12.5px] font-semibold text-[var(--cs-ink)] hover:bg-[var(--cs-blue-soft)]"
                onClick={() => onPick("resolved")}
            >
                No longer has it
                <span className="block text-[11px] font-medium text-[var(--cs-faint)]">
                    Resolved — stops carrying forward
                </span>
            </button>
            <button
                type="button"
                role="menuitem"
                className="cx-retire-opt block w-full rounded-[7px] px-2 py-[7px] text-left text-[12.5px] font-semibold text-[var(--cs-ink)] hover:bg-[var(--cs-amber-soft)]"
                onClick={() => onPick("refuted")}
            >
                Recorded in error
                <span className="block text-[11px] font-medium text-[var(--cs-faint)]">
                    Was never true — stops carrying forward
                </span>
            </button>
        </div>
    );
}

interface SheetProps {
    entries: CaseSheetEntry[];
    onRemove: (label: string) => void;
    /**
     * Take a carried-forward condition off the patient for good.
     *
     * Optional, and its absence is what the old behaviour was: without it the
     * × on a carried chip removes it from today's chart and the standing fact
     * survives, which is exactly the §14.21 bug. With it, the × asks what the
     * removal means. See `RetireMenu`.
     */
    onRetireCarried?: (label: string, status: "resolved" | "refuted") => void;
    onToggle: (o: Observable) => void;
    intensities: SelectedSymptom[];
    onIntensityChange: (label: string, intensity: SelectedSymptom["intensity"]) => void;
    /**
     * Findings that co-occur with what is already on the sheet, ranked by
     * `examSuggestions.ts`.
     *
     * Labelled "Related" rather than "Worth examining for". Worth is a verdict
     * the software should not be issuing; a relationship is a fact. The "+"
     * prefix and the unfilled outline say the rest: an offer, not yet taken.
     */
    related: Observable[];
    /** opens the browse-everything modal, which is also where "More" goes */
    onBrowse: () => void;
    disabled?: boolean;
    /**
     * The Related row's own container, for the command bar's empty-query
     * arrow keys to walk (see `ClinicalCommandBar`'s `onEmptyDown` and
     * `GeneralOpdInputs.tsx`, which owns the roving list this ref feeds).
     */
    relatedRef?: React.RefObject<HTMLDivElement | null>;
}

export function CaseSheet({
    entries, onRemove, onRetireCarried, onToggle, intensities, onIntensityChange,
    related, onBrowse, disabled = false, relatedRef,
}: SheetProps) {
    /** which carried-forward chip is asking what its removal means */
    const [retiring, setRetiring] = useState<string | null>(null);

    const reduce = useReducedMotion();

    const cycle = (label: string, current: SelectedSymptom["intensity"]) => {
        const next: SelectedSymptom["intensity"] =
            current === "mild" ? "moderate" : current === "moderate" ? "severe" : "mild";
        onIntensityChange(label, next);
    };

    // Each group renders at most its budget and sends the rest to the browse
    // modal, so the card's height is decided by the budgets rather than by how
    // talkative the patient was.
    const groups = GROUP_ORDER
        .map((kind) => {
            const all = entries.filter((e) => e.kind === kind);
            const cap = ROW_BUDGET[kind] * PER_ROW;
            return { kind, items: all.slice(0, cap), hidden: all.length - Math.min(all.length, cap) };
        })
        .filter((g) => g.items.length > 0);

    const shown = related.slice(0, RELATED_VISIBLE);
    const overflow = related.length - shown.length;

    /** One spring, reused, so nothing on this card moves at a different rate. */
    const pop = reduce
        ? { initial: false as const, animate: {}, exit: {} }
        : {
            initial: { opacity: 0, scale: 0.92, y: -2 },
            animate: { opacity: 1, scale: 1, y: 0 },
            exit: { opacity: 0, scale: 0.92, transition: { duration: 0.1 } },
        };

    return (
        <section
            aria-label="Case sheet"
            // Height comes from the column beside it, not from its own
            // contents: the row stretches, and this card fills whatever
            // Measurements plus Attachments comes to. See the height-contract
            // note in consult.css. The budgets in ROW_BUDGET are what keep the
            // contents inside that height instead of pushing past it.
            className="flex h-full min-h-[var(--cs-sheet-min-h)] min-w-0 flex-col overflow-hidden rounded-[var(--cs-radius)] border border-[var(--cs-line)] bg-[var(--cs-card)] pb-2 shadow-[var(--cs-shadow)]"
        >
            <div className="flex items-center gap-2 px-4 pt-3">
                <span className="grid size-[26px] flex-none place-items-center rounded-lg bg-[linear-gradient(180deg,#f3f6fc_0%,#e6ecf7_100%)] text-[#41506b] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                    <ClipboardList size={14} />
                </span>
                <h2 className="m-0 text-[13.5px] font-bold uppercase tracking-[0.045em] text-[var(--cs-ink)]">
                    Case Sheet
                </h2>
                <AnimatePresence>
                    {entries.length > 0 && (
                        <motion.span
                            key={entries.length}
                            initial={reduce ? false : { opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ type: "spring", stiffness: 520, damping: 30 }}
                            className="ml-auto flex-none rounded-[7px] bg-[var(--cs-blue-soft)] px-2 py-[3px] text-[12.5px] font-semibold text-[var(--cs-blue)]"
                        >
                            {entries.length} recorded
                        </motion.span>
                    )}
                </AnimatePresence>
            </div>

            {/* A genuinely EMPTY card: a drawing and one short line, no group
                scaffolding. An earlier pass printed the three labels greyed so
                the card "showed its shape", which only produced three rows of
                grey saying nothing. Nothing has been recorded, so the card
                should look like nothing has been recorded. */}
            {entries.length === 0 && (
                <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-4 py-4 text-center">
                    <EmptySheetArt />
                    {/* A heading in ink, then the line. The card previously
                        held a single sentence of grey, which is what an
                        unfinished screen looks like — nothing on it was at
                        reading weight, so the eye found no anchor and read the
                        whole panel as absent rather than as empty. */}
                    <strong className="mt-1 text-[14px] font-[660] leading-tight tracking-[-0.005em] text-[var(--cs-ink)]">
                        Nothing recorded yet
                    </strong>
                    <p className="max-w-[32ch] text-[12.5px] font-[460] leading-[1.45] text-[var(--cs-muted)]">
                        Search above for symptoms, findings or history. Cortex files
                        each entry in the right place.
                    </p>
                </div>
            )}

            {/* Label column is fixed so the three rows align into a table rather
                than three ragged lines. Rows are tight because this card is the
                one that grows, and vertical space here is the scarcest on the
                page. */}
            <div className="mt-1.5 flex flex-col gap-1.5">
                {groups.map((g) => (
                    <motion.div
                        key={g.kind}
                        layout={!reduce}
                        className="flex items-start gap-2.5 px-4 py-[3px]"
                    >
                        <span className="w-[9.5em] flex-none whitespace-nowrap pt-[6px] text-[10.5px] font-bold uppercase leading-tight tracking-[0.085em] text-[var(--cs-label)]">
                            {TONE[g.kind].group}
                        </span>
                        <div className="flex flex-1 flex-wrap content-start gap-[6px]">
                            {g.hidden > 0 && (
                                <button
                                    type="button"
                                    onClick={onBrowse}
                                    title={`${g.hidden} more not shown`}
                                    className="order-last inline-flex items-center rounded-lg border border-[var(--cs-line-strong)] bg-white px-2 py-[4px] text-[12.5px] font-semibold text-[var(--cs-faint)] hover:border-[rgba(18,104,232,0.45)] hover:text-[var(--cs-blue)]"
                                >
                                    +{g.hidden}
                                </button>
                            )}
                            <AnimatePresence mode="popLayout" initial={false}>
                                {g.items.map((entry) => {
                                    const intensity = entry.kind === "symptom"
                                        ? intensities.find((i) => i.name === entry.label)?.intensity
                                        : undefined;
                                    return (
                                        <motion.span
                                            key={entry.label}
                                            layout={!reduce}
                                            {...pop}
                                            transition={{ type: "spring", stiffness: 480, damping: 32 }}
                                            title={
                                                entry.origin === "carried"
                                                    ? "Carried forward from a previous visit. Click × to say whether it still applies."
                                                    : entry.origin === "confirmed"
                                                        ? "Added by confirming a condition in this consultation."
                                                        : undefined
                                            }
                                            className={
                                                "relative inline-flex items-center gap-[6px] rounded-lg border py-[4px] pl-[10px] pr-[7px] " +
                                                "text-[13.5px] font-semibold leading-tight whitespace-nowrap " +
                                                (entry.origin === "carried"
                                                    ? TONE_CARRIED[entry.kind]
                                                    : TONE[entry.kind].chip)
                                            }
                                        >
                                            {intensity && (
                                                <button
                                                    type="button"
                                                    onClick={() => cycle(entry.label, intensity)}
                                                    title={`${intensity}, click to change`}
                                                    aria-label={`Severity: ${intensity}. Click to change.`}
                                                    className="inline-flex items-center gap-[1.5px] border-0 bg-transparent p-0"
                                                >
                                                    {[0, 1, 2].map((d) => (
                                                        <i
                                                            key={d}
                                                            className={
                                                                "size-[3px] rounded-full bg-current " +
                                                                (d <= (intensity === "mild" ? 0 : intensity === "moderate" ? 1 : 2)
                                                                    ? "opacity-100"
                                                                    : "opacity-30")
                                                            }
                                                        />
                                                    ))}
                                                </button>
                                            )}
                                            {entry.label}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    // A carried-forward chip's × is ambiguous — see
                                                    // RetireMenu. Everything else removes outright,
                                                    // exactly as before.
                                                    if (entry.origin === "carried" && onRetireCarried) {
                                                        setRetiring((c) => (c === entry.label ? null : entry.label));
                                                    } else {
                                                        onRemove(entry.label);
                                                    }
                                                }}
                                                aria-label={`Remove ${entry.label}`}
                                                aria-haspopup={entry.origin === "carried" && onRetireCarried ? "menu" : undefined}
                                                aria-expanded={entry.origin === "carried" && onRetireCarried ? retiring === entry.label : undefined}
                                                className="cx-chip-x grid size-[14px] place-items-center rounded border-0 bg-transparent p-0 text-[14px] leading-none text-current opacity-45 transition hover:bg-black/10 hover:opacity-100"
                                            >
                                                ×
                                            </button>

                                            {retiring === entry.label && onRetireCarried && (
                                                <RetireMenu
                                                    label={entry.label}
                                                    onDismiss={() => setRetiring(null)}
                                                    onPick={(choice) => {
                                                        setRetiring(null);
                                                        // Every choice takes it off today's chart.
                                                        // They differ in what happens to the PATIENT.
                                                        onRemove(entry.label);
                                                        if (choice !== "today") onRetireCarried(entry.label, choice);
                                                    }}
                                                />
                                            )}
                                        </motion.span>
                                    );
                                })}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Set apart by a hairline, because a thing to CHECK and a thing you
                FOUND must never look alike. The stagger is the point of the
                whole motion pass: these arrive because the engine re-read the
                chart, and a cascade says that where a blip does not. */}
            <AnimatePresence>
                {shown.length > 0 && (
                    <motion.div
                        ref={relatedRef}
                        layout={!reduce}
                        initial={reduce ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="mx-4 mt-2 flex items-start gap-2.5 border-t border-dashed border-[var(--cs-line-strong)] pt-2.5"
                    >
                        <span className="w-[9.5em] flex-none whitespace-nowrap pt-[6px] text-[10.5px] font-bold uppercase leading-tight tracking-[0.085em] text-[var(--cs-label)]">
                            Related
                        </span>
                        <div className="flex flex-1 flex-wrap content-start gap-[6px]">
                            <AnimatePresence mode="popLayout" initial={false}>
                                {shown.map((o, i) => (
                                    <motion.button
                                        key={o.id}
                                        layout={!reduce}
                                        initial={reduce ? false : { opacity: 0, y: -3, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.1 } }}
                                        transition={{
                                            type: "spring", stiffness: 460, damping: 30,
                                            // The cascade. Capped so a full row never
                                            // takes longer than a glance.
                                            delay: reduce ? 0 : Math.min(i * 0.035, 0.2),
                                        }}
                                        type="button"
                                        disabled={disabled}
                                        onClick={() => onToggle(o)}
                                        title={`Record ${o.label}`}
                                        className="cx-related-chip inline-flex items-center gap-[6px] rounded-lg border border-dashed border-[var(--cs-line-strong)] bg-transparent py-[4px] pl-[8px] pr-[10px] text-[13.5px] font-medium leading-tight whitespace-nowrap text-[var(--cs-muted)] transition-colors duration-150 hover:border-solid hover:border-[#a4e3d1] hover:bg-[linear-gradient(180deg,#f4fdfa_0%,#dbf4eb_100%)] hover:text-[#0b6a62] disabled:opacity-50"
                                    >
                                        <Plus size={11} className="flex-none opacity-55" />
                                        {o.label}
                                    </motion.button>
                                ))}
                            </AnimatePresence>

                            {/* "More" opens the catalogue in a modal rather than
                                expanding the row in place. Expanding pushes every
                                card below it down the page, which is the vertical
                                space this redesign exists to reclaim. */}
                            {overflow > 0 && (
                                <button
                                    type="button"
                                    disabled={disabled}
                                    onClick={onBrowse}
                                    className="cx-related-chip inline-flex items-center gap-[5px] rounded-lg border border-[var(--cs-line-strong)] bg-white py-[4px] pl-[9px] pr-[8px] text-[13.5px] font-semibold leading-tight text-[var(--cs-muted)] transition-colors duration-150 hover:border-[rgba(18,104,232,0.45)] hover:bg-[var(--cs-blue-soft)] hover:text-[var(--cs-blue)] disabled:opacity-50"
                                >
                                    More
                                    <Plus size={11} className="flex-none opacity-70" />
                                </button>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </section>
    );
}
