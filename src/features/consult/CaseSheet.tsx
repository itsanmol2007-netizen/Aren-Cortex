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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ClipboardList, MapPin, PenLine, Plus, Search, X } from "lucide-react";
import type { Observable, PrescriptionTemplateSummary } from "../../lib/db/synapse";
import type { SelectedSymptom } from "../../types";
import {
    searchStory, storyClauses, openStoryDimensions, itemsForDimension,
    storyHas, DIMENSION_PROMPT, looksLikeNote,
} from "./story";
import type { Story, StorySearchItem, StoryDimension } from "./story";
import { clinicalSiteLabel, sameSite, type SiteRef } from "../../lib/body/clinicalSite";
import { impliedSites, searchSites, suggestSites, type SiteHit } from "../../lib/body/siteSearch";
import {
    ASKS_DURATION, DURATION_QUICK, durationChoicesFor, escalationFor,
    formatDuration, shortDuration, type DurationChoice,
} from "./duration";

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

/** Exported alongside `useCatalogueSearch` — the same badge word an observable
 *  gets in the case sheet's own search, reused so a template's observable
 *  item reads the same everywhere it shows up. */
export const KIND_BADGE: Record<Observable["kind"], string> = {
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
     * 'reception' — the front desk recorded it at intake (Consult, 2026-09-03).
     *
     * Neither of the last two may look like a chip the doctor typed, and that
     * is not decoration. A doctor reading a chart must be able to tell that
     * "Known diabetic" came from a confirmation three visits ago rather than
     * from the patient sitting in front of them — otherwise one wrong
     * confirmation propagates forever and looks freshly entered every single
     * time. The same argument holds one degree less sharply for reception's
     * intake: it IS from today and it IS about this patient, so it wears a
     * quiet marker rather than the drained carried-forward surface — enough
     * to say "check this", not enough to say "distrust this".
     */
    origin?: "confirmed" | "carried" | "reception";
    /**
     * How long this complaint has been going on, in days. Symptoms only, and
     * only the ones `duration.ts` asks about — see that file for why not
     * everything. Absent means nobody was asked or the question was skipped.
     */
    durationDays?: number;
    /**
     * "Since when" for a standing history chip that earns the detail — e.g.
     * "2019" on a Previous MI chip, "2023" on a Pacemaker chip. Free text,
     * never forced (Anmol, 2026-09-21: "obviously loosey, it will not
     * force... you can skip from when if you don't know"). Rides the chip
     * the same way `durationDays` rides a symptom's — see the badge next to
     * this one in the chip render.
     */
    onsetNote?: string | null;
    /** A local finding — swelling, tenderness, a bruise — that happens at a place. */
    localizable?: boolean;
    /** Where it was found ("Right knee"); absent until someone says. */
    sites?: SiteRef[];
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

/**
 * Reception's intake: the chip's own colour, full strength, plus a marker.
 *
 * Deliberately NOT `TONE_CARRIED`'s drained surface and NOT a new colour. A
 * complaint the front desk wrote down five minutes ago is as true as one the
 * doctor typed — the doctor should REVIEW it, not doubt it — so the only
 * change is a small leading dot in the chip's own hue, which reads as "this
 * arrived here" without downgrading the fact. The dot is a `<span>`, never a
 * second `<button>` inside the chip (the nested-button hydration trap
 * `cortex-gotchas.md` records twice).
 */
const TONE_RECEPTION: Record<Observable["kind"], string> = {
    history: "bg-[#a855f7]",
    symptom: "bg-[#f472b6]",
    finding: "bg-[#0f766e]",
};

// ── shared search ──────────────────────────────────────────────────────────

/** Exported for `PracticePage`'s template builder — the same client-side
 *  rank-and-filter over the observable catalogue, so a doctor can add a
 *  symptom/finding/history item to a template through the identical search
 *  the case sheet itself uses, rather than a second implementation of it. */
/** Systems that are never "someone else's" — general findings, history,
 *  infection signs belong to every specialty. */
const NEUTRAL_SYSTEMS = new Set(["general", "history", "infection"]);

/**
 * Whether a specialty that prefers some systems would rank this one lower:
 * in Orthopedics, "Swelling in legs" is cardiovascular oedema, not the
 * swollen knee the doctor is typing about. Lowered, never hidden — ranking
 * decides what is offered first, never what is reachable.
 */
export function isOffSpecialty(o: Observable, preferSystems?: string[], preferDomain?: string): boolean {
    if (!preferSystems?.length || preferSystems.includes(o.system)) return false;
    // A general finding is everyone's only if it is tagged for this
    // practice's own domain — "Localised swelling" is, "Swelling all over
    // body" (generalised oedema, OPD only) is not.
    if (NEUTRAL_SYSTEMS.has(o.system)) return !!preferDomain && !o.domains.includes(preferDomain);
    return true;
}

/** The catalogue search itself, pure — see `useCatalogueSearch`. */
export function searchCatalogue(observables: Observable[], query: string, preferSystems?: string[], preferDomain?: string): Observable[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const prefer = preferSystems ?? [];
    // A text-match rank, shifted by specialty: a preferred system's entry
    // gains a little; another system's (cardiovascular swelling in an ortho
    // clinic) drops below every good match that fits.
    const score = (o: Observable, r: number) =>
        r + (isOffSpecialty(o, prefer, preferDomain) ? 2.5 : 0) - (prefer.includes(o.system) ? 0.3 : 0);
    return observables
        .map((o) => {
            const r = rankOf(o, q);
            return { o, r, s: r < 99 ? score(o, r) : 99 };
        })
        .filter((x) => x.r < 99)
        .sort((a, b) =>
            a.s - b.s ||
            KIND_ORDER[a.o.kind] - KIND_ORDER[b.o.kind] ||
            a.o.label.localeCompare(b.o.label)
        )
        .slice(0, MAX_RESULTS)
        .map((x) => x.o);
}

export function useCatalogueSearch(observables: Observable[], query: string, preferSystems?: string[], preferDomain?: string) {
    const key = `${(preferSystems ?? []).join(",")}|${preferDomain ?? ""}`;
    return useMemo(
        () => searchCatalogue(observables, query, preferSystems, preferDomain),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [observables, query, key],
    );
}

// ── the command bar ────────────────────────────────────────────────────────
//
// ── ONE surface for clinical information (2026-08-20)
//
// The bar used to search the observable catalogue only, and physiotherapy's
// Story sat in a card of its own below it with a second search inside. That
// asked the clinician a question the software should never ask: "is this
// Story or is this Case Sheet?" — a distinction that exists in the schema
// (`visit_story`'s columns vs `consultInput`'s observation set) and nowhere in
// a physiotherapist's head. Knee pain and "three weeks" arrive in the same
// sentence from the same patient.
//
// So the bar searches BOTH vocabularies at once and routes the answer itself.
// `Knee pain` is an observable and lands on the Case Sheet; `3 weeks` is a
// story dimension and lands on the Story. The clinician types and picks; the
// classification is Cortex's problem, which is the whole point.
//
// Order is not imposed, because a consultation does not have one. Every item
// in both vocabularies is reachable from the first keystroke — duration before
// the complaint, easing factor before onset, whatever the patient said first.
// `nextStoryPrompts` offers a next question only when the field is EMPTY and
// focused, so guidance costs nothing and never becomes a wall of chips.

type BarResult =
    | { t: "obs"; key: string; o: Observable }
    | { t: "story"; key: string; it: StorySearchItem }
    /** A doctor-authored template, matched by trigger word — never a
     *  Synapse suggestion. See BarProps.templates and `take()` below. */
    | { t: "template"; key: string; tpl: PrescriptionTemplateSummary }
    /** How long the complaint in the current duration slot has been going on.
     *  A fourth vocabulary the same box routes, on exactly the terms the
     *  other three already established — see `durationCandidates`. */
    | { t: "duration"; key: string; complaint: string; choice: DurationChoice }
    /** Where the local finding just added was found — the where-slot. */
    | { t: "site"; key: string; finding: string; hit: SiteHit }
    /** Anything typed as a sentence, kept word for word on the story. */
    | { t: "note"; key: string; text: string };

interface BarProps {
    observables: Observable[];
    /** labels already on the sheet, so a result shows a tick */
    onSheet: Set<string>;
    onToggle: (o: Observable, opts?: { deferSite?: boolean }) => void;
    /**
     * The story half of the same box. Both optional: General OPD passes
     * neither and gets exactly the catalogue-only bar it always had, so this
     * absorbs physiotherapy's Story without forking the component.
     */
    story?: Story;
    onStoryAdd?: (it: StorySearchItem) => void;
    /** removing a token from inside the box — same handler the sheet uses */
    onStoryRemove?: (it: StorySearchItem) => void;
    /**
     * The complaint, if one has been recorded — the first REPORTED entry.
     *
     * Load-bearing, not decoration. Until this exists there is no story to
     * ask questions about, so the box asks what happened and offers no
     * dimension at all. See `slot`.
     */
    leadComplaint?: string;
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
    /**
     * This doctor's reusable prescription templates, matched here by
     * trigger word — "fever" surfaces "Fever — General OPD" as a SEPARATE,
     * visually distinct row alongside the symptom "fever" itself, never
     * merged with it. Optional and additive: a caller that omits it (or
     * `onApplyTemplate`) gets exactly the bar it always had. See `take()`
     * and the template branch of the results dropdown.
     */
    templates?: PrescriptionTemplateSummary[];
    onApplyTemplate?: (templateId: number) => void;
    /**
     * ── THE DURATION SLOT (2026-09-03) ────────────────────────────────────
     *
     * Complaints on the sheet that could carry a duration and do not have one
     * yet, oldest first. The box asks about the first of them the same way
     * physiotherapy's composer asks its next open story dimension — same
     * pill, same Space-to-skip, same Backspace-to-undo — because it is the
     * same mechanism, and a second one that merely resembled it would drift.
     *
     * The CALLER decides which complaints qualify (`ASKS_DURATION` in
     * `duration.ts`, filtered against what is already recorded); the bar owns
     * only which of them is currently being asked and which have been skipped
     * this visit. Physiotherapy passes nothing here: its Story already owns
     * "how long", and asking twice is precisely the double-entry this screen
     * exists to remove.
     */
    durationCandidates?: string[];
    /**
     * Body systems this specialty works in ("musculoskeletal" for
     * Orthopedics and Physiotherapy). Matches from other systems rank below
     * the ones that fit and name their system on the row — see
     * `isOffSpecialty`. Absent: plain text ranking, as before.
     */
    preferSystems?: string[];
    /** the catalogue domain tag this practice's findings carry ("physio") */
    preferDomain?: string;
    /** label -> days, for the chips already answered — read to decide whether
     *  a threshold escalation is worth offering. */
    durationsByLabel?: Map<string, number>;
    /** `null` clears a duration already recorded — what Backspace undoes. */
    onDurationAnswer?: (label: string, days: number | null) => void;
    /**
     * ── THE WHERE-SLOT (2026-09-25) ───────────────────────────────────────
     *
     * A local finding picked here ("Joint swelling / effusion") is asked
     * "where?" in the same box, the way a complaint is asked "how long?":
     * type "kn" and the knee is on top, Enter, done. Places already in the
     * visit and places the complaints name ("Knee pain") lead. Typing
     * something that is not a place ("worse on standing") simply searches
     * as always; the question steps aside rather than blocking. Space skips.
     *
     * `onSiteChange` records (or, with `false`, takes back) one place for a
     * finding. Absent, local findings are added bare, exactly as before.
     */
    siteKnown?: SiteRef[];
    onSiteChange?: (finding: string, site: SiteRef, on: boolean) => void;
    /**
     * ── FREE-TEXT STORY (2026-09-27) ──────────────────────────────────────
     *
     * "Fell from bike yesterday" has no chip. Anything typed as a sentence is
     * offered as a note on the visit's story, word for word (`looksLikeNote`
     * decides what reads as a sentence). It leads the list when nothing in
     * the vocabularies starts with what was typed, and trails it otherwise,
     * so a catalogue search is never pre-empted. Absent: no note row.
     */
    onStoryNote?: (text: string) => void;
}

/**
 * The page's one input. It sits above every card rather than inside one,
 * because it belongs to the consultation and not to any single module.
 */
export function ClinicalCommandBar({
    observables, onSheet, onToggle, story, onStoryAdd, onStoryRemove, leadComplaint,
    disabled = false, searchRef, onEmptyDown, onEmptyUp, onEmptyEnter,
    templates, onApplyTemplate,
    durationCandidates, durationsByLabel, onDurationAnswer, preferSystems, preferDomain,
    siteKnown, onSiteChange, onStoryNote,
}: BarProps) {
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const [rect, setRect] = useState<DOMRect | null>(null);
    const [focused, setFocused] = useState(false);
    const reduce = useReducedMotion();

    const internalRef = useRef<HTMLInputElement>(null);
    const inputRef = (searchRef ?? internalRef) as React.RefObject<HTMLInputElement>;
    const boxRef = useRef<HTMLDivElement>(null);
    const stripRef = useRef<HTMLDivElement>(null);

    const obsResults = useCatalogueSearch(observables, query, preferSystems, preferDomain);
    const storyOn = !!(story && onStoryAdd);

    /**
     * ── THE SLOT ───────────────────────────────────────────────────────────
     *
     * Which clinical question the box is standing in right now. It decides two
     * things and no others: what the empty box SUGGESTS, and what the hint
     * beside the caret says. It never restricts what can be typed — typing
     * "severe" finds severity whatever slot is current, which is what makes
     * this a composer and not a wizard.
     *
     * `skipped` is the set the clinician has stepped past this visit. A skip is
     * not an answer and is never written to the story; it only takes that
     * question out of the rotation so the box stops offering it. Answering a
     * skipped dimension later still works — it is a search away, like
     * everything else.
     */
    const [skipped, setSkipped] = useState<Set<StoryDimension>>(new Set());

    /**
     * ── THE WAY BACK ───────────────────────────────────────────────────────
     *
     * `skipped` on its own is a set with no memory of ORDER or of how it
     * interleaved with the answers, and that turned out to be the whole bug.
     * Skipping was reachable — Space, Tab, the Skip button — and nothing
     * undid it, so three separate complaints all traced here:
     *
     *   - "no way to go back": a skipped question left the rotation for good.
     *   - "backspace is not working": Backspace only knew about `clauses`, so
     *     pressing it after a skip stepped over the question just skipped and
     *     deleted the ANSWER before it — destroying good data while appearing
     *     to do nothing about the skip.
     *   - "once you skipped everything it becomes gen OPD": every dimension
     *     skipped means `openDims` is empty, `slot` is null, and the pill,
     *     the Skip button and the prompt list all unmount at once, leaving a
     *     blank box with no route back into the physio flow.
     *
     * So the composer now keeps its steps in order — an answer or a skip —
     * and `goBack` pops one. Answers are checked against the story before
     * being undone, because the Case Sheet's own × can remove a chip behind
     * the composer's back; a step whose item is already gone is stale and is
     * popped straight through rather than firing a second removal.
     */
    type Step =
        | { kind: "skip"; dim: StoryDimension }
        | { kind: "answer"; item: StorySearchItem }
        /** the duration slot's own two steps — see `durationSlot` below.
         *  They ride the SAME history so Backspace walks one timeline, not
         *  two interleaved ones the clinician has to hold in their head. */
        | { kind: "durskip"; label: string }
        | { kind: "duration"; label: string }
        /** the where-slot's own two steps, on the same one timeline */
        | { kind: "siteskip"; label: string }
        | { kind: "site"; label: string; site: SiteRef };
    const [history, setHistory] = useState<Step[]>([]);

    const openDims = useMemo(
        () => (storyOn ? openStoryDimensions(story!).filter((d) => !skipped.has(d)) : []),
        [storyOn, story, skipped]
    );

    /**
     * ── NOTHING IS ASKED UNTIL THE COMPLAINT EXISTS ────────────────────────
     *
     * The first cut opened on "how long", which is not a question anyone asks
     * a patient who has not yet said what is wrong. A physiotherapist asks
     * what happened; duration, onset and the rest are qualifiers OF that
     * answer and are meaningless without it — "for 2 days" on its own is not
     * a clinical statement.
     *
     * So the slot stays null until a complaint is on the sheet, and the box
     * asks for the complaint instead. This is a change to what is OFFERED and
     * not to what is reachable: a clinician who genuinely wants to record a
     * duration first can still type "3 weeks" and pick it. The sequence is a
     * default, and defaults are exactly where clinical order belongs.
     */
    /**
     * ── THE WHERE-SLOT ─────────────────────────────────────────────────────
     * The local finding just added, while its place is being asked. Takes
     * precedence over the story and duration questions — it was asked by the
     * very keystroke that added the finding, and it is one word to answer.
     * Gone the moment the chip is (removed from the sheet) or the doctor
     * moves on to anything else.
     */
    const [siteAsk, setSiteAsk] = useState<string | null>(null);
    const siteOn = !!onSiteChange;
    const siteSlot = siteOn && siteAsk && onSheet.has(siteAsk) ? siteAsk : null;
    const skipSite = useCallback(() => {
        if (!siteSlot) return;
        setSiteAsk(null);
        setHistory((h) => [...h, { kind: "siteskip", label: siteSlot }]);
        setActive(0);
        inputRef.current?.focus();
    }, [siteSlot]);

    const storySlot: StoryDimension | null = leadComplaint ? (openDims[0] ?? null) : null;
    const slot: StoryDimension | null = siteSlot ? null : storySlot;

    /** Step past the current question without answering it. */
    const skipSlot = useCallback(() => {
        if (!slot) return;
        setSkipped((prev) => new Set(prev).add(slot));
        setHistory((h) => [...h, { kind: "skip", dim: slot }]);
        setActive(0);
        inputRef.current?.focus();
    }, [slot]);

    // ── THE DURATION SLOT ───────────────────────────────────────────────
    //
    // Same three pieces as the story slot above it — what is being asked, what
    // has been stepped past, and how to step past it — for the surfaces that
    // have no Story. Never both: `durationOn` is false whenever the story
    // composer is running (see `durationCandidates`).
    const [durationSkipped, setDurationSkipped] = useState<Set<string>>(new Set());
    const durationOn = !storyOn && !!durationCandidates?.length && !!onDurationAnswer;
    const durationSlot = useMemo(
        () => (durationOn && !siteSlot ? (durationCandidates!.find((l) => !durationSkipped.has(l)) ?? null) : null),
        [durationOn, siteSlot, durationCandidates, durationSkipped]
    );

    const skipDuration = useCallback(() => {
        if (!durationSlot) return;
        setDurationSkipped((prev) => new Set(prev).add(durationSlot));
        setHistory((h) => [...h, { kind: "durskip", label: durationSlot }]);
        setActive(0);
        inputRef.current?.focus();
    }, [durationSlot]);

    /**
     * A duration that has crossed a threshold the catalogue already has a chip
     * for — "18 days" on a fever is `fever_prolonged`, which is a real
     * observable with real rules behind it.
     *
     * OFFERED, never applied. Auto-charting it would be the software making a
     * clinical assertion nobody made, and then ranking medicines off it. This
     * is the same "suggested, with the reason stated, one click to take it"
     * shape `suggestIrritability` and MeasureCell's `suggested`/`because`
     * already use. Dismissable, and dismissal is per-visit UI state — the
     * suggestion is not a finding, so there is nothing to record about
     * declining it.
     */
    const [dismissedEscalations, setDismissedEscalations] = useState<Set<string>>(new Set());
    const observableByLabel = useMemo(() => {
        const m = new Map<string, Observable>();
        for (const o of observables) m.set(o.label, o);
        return m;
    }, [observables]);

    const escalation = useMemo(() => {
        if (!durationsByLabel?.size) return null;
        for (const [label, days] of durationsByLabel) {
            const source = observableByLabel.get(label);
            if (!source) continue;
            const hit = escalationFor(source.slug, days);
            if (!hit) continue;
            const target = observables.find((o) => o.slug === hit.toSlug);
            if (!target || onSheet.has(target.label)) continue;
            if (dismissedEscalations.has(target.slug)) continue;
            return { complaint: label, days, target };
        }
        return null;
    }, [durationsByLabel, observableByLabel, observables, onSheet, dismissedEscalations]);

    /** The sentence so far, for the tokens rendered INSIDE the box. */
    const clauses = useMemo(() => (story ? storyClauses(story) : []), [story]);

    /**
     * Undo one composer step — a skip becomes un-skipped, an answer is taken
     * off the story. This is what Backspace on an empty box does and what the
     * Back button does, because they are the same intention typed two ways.
     *
     * The fallback at the end matters: history is per-mount and the story is
     * not, so a visit reopened (or edited from the Case Sheet) can have
     * clauses with no history behind them. Rather than refuse to go back, the
     * composer falls back to the old behaviour and removes the last clause.
     */
    const canGoBack = history.length > 0 || clauses.length > 0;

    const goBack = useCallback(() => {
        const next = [...history];
        while (next.length) {
            const step = next.pop()!;
            if (step.kind === "skip") {
                setSkipped((prev) => {
                    const s = new Set(prev);
                    s.delete(step.dim);
                    return s;
                });
                setHistory(next);
                setActive(0);
                inputRef.current?.focus();
                return;
            }
            if (step.kind === "durskip") {
                setDurationSkipped((prev) => {
                    const s = new Set(prev);
                    s.delete(step.label);
                    return s;
                });
                setHistory(next);
                setActive(0);
                inputRef.current?.focus();
                return;
            }
            if (step.kind === "siteskip") {
                // Ask again, as long as the finding is still on the sheet.
                if (!onSheet.has(step.label)) continue;
                setSiteAsk(step.label);
                setHistory(next);
                setActive(0);
                inputRef.current?.focus();
                return;
            }
            if (step.kind === "site") {
                // Take the place back and ask again — "wrong knee".
                if (!onSheet.has(step.label)) continue;
                onSiteChange?.(step.label, step.site, false);
                setSiteAsk(step.label);
                setHistory(next);
                setActive(0);
                inputRef.current?.focus();
                return;
            }
            if (step.kind === "duration") {
                // Clearing the answer puts the complaint back in the rotation
                // on its own — `durationCandidates` is recomputed from what is
                // recorded, so there is no second piece of state to unwind.
                onDurationAnswer?.(step.label, null);
                setHistory(next);
                setActive(0);
                inputRef.current?.focus();
                return;
            }
            // An answer, but only if it is still on the story — see above.
            if (story && storyHas(story, step.item)) {
                onStoryRemove?.(step.item);
                setHistory(next);
                setActive(0);
                inputRef.current?.focus();
                return;
            }
        }
        setHistory([]);
        if (clauses.length > 0) onStoryRemove?.(clauses[clauses.length - 1].item);
        setActive(0);
        inputRef.current?.focus();
    }, [history, story, onStoryRemove, clauses, onSheet, onSiteChange]);

    /**
     * Put every skipped question back in the rotation at once.
     *
     * Back walks out one step at a time, which is right for "I picked the
     * wrong thing" but wrong for "I skipped through the lot and now I want
     * the case sheet back". Without this the only remedy for a fully-skipped
     * story is reloading the consult.
     */
    const resumeSkipped = useCallback(() => {
        setSkipped(new Set());
        setHistory((h) => h.filter((s) => s.kind !== "skip"));
        setActive(0);
        inputRef.current?.focus();
    }, []);

    /**
     * The two vocabularies, merged.
     *
     * Story items are appended rather than interleaved by rank. Two ranking
     * scales computed by different functions are not comparable — sorting on
     * them together would let a rank-2 story item outrank a rank-3 observable
     * for reasons neither function intended. Observables lead because they are
     * what is typed most of the time; both are always present, and the story
     * block is at most a few rows, so nothing is pushed out of reach.
     */
    /**
     * A doctor's own templates, matched by trigger word — case-insensitive
     * substring, the same generosity `searchStory` and the catalogue search
     * both use. Lead the list: a template is a bigger decision than any
     * single chip beneath it, and the row itself is styled distinctly (see
     * the dropdown's badge below) so it never reads as just another symptom.
     */
    const templateMatches = useMemo<BarResult[]>(() => {
        const q = query.trim().toLowerCase();
        if (!templates || !onApplyTemplate || q.length < 2) return [];
        return templates
            .filter((t) => t.triggerLabel.toLowerCase().includes(q))
            .map((t) => ({ t: "template" as const, key: `tpl:${t.id}`, tpl: t }));
    }, [templates, onApplyTemplate, query]);

    /**
     * What the typed query means as a DURATION, when a duration is what is
     * being asked.
     *
     * These lead the list, for the same reason story items answering the open
     * dimension lead it: the first row is what Enter takes, and a doctor
     * answering "how many days" with `3` must not have that Enter file an
     * observable whose label happens to contain a 3. `durationChoicesFor`
     * turns a bare number into days/weeks/months and a qualified one
     * ("3 weeks", "10d") into exactly what was said — so any number is
     * enterable, which is the whole complaint that started this.
     */
    const durationMatches = useMemo<BarResult[]>(() => {
        if (!durationSlot) return [];
        return durationChoicesFor(query).map((choice) => ({
            t: "duration" as const,
            key: `d:${durationSlot}:${choice.days}`,
            complaint: durationSlot,
            choice,
        }));
    }, [durationSlot, query]);

    /** The sheet's region-named complaints, for the where-slot's second tier. */
    const implied = useMemo(() => (siteSlot ? impliedSites(onSheet) : []), [siteSlot, onSheet]);

    /** What the typed query means as a PLACE, while a place is being asked.
     *  Leads the list for the same reason a duration does; a query that is
     *  no place at all yields nothing here and searches as it always has. */
    const siteMatches = useMemo<BarResult[]>(() => {
        if (!siteSlot || !query.trim()) return [];
        return searchSites(query, siteKnown ?? [], implied, 5).map((hit) => ({
            t: "site" as const, key: `w:${siteSlot}:${hit.label}`, finding: siteSlot, hit,
        }));
    }, [siteSlot, query, siteKnown, implied]);

    const searchResults = useMemo<BarResult[]>(() => {
        const obs: BarResult[] = obsResults.map((o) => ({ t: "obs", key: `o:${o.id}`, o }));
        if (!storyOn) return [...siteMatches, ...durationMatches, ...templateMatches, ...obs];
        const st = searchStory(query, story!, 6);

        /**
         * Items answering the question actually on screen lead the list.
         *
         * Observables led unconditionally before, which read as a sensible
         * default and was not. With "how long" open, typing "3 weeks" put the
         * observable "Cough over 3 weeks" above the duration "3 weeks" — and
         * because the first row is what Enter takes, the natural keystrokes
         * for the brief's own test scenario filed a cough on a knee patient.
         * That is not a cosmetic ranking miss: the wrong chip re-pointed
         * RELATED at chest findings and pulled Resp Rate and SpO₂ into a
         * physiotherapy consult's Measurements.
         *
         * Only the items belonging to the OPEN dimension are promoted, and
         * only while a slot is open. Everything else keeps the old order, so
         * this stays a tie-break for the question being asked rather than a
         * general preference for story over observables.
         */
        const inSlot = (it: StorySearchItem) => !!slot && it.dimension === slot;
        const lead: BarResult[] = st.filter(inSlot)
            .map((it) => ({ t: "story", key: `s:${it.id}`, it }));
        const rest: BarResult[] = st.filter((it) => !inSlot(it))
            .map((it) => ({ t: "story", key: `s:${it.id}`, it }));
        return [...siteMatches, ...templateMatches, ...lead, ...obs, ...rest];
    }, [obsResults, storyOn, query, story, slot, templateMatches, durationMatches, siteMatches]);

    /**
     * The typed sentence itself, as a story note. Leads when nothing offered
     * begins with what was typed (so "fell from bike yesterday" + Enter keeps
     * it), trails otherwise (so "knee pain" + Enter still takes the chip).
     */
    const results = useMemo<BarResult[]>(() => {
        const q = query.trim();
        if (!onStoryNote || !looksLikeNote(q)) return searchResults;
        const note: BarResult = { t: "note", key: `n:${q.toLowerCase()}`, text: q };
        const lower = q.toLowerCase();
        const labelOf = (r: BarResult) => r.t === "obs" ? r.o.label
            : r.t === "template" ? r.tpl.name
                : r.t === "duration" ? r.choice.label
                    : r.t === "site" ? r.hit.label
                        : r.t === "story" ? r.it.label : "";
        // ...or when a parsed answer opens the sentence ("10 days back" is the
        // duration "10 days", not a note).
        const parsed = (r: BarResult) => r.t === "duration" || r.t === "site" || (r.t === "story" && r.it.dimension === "Duration");
        const startsWith = searchResults.some((r) => {
            const l = labelOf(r).toLowerCase();
            return l.startsWith(lower) || (parsed(r) && !!l && lower.startsWith(l));
        });
        return startsWith ? [...searchResults, note] : [note, ...searchResults];
    }, [searchResults, query, onStoryNote]);

    /** Empty + focused: the current slot's options, never a permanent row. */
    const prompts = useMemo<BarResult[]>(() => {
        if (query.trim()) return [];
        if (siteSlot) {
            return suggestSites(siteKnown ?? [], implied, 6).map((hit) => ({
                t: "site" as const, key: `wp:${siteSlot}:${hit.label}`, finding: siteSlot, hit,
            }));
        }
        if (durationSlot) {
            // The everyday answers, offered — and the box still takes any
            // number typed over the top of them. A ladder is a shortcut here,
            // never the only way through, which is exactly where
            // physiotherapy's hard-coded list went wrong.
            return DURATION_QUICK.map((choice) => ({
                t: "duration" as const,
                key: `dp:${durationSlot}:${choice.days}`,
                complaint: durationSlot,
                choice,
            }));
        }
        if (!storyOn || !slot) return [];
        return itemsForDimension(story!, slot, 6)
            .map((it) => ({ t: "story", key: `p:${it.id}`, it }));
    }, [storyOn, query, story, slot, durationSlot, siteSlot, siteKnown, implied]);

    const showPrompts = focused && !query.trim() && prompts.length > 0;
    const shown = query.trim() ? results : prompts;
    const open = query.trim().length > 0 || showPrompts;

    /**
     * Keep the caret in view as the sentence grows past the box.
     *
     * The strip scrolls sideways rather than wrapping, so without this the
     * newest token — and the input right after it — slide out of sight the
     * moment the sentence is wider than the box, which would reintroduce the
     * exact "I cannot see what I am building" problem the composer exists to
     * fix, just on a different axis.
     */
    useEffect(() => {
        const el = stripRef.current;
        if (el) el.scrollLeft = el.scrollWidth;
    }, [clauses.length, leadComplaint]);

    /**
     * Put the highlight back on the first row whenever the OFFER changes.
     *
     * This keyed off `query` alone, which missed the case that matters: the
     * slot advancing swaps the entire list without the query ever changing,
     * so `active` survived from the previous dimension and Enter committed
     * that row of the new list. Answering "how long", then pressing Enter on
     * a "what makes it worse" list whose first row was "Going downstairs",
     * recorded "going upstairs" — index 1 held over from the list before.
     * `onMouseEnter` sets `active` too, so a cursor merely resting over the
     * dropdown could do the same thing.
     *
     * Keying off the rendered row identities catches both, and costs one
     * string join over a list that is at most a few rows.
     */
    const shownKey = shown.map((s) => s.key).join("|");
    useEffect(() => { setActive(0); }, [shownKey]);

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

    /** One entry point for every vocabulary this bar spans — the routing IS
     *  the feature. A template is neither an observable nor a story answer:
     *  it never touches the sheet or the step history itself, it hands off
     *  to `onApplyTemplate`, which runs each of its items through the same
     *  guarded accept path as everything else (see App.tsx's applyTemplate). */
    const take = (r: BarResult) => {
        // Anything taken other than a place moves on from the where-slot; a
        // new local finding opens it again for itself, below.
        if (r.t !== "site") setSiteAsk(null);
        if (r.t === "site") {
            onSiteChange?.(r.finding, r.hit.site, true);
            setHistory((h) => [...h, { kind: "site", label: r.finding, site: r.hit.site }]);
            setSiteAsk(null);
        }
        else if (r.t === "obs") {
            const adding = !onSheet.has(r.o.label);
            const ask = siteOn && adding && r.o.localizable;
            onToggle(r.o, ask ? { deferSite: true } : undefined);
            if (ask) setSiteAsk(r.o.label);
        }
        else if (r.t === "template") onApplyTemplate?.(r.tpl.id);
        else if (r.t === "note") onStoryNote?.(r.text);
        else if (r.t === "duration") {
            onDurationAnswer?.(r.complaint, r.choice.days);
            setHistory((h) => [...h, { kind: "duration", label: r.complaint }]);
        }
        else {
            onStoryAdd?.(r.it);
            // Only story answers go on the step history. An observable is a
            // Case Sheet chip with its own × sitting in plain sight; the
            // composer has no business owning the undo for something it does
            // not render.
            setHistory((h) => [...h, { kind: "answer", item: r.it }]);
        }
        setQuery("");
        inputRef.current?.focus();
    };

    const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const empty = !query.trim();

        // ── Skip, on the two keys a hand is already resting on ────────────
        // Space is free while the box is empty (it cannot begin a search term)
        // and it is the largest key on the keyboard, which is the whole reason
        // to spend it here rather than on a chord nobody will remember. Tab
        // does the same thing for anyone who expects it to; both stop at the
        // last open question rather than wrapping, so a clinician cannot skip
        // in a circle.
        if (empty && siteSlot && (e.key === " " || e.key === "Tab")) {
            e.preventDefault();
            skipSite();
            return;
        }

        if (empty && storyOn && slot && (e.key === " " || e.key === "Tab")) {
            e.preventDefault();
            skipSlot();
            return;
        }

        // The duration slot skips on exactly the same keys, because to the
        // hand it IS the same question: "how long" with nothing typed. Anmol,
        // 2026-09-03: "you click space, it will be simply ignored, you could
        // just go to new symptom."
        if (empty && durationSlot && (e.key === " " || e.key === "Tab")) {
            e.preventDefault();
            skipDuration();
            return;
        }

        // Backspace on an empty box takes back the last thing DONE — the
        // convention every chip input shares, and the fastest correction
        // available when the wrong item was picked from the list.
        //
        // "Last thing done", not "last token": a skip is a step too. Gating
        // this on `clauses.length` was what made Backspace look broken after
        // a skip — there was no token for the skipped question, so the guard
        // fell through to the answer before it and deleted that instead.
        if (empty && e.key === "Backspace" && canGoBack) {
            e.preventDefault();
            goBack();
            return;
        }

        // With nothing typed AND nothing being offered, these three keys have
        // nothing of THIS bar's to act on — handed to Related instead, if the
        // parent wired anything there. Genuinely a no-op if it did not.
        if (!open) {
            if (e.key === "ArrowDown" && onEmptyDown) { e.preventDefault(); onEmptyDown(); }
            else if (e.key === "ArrowUp" && onEmptyUp) { e.preventDefault(); onEmptyUp(); }
            else if (e.key === "Enter" && onEmptyEnter) { e.preventDefault(); onEmptyEnter(); }
            return;
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, shown.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            const pick = shown[active];
            if (pick) take(pick);
        } else if (e.key === "Escape") {
            e.preventDefault();
            if (query.trim()) setQuery("");
            else if (siteSlot) skipSite();
            else inputRef.current?.blur();
        }
    };

    const dropdown = open && rect ? createPortal(
        <AnimatePresence>
            <motion.div
                initial={reduce ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.13, ease: "easeOut" }}
                className="fixed z-50 max-h-[16rem] overflow-y-auto rounded-[10px] border border-[var(--cs-line-strong)] bg-white py-1 shadow-[0_12px_32px_rgba(16,28,46,0.16)]"
                style={{ top: rect.bottom + 6, left: rect.left, width: rect.width }}
                role="listbox"
            >
                {/* The prompt list says WHY it is offering these, because
                    otherwise a list that appears on focus reads as a search
                    result for a query nobody typed. */}
                {showPrompts && (slot || durationSlot || siteSlot) && (
                    <p className="flex items-center justify-between gap-2 border-b border-[var(--cs-line)] px-3 pb-1.5 pt-2">
                        <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--cs-label)]">
                            {siteSlot ? (
                                <span className="text-[var(--cs-teal)]">{siteSlot} — where?</span>
                            ) : slot ? DIMENSION_PROMPT[slot] : `${durationSlot} — how long?`}
                        </span>
                        {/* The skip is stated where the clinician is looking —
                            a key that is only discoverable by being told is a
                            key nobody uses. */}
                        <span className="text-[10.5px] font-medium text-[var(--cs-faint)]">
                            <kbd className="rounded border border-[var(--cs-line-strong)] bg-[#f7f8fa] px-1.5 py-[1px] font-semibold">Space</kbd>
                            {" "}to skip
                        </span>
                    </p>
                )}

                {shown.length === 0 ? (
                    <p className="px-3.5 py-2.5 text-[13px] text-[var(--cs-faint)]">
                        Nothing matches “{query.trim()}”
                    </p>
                ) : (
                    shown.map((r, i) => {
                        // A story item is never "already on the sheet" — the
                        // search filters those out at source (`searchStory`),
                        // so only observables can come back ticked.
                        const on = r.t === "obs" && onSheet.has(r.o.label);
                        const label = r.t === "obs" ? r.o.label
                            : r.t === "template" ? r.tpl.name
                                : r.t === "duration" ? r.choice.label
                                    : r.t === "site" ? r.hit.label
                                        : r.t === "note" ? r.text
                                            : r.it.label;
                        return (
                            <button
                                key={r.key}
                                type="button"
                                role="option"
                                aria-selected={i === active}
                                onMouseEnter={() => setActive(i)}
                                // `onMouseDown` rather than `onClick`: the input's
                                // blur fires first on a click and would close the
                                // prompt list out from under the pointer.
                                onMouseDown={(e) => { e.preventDefault(); take(r); }}
                                className={
                                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] " +
                                    "font-medium text-[var(--cs-ink)] " +
                                    (on ? "opacity-55 " : "") +
                                    // ── EXACTLY ONE BACKGROUND PER ROW ──────
                                    // Anmol, 2026-09-14: "in the duration
                                    // thing, down/up arrow doesn't work."
                                    //
                                    // The arrows worked. The CURSOR did not
                                    // move, which is indistinguishable from
                                    // the doctor's side. A duration row used
                                    // to carry `bg-…/40` unconditionally AND
                                    // the active row `bg-…` — two utilities
                                    // setting the same property, so the class
                                    // string's order decided nothing and the
                                    // stylesheet's did. Tailwind emits the
                                    // `/40` variant LAST, inside an
                                    // `@supports (color-mix)` block, so it won
                                    // on every modern browser and every
                                    // duration row painted identically whether
                                    // it held the cursor or not. Verified
                                    // against the built CSS, not guessed.
                                    //
                                    // Templates carried the same latent
                                    // conflict with their violet wash.
                                    //
                                    // So the background is now ONE ternary:
                                    // the cursor always wins, and a row type's
                                    // own tint only applies when it is not the
                                    // cursor. Row IDENTITY stays on the left
                                    // rule below, which nothing competes for —
                                    // a template is a bigger decision than a
                                    // chip and a duration answers the question
                                    // the box is standing on, and both still
                                    // say so at a glance.
                                    (i === active
                                        ? "bg-[var(--cs-blue-soft)] "
                                        : r.t === "template" ? "bg-[#faf8ff] " : "") +
                                    (r.t === "template" ? "border-l-2 border-l-[var(--cs-violet)] " : "") +
                                    (r.t === "duration" ? "border-l-2 border-l-[var(--cs-blue)] " : "") +
                                    (r.t === "site" ? "border-l-2 border-l-[var(--cs-teal)] " : "") +
                                    (r.t === "note" ? "border-l-2 border-l-[#a855f7] " : "")
                                }
                            >
                                {r.t === "site" && (
                                    <MapPin size={13} aria-hidden="true" className="flex-none text-[var(--cs-teal)]" />
                                )}
                                {r.t === "note" && (
                                    <PenLine size={13} aria-hidden="true" className="flex-none text-[#9333ea]" />
                                )}
                                <span className={"min-w-0 flex-1 truncate" + (r.t === "site" ? " font-semibold" : "")}>
                                    {on && <span aria-hidden="true">✓ </span>}
                                    {r.t === "note" && (
                                        <span className="mr-1 text-[12px] font-semibold text-[#7e22ce]">Add to story</span>
                                    )}
                                    {r.t === "note" ? <span className="text-[var(--cs-ink)]">“{label}”</span> : label}
                                    {r.t === "template" && (
                                        <span className="ml-1.5 text-[11px] font-normal text-[var(--cs-faint)]">
                                            {r.tpl.itemCount} item{r.tpl.itemCount === 1 ? "" : "s"}
                                        </span>
                                    )}
                                    {/* Says why a lowered match is lowered —
                                        "Swelling in legs · cardiovascular" —
                                        so it is never mistaken for the local
                                        swelling above it. */}
                                    {/* Why this place leads — the visit already
                                        has it, or the complaint names it. */}
                                    {r.t === "site" && r.hit.why && (
                                        <span className="ml-1.5 text-[11px] font-medium text-[var(--cs-faint)]">
                                            {r.hit.why === "visit" ? "· in this visit" : "· from the complaint"}
                                        </span>
                                    )}
                                    {r.t === "obs" && isOffSpecialty(r.o, preferSystems, preferDomain) && (
                                        <span className="ml-1.5 text-[11px] font-medium text-[var(--cs-faint)]">
                                            · {r.o.system}
                                        </span>
                                    )}
                                </span>
                                {/* What Cortex is about to call this, stated
                                    BEFORE it is committed, so the doctor sees
                                    the system's reading while disagreeing with
                                    it is still cheap. For a story item that is
                                    its clinical dimension — which is also the
                                    only place the word "duration" or "onset"
                                    ever appears, now that the form is gone. */}
                                <span
                                    className={
                                        "flex-none rounded-[5px] px-[7px] py-[2px] text-[11px] font-semibold " +
                                        (r.t === "obs" ? TONE[r.o.kind].badge
                                            : r.t === "template" ? "bg-[var(--cs-violet-soft)] text-[var(--cs-violet)]"
                                                : r.t === "site" ? "bg-[#dbf4eb] text-[#0b6a62]"
                                                    : r.t === "note" ? "bg-[#f3e8ff] text-[#7e22ce]"
                                                        : "bg-[#eaf0fb] text-[#2c4a7c]")
                                    }
                                >
                                    {r.t === "obs" ? KIND_BADGE[r.o.kind]
                                        : r.t === "template" ? "Template"
                                            : r.t === "duration" ? "duration"
                                                : r.t === "site" ? "where"
                                                    : r.t === "note" ? "story"
                                                        : r.it.dimension.toLowerCase()}
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
        <div className="mb-1.5">
            {/* ── THE COMPOSER ──────────────────────────────────────────────
                The sentence is built INSIDE this box, not underneath it.

                That is the whole point of the rewrite. Previously the story
                assembled itself in the Case Sheet 200px below, which the
                suggestion dropdown sat directly on top of — so the clinician
                could not see the sentence they were composing without first
                dismissing the list they were composing it from. The tokens
                live in the box now, the dropdown opens below the box, and the
                two can never occlude each other.

                It scrolls sideways rather than wrapping: the box keeps one
                height, and the end of the sentence — where the caret is, and
                the only part being edited — stays in view. */}
            <div
                ref={boxRef}
                onClick={() => inputRef.current?.focus()}
                className={
                    "flex min-h-[38px] cursor-text items-center gap-2 overflow-hidden rounded-[var(--cs-radius)] border border-[var(--cs-line-strong)] bg-white px-3 shadow-[0_1px_2px_rgba(16,28,46,0.04)] transition-[border-color,box-shadow] duration-150 " +
                    // Teal while a place is being asked — the finding's own
                    // colour, so the box visibly belongs to that question.
                    (siteSlot
                        ? "focus-within:border-[rgba(15,118,110,0.55)] focus-within:shadow-[0_0_0_3px_rgba(15,118,110,0.12)]"
                        : "focus-within:border-[rgba(18,104,232,0.5)] focus-within:shadow-[0_0_0_3px_rgba(18,104,232,0.1)]")
                }
            >
                <Search size={15} className="flex-none text-[var(--cs-faint)]" />

                <div ref={stripRef} className="scrollbar-none flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1.5">
                    {/* The complaint leads, because it is what the sentence is
                        ABOUT — everything after it qualifies it. Rose, matching
                        the Reported chips on the sheet, so the one fact that
                        arrived from the catalogue rather than the story
                        vocabulary is visibly the same fact in both places. It
                        is removed from the Case Sheet, not from here: this is
                        the story's subject, and the × on a subject would
                        silently take a symptom off the chart. */}
                    {leadComplaint && (
                        <span className="inline-flex flex-none items-center rounded-md border border-[#f6c3cd] bg-[linear-gradient(180deg,#fff8f9_0%,#ffe6ea_100%)] px-2 py-[2px] text-[12.5px] font-bold text-[#b3103b]">
                            {leadComplaint}
                        </span>
                    )}
                    {/* Everything already said, as one running line. Each token
                        is removable, but they read as a sentence rather than as
                        a row of boxes — a story is one statement about one
                        person, and chipping it apart loses every relationship
                        in it. */}
                    {clauses.map((c) => (
                        <span
                            key={c.item.id}
                            className="group/tok inline-flex flex-none items-center gap-1 rounded-md border border-[#dbe4f2] bg-[#f2f6fd] py-[2px] pl-2 pr-1 text-[12.5px] font-semibold text-[#23406e]"
                            title={c.item.dimension}
                        >
                            {c.lead && <span className="font-normal text-[#6a80a6]">{c.lead}</span>}
                            {c.text}
                            <button
                                type="button"
                                aria-label={`Remove ${c.item.label}`}
                                disabled={disabled}
                                onMouseDown={(e) => { e.preventDefault(); onStoryRemove?.(c.item); }}
                                className="grid size-[14px] place-items-center rounded text-[#8296b7] hover:bg-[rgba(35,64,110,0.12)] hover:text-[#23406e]"
                            >
                                <X size={10} />
                            </button>
                        </span>
                    ))}

                    <input
                        ref={inputRef}
                        /* First-run walkthrough anchor — see features/onboarding. */
                        data-coach="case.search"
                        value={query}
                        disabled={disabled}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={onKey}
                        onFocus={() => setFocused(true)}
                        onBlur={() => setFocused(false)}
                        placeholder={
                            siteSlot ? `Where is it? Type a place, e.g. kn or lower back. Space to skip`
                            : durationSlot ? `How long — ${durationSlot.toLowerCase()}? Type a number, or Space to skip`
                                : !storyOn ? (onStoryNote ? "Add symptoms, findings, history, or type what happened…" : "Add clinical information (symptoms, findings, history…)")
                                : !leadComplaint ? "What happened? Start with the complaint…"
                                    // A slot names the question in the pill beside the
                                    // caret, so a placeholder would only repeat it.
                                    : slot ? ""
                                        // No slot left. This used to be "" and left a
                                        // blank unlabelled box that read as a dead input
                                        // — the "it just becomes gen OPD" report.
                                        : "Add a symptom, finding or measurement…"
                        }
                        aria-label="Add clinical information"
                        className="cx-bar-input min-w-[9rem] flex-1 border-0 bg-transparent p-0 text-[13.5px] font-medium text-[var(--cs-ink)] outline-none placeholder:font-normal placeholder:text-[var(--cs-faint)]"
                    />

                    {Boolean(query) && !disabled && (
                        <button
                            type="button"
                            className="cs-field-clear"
                            onClick={() => {
                                setQuery("");
                                inputRef.current?.focus();
                            }}
                            onMouseDown={(e) => e.preventDefault()}
                            aria-label="Clear clinical search"
                            title="Clear search"
                            tabIndex={-1}
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

                {/* ── The slot, named and skippable ─────────────────────────
                    Says which question the box is on, in the words a clinician
                    would use rather than the schema's ("how long", not
                    "Duration"). Skippable by mouse here and by Space or Tab on
                    an empty box — Space because it is the largest key on the
                    keyboard and it does nothing else while the box is empty. */}
                {/* Back sits to the LEFT of Skip and outside the `slot` guard.
                    Both placements are the bug report: a way forward with no
                    way back reads as a one-way door, and when every question
                    has been skipped `slot` is null — which is exactly the
                    moment a clinician most needs a way out, and exactly the
                    moment the old markup rendered nothing at all. */}
                {/* The duration composer's own controls. Same three shapes as
                    the story composer's below — pill, Back, Skip — so the two
                    are one mechanism a doctor learns once, not two that look
                    alike. Rendered only when a duration is actually open;
                    General OPD with nothing to ask is exactly the bar it has
                    always been. */}
                {/* The where-slot's controls — the same pill and Skip as
                    "how long", in the finding's teal, naming WHAT is being
                    placed so the question is never ambiguous. */}
                {siteSlot && (
                    <span className="flex flex-none items-center gap-1.5 pl-1">
                        <span
                            title={`Where is the ${siteSlot.toLowerCase()}?`}
                            className="hidden max-w-[15rem] items-center gap-1 rounded-md border border-[#a4e3d1] bg-[linear-gradient(180deg,#f4fdfa_0%,#dbf4eb_100%)] px-2 py-[3px] text-[11px] font-semibold text-[#0b6a62] sm:inline-flex"
                        >
                            <MapPin size={11} aria-hidden="true" className="flex-none" />
                            <span className="truncate">{siteSlot}</span>
                            <span className="flex-none font-bold">· where?</span>
                        </span>
                        <button
                            type="button"
                            disabled={disabled}
                            onMouseDown={(e) => { e.preventDefault(); skipSite(); }}
                            title="Skip — leave it without a place (Space)"
                            className="rounded-md border border-[var(--cs-line-strong)] px-2 py-[3px] text-[11px] font-semibold text-[var(--cs-faint)] hover:border-[var(--cs-teal)] hover:text-[var(--cs-teal)]"
                        >
                            Skip
                        </button>
                    </span>
                )}

                {durationSlot && (
                    <span className="flex flex-none items-center gap-1.5 pl-1">
                        <span className="hidden items-center gap-1 rounded-md bg-[var(--cs-blue-soft)] px-2 py-[3px] text-[11px] font-semibold text-[var(--cs-blue)] sm:inline-flex">
                            how long
                        </span>
                        {canGoBack && (
                            <button
                                type="button"
                                disabled={disabled}
                                onMouseDown={(e) => { e.preventDefault(); goBack(); }}
                                title="Go back one step — Backspace"
                                className="rounded-md border border-[var(--cs-line-strong)] px-2 py-[3px] text-[11px] font-semibold text-[var(--cs-faint)] hover:border-[var(--cs-blue)] hover:text-[var(--cs-blue)]"
                            >
                                Back
                            </button>
                        )}
                        <button
                            type="button"
                            disabled={disabled}
                            onMouseDown={(e) => { e.preventDefault(); skipDuration(); }}
                            title="Skip this question — Space"
                            className="rounded-md border border-[var(--cs-line-strong)] px-2 py-[3px] text-[11px] font-semibold text-[var(--cs-faint)] hover:border-[var(--cs-blue)] hover:text-[var(--cs-blue)]"
                        >
                            Skip
                        </button>
                    </span>
                )}

                {storyOn && leadComplaint && !siteSlot && (
                    <span className="flex flex-none items-center gap-1.5 pl-1">
                        {slot && (
                            <span className="hidden items-center gap-1 rounded-md bg-[var(--cs-blue-soft)] px-2 py-[3px] text-[11px] font-semibold text-[var(--cs-blue)] sm:inline-flex">
                                {DIMENSION_PROMPT[slot]}
                            </span>
                        )}
                        {canGoBack && (
                            <button
                                type="button"
                                disabled={disabled}
                                onMouseDown={(e) => { e.preventDefault(); goBack(); }}
                                title="Go back one step — Backspace"
                                className="rounded-md border border-[var(--cs-line-strong)] px-2 py-[3px] text-[11px] font-semibold text-[var(--cs-faint)] hover:border-[var(--cs-blue)] hover:text-[var(--cs-blue)]"
                            >
                                Back
                            </button>
                        )}
                        {slot && (
                            <button
                                type="button"
                                disabled={disabled}
                                onMouseDown={(e) => { e.preventDefault(); skipSlot(); }}
                                title="Skip this question — Space"
                                className="rounded-md border border-[var(--cs-line-strong)] px-2 py-[3px] text-[11px] font-semibold text-[var(--cs-faint)] hover:border-[var(--cs-blue)] hover:text-[var(--cs-blue)]"
                            >
                                Skip
                            </button>
                        )}
                        {/* Only when there is nothing left to ask AND something
                            was skipped to get there — otherwise this is a
                            button offering to undo a thing that did not
                            happen. Stated as the question it restores rather
                            than as "undo", because that is what is wanted. */}
                        {!slot && skipped.size > 0 && (
                            <button
                                type="button"
                                disabled={disabled}
                                onMouseDown={(e) => { e.preventDefault(); resumeSkipped(); }}
                                title="Ask the skipped questions again"
                                className="rounded-md border border-[var(--cs-blue)] px-2 py-[3px] text-[11px] font-semibold text-[var(--cs-blue)] hover:bg-[var(--cs-blue-soft)]"
                            >
                                {skipped.size} skipped — ask again
                            </button>
                        )}
                    </span>
                )}

                <kbd className="hidden flex-none rounded-md border border-[var(--cs-line-strong)] bg-[#f7f8fa] px-2 py-1 text-[11px] font-semibold text-[var(--cs-faint)] md:block">
                    Ctrl K
                </kbd>
            </div>

            {/* ── What this duration means, if the catalogue already knows ──
                One line, one action, and only when a real threshold has been
                crossed. It states the REASON before the offer ("18 days —"),
                because a suggestion whose grounds are invisible is one a
                doctor has to either trust blindly or ignore. Taking it is a
                normal chip toggle: the observable is already in the
                catalogue, already carries its own rules, and ranks from the
                moment it lands. Nothing is minted here. */}
            {escalation && (
                <div className="mt-1.5 flex items-center gap-2 rounded-[var(--cs-radius)] border border-[#f3d9a7] bg-[linear-gradient(180deg,#fffcf5_0%,#fdf4e3_100%)] px-3 py-[6px]">
                    <span className="text-[12.5px] font-medium leading-tight text-[#7a5a17]">
                        <strong className="font-bold">{formatDuration(escalation.days)}</strong>
                        {" — "}
                        {escalation.complaint.toLowerCase()} of this length is
                        {" "}
                        <strong className="font-bold">{escalation.target.label.toLowerCase()}</strong>.
                    </span>
                    <button
                        type="button"
                        disabled={disabled}
                        onClick={() => onToggle(escalation.target)}
                        className="ml-auto flex-none rounded-md border border-[#e0b95f] bg-white px-2.5 py-[4px] text-[11.5px] font-semibold text-[#8a6410] transition-colors hover:bg-[#fdf4e3]"
                    >
                        Add to chart
                    </button>
                    <button
                        type="button"
                        aria-label="Dismiss this suggestion"
                        onClick={() => setDismissedEscalations((d) => new Set(d).add(escalation.target.slug))}
                        className="grid size-[20px] flex-none place-items-center rounded border-0 bg-transparent p-0 text-[#b08c3e] hover:bg-black/5"
                    >
                        <X size={12} />
                    </button>
                </div>
            )}
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
            className="cx-retire absolute left-0 top-[calc(100%+6px)] z-50 w-[272px] rounded-[10px] border border-[var(--cs-line-strong)] bg-white p-1.5 shadow-[0_12px_28px_rgba(16,28,46,0.16)]"
            role="menu"
            aria-label={`Remove ${label}`}
        >
            <p
                className="px-2 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--cs-faint)] truncate"
                title={`Remove “${label}”`}
            >
                Remove “{label}”
            </p>
            <button
                type="button"
                role="menuitem"
                className="cx-retire-opt block w-full rounded-[7px] px-2 py-[7px] text-left text-[12.5px] font-semibold text-[var(--cs-ink)] hover:bg-[var(--cs-blue-soft)]"
                onClick={() => onPick("today")}
            >
                Not today
                <span className="block text-[11px] font-medium leading-[1.35] text-[var(--cs-faint)]">
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
                <span className="block text-[11px] font-medium leading-[1.35] text-[var(--cs-faint)]">
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
                <span className="block text-[11px] font-medium leading-[1.35] text-[var(--cs-faint)]">
                    Was never true — stops carrying forward
                </span>
            </button>
        </div>
    );
}

/**
 * "Previous MI — since when?" A single free-text field, save or skip. Same
 * popover shell as `RetireMenu` deliberately — one small-popup idiom on this
 * card, not two — but its own component: the question and the one control
 * are nothing like a 3-option menu.
 *
 * Cardiac History enrichment, Project Pulse Point (2026-09-21): "type
 * previous MI, it will ask from when, which will be obviously loosey, it
 * will not force. You can skip from when if you don't know." (Anmol) — the
 * input is plain text (a year is plenty — "2019", not a date picker), Enter
 * or Save records it, Escape/Skip dismisses with nothing written.
 */
function OnsetPrompt({ label, onSave, onDismiss }: {
    label: string;
    onSave: (note: string) => void;
    onDismiss: () => void;
}) {
    const [value, setValue] = useState("");
    const ref = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDismiss(); };
        const onDown = (e: MouseEvent) => {
            if (!ref.current?.contains(e.target as Node)) onDismiss();
        };
        window.addEventListener("keydown", onKey);
        const t = window.setTimeout(() => window.addEventListener("mousedown", onDown), 0);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("mousedown", onDown);
            window.clearTimeout(t);
        };
    }, [onDismiss]);

    const save = () => {
        const trimmed = value.trim();
        if (trimmed) onSave(trimmed);
        else onDismiss();
    };

    return (
        <div
            ref={ref}
            className="cx-retire absolute left-0 top-[calc(100%+6px)] z-50 w-[220px] rounded-[10px] border border-[var(--cs-line-strong)] bg-white p-2 shadow-[0_12px_28px_rgba(16,28,46,0.16)]"
            role="dialog"
            aria-label={`Since when — ${label}`}
        >
            <p className="m-0 px-0.5 pb-1.5 text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--cs-faint)]">
                Since when? <span className="normal-case font-medium">(optional)</span>
            </p>
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") save(); }}
                placeholder="e.g. 2019"
                className="w-full rounded-[7px] border border-[var(--cs-line-strong)] px-2 py-[6px] text-[12.5px] font-medium text-[var(--cs-ink)] outline-none focus:border-[var(--cs-blue)]"
            />
            <div className="mt-1.5 flex justify-end gap-1.5">
                <button
                    type="button"
                    onClick={onDismiss}
                    className="rounded-[6px] px-2 py-[5px] text-[11.5px] font-semibold text-[var(--cs-faint)] hover:bg-black/5"
                >
                    Skip
                </button>
                <button
                    type="button"
                    onClick={save}
                    className="rounded-[6px] bg-[var(--cs-blue)] px-2.5 py-[5px] text-[11.5px] font-semibold text-white hover:opacity-90"
                >
                    Save
                </button>
            </div>
        </div>
    );
}

/**
 * "Where?" for a local finding — swelling, tenderness, a bruise — asked on
 * the chip itself, the same small popover shape as `OnsetPrompt`.
 *
 * The places already established in this visit come first as one-click
 * chips (tick one, or several: swelling of both knees); anything else is
 * typed ("left wr…"), from the same site list the anatomy picker uses, so a
 * finding's "Right knee" and a fracture's "Right knee" are one string.
 * Every tick applies at once; Done only closes. Optional, like every
 * qualifier on a chip: dismissing it leaves the finding bare, as before.
 */
const SITE_POP_W = 264;

function FindingSitePrompt({ label, anchor, sites, known, onChange, onDismiss }: {
    label: string;
    /** the chip's own "where" control — the popover hangs under it */
    anchor: HTMLElement | null;
    sites: SiteRef[];
    known: SiteRef[];
    onChange: (sites: SiteRef[]) => void;
    onDismiss: () => void;
}) {
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const ref = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Portalled and fixed, so no card's overflow can crop it or scroll
    // sideways to make room: under its chip, kept inside the window, and
    // above the chip instead when there is no room below.
    useLayoutEffect(() => {
        if (!anchor) return;
        const place = () => {
            const r = anchor.getBoundingClientRect();
            const h = ref.current?.offsetHeight ?? 220;
            const left = Math.max(8, Math.min(r.left, window.innerWidth - SITE_POP_W - 8));
            const below = r.bottom + 6;
            const top = below + h > window.innerHeight - 8 ? Math.max(8, r.top - 6 - h) : below;
            setPos((p) => (p && p.top === top && p.left === left ? p : { top, left }));
        };
        place();
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        return () => {
            window.removeEventListener("resize", place);
            window.removeEventListener("scroll", place, true);
        };
    });

    useEffect(() => {
        // With places to tick, the chips are the answer and the input waits;
        // with none, typing is the only way, so it takes focus.
        if (!known.length) inputRef.current?.focus();
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDismiss(); };
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            // The chip's own control toggles it; closing here too would
            // reopen it on the same click.
            if (ref.current?.contains(t) || anchor?.contains(t)) return;
            onDismiss();
        };
        window.addEventListener("keydown", onKey);
        const t = window.setTimeout(() => window.addEventListener("mousedown", onDown), 0);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("mousedown", onDown);
            window.clearTimeout(t);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onDismiss, anchor]);

    // This visit's places, then any place this finding already has that is
    // not one of them — so every current place is visible and un-tickable.
    const choices = useMemo(() => {
        const out: SiteRef[] = [];
        for (const s of [...known, ...sites]) if (!out.some((k) => sameSite(k, s))) out.push(s);
        return out;
    }, [known, sites]);

    // Same forgiving search as the command bar's where-slot ("rt kn").
    const options = useMemo(() => searchSites(query, known, [], 6), [query, known]);
    useEffect(() => { setActive(0); }, [query]);

    const isOn = (x: SiteRef) => sites.some((s) => sameSite(s, x));
    const toggle = (x: SiteRef) => onChange(isOn(x) ? sites.filter((s) => !sameSite(s, x)) : [...sites, x]);
    const add = (x: SiteRef) => {
        if (!isOn(x)) onChange([...sites, x]);
        setQuery("");
    };

    return createPortal(
        <div
            ref={ref}
            className="cx-site-pop"
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: SITE_POP_W }}
            role="dialog"
            aria-label={`Where: ${label}`}
        >
            <p className="cx-site-pop-head">
                Where? <span>(optional)</span>
            </p>
            {choices.length > 0 && (
                <div className="cx-site-pop-chips" role="group" aria-label="Places in this visit">
                    {choices.map((k) => (
                        <button
                            key={clinicalSiteLabel(k)}
                            type="button"
                            aria-pressed={isOn(k)}
                            className={`cx-site-pop-chip${isOn(k) ? " is-on" : ""}`}
                            onClick={() => toggle(k)}
                        >
                            {isOn(k) && <Check size={12} aria-hidden="true" />}
                            {clinicalSiteLabel(k)}
                        </button>
                    ))}
                </div>
            )}
            <div className="cs-anat-search">
                <input
                    ref={inputRef}
                    className="cs-anat-input cx-site-pop-input"
                    value={query}
                    placeholder={choices.length ? "Another place, e.g. left wrist" : "Type a place, e.g. right knee"}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            if (options.length) add(options[active].site);
                            else if (!query.trim()) onDismiss();
                            return;
                        }
                        if (!options.length) return;
                        if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, options.length - 1)); }
                        else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
                    }}
                />
                {options.length > 0 && (
                    <div className="cs-anat-results" role="listbox">
                        {options.map((o, i) => (
                            <button
                                key={o.label}
                                type="button"
                                role="option"
                                aria-selected={i === active}
                                className={`cs-anat-result${i === active ? " is-active" : ""}`}
                                onMouseEnter={() => setActive(i)}
                                onClick={() => add(o.site)}
                            >
                                {o.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <div className="cx-site-pop-foot">
                {sites.length > 0 && (
                    <button type="button" className="cx-site-pop-clear" onClick={() => onChange([])}>
                        Clear
                    </button>
                )}
                <button type="button" className="cx-site-pop-done" onClick={onDismiss}>
                    Done
                </button>
            </div>
        </div>,
        document.body,
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
    /**
     * Labels worth asking "since when" — the curated, detail-worthy subset of
     * chronic history (Previous MI, PCI, CABG, pacemaker, ICD — see
     * `conditionDetail.ts`). Absent/empty means the "+ since when" affordance
     * never renders, same optional-prop-off-by-default pattern `onRetireCarried`
     * uses.
     */
    detailWorthyLabels?: Set<string>;
    /** Records the free-text onset answer from `OnsetPrompt`. */
    onSetOnsetNote?: (label: string, note: string) => void;
    /**
     * Open `OnsetPrompt` for this label the instant it renders, no click
     * needed — the command bar sets this the moment a detail-worthy history
     * observable is picked from SEARCH (`GeneralOpdInputs.tsx`'s
     * `handleCommandBarToggle`), so "type Previous MI, get asked since when"
     * happens in one motion instead of a pick now and a second click later.
     * A chip ticked any other way (Related, the browse sheet, CaseSheet's
     * own "+ since" button) is unaffected — this only fires for a fresh
     * search pick. Cleared via `onAutoOpenOnsetHandled` once consumed, so it
     * never reopens on an unrelated re-render.
     */
    autoOpenOnsetLabel?: string | null;
    onAutoOpenOnsetHandled?: () => void;
    /**
     * Sited findings (2026-09-25). The places established in this visit,
     * offered first in a local finding's "Where?" popover, and the way to
     * record its answer. Absent, a local finding renders exactly as before.
     */
    knownSites?: SiteRef[];
    onSetFindingSites?: (label: string, sites: SiteRef[]) => void;
    /** Open "Where?" on this chip as it lands — set when the visit already
     *  has two or more places and the doctor has to say which. */
    autoOpenSiteLabel?: string | null;
    onAutoOpenSiteHandled?: () => void;
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
    /**
     * The story, as it currently stands. Rendered as the sheet's first chip
     * row rather than as its own card — see the row itself for why.
     * Defaults to empty, so every non-physiotherapy profile is untouched.
     */
    storyChips?: StorySearchItem[];
    /** the story itself, for the sentence — see the Story row */
    story?: Story;
    onStoryRemove?: (it: StorySearchItem) => void;
    /** free-text story typed into the bar ("Fell from bike yesterday"), one
     *  sentence each, closing the Story row; see BarProps.onStoryNote */
    storyNotes?: string[];
    onStoryNoteRemove?: (index: number) => void;
    /**
     * Lands focus in the command bar's search input — the empty sheet's own
     * "+" (2026-08-28). `ClinicalCommandBar` and `CaseSheet` are siblings on
     * purpose (neither shared component should need to know the other
     * exists — see `relatedRef`'s doc comment above), so this is a plain
     * callback rather than a shared ref, wired by whichever profile layout
     * renders both (`GeneralOpdInputs.tsx`, `PhysioInputs.tsx`).
     */
    onFocusSearch?: () => void;
}

export function CaseSheet({
    entries, onRemove, onRetireCarried, onToggle, intensities, onIntensityChange,
    related, onBrowse, disabled = false, relatedRef,
    storyChips = [], story: storyOf, onStoryRemove, storyNotes = [], onStoryNoteRemove, onFocusSearch,
    detailWorthyLabels, onSetOnsetNote, autoOpenOnsetLabel, onAutoOpenOnsetHandled,
    knownSites = [], onSetFindingSites, autoOpenSiteLabel, onAutoOpenSiteHandled,
}: SheetProps) {
    /** which carried-forward chip is asking what its removal means */
    const [retiring, setRetiring] = useState<string | null>(null);
    /** which chip's "since when" popover is open */
    const [editingOnset, setEditingOnset] = useState<string | null>(null);
    /** which local finding's "Where?" popover is open */
    const [editingSite, setEditingSite] = useState<string | null>(null);
    const closeSite = useCallback(() => setEditingSite(null), []);
    /** each local finding's "where" control, for its popover to hang under */
    const siteAnchors = useRef(new Map<string, HTMLElement>());
    const siteAnchorRef = (label: string) => (el: HTMLElement | null) => {
        if (el) siteAnchors.current.set(label, el);
        else siteAnchors.current.delete(label);
    };

    useEffect(() => {
        if (!autoOpenSiteLabel) return;
        setEditingSite(autoOpenSiteLabel);
        onAutoOpenSiteHandled?.();
    }, [autoOpenSiteLabel, onAutoOpenSiteHandled]);

    // See `autoOpenOnsetLabel`'s own doc comment — a fresh search pick opens
    // this without waiting for the doctor to find and click "+ since" on the
    // chip that pick just created.
    useEffect(() => {
        if (!autoOpenOnsetLabel) return;
        setEditingOnset(autoOpenOnsetLabel);
        onAutoOpenOnsetHandled?.();
    }, [autoOpenOnsetLabel, onAutoOpenOnsetHandled]);

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

    /**
     * The sentence's subject. The first REPORTED entry — what the patient came
     * in with — so the story reads "Knee pain, for 3 weeks, ..." rather than
     * opening on a duration attached to nothing. Undefined until a complaint
     * lands, and the sentence simply starts at its first clause until then.
     */
    const leadComplaint = entries.find((e) => e.kind === "symptom")?.label;
    const storyClauseList = useMemo(() => (storyOf ? storyClauses(storyOf) : []), [storyOf]);

    /**
     * One transition, reused, so nothing on this card moves at a different
     * rate.
     *
     * This was a SPRING with a scale — chips landed by bouncing up from 0.92
     * and overshooting. Anmol's verdict, and he is right: on a clinical
     * workstation that reads as unserious. A spring is a physical metaphor,
     * and a recorded fact does not have momentum; it is simply now on the
     * chart.
     *
     * What replaces it is a 120ms linear-ish fade with a 2px settle. Fast
     * enough to be felt rather than watched, no overshoot, no scale — the
     * chip appears where it belongs instead of arriving there.
     */
    const pop = reduce
        ? { initial: false as const, animate: {}, exit: {} }
        : {
            initial: { opacity: 0, y: -2 },
            animate: { opacity: 1, y: 0 },
            exit: { opacity: 0, transition: { duration: 0.09 } },
        };
    const popEase = { duration: 0.12, ease: [0.2, 0, 0.2, 1] as const };

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
                    {entries.length + storyChips.length + storyNotes.length > 0 && (
                        <motion.span
                            key={entries.length + storyChips.length + storyNotes.length}
                            initial={reduce ? false : { opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={popEase}
                            className="ml-auto flex-none rounded-[7px] bg-[var(--cs-blue-soft)] px-2 py-[3px] text-[12.5px] font-semibold text-[var(--cs-blue)]"
                        >
                            {entries.length + storyChips.length + storyNotes.length} recorded
                        </motion.span>
                    )}
                </AnimatePresence>
            </div>

            {/* A genuinely EMPTY card: a drawing and one short line, no group
                scaffolding. An earlier pass printed the three labels greyed so
                the card "showed its shape", which only produced three rows of
                grey saying nothing. Nothing has been recorded, so the card
                should look like nothing has been recorded. */}
            {entries.length === 0 && storyChips.length === 0 && storyNotes.length === 0 && (
                <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-4 py-4 text-center">
                    {/* The drawing stays exactly as it was — only a small "+"
                        rides its corner now (2026-08-28), a real affordance
                        rather than just a picture: click it and the command
                        bar's own search field takes focus, the same field
                        the line below already points at. */}
                    <div className="relative inline-flex">
                        <EmptySheetArt />
                        {onFocusSearch && (
                            <button
                                type="button"
                                onClick={onFocusSearch}
                                aria-label="Add a symptom, finding or history"
                                title="Add a symptom, finding or history"
                                className="absolute -bottom-0.5 -right-0.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-white bg-[var(--cs-blue)] text-white shadow-[0_2px_6px_rgba(18,104,232,0.35)] transition-transform hover:scale-110"
                            >
                                <Plus size={13} strokeWidth={2.5} />
                            </button>
                        )}
                    </div>
                    {/* A heading in ink, then the line. The card previously
                        held a single sentence of grey, which is what an
                        unfinished screen looks like — nothing on it was at
                        reading weight, so the eye found no anchor and read the
                        whole panel as absent rather than as empty. */}
                    <strong className="mt-1 text-[14px] font-[660] leading-tight tracking-[-0.005em] text-[var(--cs-ink)]">
                        Nothing recorded yet
                    </strong>
                    <p className="max-w-[32ch] text-[12.5px] font-[460] leading-[1.45] text-[var(--cs-muted)]">
                        Search above for symptoms, findings or history.
                    </p>
                </div>
            )}

            {/* ── The story, as confirmation ────────────────────────────────
                First row, because it is what the patient said and the rest of
                the sheet is what was found. Same table as the groups below it
                — one label column, chips beside — because it IS one of them
                now; it just happens to be stored in `visit_story` rather than
                in the observation set. That storage split is invisible here on
                purpose: the brief's "Story is a behavior, not a separate form"
                only means anything if the two read as one record.

                A chip, not a row per dimension. The dimension is the chip's
                own sub-label, which is where it belongs once its value is
                known — "3 weeks" needs the word "duration" attached to it far
                less than an empty duration field needs a prompt. */}
            {/* ── The story, as ONE sentence ────────────────────────────
                Not a row of tiles. A story is a single clinical statement —
                "knee pain for 3 weeks, gradual onset, worse going upstairs,
                better with rest" — and chipping it into seven separate boxes
                throws away every relationship in it and leaves the reader to
                rebuild the sentence in their head on each read.

                So it renders as running text, led by the complaint itself
                (the first reported entry on the sheet, so the sentence has a
                subject rather than starting mid-clause). Each clause is still
                individually removable — hover reveals its ×, and the clause
                greys under the cursor so it is obvious what is about to go —
                but removal is the secondary act here. Reading is the point. */}
            {storyChips.length + storyNotes.length > 0 && (
                <div className="mt-2 flex items-start gap-2.5 px-4 py-[3px]">
                    <span className="w-[9.5em] flex-none whitespace-nowrap pt-[3px] text-[10.5px] font-bold uppercase leading-tight tracking-[0.085em] text-[var(--cs-label)]">
                        Story
                    </span>
                    {/* `min-w-0` is load-bearing: a flex child defaults to
                        `min-width: auto`, which refuses to shrink below its
                        content, so the sentence pushed straight out of the card
                        instead of wrapping. `break-words` covers the one case
                        min-w-0 cannot — a single clause longer than the column. */}
                    <p className="m-0 min-w-0 flex-1 break-words text-[13.5px] font-medium leading-[1.6] text-[var(--cs-ink)]">
                        {leadComplaint && storyClauseList.length > 0 && (
                            <span className="font-bold">{leadComplaint}</span>
                        )}
                        {storyClauseList.map((c, i) => (
                            <span key={c.item.id} className="group/clause">
                                <span className="text-[var(--cs-faint)]">
                                    {i === 0 && !leadComplaint ? "" : ", "}
                                </span>
                                {c.lead && (
                                    <span className="font-normal text-[var(--cs-muted)]">{c.lead} </span>
                                )}
                                <span className="rounded-[4px] px-[2px] transition-colors group-hover/clause:bg-[var(--cs-rose-soft)] group-hover/clause:text-[var(--cs-rose)]">
                                    {c.text}
                                </span>
                                {/* `hidden` rather than `opacity-0`: an
                                    invisible button still occupies width, and
                                    that phantom column is what put a space
                                    before every comma — "for 2 days , sudden
                                    onset ,". Taken out of layout entirely, the
                                    sentence punctuates like a sentence. */}
                                <button
                                    type="button"
                                    aria-label={`Remove ${c.item.label}`}
                                    disabled={disabled}
                                    onClick={() => onStoryRemove?.(c.item)}
                                    className="ml-[2px] hidden align-middle text-[var(--cs-faint)] hover:text-[var(--cs-rose)] focus-visible:inline group-hover/clause:inline"
                                >
                                    <X size={11} className="inline" />
                                </button>
                            </span>
                        ))}
                        {/* Free text typed into the bar, each its own
                            sentence after the structured clauses, removable
                            the same way. */}
                        {storyClauseList.length > 0 && storyNotes.length > 0 && (
                            <span className="mr-[1px] text-[var(--cs-faint)]">.</span>
                        )}
                        {storyNotes.map((n, i) => (
                            <span key={`note-${i}`} className={"group/clause" + (i > 0 ? " ml-[3px]" : "")}>
                                <span className="rounded-[4px] px-[2px] transition-colors group-hover/clause:bg-[var(--cs-rose-soft)] group-hover/clause:text-[var(--cs-rose)]">
                                    {/[.!?]$/.test(n) ? n : `${n}.`}
                                </span>
                                <button
                                    type="button"
                                    aria-label={`Remove "${n}"`}
                                    disabled={disabled}
                                    onClick={() => onStoryNoteRemove?.(i)}
                                    className="ml-[2px] hidden align-middle text-[var(--cs-faint)] hover:text-[var(--cs-rose)] focus-visible:inline group-hover/clause:inline"
                                >
                                    <X size={11} className="inline" />
                                </button>
                            </span>
                        ))}
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
                                            transition={popEase}
                                            title={
                                                entry.origin === "carried"
                                                    ? "Carried forward from a previous visit. Click × to say whether it still applies."
                                                    : entry.origin === "confirmed"
                                                        ? "Added by confirming a condition in this consultation."
                                                        : entry.origin === "reception"
                                                            ? "Recorded at the front desk. Edit or remove it like any other chip."
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
                                            {entry.origin === "reception" && (
                                                <span
                                                    aria-hidden="true"
                                                    className={`size-[5px] flex-none rounded-full ${TONE_RECEPTION[entry.kind]}`}
                                                />
                                            )}
                                            {entry.label}
                                            {entry.durationDays != null && (
                                                /* The number, on the chip that owns it. A duration is a
                                                   qualifier OF this complaint, so it rides the chip rather
                                                   than becoming a row of its own — the same reasoning
                                                   `story.ts` applies to its clauses. */
                                                <span
                                                    title={`Present for ${formatDuration(entry.durationDays)}`}
                                                    className="rounded-[5px] bg-black/[0.07] px-[4px] py-[1px] text-[10.5px] font-bold tabular-nums leading-none opacity-80"
                                                >
                                                    {shortDuration(entry.durationDays)}
                                                </span>
                                            )}
                                            {entry.onsetNote && (
                                                <span
                                                    title={`Since ${entry.onsetNote}`}
                                                    className="rounded-[5px] bg-black/[0.07] px-[4px] py-[1px] text-[10.5px] font-bold leading-none opacity-80"
                                                >
                                                    · {entry.onsetNote}
                                                </span>
                                            )}
                                            {!entry.onsetNote && detailWorthyLabels?.has(entry.label) && onSetOnsetNote && (
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingOnset((c) => (c === entry.label ? null : entry.label))}
                                                    title="Add when this happened"
                                                    aria-haspopup="dialog"
                                                    aria-expanded={editingOnset === entry.label}
                                                    className="rounded-[5px] border border-dashed border-current px-[4px] py-[1px] text-[10.5px] font-bold leading-none opacity-55 hover:opacity-90"
                                                >
                                                    + since
                                                </button>
                                            )}
                                            {entry.localizable && onSetFindingSites && (entry.sites?.length ? (
                                                /* Where it was found, on the chip that owns it — a
                                                   qualifier like the duration, and like it, changed
                                                   by clicking it. */
                                                <button
                                                    ref={siteAnchorRef(entry.label)}
                                                    type="button"
                                                    onClick={() => setEditingSite((c) => (c === entry.label ? null : entry.label))}
                                                    title={`Found at: ${entry.sites.map(clinicalSiteLabel).join(", ")}. Click to change.`}
                                                    aria-haspopup="dialog"
                                                    aria-expanded={editingSite === entry.label}
                                                    className="rounded-[5px] border-0 bg-black/[0.07] px-[5px] py-[2px] text-[11px] font-bold leading-none text-current opacity-85 hover:bg-black/[0.12] hover:opacity-100"
                                                >
                                                    {clinicalSiteLabel(entry.sites[0])}
                                                    {entry.sites.length > 1 && ` +${entry.sites.length - 1}`}
                                                </button>
                                            ) : (
                                                <button
                                                    ref={siteAnchorRef(entry.label)}
                                                    type="button"
                                                    onClick={() => setEditingSite((c) => (c === entry.label ? null : entry.label))}
                                                    title="Add where this was found"
                                                    aria-haspopup="dialog"
                                                    aria-expanded={editingSite === entry.label}
                                                    className="rounded-[5px] border border-dashed border-current bg-transparent px-[4px] py-[1px] text-[10.5px] font-bold leading-none text-current opacity-55 hover:opacity-90"
                                                >
                                                    + where
                                                </button>
                                            ))}
                                            {editingSite === entry.label && onSetFindingSites && (
                                                <FindingSitePrompt
                                                    label={entry.label}
                                                    anchor={siteAnchors.current.get(entry.label) ?? null}
                                                    sites={entry.sites ?? []}
                                                    known={knownSites}
                                                    onChange={(next) => onSetFindingSites(entry.label, next)}
                                                    onDismiss={closeSite}
                                                />
                                            )}
                                            {editingOnset === entry.label && onSetOnsetNote && (
                                                <OnsetPrompt
                                                    label={entry.label}
                                                    onDismiss={() => setEditingOnset(null)}
                                                    onSave={(note) => {
                                                        setEditingOnset(null);
                                                        onSetOnsetNote(entry.label, note);
                                                    }}
                                                />
                                            )}
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
                                        initial={reduce ? false : { opacity: 0, y: -3 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, transition: { duration: 0.09 } }}
                                        transition={{
                                            ...popEase,
                                            // The cascade. Capped so a full row never
                                            // takes longer than a glance. Shorter steps
                                            // than before, because a fade reads as one
                                            // group arriving where a bounce read as
                                            // several things landing separately.
                                            delay: reduce ? 0 : Math.min(i * 0.025, 0.14),
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
