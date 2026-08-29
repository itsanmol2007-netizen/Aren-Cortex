// ---------------------------------------------------------------------------
// PRACTICE — "this is where I tune Cortex to the way I practice."
//
// Rebuilt 2026-08-26 as a real configuration workspace, then again the same
// day into the composition-tree/Add-New-Medicine/Clinical-Companions shape
// this comment now describes — every card on this page is a genuine
// add/edit/remove/configure surface, backed by a real table, never an
// informational summary and never a dead-end "not built yet."
//
// ── Clinical defaults, two rows of three ────────────────────────────────
//  Row 1 — Preferred Medicines, Preferred Labs, Prescription Templates:
//    concrete practice preferences that directly influence a consultation.
//  Row 2 — Add New Medicine, Clinical Companions, Consultation Defaults:
//    the surfaces that extend or configure those preferences.
//  PRACTICE VOCABULARY — Your Clinical Terms: this doctor's own words,
//    remembered so Cortex can offer them back.
//
// ── What's real, checked against the live schema, not assumed ─────────────
//  * Preferred Medicines   — `clinic_brand_preference` (hospital_id,
//    composition_id, medicine_id) — a REFRAMING of what was "Clinic Default
//    Brands", not a new table. The primary key was already the full
//    3-column tuple, so several preferred BRANDS per composition were
//    always representable; only the UI (a composition tree, not a flat
//    list) and Consult's rendering (RecommendationsCard shows every
//    preferred brand always-visible, not just one "default") changed.
//    `doctor_pinned_intent` (the personal ranked-list shortcut, a DIFFERENT
//    concept) has no card here any more — it stays a Consult-only heart
//    toggle (`PinButton` in RecommendationsCard), never a Practice surface.
//  * Preferred Labs        — `doctor_preferred_labs` + `diagnostic_orders.lab_name`,
//    the foundation for Consult's own "order from" prompt (PlanCard) — see
//    the `add_doctor_preferred_labs` migration's header for the "Lab Node"
//    framing this is a foundation for, not the whole of.
//  * Prescription Templates — `prescription_templates` / `_items`; applying
//    one in Consult (CaseSheet's search) still runs every item through the
//    normal guarded accept path — see useConsultPlan's `handleApplyTemplate`.
//  * Add New Medicine      — `addMedicine` RPC (already built for Consult's
//    `AddMedicineSheet`, reused here): composition-anchored, never mints a
//    new composition (standing rule 22), optionally marks the result
//    preferred via `setClinicBrandDefault` on success.
//  * Clinical Companions   — `hospital_companion_preference`, the
//    practice-specific layer OVER Synapse's already-authored
//    `intent_companions` edges (never a parallel pipeline): curate an
//    existing edge off, or author a new hospital-scoped one between two
//    EXISTING intents. See `lib/synapse/companions.ts`'s
//    `applyHospitalCompanionPrefs` for how this reaches Consult, and its
//    safety rule (a warn/warn_hard suggestion is never suppressible here).
//  * Your Clinical Terms   — `doctor_free_terms`, the same free-text fallback
//    Assessment/Clinical Suggestions remember mid-consult.
//  * Consultation Defaults — chart: `hospitals.specialty_profile` (read-only
//    here, SettingsPage owns the write); measurements:
//    `doctors.preferred_measure_keys`, read AND written here, and the SAME
//    column `App.tsx` reads to build `defaultMeasureKeys` for Consult's own
//    MeasurementsCard — a real default, not a preference that only Practice
//    itself ever looks at.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
    ArrowDown, ArrowUp, BookText, Check, ChevronDown, ChevronRight, Clock, FlaskConical, Heart, Layers,
    MessageCircle, MoreHorizontal, Pill, Plus, Printer, Settings, Shield, SlidersHorizontal, Sparkles, Star,
    ToggleLeft, ToggleRight, User, X,
} from "lucide-react";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { useClinicalIdentity } from "../../hooks/useClinicalIdentity";
import {
    addMedicine, addPreferredLab, clearClinicBrandDefault, clearHospitalCompanionCuration,
    createHospitalCompanionEdge, createPrescriptionTemplate, deleteDoctorFreeTerm,
    deleteHospitalCompanionEdge, deletePrescriptionTemplate, duplicatePrescriptionTemplate,
    fetchAuthoredCompanionCatalogue, fetchBrandsForComposition, fetchClinicBrandDefaultDetails,
    fetchDoctorFreeTermDetails, fetchHospitalAddedMedicines, fetchHospitalCompanionDetails,
    fetchPrescriptionTemplateDetail,
    loadPreferredLabs, loadPrescriptionTemplateSummaries, removePreferredLab,
    replacePrescriptionTemplateItems, reorderPreferredLabs, saveDoctorFreeTerm,
    setClinicBrandDefault, setDefaultPreferredLab, setDoctorMeasurePrefs,
    setHospitalCompanionCuration, updatePrescriptionTemplateMeta,
    type AuthoredCompanionEdgeDetail, type ClinicBrandDefaultDetail, type DoctorFreeTermDetail,
    type DoctorFreeTermType, type HospitalAddedMedicine, type HospitalCompanionDetail,
    type PreferredLab, type PrescriptionTemplateSummary, type PrescriptionTemplateItemInput,
    type Observable,
} from "../../lib/db/synapse";
import type { IntentSearchHit } from "../../lib/db/synapse";
import type { IntentType } from "../../lib/synapse/engine";
import { MEASURE_FIELDS, type MeasureFieldKey } from "../consult/measures";
import { useCatalogueSearch, KIND_BADGE } from "../consult/CaseSheet";
import {
    BlankAddMedicineArt, BlankCompanionArt, BlankConsultDefaultsArt, BlankLabArt, BlankMedicineArt,
    BlankTemplateArt, BlankTermArt,
} from "../consult/BlankArt";
import { resolveProductByName } from "../../lib/db/medicines";
import { IntentSearchField, useIntentSearch } from "../consult/IntentSearch";
import { PracticeModal } from "./PracticeModal";
import { useRovingList } from "../../hooks/useRovingList";
import { firedChord, matches } from "../../lib/keyboard/keymap";
import type { SpecialtyProfile } from "../synapse/specialtyProfile";
import type { SidebarPage } from "../sidebar/SidebarNav";
import "./practice.css";

interface Props {
    logoRef: RefObject<HTMLDivElement>;
    onOpenSidebar: () => void;
    /** Resolved once in App.tsx from `hospitals.specialty_profile` — the
     *  Consultation Defaults card reads it, never re-derives it. */
    specialty: SpecialtyProfile;
    /** Same navigate function the sidebar itself uses (saves an in-progress
     *  consult as a draft, closes overlays) — every "Related settings" link
     *  and Consultation Defaults' "change specialty" link is a real
     *  navigation, not a second nav concept. */
    onNavigate: (page: SidebarPage) => void;
    /** Owned by App.tsx (Consult's plan rail reads the same list for its
     *  "order from" prompt) — Practice's CRUD writes back through this so a
     *  lab added here is reachable from Consult without a reload. */
    preferredLabs: PreferredLab[];
    onPreferredLabsChange: (labs: PreferredLab[]) => void;
    /** Owned by App.tsx (it derives Consult's actual `defaultMeasureKeys`
     *  from this) — null means "use the specialty baseline". */
    measurePrefs: string[] | null;
    onMeasurePrefsChange: (keys: string[] | null) => void;
    /** Owned by App.tsx (CaseSheet's search matches trigger words against
     *  this same list) — see `loadPrescriptionTemplateSummaries`. */
    templates: PrescriptionTemplateSummary[];
    onTemplatesChange: (templates: PrescriptionTemplateSummary[]) => void;
    /** The same catalogue App.tsx already loads (`synapse.data.observables`)
     *  — the template builder's "add a symptom/finding/history item" search
     *  runs client-side over this, exactly like the case sheet's own bar. */
    observables: Observable[];
}

// ── The row-list primitive every real card below shares ────────────────────
// One measured row height per list (never guessed — see progressive-
// disclosure.md), a `cap`, and the SAME capped/expand mechanism Consult's
// ranked panels use: collapsed shows `cap` rows with no scrollbar, "Show
// all" unlocks a bounded, scrolling box. Rows here are single-line and
// truncate rather than wrap, so one constant per list is exact, not a
// worst-case guess.
const ROW_H = 34;
/** Any two-line row (Prescription Templates' name + trigger, Clinical
 *  Companions' pairing + source) — a single shared row height would either
 *  clip the second line or under-cap every OTHER list to match it. Measured
 *  against the actual rendered row (icon tile + two text lines + padding). */
const MED_ROW_H = 54;

function CappedRows<T>({
    items, cap, rowH = ROW_H, rowClassName, renderRow, keyOf, showAllLabel, hideTrigger,
}: {
    items: T[];
    cap: number;
    rowH?: number;
    rowClassName?: string;
    renderRow: (item: T) => ReactNode;
    keyOf: (item: T) => string | number;
    /** The FULL collapsed-state label ("View all templates"), not a prefix
     *  the count gets appended to — every card phrases this in its own
     *  words now, rather than sharing one generic "Show all N". */
    showAllLabel: string;
    /** Suppresses the built-in expand trigger — set when the card already
     *  carries its own persistent "Manage/View all →" link (`FootLink`)
     *  that opens a full management modal instead of expanding this list
     *  in place; showing both would be two controls doing the same job. */
    hideTrigger?: boolean;
}) {
    const [showAll, setShowAll] = useState(false);
    const reduce = useReducedMotion();
    const overflowing = items.length > cap;
    // Collapsed is measured exactly (`cap * rowH`). Expanded USED to tween
    // to an arbitrarily large flat number (9999) on the reasoning that the
    // CARD's own fixed height would bound it visually either way — true for
    // the FINAL rendered frame, but not for how the spring gets there: a
    // spring easing toward 9999 covers a real collapsed→expanded distance
    // of maybe 50-150px in well under a tenth of its nominal travel, so it
    // "arrives" (visually) almost the instant it starts, reading as a snap
    // rather than an animation ("the animation of... show more and then
    // nested scroll bar appearing... should feel smooth, not direct",
    // 2026-08-29). A REAL, bounded target fixes this the same way it fixed
    // the composition tree's own open/close spring (see that `motion.div`'s
    // comment in this file): `EXPANDED_ROW_WINDOW` rows' worth of real
    // height, same "peek window, then scroll" shape
    // `progressive-disclosure.md` already documents for a capped list
    // ("expanding into a bounded, scrolling box... stopping mid-row on
    // purpose so it visibly reads as a scroll box") — this just makes
    // `CappedRows` actually follow its own doctrine instead of a flat
    // constant that happened to look identical at rest.
    const EXPANDED_ROW_WINDOW = 8;
    const expandedHeight = Math.min(items.length, EXPANDED_ROW_WINDOW) * rowH;

    return (
        <>
            <motion.div
                initial={false}
                animate={{ maxHeight: overflowing && showAll ? expandedHeight : cap * rowH }}
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 32 }}
                className={"prac-rows" + (overflowing && showAll ? " is-expanded" : "")}
            >
                {items.map((item) => (
                    <div key={keyOf(item)} className={"prac-row" + (rowClassName ? ` ${rowClassName}` : "")}>
                        {renderRow(item)}
                    </div>
                ))}
            </motion.div>
            {overflowing && !hideTrigger && (
                <button
                    type="button"
                    className="prac-foot-more"
                    onClick={() => setShowAll((v) => !v)}
                >
                    {showAll ? "Show less" : showAllLabel}
                    <ChevronDown size={12} className={showAll ? "is-flipped" : undefined} />
                </button>
            )}
        </>
    );
}

function RemoveBtn({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button type="button" className="prac-row-remove" aria-label={label} title={label} onClick={onClick}>
            <X size={12} />
        </button>
    );
}

/** A pinned-state heart with no click of its own — `PinButton` verbatim in
 *  everything but interactivity. Every row that used it here (`.prac-hit-
 *  row`, `.prac-modal-row.is-pick`) is ALREADY a `<button>` whose own
 *  onClick does the exact same thing `PinButton`'s `onToggle` did, so
 *  nesting a second, real `<button>` inside it was never adding a
 *  reachable action — only an invalid `<button>`-in-`<button>` DOM
 *  (React: "cannot be a descendant of a button... hydration error"),
 *  caught live once the catalogue got deep enough to render one. The
 *  heart still shows the same two states (`is-on` filled rose vs. plain
 *  grey outline) purely as information now, same as the tree's own static
 *  heart already does for rows that are unambiguously preferred. */
function StaticPin({ pinned, label }: { pinned: boolean; label: string }) {
    return (
        <span
            className={`prac-static-pin${pinned ? " is-on" : ""}`}
            aria-hidden="true"
            title={pinned ? `${label} is already preferred` : undefined}
        >
            <Heart size={15} fill={pinned ? "currentColor" : "none"} />
        </span>
    );
}

function SkelRows({ count }: { count: number }) {
    return (
        <div className="prac-skel-rows">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="prac-skeleton" style={{ height: 22 }} />
            ))}
        </div>
    );
}

function EmptyBlock({ art, fact, next, action }: { art: ReactNode; fact: string; next: string; action?: ReactNode }) {
    return (
        <div className="prac-empty">
            {art}
            <strong>{fact}</strong>
            <span>{next}</span>
            {action}
        </div>
    );
}

/** The page's own section heading gets a little presence beside it — never
 *  a mascot, never a chart. Three quiet sparks on a dashed thread, the SAME
 *  spark glyph BlankArt.tsx already draws in every card's own empty state
 *  (a diamond, one line weight), just arranged once here rather than
 *  invented as a new motif. Sits behind/beside the title, low-opacity, so
 *  it reads as texture the section head carries, not a fourth thing
 *  competing with "Clinical Defaults" for attention. */
function GroupHeadMark() {
    return (
        <svg width="108" height="28" viewBox="0 0 108 28" fill="none" aria-hidden="true" className="prac-group-mark">
            <path d="M2 14h30M78 14h28" stroke="var(--cs-line-strong)" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="1 5" />
            <path d="M46 4l1.6 3.8 3.8 1.6-3.8 1.6L46 15l-1.6-3.8L40.6 9.4l3.8-1.6z" fill="var(--cs-blue-soft)" stroke="var(--cs-blue)" strokeWidth="1.1" />
            <path d="M60 16l1.1 2.6 2.6 1.1-2.6 1.1L60 23.4l-1.1-2.6-2.6-1.1 2.6-1.1z" fill="var(--cs-violet-soft)" stroke="var(--cs-violet)" strokeWidth="1" />
            <path d="M68 6l.8 1.9 1.9.8-1.9.8L68 11.4l-.8-1.9-1.9-.8 1.9-.8z" fill="var(--cs-teal-soft)" stroke="var(--cs-teal)" strokeWidth="0.9" />
        </svg>
    );
}

// A 4-pointed sparkle/star — the SAME shape `GroupHeadMark`'s three spark
// diamonds above already draw by hand, just computed so `PracticeCanvasArt`
// below can place a dozen of them without hand-typing each one's path.
function sparklePath(cx: number, cy: number, r: number): string {
    const inner = r * 0.34;
    const pts: [number, number][] = [
        [cx, cy - r], [cx + inner, cy - inner], [cx + r, cy], [cx + inner, cy + inner],
        [cx, cy + r], [cx - inner, cy + inner], [cx - r, cy], [cx - inner, cy - inner],
    ];
    return `M${pts.map((p) => p.join(" ")).join("L")}Z`;
}

/**
 * The page's own background texture (2026-08-29, replacing an earlier
 * attempt that blew the login screen's `ArenMark` letterform up to 520px
 * and cropped it at the corner — "the SVG is trash... on the corner it
 * could act as a slight decorative element, a node diagram or astronomy
 * and healthcare blend of neurons and stars"). A geometric letterform
 * doesn't survive being scaled 9× and cropped: its straight strokes read as
 * arbitrary diagonal lines once the "A" it spells is no longer legible at
 * that scale. This is built for the crop instead of despite it — a loose
 * scatter of nodes (the "neurons" half) with a few starred ones (the
 * "astronomy" half), thinned by hand-picked opacity so it fades outward
 * from the corner it's anchored to rather than reading as one hard-edged
 * shape. No letterform, no single "correct" viewing angle — a scatter
 * still reads as a scatter no matter where the crop falls.
 */
function PracticeCanvasArt({ accent = "#7c3aed" }: { accent?: string }) {
    // Hand-placed, weighted toward the top-right (the corner this bleeds
    // off of via `.prac-bg-mark`'s CSS position) and thinning toward the
    // bottom-left so the density itself reads as "anchored to a corner",
    // the same reasoning as the AREN mark's own "quiet satellite" node.
    const nodes: { x: number; y: number; r: number; star?: boolean }[] = [
        { x: 356, y: 26, r: 3.2, star: true },
        { x: 318, y: 12, r: 1.6 },
        { x: 384, y: 58, r: 2 },
        { x: 296, y: 52, r: 1.4 },
        { x: 340, y: 82, r: 1.7 },
        { x: 262, y: 20, r: 1.2 },
        { x: 372, y: 116, r: 2.6, star: true },
        { x: 244, y: 62, r: 1.4 },
        { x: 306, y: 122, r: 1.2 },
        { x: 216, y: 30, r: 1 },
        { x: 348, y: 156, r: 1.6 },
        { x: 200, y: 86, r: 1.2 },
        { x: 274, y: 168, r: 1.9, star: true },
        { x: 160, y: 50, r: 0.9 },
        { x: 240, y: 132, r: 0.9 },
        { x: 146, y: 106, r: 0.8 },
        { x: 194, y: 158, r: 1 },
        { x: 120, y: 74, r: 0.7 },
    ];
    const edges: [number, number, number][] = [
        [0, 1, 0.42], [0, 2, 0.42], [0, 3, 0.32], [1, 5, 0.28],
        [3, 4, 0.32], [3, 7, 0.24], [4, 6, 0.32], [4, 8, 0.28],
        [2, 6, 0.32], [5, 9, 0.24], [7, 11, 0.24], [7, 13, 0.2],
        [8, 10, 0.28], [8, 12, 0.24], [11, 14, 0.2], [11, 15, 0.16],
        [12, 16, 0.2], [13, 17, 0.16], [14, 16, 0.16], [15, 17, 0.16],
    ];
    return (
        <svg width="400" height="200" viewBox="0 0 400 200" fill="none" aria-hidden="true" className="prac-bg-mark">
            {edges.map(([a, b, o], i) => (
                <line
                    key={i} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y}
                    stroke={accent} strokeWidth="1" opacity={o}
                />
            ))}
            {nodes.map((n, i) => (
                n.star
                    ? <path key={i} d={sparklePath(n.x, n.y, n.r * 2.3)} fill={accent} opacity={0.65} />
                    : <circle key={i} cx={n.x} cy={n.y} r={n.r} fill={accent} opacity={0.55} />
            ))}
        </svg>
    );
}

// ── The card primitive — every card on the page shares this head/body
//    recipe so it reads as one system, not several. `action` is the
//    optional "Manage" / "+ New" trigger that opens a modal. ─────────────
function PracticeCard({
    id, icon, tone, title, subtitle, count, countTone, quiet, fixed, action, foot, children,
}: {
    /** `prac-card-${id}` on the section — the header stat pills' scroll
     *  target (`scrollToCard`). Only the four cards a pill points at need
     *  one. */
    id?: string;
    icon: ReactNode;
    tone: "blue" | "teal" | "violet" | "slate";
    title: string;
    /** The one line under the title every card in the reference layout
     *  carries — what this card IS, not restated content ("Medicines your
     *  practice prefers to use, grouped by composition."). */
    subtitle?: string;
    count?: number;
    /** Overrides the count badge's colour away from this card's own `tone`
     *  — Preferred Medicines' count reads GREEN (colour.md: "taken/added to
     *  the plan"), because every unit in it is a medicine the practice has
     *  actively marked preferred, not merely a teal-tinted echo of the
     *  card's icon. Every other count still follows its card's tone. */
    countTone?: "blue" | "teal" | "violet" | "slate" | "green";
    quiet?: boolean;
    /** Gives this card the shared, derived fixed footprint — every
     *  "primary" card in Clinical Defaults except the content-driven
     *  quiet ones (Consultation Defaults). See `.prac-card.is-fixed`. */
    fixed?: boolean;
    action?: ReactNode;
    /** The persistent "Manage X →" / "View all X →" link every populated
     *  card in the reference carries at its foot — a real navigation (opens
     *  that card's own modal, or focuses its search) never a decoration.
     *  Sits below `children`, tone-coloured to match the card. */
    foot?: ReactNode;
    children: ReactNode;
}) {
    return (
        <section
            id={id ? `prac-card-${id}` : undefined}
            className={"prac-card" + ` prac-card--${tone}` + (quiet ? " is-quiet" : "") + (fixed ? " is-fixed" : "")}
            aria-label={title}
        >
            <div className="prac-card-head">
                <span className={`prac-glyph is-${tone}`}>{icon}</span>
                <h2 className="prac-card-title">{title}</h2>
                {(count != null || action) && (
                    <div className="prac-card-head-end">
                        {count != null && count > 0 && (
                            <span className={`prac-count is-${countTone ?? tone}`}>{count}</span>
                        )}
                        {action}
                    </div>
                )}
            </div>
            {subtitle && <p className="prac-card-sub">{subtitle}</p>}
            <div className="prac-card-body">{children}</div>
            {foot && <div className="prac-card-foot">{foot}</div>}
        </section>
    );
}

/** The "Manage all X →" / "View all X →" link — one shape, tone-coloured by
 *  its enclosing `.prac-card--{tone}`, used at the foot of every populated
 *  primary card instead of a second, differently-styled affordance per
 *  card ("this symmetry doesn't match" was the exact complaint the LAST
 *  time two cards in the same row grew two different footer treatments). */
function FootLink({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button type="button" className="prac-foot-link" onClick={onClick}>
            {label} <ChevronRight size={12} />
        </button>
    );
}

const TERM_TYPE_LABEL: Record<DoctorFreeTermType, string> = {
    finding: "Condition", test: "Investigation", referral: "Referral", advice: "Advice",
};

/** Covers every type a template item, the term-add form, or a companion
 *  pairing can carry — the last of which (Clinical Companions' "author a
 *  new pairing" search) is genuinely unrestricted, unlike the four-type
 *  searches elsewhere on this page. */
function intentTypeLabel(type: IntentType): string {
    switch (type) {
        case "medicine": return "Medicine";
        case "test": return "Investigation";
        case "referral": return "Referral";
        case "advice": return "Advice";
        case "finding": return "Condition";
        case "exercise": return "Exercise";
        case "modality": return "Modality";
        case "impairment": return "Impairment";
        default: return type;
    }
}

/** Every intent type — Clinical Companions' "author a new pairing" search
 *  is the one place on this page that is genuinely unrestricted (a
 *  companion can point at any kind of output), unlike the scoped searches
 *  elsewhere (rule 7: one manual search, given a `types` array per use). */
const ALL_INTENT_TYPES: IntentType[] = [
    "medicine", "test", "exercise", "modality", "referral", "finding", "advice", "impairment",
];

/** How many companion rows fit the list window before it scrolls — must
 *  match `.prac-modal-rows.is-companion-list`'s max-height divided by the
 *  46px row (232 / 46 ≈ 5). Declared once so the "5 of 26" count cannot
 *  drift from what is actually visible. */
const COMPANION_VISIBLE = 5;

const TERM_CHIP_CAP = 16;

// ===========================================================================
// PREFERRED MEDICINES — a composition-grouped tree, not a flat list.
//
// `clinic_brand_preference`'s primary key is already the full 3-column
// tuple (hospital_id, composition_id, medicine_id) — it already supports
// several preferred BRANDS per composition, it was just being rendered
// (and until this session, framed) as "one clinic default". This is the
// same table, same functions, reframed: composition is the parent, every
// preferred concrete medicine under it is an independently visible,
// independently removable child.
// ===========================================================================

interface CompositionGroup {
    /** A single composition's real id for a plain group; a synthesized
     *  string (never collides with a numeric id) for a combination group —
     *  see `isCombo`. Only used as this group's React key / expand-id. */
    compositionId: number | string;
    compositionName: string;
    /** True when every brand in this group carries 2+ active ingredients.
     *  A combination brand is never merged into a single-ingredient
     *  group of the same name — "paracetamol + aceclofenac" is not the
     *  same clinical thing as "paracetamol" alone, even though one of its
     *  two `clinic_brand_preference` candidate keys happens to be plain
     *  paracetamol. See `allCompositionNames`'s doc comment in
     *  `lib/db/synapse.ts`. */
    isCombo: boolean;
    rows: ClinicBrandDefaultDetail[];
}

/** Groups already arrive ordered by `updated_at desc` (the fetch's own
 *  order) — a plain single pass preserves that as "most recently touched
 *  composition first", both across groups and within one.
 *
 * The group KEY is the medicine's full, sorted ingredient list when it has
 * more than one (`"aceclofenac + paracetamol"`), never the single
 * `compositionId` the preference row happens to be written against — that
 * id only ever names ONE of a combination brand's ingredients (whichever
 * one the doctor searched through), and grouping by it was silently filing
 * combination brands into a plain single-salt group ("A Clo SP Tablet"
 * reading as just another paracetamol product). Single-ingredient brands
 * still group by the real `compositionId`, unchanged. */
function groupByComposition(rows: ClinicBrandDefaultDetail[]): CompositionGroup[] {
    const byKey = new Map<string, CompositionGroup>();
    for (const r of rows) {
        const names = r.allCompositionNames.length > 0 ? r.allCompositionNames : [r.compositionName];
        const isCombo = names.length > 1;
        const key = isCombo ? `combo:${names.join("+")}` : `single:${r.compositionId}`;
        const g = byKey.get(key);
        if (g) g.rows.push(r);
        else byKey.set(key, {
            compositionId: isCombo ? key : r.compositionId,
            compositionName: isCombo ? names.join(" + ") : r.compositionName,
            isCombo,
            rows: [r],
        });
    }
    return [...byKey.values()];
}

/** One tree row's height, collapsed or a child — same measured 34px as
 *  every other single-line row on this page (`ROW_H`). */
const TREE_ROW_H = ROW_H;

/** How many concrete medicines an OPEN composition group shows before
 *  "Show more" — a group used to reveal every row it had at once, the tree
 *  just growing (and, past the card's fixed height, quietly scrolling with
 *  no signal that there was more): "There is no Show more button (if the
 *  list exceeds the box height), it directly go for scrolling" (2026-08-29).
 *  Same 4-row number Preferred Labs' cap was bumped to the same round, for
 *  one consistent "how much before you have to ask for more" across the
 *  page rather than each list picking its own. */
const GROUP_ROW_CAP = 4;

/** `.prac-tree-more`'s own rendered height (`.prac-foot-more`: 3px
 *  margin-top + ~2px vertical padding either side + an 11px line at
 *  ~1.3 line-height), measured live rather than guessed — see the note
 *  by its `animate` target below for why a precise number matters here
 *  and didn't for `CappedRows`' own "arbitrarily large" trick. */
const SHOW_MORE_H = 21;

function PreferredMedicinesCard({
    hospitalId, brands, brandsLoading, onBrandsChange, onOpenAddNew, anyModalOpen,
}: {
    hospitalId: string;
    brands: ClinicBrandDefaultDetail[];
    brandsLoading: boolean;
    onBrandsChange: (next: ClinicBrandDefaultDetail[]) => void;
    /** Opens the Add New Medicine modal with this query pre-filled — the
     *  "not found here either? add it" tail of the search. */
    onOpenAddNew: (initialName: string) => void;
    /** True while any of Practice's OWN modals (Add New Medicine, Labs,
     *  Companions, …) is open — gates `practiceFocusSearch` the same way
     *  `useConsultKeyboard`'s `isAnyModalOpen` gates `focusChart`: an overlay
     *  owns the keyboard for as long as it is up, so Ctrl+K must not steal
     *  focus out of a modal's own field mid-type. */
    anyModalOpen: boolean;
}) {
    const search = useIntentSearch(["medicine"]);
    // Search resolves to a COMPOSITION (an intent's `refId`), never a
    // concrete medicine id — the same reason `ClinicBrandModal` used to
    // need a second step. Drilling in is that same second step, inline.
    const [drill, setDrill] = useState<{ id: number; name: string } | null>(null);
    const [drillBrands, setDrillBrands] = useState<{ medicineId: number; name: string }[]>([]);
    const [drillLoading, setDrillLoading] = useState(false);
    // Single-expand accordion — req. "focus the expanded composition":
    // opening one composition closes any other, so the bounded scroll area
    // stays predictable rather than growing with every group opened.
    const [expandedId, setExpandedId] = useState<number | string | null>(null);
    // A single flag, not a Set keyed by group — only one group is ever open
    // at a time (the accordion above), so only one group's "Show more" can
    // ever be relevant. Resets on every group switch so opening a
    // DIFFERENT composition always starts capped again, never inheriting
    // the last group's "show all" state.
    const [childrenExpanded, setChildrenExpanded] = useState(false);
    useEffect(() => { setChildrenExpanded(false); }, [expandedId]);
    const searchInputRef = useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement>;
    const reduce = useReducedMotion();
    const headerRefs = useRef(new Map<number | string, HTMLButtonElement>());

    // ── Keyboard — same settings as the consult workspace ──────────────────
    // Ctrl+K / "/" jumps here from anywhere on the page, mirroring
    // `focusChart`; ↑ ↓ + Enter walk the search results exactly like
    // `ConditionsCard`'s `conditionMove`/`conditionTake` does over its own
    // list — same `useRovingList` mechanism, same reason (a re-ranking DOM
    // list, cursor read back rather than kept in React state). This effect
    // is scoped to Practice for free: it only exists in the DOM while this
    // card is mounted, unlike `useConsultKeyboard`'s window-level listener
    // which runs unconditionally regardless of which page is showing.
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (anyModalOpen) return;
            if (matches(e, "practiceFocusSearch")) {
                e.preventDefault();
                e.stopPropagation();
                searchInputRef.current?.focus();
            }
        };
        window.addEventListener("keydown", handler, true);
        return () => window.removeEventListener("keydown", handler, true);
    }, [anyModalOpen]);

    const resultsRef = useRef<HTMLDivElement>(null);
    // One cursor over BOTH the flat hit list and the composition drill-down
    // — a doctor mid-search doesn't think of those as two different lists,
    // and only one of the two branches is ever mounted under `resultsRef`
    // at a time (see `search.isSearching`'s render below), same as
    // `ConditionsCard`'s ranked-list/search-hit split.
    const roving = useRovingList({
        containerRef: resultsRef,
        rowSelector: ".prac-hit-row, .prac-modal-row.is-pick",
        actionSelector: ".prac-hit-row, .prac-modal-row.is-pick",
        enabled: search.isSearching,
    });
    const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const move = firedChord(e, "practiceMove");
        if (move) {
            e.preventDefault();
            e.stopPropagation();
            roving.move(move.key === "ArrowUp" ? -1 : 1);
            return;
        }
        if (matches(e, "practiceTake")) {
            e.preventDefault();
            e.stopPropagation();
            roving.activate();
        }
    };

    const groups = useMemo(() => groupByComposition(brands), [brands]);

    /** The first group opens on its own. A card whose entire body is one
     *  collapsed row reads as empty (rendered and checked 2026-08-27), and
     *  the reference layout shows the leading composition already expanded
     *  with its concrete medicines under it. Only ever sets the INITIAL
     *  group — collapsing it stays collapsed, and it never fights a group
     *  the doctor opened themselves. */
    const firstGroupId = groups[0]?.compositionId;
    const autoExpanded = useRef(false);
    useEffect(() => {
        if (autoExpanded.current || firstGroupId == null) return;
        autoExpanded.current = true;
        setExpandedId(firstGroupId);
    }, [firstGroupId]);

    useEffect(() => {
        if (!search.isSearching) { setDrill(null); setDrillBrands([]); }
    }, [search.isSearching]);

    // Focus follows the expanded composition — scrolls it into view inside
    // the tree's OWN scroll box (`block: "nearest"`), never the page.
    useEffect(() => {
        if (expandedId == null) return;
        headerRefs.current.get(expandedId)?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    }, [expandedId, reduce]);

    const isPreferred = (compositionId: number, medicineId: number) =>
        brands.some((b) => b.compositionId === compositionId && b.medicineId === medicineId);

    /** A search hit names a product but carries no medicine id (see
     *  `pickHit`), so "is this one already preferred?" can only be answered
     *  by name — enough to draw the heart filled, and the toggle itself
     *  still resolves the real id before writing anything. */
    const preferredBrandNames = useMemo(
        () => new Set(brands.map((b) => b.medicineName.toLowerCase())),
        [brands]
    );

    const openDrill = (hit: IntentSearchHit) => {
        if (hit.refId == null) return;
        setDrill({ id: hit.refId, name: hit.label });
        setDrillLoading(true);
        fetchBrandsForComposition(hit.refId).then(setDrillBrands).catch(console.error).finally(() => setDrillLoading(false));
    };

    /**
     * Search resolves to a MEDICINE first, not a composition ("brand name is
     * primary, composition is secondary"), even though `search_intents`
     * (`IntentSearchHit`) only ever names the composition a hit resolves
     * through, never a concrete medicine id. A brand-matched hit (the
     * doctor typed "Dolo", not "paracetamol") is resolved and marked
     * preferred in ONE click. A molecule-name hit still opens the drill:
     * "paracetamol" names no single product, so there is a real choice to
     * make there.
     *
     * Resolution goes through `resolveProductByName` — the existing exact
     * `.eq("name", …)` lookup Consult already uses for the identical
     * "the doctor named this exact product" job. A first attempt matched
     * `hit.viaLabel` against `fetchBrandsForComposition`'s list instead,
     * which silently did nothing for any common molecule: that list is
     * capped, and paracetamol alone carries thousands of brands, so
     * "Dolo 650 Tablet" was simply not in the window. Caught by clicking
     * the heart in the real app and watching the count stay at 1.
     */
    const pickHit = (hit: IntentSearchHit) => {
        if (hit.refId == null) return;
        if (hit.matchKind !== "brand" || !hit.viaLabel) {
            openDrill(hit);
            return;
        }
        const compositionId = hit.refId;
        const compositionName = hit.label;
        const brandName = hit.viaLabel;
        resolveProductByName(brandName)
            .then((product) => {
                if (!product) {
                    // Named in search but not resolvable as a row: fall back
                    // to the molecule's own brand list rather than doing
                    // nothing the doctor can see.
                    openDrill(hit);
                    return;
                }
                if (!isPreferred(compositionId, product.id)) {
                    togglePreferred(compositionId, compositionName, product.id, product.name);
                }
                search.setQuery("");
            })
            .catch(console.error);
    };

    const togglePreferred = (compositionId: number, compositionName: string, medicineId: number, medicineName: string) => {
        if (isPreferred(compositionId, medicineId)) {
            onBrandsChange(brands.filter((b) => !(b.compositionId === compositionId && b.medicineId === medicineId)));
            clearClinicBrandDefault({ hospitalId, compositionId, medicineId }).catch(console.error);
        } else {
            // A thin optimistic row first (instant heart feedback), then a
            // real refetch — `productForm`/`manufacturer` are hydrated
            // reads, not something this call site has to hand; a refetch
            // is the same "optimistic, then reconcile" pattern `pinMedicine`
            // already used for the equivalent Pinned Medicines flow.
            const optimistic: ClinicBrandDefaultDetail = {
                compositionId, medicineId, medicineName, compositionName,
                form: null, productForm: null, manufacturer: null, note: null,
                updatedAt: new Date().toISOString(),
                // Corrected the instant the refetch below lands — this is
                // just what's known before that round trip returns.
                allCompositionNames: [compositionName],
            };
            onBrandsChange([optimistic, ...brands]);
            setExpandedId(compositionId);
            setClinicBrandDefault({ hospitalId, compositionId, medicineId })
                .then(() => fetchClinicBrandDefaultDetails(hospitalId).then(onBrandsChange).catch(() => {}))
                .catch(console.error);
        }
    };

    return (
        <PracticeCard
            id="medicines"
            icon={<Pill size={14} />} tone="teal" title="Preferred Medicines"
            count={brands.length} countTone="green" fixed
            subtitle="Medicines your practice prefers to use, grouped by composition."
            // No footer link here (removed 2026-08-29 — "it does nothing,
            // really nothing"): unlike Labs/Companions, this card has no
            // separate management modal to open, and "focus the search
            // field" didn't read as an action worth a whole link. The
            // search field + tree ARE the full management surface,
            // already in view with nothing further to jump to.
        >
            <div>
                <IntentSearchField
                    state={search} placeholder="Search medicine (brand or generic)…"
                    inputRef={searchInputRef}
                    onKeyDown={onSearchKeyDown}
                    trailing={
                        // "Add Preferred" — NOT "Add New Medicine" (a
                        // completely different action, §15/16: one marks an
                        // EXISTING catalogue brand preferred, the other
                        // creates a brand that doesn't exist yet). This
                        // button used to open the create-a-brand modal by
                        // mistake. The search field immediately below IS
                        // the preferred-medicine picker — every hit already
                        // carries a heart — so this button's whole job is
                        // to land focus there.
                        <button type="button" className="prac-search-add" onClick={() => searchInputRef.current?.focus()}>
                            <Plus size={13} /> Add Preferred
                        </button>
                    }
                />
            </div>
            {search.isSearching ? (
                <div className="prac-search-results" ref={resultsRef}>
                    {drill ? (
                        <>
                            <button type="button" className="prac-modal-back" onClick={() => setDrill(null)}>
                                ← Different molecule
                            </button>
                            {drillLoading ? (
                                <SkelRows count={3} />
                            ) : drillBrands.length === 0 ? (
                                <EmptyBlock
                                    art={<BlankMedicineArt />} fact="No catalogue brand yet"
                                    next="Add it to the database instead."
                                    action={<button type="button" className="prac-empty-action" onClick={() => onOpenAddNew(drill.name)}>+ Add new medicine</button>}
                                />
                            ) : (
                                <>
                                    {drillBrands.length >= 60 && (
                                        <p className="prac-soon">
                                            Showing the first {drillBrands.length}. Know the brand name? Search it directly.
                                        </p>
                                    )}
                                    {drillBrands.map((b) => {
                                        const pinned = isPreferred(drill.id, b.medicineId);
                                        // Add-only here too — this is a search surface, not
                                        // the preferred-medicines list itself, so a click never
                                        // removes (see the tree's own X for that).
                                        const add = () => { if (!pinned) togglePreferred(drill.id, drill.name, b.medicineId, b.name); };
                                        return (
                                            <button
                                                key={b.medicineId} type="button"
                                                className="prac-modal-row is-pick"
                                                onClick={add}
                                            >
                                                <span className="prac-row-label">{b.name}</span>
                                                <StaticPin pinned={pinned} label={b.name} />
                                            </button>
                                        );
                                    })}
                                </>
                            )}
                        </>
                    ) : search.hits.length === 0 ? (
                        <EmptyBlock
                            art={<BlankMedicineArt />} fact={search.loading ? "Searching…" : `Nothing matches "${search.query.trim()}"`}
                            next="Try the molecule name or a brand."
                            action={!search.loading ? (
                                <button type="button" className="prac-empty-action" onClick={() => onOpenAddNew(search.query.trim())}>
                                    + Add new medicine
                                </button>
                            ) : undefined}
                        />
                    ) : (
                        search.hits.map((hit) => {
                            // Brand-first: the doctor searched "Dolo", the
                            // row leads with "Dolo 650" — the composition
                            // it satisfies is secondary context underneath,
                            // never the primary line (req: "medicine/brand
                            // name is primary, composition is secondary").
                            const isBrandHit = hit.matchKind === "brand" && !!hit.viaLabel;
                            const already = isBrandHit && preferredBrandNames.has((hit.viaLabel ?? "").toLowerCase());
                            // EVERY row carries a visible way to act — a
                            // heart for a resolved product, a "Brands"
                            // drill for a molecule name — AND the row
                            // itself now does the same thing on click
                            // (2026-08-28: "clicking anywhere on the row
                            // should toggle it", not just the tiny heart).
                            return (
                                <button
                                    key={hit.intentId} type="button" className="prac-hit-row"
                                    onClick={() => (isBrandHit ? pickHit(hit) : openDrill(hit))}
                                >
                                    <span className="prac-med-icon" aria-hidden="true"><Pill size={13} /></span>
                                    <div className="prac-med-info">
                                        <span className="prac-row-label is-catalogue">{isBrandHit ? hit.viaLabel : hit.label}</span>
                                        <span className="prac-med-brands">
                                            {isBrandHit ? hit.label : "Molecule. Pick a brand."}
                                        </span>
                                    </div>
                                    {isBrandHit ? (
                                        <StaticPin pinned={!!already} label={hit.viaLabel ?? hit.label} />
                                    ) : (
                                        <span className="prac-hit-drill">
                                            Brands <ChevronDown size={12} />
                                        </span>
                                    )}
                                </button>
                            );
                        })
                    )}
                </div>
            ) : brandsLoading ? (
                <SkelRows count={3} />
            ) : groups.length > 0 ? (
                <div className="prac-tree">
                    {groups.map((g) => {
                        const open = expandedId === g.compositionId;
                        return (
                            <div key={g.compositionId} className="prac-tree-group">
                                <button
                                    type="button"
                                    ref={(el) => {
                                        if (el) headerRefs.current.set(g.compositionId, el);
                                        else headerRefs.current.delete(g.compositionId);
                                    }}
                                    className={"prac-tree-head" + (g.isCombo ? " is-combo" : "")}
                                    onClick={() => setExpandedId(open ? null : g.compositionId)}
                                >
                                    <ChevronDown size={12} className={open ? "is-flipped" : undefined} />
                                    <span className="prac-row-label is-catalogue">
                                        {g.compositionName}
                                        {/* A combination brand's group is never mistaken for
                                            a plain single-salt one — see groupByComposition's
                                            doc comment for why this is a real, separate group,
                                            not a display trick. */}
                                        {g.isCombo && <em className="prac-tree-combo-tag">combination</em>}
                                    </span>
                                    <span className="prac-tree-count">{g.rows.length}</span>
                                </button>
                                {(() => {
                                    const overflowingChildren = g.rows.length > GROUP_ROW_CAP;
                                    const showingAll = childrenExpanded && open;
                                    const visibleRows = overflowingChildren && !showingAll ? g.rows.slice(0, GROUP_ROW_CAP) : g.rows;
                                    // The PRECISE target height, not `CappedRows`' own
                                    // "animate to an arbitrarily large flat number" trick —
                                    // that trick only reads as smooth when the real content
                                    // height is a meaningful fraction of the spring's actual
                                    // travel, which `CappedRows` gets for free from its
                                    // `flex:1; overflow-y:auto` expanded state bounding growth
                                    // against the CARD's remaining space. This box has no such
                                    // bound — animating toward 9999 from a real height of
                                    // 34-190px meant the spring "arrived" (visually) after
                                    // covering under 2% of its nominal travel, so it read as a
                                    // snap, not an animation ("the animation of closing and
                                    // opening a composition is rigged", 2026-08-29). A real
                                    // number gives the spring a real distance to ease across,
                                    // in both directions, and doubles as the correct target
                                    // the moment "Show more"/"Show less" changes how many rows
                                    // are actually in view — no retuning on every click needed,
                                    // it's just computed fresh each render.
                                    const targetHeight = open
                                        ? visibleRows.length * TREE_ROW_H + (overflowingChildren ? SHOW_MORE_H : 0)
                                        : 0;
                                    return (
                                        <motion.div
                                            initial={false}
                                            animate={{ maxHeight: targetHeight }}
                                            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 32 }}
                                            className="prac-tree-children"
                                        >
                                            {/* Every row here is ALREADY preferred — there is
                                                nothing left to "add" by clicking it, only
                                                something to remove, and removal is
                                                deliberately NOT a click-anywhere gesture
                                                (2026-08-29: "clicking on it should add it,
                                                but for removing there should be a...
                                                cross button... not anywhere"). The heart
                                                is a plain indicator now; only the ✕
                                                actually removes. */}
                                            {visibleRows.map((r) => (
                                                <div key={r.medicineId} className="prac-tree-row">
                                                    <span className="prac-row-label is-catalogue">{r.medicineName}</span>
                                                    {r.productForm && <span className="prac-tree-form">{r.productForm}</span>}
                                                    {r.manufacturer && <span className="prac-tree-mfr">{r.manufacturer}</span>}
                                                    <Heart size={14} className="prac-tree-heart" fill="currentColor" aria-hidden="true" />
                                                    <RemoveBtn
                                                        label={`Remove ${r.medicineName} from preferred medicines`}
                                                        onClick={() => togglePreferred(r.compositionId, r.compositionName, r.medicineId, r.medicineName)}
                                                    />
                                                </div>
                                            ))}
                                            {/* Only appears once a group's own list actually
                                                exceeds the cap — "There is no Show more button
                                                (if the list exceeds the box height), it directly
                                                go for scrolling" (2026-08-29). Unlocks the rest
                                                in place, same spring the group itself opened
                                                with, rather than silently handing the doctor a
                                                scrollbar with no signal there was more to see. */}
                                            {overflowingChildren && (
                                                <button
                                                    type="button"
                                                    className="prac-foot-more prac-tree-more"
                                                    onClick={() => setChildrenExpanded((v) => !v)}
                                                >
                                                    {showingAll ? "Show less" : "Show more"}
                                                    <ChevronDown size={12} className={showingAll ? "is-flipped" : undefined} />
                                                </button>
                                            )}
                                        </motion.div>
                                    );
                                })()}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <EmptyBlock
                    art={<BlankMedicineArt />} fact="No preferred medicines yet"
                    next="Search above and mark the brands your practice reaches for. Consult surfaces them first."
                />
            )}
        </PracticeCard>
    );
}

// ===========================================================================
// MODALS — one PracticeModal-shaped body per deeper management surface.
// Kept as sibling components in this file rather than split out: each is a
// short form + a short list, and none is reused outside this page.
// ===========================================================================

function LabsModal({
    doctorId, hospitalId, labs, onChange, onClose,
}: {
    doctorId: string;
    hospitalId: string;
    labs: PreferredLab[];
    onChange: (labs: PreferredLab[]) => void;
    onClose: () => void;
}) {
    const [name, setName] = useState("");
    const [contactNote, setContactNote] = useState("");
    const [busy, setBusy] = useState(false);

    const refresh = () => loadPreferredLabs(doctorId).then(onChange).catch(console.error);

    const submitAdd = () => {
        const trimmed = name.trim();
        if (!trimmed || busy) return;
        setBusy(true);
        addPreferredLab({ doctorId, hospitalId, name: trimmed, contactNote, makeDefault: labs.length === 0 })
            .then(() => { setName(""); setContactNote(""); return refresh(); })
            .catch(console.error)
            .finally(() => setBusy(false));
    };

    const removeLab = (id: number) => {
        onChange(labs.filter((l) => l.id !== id));
        removePreferredLab(id).then(refresh).catch(console.error);
    };

    const makeDefault = (id: number) => {
        setDefaultPreferredLab({ doctorId, id }).then(refresh).catch(console.error);
    };

    const move = (index: number, dir: -1 | 1) => {
        const target = index + dir;
        if (target < 0 || target >= labs.length) return;
        const next = [...labs];
        [next[index], next[target]] = [next[target], next[index]];
        onChange(next);
        reorderPreferredLabs(next.map((l, i) => ({ id: l.id, sortOrder: i }))).catch(console.error);
    };

    return (
        <PracticeModal
            accent="slate"
            icon={<FlaskConical size={15} />}
            eyebrow="Preferred Labs"
            title="Your diagnostic centres"
            onClose={onClose}
            wide
            dirty={!!name.trim() || !!contactNote.trim()}
            footer={<button type="button" className="prac-modal-btn is-primary" onClick={onClose}>Done</button>}
        >
            <div className="prac-modal-field">
                <label>Add a lab</label>
                <input
                    type="text" value={name} placeholder="e.g. City Diagnostics"
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") submitAdd(); }}
                />
            </div>
            <div className="prac-modal-field">
                <label>Note (optional)</label>
                <input
                    type="text" value={contactNote} placeholder="Phone, address, or how you refer"
                    onChange={(e) => setContactNote(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") submitAdd(); }}
                />
            </div>
            <button type="button" className="prac-modal-btn is-primary is-compact" disabled={!name.trim() || busy} onClick={submitAdd}>
                <Plus size={14} /> Add lab
            </button>

            <div className="prac-modal-section-title">Your labs, in order</div>
            {labs.length === 0 ? (
                <p className="prac-soon">Nothing added yet. The first one becomes your default.</p>
            ) : (
                <div className="prac-modal-rows">
                    {labs.map((lab, i) => (
                        <div key={lab.id} className="prac-modal-row">
                            <button
                                type="button"
                                className={`prac-lab-star${lab.isDefault ? " is-default" : ""}`}
                                title={lab.isDefault ? "Your default lab" : "Make default"}
                                onClick={() => makeDefault(lab.id)}
                            >
                                <Star size={13} fill={lab.isDefault ? "currentColor" : "none"} />
                            </button>
                            <div className="prac-med-info">
                                <span className="prac-row-label">{lab.name}</span>
                                {lab.contactNote && <span className="prac-med-brands">{lab.contactNote}</span>}
                            </div>
                            <div className="prac-reorder">
                                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp size={12} /></button>
                                <button type="button" disabled={i === labs.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown size={12} /></button>
                            </div>
                            <RemoveBtn label={`Remove ${lab.name}`} onClick={() => removeLab(lab.id)} />
                        </div>
                    ))}
                </div>
            )}
        </PracticeModal>
    );
}

/** A row in the builder, before it's saved — the same two kinds
 *  `PrescriptionTemplateItemDetail` carries (`add_template_observable_items`),
 *  plus the display label every row needs regardless of which kind it is. */
type BuilderItem =
    | { kind: "intent"; intentId: number; type: IntentType; label: string }
    | { kind: "observable"; observableId: number; observableKind: Observable["kind"]; label: string };

/** Both id spaces are independent `bigint` columns — an intent id and an
 *  observable id can collide numerically — so React's key (and every
 *  same-item check below) is keyed on kind+id together, never id alone. */
const builderItemKey = (it: BuilderItem) =>
    it.kind === "intent" ? `intent:${it.intentId}` : `obs:${it.observableId}`;

function TemplateBuilderModal({
    doctorId, hospitalId, templateId, observables, onClose, onSaved,
}: {
    doctorId: string;
    hospitalId: string;
    templateId: number | "new";
    observables: Observable[];
    onClose: () => void;
    onSaved: (templates: PrescriptionTemplateSummary[]) => void;
}) {
    const [loading, setLoading] = useState(templateId !== "new");
    const [name, setName] = useState("");
    const [triggerLabel, setTriggerLabel] = useState("");
    const [items, setItems] = useState<BuilderItem[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const itemSearch = useIntentSearch(["medicine", "test", "referral", "advice"]);
    // A second, independent search over the observable catalogue — see
    // `useCatalogueSearch`'s own doc comment for why this isn't a second
    // implementation of the case sheet's search, just a reuse of it.
    const [obsQuery, setObsQuery] = useState("");
    const obsHits = useCatalogueSearch(observables, obsQuery);

    useEffect(() => {
        if (templateId === "new") return;
        let cancelled = false;
        fetchPrescriptionTemplateDetail(templateId)
            .then((detail) => {
                if (cancelled || !detail) return;
                setName(detail.name);
                setTriggerLabel(detail.triggerLabel);
                setItems(detail.items.map((i): BuilderItem => (i.kind === "intent"
                    ? { kind: "intent", intentId: i.intentId, type: i.type, label: i.label }
                    : { kind: "observable", observableId: i.observableId, observableKind: i.observableKind, label: i.label }
                )));
            })
            .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [templateId]);

    const addItem = (hit: IntentSearchHit) => {
        if (items.some((i) => i.kind === "intent" && i.intentId === hit.intentId)) return;
        const label = hit.matchKind === "brand" && hit.viaLabel ? hit.viaLabel : hit.label;
        setItems((curr) => [...curr, { kind: "intent", intentId: hit.intentId, type: hit.type, label }]);
        itemSearch.setQuery("");
    };

    const addObservableItem = (o: Observable) => {
        if (items.some((i) => i.kind === "observable" && i.observableId === o.id)) return;
        setItems((curr) => [...curr, { kind: "observable", observableId: o.id, observableKind: o.kind, label: o.label }]);
        setObsQuery("");
    };

    const removeItem = (key: string) => setItems((curr) => curr.filter((i) => builderItemKey(i) !== key));

    const move = (index: number, dir: -1 | 1) => {
        const target = index + dir;
        if (target < 0 || target >= items.length) return;
        setItems((curr) => {
            const next = [...curr];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    };

    const finishAndReload = () =>
        loadPrescriptionTemplateSummaries(doctorId).then((rows) => { onSaved(rows); onClose(); });

    const save = () => {
        if (!name.trim() || !triggerLabel.trim() || busy) return;
        setBusy(true);
        setError(null);
        const payloadItems: PrescriptionTemplateItemInput[] = items.map((i) => (i.kind === "intent"
            ? { intentId: i.intentId, type: i.type }
            : { observableId: i.observableId, observableKind: i.observableKind }
        ));
        const op = templateId === "new"
            ? createPrescriptionTemplate({ doctorId, hospitalId, name, triggerLabel, items: payloadItems })
            : Promise.all([
                updatePrescriptionTemplateMeta({ id: templateId, name, triggerLabel }),
                replacePrescriptionTemplateItems({ templateId, items: payloadItems }),
            ]);
        Promise.resolve(op)
            .then(() => finishAndReload())
            .catch((e) => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => setBusy(false));
    };

    const remove = () => {
        if (templateId === "new" || busy) return;
        if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return;
        setBusy(true);
        deletePrescriptionTemplate(templateId)
            .then(finishAndReload)
            .catch((e) => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => setBusy(false));
    };

    const duplicate = () => {
        if (templateId === "new" || busy) return;
        setBusy(true);
        duplicatePrescriptionTemplate({ id: templateId, doctorId, hospitalId })
            .then(finishAndReload)
            .catch((e) => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => setBusy(false));
    };

    return (
        <PracticeModal
            accent="violet"
            icon={<Layers size={15} />}
            eyebrow="Prescription Templates"
            title={templateId === "new" ? "New template" : "Edit template"}
            onClose={onClose}
            wide
            dirty={!loading && (!!name.trim() || !!triggerLabel.trim() || items.length > 0)}
            footer={
                <>
                    {templateId !== "new" && (
                        <button type="button" className="prac-modal-btn is-ghost" onClick={remove} disabled={busy}>
                            Delete
                        </button>
                    )}
                    <button
                        type="button" className="prac-modal-btn is-primary" onClick={save}
                        disabled={busy || !name.trim() || !triggerLabel.trim()}
                    >
                        {templateId === "new" ? "Create template" : "Save changes"}
                    </button>
                </>
            }
        >
            {loading ? (
                <SkelRows count={4} />
            ) : (
                <>
                    {error && <p className="prac-modal-error">{error}</p>}
                    <div className="prac-modal-field">
                        <label>Template name</label>
                        <input type="text" value={name} placeholder="e.g. Fever — General OPD"
                            onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="prac-modal-field">
                        <label>Trigger word, typed in the case sheet to find it</label>
                        <input type="text" value={triggerLabel} placeholder="e.g. fever"
                            onChange={(e) => setTriggerLabel(e.target.value)} />
                    </div>
                    {templateId !== "new" && (
                        <button type="button" className="prac-modal-back" onClick={duplicate} disabled={busy}>
                            Duplicate as a new template
                        </button>
                    )}

                    <div className="prac-modal-section-title">Items ({items.length})</div>
                    {items.length === 0 ? (
                        <p className="prac-soon">
                            Add medicines, investigations, referrals or advice below — and, if this
                            template should chart its own trigger symptom (so applying it ranks
                            Assessment/Medicine Recommendations for real instead of landing items on
                            an empty chart), a symptom, finding or history item too. Every treatment
                            item still passes the normal safety check when the template is applied —
                            this is a starting point, never a bypass.
                        </p>
                    ) : (
                        <div className="prac-modal-rows">
                            {items.map((it, i) => {
                                const key = builderItemKey(it);
                                return (
                                    <div key={key} className="prac-modal-row">
                                        <span className={it.kind === "intent"
                                            ? `prac-term-kind is-${it.type}`
                                            : `prac-term-kind is-obs-${it.observableKind}`
                                        }>
                                            {it.kind === "intent" ? intentTypeLabel(it.type) : KIND_BADGE[it.observableKind]}
                                        </span>
                                        <span className="prac-row-label">{it.label}</span>
                                        <div className="prac-reorder">
                                            <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp size={12} /></button>
                                            <button type="button" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown size={12} /></button>
                                        </div>
                                        <RemoveBtn label={`Remove ${it.label}`} onClick={() => removeItem(key)} />
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <IntentSearchField state={itemSearch} placeholder="Add a medicine, test, referral or advice…" />
                    {itemSearch.isSearching && (
                        <div className="prac-modal-rows">
                            {itemSearch.hits.length === 0 ? (
                                <p className="prac-soon">{itemSearch.loading ? "Searching…" : "Nothing matches."}</p>
                            ) : (
                                itemSearch.hits.map((hit) => {
                                    const already = items.some((i) => i.kind === "intent" && i.intentId === hit.intentId);
                                    const label = hit.matchKind === "brand" && hit.viaLabel ? hit.viaLabel : hit.label;
                                    return (
                                        <button
                                            key={hit.intentId} type="button" className="prac-modal-row is-pick"
                                            disabled={already} onClick={() => addItem(hit)}
                                        >
                                            <span className={`prac-term-kind is-${hit.type}`}>{intentTypeLabel(hit.type)}</span>
                                            <span className="prac-row-label">{label}</span>
                                            {already && <Check size={13} />}
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    )}

                    <div className="prac-modal-field">
                        <input
                            type="text" value={obsQuery} placeholder="Add a symptom, finding or history item…"
                            onChange={(e) => setObsQuery(e.target.value)}
                        />
                    </div>
                    {obsQuery.trim() && (
                        <div className="prac-modal-rows">
                            {obsHits.length === 0 ? (
                                <p className="prac-soon">Nothing matches.</p>
                            ) : (
                                obsHits.map((o) => {
                                    const already = items.some((i) => i.kind === "observable" && i.observableId === o.id);
                                    return (
                                        <button
                                            key={o.id} type="button" className="prac-modal-row is-pick"
                                            disabled={already} onClick={() => addObservableItem(o)}
                                        >
                                            <span className={`prac-term-kind is-obs-${o.kind}`}>{KIND_BADGE[o.kind]}</span>
                                            <span className="prac-row-label">{o.label}</span>
                                            {already && <Check size={13} />}
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    )}
                </>
            )}
        </PracticeModal>
    );
}

function MeasurementsModal({
    doctorId, specialtyKeys, specialtyLabel, currentPrefs, onClose, onSaved,
}: {
    doctorId: string;
    specialtyKeys: MeasureFieldKey[];
    specialtyLabel: string;
    currentPrefs: string[] | null;
    onClose: () => void;
    onSaved: (keys: string[] | null) => void;
}) {
    // Was `MEASURE_FIELDS.filter(...specialtyKeys)` — only the specialty's OWN
    // curated set was ever offered, so "5 of 5" read as a hard ceiling on how
    // many measurements a doctor could have Cortex open with ("doctors should
    // be able to configure more than five"). The specialty's set is still
    // what's on BY DEFAULT (a real clinical curation, kept); the doctor can
    // now add any other field from the full catalogue on top of it. Specialty
    // fields sort first, so the ones already checked stay above the fold.
    const fields = useMemo(
        () => [...MEASURE_FIELDS].sort((a, b) => {
            const ai = (specialtyKeys as string[]).includes(a.key) ? 0 : 1;
            const bi = (specialtyKeys as string[]).includes(b.key) ? 0 : 1;
            return ai - bi;
        }),
        [specialtyKeys]
    );
    const initialKeys = useMemo(
        () => new Set(currentPrefs && currentPrefs.length ? currentPrefs : specialtyKeys),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []
    );
    const [selected, setSelected] = useState<Set<string>>(() => new Set(initialKeys));
    const [busy, setBusy] = useState(false);
    const changed = selected.size !== initialKeys.size || [...selected].some((k) => !initialKeys.has(k));

    const toggle = (key: string) => {
        setSelected((curr) => {
            const next = new Set(curr);
            if (next.has(key)) { if (next.size > 1) next.delete(key); }
            else next.add(key);
            return next;
        });
    };

    const save = () => {
        setBusy(true);
        const isFullBaseline = specialtyKeys.length === selected.size && specialtyKeys.every((k) => selected.has(k));
        const toSave = isFullBaseline ? null : fields.filter((f) => selected.has(f.key)).map((f) => f.key);
        setDoctorMeasurePrefs(doctorId, toSave)
            .then(() => { onSaved(toSave); onClose(); })
            .catch(console.error)
            .finally(() => setBusy(false));
    };

    return (
        <PracticeModal
            accent="blue"
            icon={<SlidersHorizontal size={15} />}
            eyebrow="Consultation Defaults"
            title="Measurements Cortex opens with"
            onClose={onClose}
            dirty={changed}
            footer={<button type="button" className="prac-modal-btn is-primary" onClick={save} disabled={busy}>Save</button>}
        >
            <p className="prac-soon">
                On by default for {specialtyLabel}. Uncheck the ones you rarely use, or add any
                other field from the full catalogue below — every field stays one tap away from
                "+ Add" in Consult regardless of whether it's checked here.
            </p>
            <div className="prac-measure-grid">
                {fields.map((f) => (
                    <label key={f.key} className="prac-measure-item">
                        <input type="checkbox" checked={selected.has(f.key)} onChange={() => toggle(f.key)} />
                        <span>{f.shortLabel ?? f.label}</span>
                    </label>
                ))}
            </div>
        </PracticeModal>
    );
}

/** Dosage forms worth naming up front — same list `AddMedicineSheet.tsx`
 *  (Consult's own version of this flow) declares; free beyond this costs
 *  nothing (`route` is a plain text column) but a picker is faster than
 *  typing for the forms that cover almost every real brand. */
const NEW_MEDICINE_FORMS = [
    "Tablet", "Capsule", "Syrup", "Suspension", "Drops",
    "Injection", "Cream", "Ointment", "Gel", "Inhaler",
];

interface CompositionPick {
    intentId: number;
    compositionId: number;
    label: string;
}

/**
 * ADD NEW MEDICINE — a different thing from Preferred Medicines (§15/§16 of
 * the brief). This one says "the medicine does not exist in our database
 * yet"; Preferred Medicines says "this existing one is preferred here".
 *
 * Search-first, composition-anchored, same as Consult's `AddMedicineSheet`
 * and the same `addMedicine` RPC — which already enforces standing rule 22
 * (attaches a brand to an EXISTING composition only, never mints one). This
 * is a lighter sibling of that sheet, not a fork of it: Practice has no
 * consult, no plan, no dose/timing handoff to make — it ends at "the brand
 * now exists", optionally followed by marking it preferred.
 */
function AddMedicineModal({
    hospitalId, userId, initialName, onClose, onCreated, onMedicineAdded,
}: {
    hospitalId: string;
    /** `users.id` — `clinic_brand_preference.set_by`'s FK points at `users`,
     *  NOT `doctors` (a different row `hospital_companion_preference.set_by`
     *  happens to use instead — two tables, two conventions). Passing the
     *  wrong one throws `violates foreign key constraint
     *  clinic_brand_preference_set_by_fkey` — caught 2026-08-29 on a live
     *  account: the medicine WAS created (that RPC succeeded), but "mark as
     *  preferred" then failed silently into an error with no success
     *  shown, because it was passed `doctorId` here. */
    userId: string | null;
    initialName: string;
    onClose: () => void;
    onCreated: (row: ClinicBrandDefaultDetail) => void;
    /** Fires the instant the brand itself is created — independent of
     *  "mark as preferred" — so the "View added (N)" count updates whether
     *  or not the checkbox was on. */
    onMedicineAdded: (m: HospitalAddedMedicine) => void;
}) {
    const [name, setName] = useState(initialName);
    const [compositions, setCompositions] = useState<CompositionPick[]>([]);
    const [form, setForm] = useState("");
    const [dosage, setDosage] = useState("");
    const [markPreferred, setMarkPreferred] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const compSearch = useIntentSearch(["medicine"]);

    // Duplicate check — "why isn't adding a new medicine triggering a
    // search to verify it isn't already there?" (2026-08-29). A free-typed
    // brand name never touched search before this; now every keystroke here
    // runs the SAME `search_intents` RPC the composition field below uses,
    // via a second independent `useIntentSearch` instance kept in sync with
    // `name`. This deliberately does NOT go through `medicines.name ilike`
    // — `resolveProductByName`'s doc comment measured that against the live
    // 213k-row catalogue and it is cancelled by the statement timeout with
    // no supporting index, every time. `search_intents` already has to
    // answer this same question fast for every OTHER search box on this
    // page, so it is reused rather than a second, slower path invented here.
    const nameSearch = useIntentSearch(["medicine"]);
    useEffect(() => { nameSearch.setQuery(name); }, [name]);
    // Only `matchKind === "brand"` hits — a hit that only matched the
    // MOLECULE name (typing "Paracetamol" as a brand name, say) isn't
    // evidence this exact brand already exists, and would just make the
    // warning fire on every plain-composition name typed here.
    const duplicateBrands = useMemo(() => {
        if (name.trim().length < 2) return [];
        const seen = new Set<string>();
        const out: { brand: string; composition: string }[] = [];
        for (const h of nameSearch.hits) {
            if (h.matchKind !== "brand" || !h.viaLabel) continue;
            const key = h.viaLabel.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ brand: h.viaLabel, composition: h.label });
        }
        return out;
    }, [nameSearch.hits, name]);

    const chosenIds = new Set(compositions.map((c) => c.compositionId));
    const compositionHits = (() => {
        const seen = new Set<number>();
        const out: CompositionPick[] = [];
        for (const h of compSearch.hits) {
            if (h.refTable !== "compositions" || h.refId == null) continue;
            if (seen.has(h.refId) || chosenIds.has(h.refId)) continue;
            seen.add(h.refId);
            out.push({ intentId: h.intentId, compositionId: h.refId, label: h.label });
        }
        return out;
    })();

    const canSubmit = !!name.trim() && compositions.length > 0 && !submitting;

    const submit = () => {
        if (!canSubmit) return;
        setSubmitting(true);
        setError(null);
        const strengthMg = dosage.trim() ? Number(dosage.trim().replace(/[^\d.]/g, "")) : null;
        addMedicine({
            name: name.trim(),
            compositionIds: compositions.map((c) => c.compositionId),
            route: form || null,
            strengthMg: strengthMg != null && Number.isFinite(strengthMg) ? strengthMg : null,
        })
            .then((results) => {
                const created = results[0]?.medicine;
                if (!created) return;
                // Always — this fires regardless of "mark as preferred"
                // (the brand exists in the catalogue either way, and the
                // "View added" count next to this card needs to reflect
                // that immediately, not only when the checkbox was on).
                onMedicineAdded({
                    id: created.id,
                    name: created.name,
                    manufacturer: null,
                    strengthMg: strengthMg != null && Number.isFinite(strengthMg) ? strengthMg : null,
                    createdAt: new Date().toISOString(),
                    compositionNames: [...new Set(compositions.map((c) => c.label))].sort(),
                });
                if (markPreferred) {
                    const primary = compositions[0];
                    return setClinicBrandDefault({
                        hospitalId, compositionId: primary.compositionId, medicineId: created.id, setBy: userId,
                    }).then(() => onCreated({
                        compositionId: primary.compositionId,
                        medicineId: created.id,
                        medicineName: created.name,
                        compositionName: primary.label,
                        form: created.form,
                        productForm: created.form,
                        manufacturer: null,
                        note: null,
                        updatedAt: new Date().toISOString(),
                        // Every salt the doctor actually picked in this
                        // form, not just the first — a combination brand
                        // created here is a combination from the start.
                        allCompositionNames: [...new Set(compositions.map((c) => c.label))].sort(),
                    }));
                }
            })
            .then(() => onClose())
            .catch((e) => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => setSubmitting(false));
    };

    return (
        <PracticeModal
            accent="teal" icon={<Plus size={15} />} eyebrow="Add New Medicine"
            title="Create a medicine record" onClose={onClose} wide
            dirty={!!name.trim() || compositions.length > 0 || !!dosage.trim()}
            footer={
                <button type="button" className="prac-modal-btn is-primary" disabled={!canSubmit} onClick={submit}>
                    {submitting ? "Creating…" : "Create medicine"}
                </button>
            }
        >
            {error && <p className="prac-modal-error">{error}</p>}
            <p className="prac-soon">
                Search the salt this brand contains first — if it already carries a catalogue brand,
                use Preferred Medicines instead of creating a duplicate.
            </p>

            <div className="prac-modal-field">
                <label>Brand name</label>
                <input type="text" value={name} placeholder="e.g. Acenac-XT" onChange={(e) => setName(e.target.value)} autoFocus />
                {duplicateBrands.length > 0 && (
                    <div className="prac-modal-dupe-warn" role="status">
                        <strong>Already in our library:</strong>
                        <ul>
                            {duplicateBrands.slice(0, 5).map((m) => (
                                <li key={m.brand}>{m.brand} <span>— {m.composition}</span></li>
                            ))}
                        </ul>
                        <p>Search Preferred Medicines above instead of creating a duplicate.</p>
                    </div>
                )}
            </div>

            <div className="prac-modal-field">
                <label>Salt / composition <em className="prac-modal-required">required</em></label>
                {compositions.length > 0 && (
                    <div className="prac-modal-rows">
                        {compositions.map((c) => (
                            <div key={c.compositionId} className="prac-modal-row">
                                <span className="prac-row-label is-catalogue">{c.label}</span>
                                <RemoveBtn
                                    label={`Remove ${c.label}`}
                                    onClick={() => setCompositions((cur) => cur.filter((x) => x.compositionId !== c.compositionId))}
                                />
                            </div>
                        ))}
                    </div>
                )}
                <IntentSearchField
                    state={compSearch}
                    placeholder={compositions.length === 0 ? "Search the salt this contains…" : "Add another salt, if this is a combination…"}
                />
                {compSearch.isSearching && (
                    <div className="prac-modal-rows">
                        {compositionHits.length === 0 ? (
                            <p className="prac-soon">{compSearch.loading ? "Searching…" : "Nothing matches — try the molecule name."}</p>
                        ) : (
                            compositionHits.map((c) => (
                                <button
                                    key={c.compositionId} type="button" className="prac-modal-row is-pick"
                                    onClick={() => { setCompositions((cur) => [...cur, c]); compSearch.setQuery(""); }}
                                >
                                    <span className="prac-row-label is-catalogue">{c.label}</span>
                                </button>
                            ))
                        )}
                    </div>
                )}
            </div>

            <div className="prac-modal-field-row">
                <div className="prac-modal-field">
                    <label>Form</label>
                    <select value={form} onChange={(e) => setForm(e.target.value)}>
                        <option value="">Not specified</option>
                        {NEW_MEDICINE_FORMS.map((f) => <option key={f} value={f.toLowerCase()}>{f}</option>)}
                    </select>
                </div>
                <div className="prac-modal-field">
                    <label>Strength in mg (optional)</label>
                    <input type="text" value={dosage} placeholder="e.g. 650" onChange={(e) => setDosage(e.target.value)} />
                </div>
            </div>

            <label className="prac-modal-check">
                <input type="checkbox" checked={markPreferred} onChange={(e) => setMarkPreferred(e.target.checked)} />
                Mark as a preferred medicine once created
            </label>
        </PracticeModal>
    );
}

/** Read-only history for "Add New Medicine" — every brand this practice has
 *  ever submitted, newest first, each with the salt it was filed under and
 *  when it was added. Nothing here is editable; Preferred Medicines is
 *  where a doctor manages what Consult actually shows.
 *
 *  `rows`/`loading` are lifted to `PracticePage` now (2026-08-29) rather
 *  than fetched inside this modal — the head action next to "Add New
 *  Medicine" needs the same count for its "(N)" badge, and fetching it
 *  twice (once for the badge, once when the modal opens) for data this
 *  small isn't worth two round trips or two sources of truth. */
function AddedMedicinesModal({
    rows, loading, onClose,
}: {
    rows: HospitalAddedMedicine[];
    loading: boolean;
    onClose: () => void;
}) {
    return (
        <PracticeModal
            accent="teal" icon={<Clock size={15} />} eyebrow="Add New Medicine"
            title="Medicines you've added" onClose={onClose} wide
            footer={<button type="button" className="prac-modal-btn is-primary" onClick={onClose}>Done</button>}
        >
            {loading ? (
                <SkelRows count={4} />
            ) : rows.length === 0 ? (
                <p className="prac-soon">Nothing added yet. New brands you create show up here with a timestamp.</p>
            ) : (
                <div className="prac-modal-rows">
                    {rows.map((m) => (
                        <div key={m.id} className="prac-modal-row">
                            <div className="prac-med-info">
                                <span className="prac-row-label">{m.name}</span>
                                <span className="prac-med-brands">
                                    {m.compositionNames.length > 0 ? m.compositionNames.join(" + ") : "No salt on file"}
                                    {m.manufacturer ? ` · ${m.manufacturer}` : ""}
                                </span>
                            </div>
                            <span className="prac-modal-row-time">
                                {new Date(m.createdAt).toLocaleString("en-IN", {
                                    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
                                })}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </PracticeModal>
    );
}

/** "Manage clinical terms" used to be wired ONLY to the chip cloud's own
 *  16-term overflow toggle — for any doctor with fewer than 16 terms
 *  (nearly everyone) it was a link that visibly did nothing when clicked.
 *  A real destination: every term, searchable, removable, one modal —
 *  the same "Manage" surface every other populated card on this page
 *  already has. */
function ManageTermsModal({
    terms, onForget, onClose,
}: {
    terms: DoctorFreeTermDetail[];
    onForget: (id: number) => void;
    onClose: () => void;
}) {
    const [query, setQuery] = useState("");
    const q = query.trim().toLowerCase();
    const filtered = q ? terms.filter((t) => t.label.toLowerCase().includes(q)) : terms;

    return (
        <PracticeModal
            accent="violet" icon={<BookText size={15} />} eyebrow="Your Clinical Terms"
            title="All your terms" onClose={onClose} wide
            footer={<button type="button" className="prac-modal-btn is-primary" onClick={onClose}>Done</button>}
        >
            <div className="prac-modal-field">
                <input
                    type="text" value={query} placeholder="Filter your terms…"
                    onChange={(e) => setQuery(e.target.value)} autoFocus
                />
            </div>
            {terms.length === 0 ? (
                <p className="prac-soon">Nothing added yet.</p>
            ) : filtered.length === 0 ? (
                <p className="prac-soon">Nothing matches "{query.trim()}".</p>
            ) : (
                <div className="prac-modal-rows">
                    {filtered.map((t) => (
                        <div key={t.id} className="prac-modal-row">
                            <span className={`prac-term-kind is-${t.type}`}>{TERM_TYPE_LABEL[t.type]}</span>
                            <span className="prac-row-label">{t.label}</span>
                            <span className="prac-modal-row-time">{t.useCount} use{t.useCount === 1 ? "" : "s"}</span>
                            <RemoveBtn label={`Forget "${t.label}"`} onClick={() => onForget(t.id)} />
                        </div>
                    ))}
                </div>
            )}
        </PracticeModal>
    );
}

/**
 * CLINICAL COMPANIONS — the practice-specific layer over Synapse's
 * ALREADY-authored `intent_companions` edges (§17/§18 of the brief: reuse
 * the real pipeline, never a parallel one). Two things a doctor can do,
 * neither of which is clinical reasoning:
 *   * curate — turn a globally authored pairing off for this practice;
 *   * author — add a brand-new pairing between two EXISTING intents this
 *     practice picked from search, never a newly invented intent.
 * Every suggestion this produces still carries the engine's own guard
 * verdict in Consult and is never added automatically — see
 * `applyHospitalCompanionPrefs` (companions.ts) for the safety rule that
 * makes this true underneath the UI.
 */
function CompanionsModal({
    hospitalId, doctorId, entries, onChange, onClose,
}: {
    hospitalId: string;
    doctorId: string;
    entries: HospitalCompanionDetail[];
    onChange: (entries: HospitalCompanionDetail[]) => void;
    onClose: () => void;
}) {
    const [catalogue, setCatalogue] = useState<AuthoredCompanionEdgeDetail[]>([]);
    const [catalogueLoading, setCatalogueLoading] = useState(true);
    const [trigger, setTrigger] = useState<{ intentId: number; label: string } | null>(null);
    const [companion, setCompanion] = useState<{ intentId: number; label: string } | null>(null);
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const triggerSearch = useIntentSearch(ALL_INTENT_TYPES);
    const companionSearch = useIntentSearch(ALL_INTENT_TYPES);

    useEffect(() => {
        fetchAuthoredCompanionCatalogue().then(setCatalogue).catch(console.error).finally(() => setCatalogueLoading(false));
    }, []);

    const curatedKey = (intentId: number, companionIntentId: number) => `${intentId}|${companionIntentId}`;
    const curated = new Map(
        entries.filter((e) => e.source === "curated").map((e) => [curatedKey(e.intentId, e.companionIntentId), e])
    );

    const toggleGlobal = (edge: AuthoredCompanionEdgeDetail, currentlyOn: boolean) => {
        if (currentlyOn) {
            const optimistic: HospitalCompanionDetail = {
                intentId: edge.intentId, companionIntentId: edge.companionIntentId,
                triggerLabel: edge.triggerLabel, companionLabel: edge.companionLabel,
                companionType: edge.companionType, enabled: false, reason: null,
                source: "curated", updatedAt: new Date().toISOString(),
            };
            onChange([optimistic, ...entries.filter((e) => !(e.intentId === edge.intentId && e.companionIntentId === edge.companionIntentId))]);
            setHospitalCompanionCuration({
                hospitalId, intentId: edge.intentId, companionIntentId: edge.companionIntentId, enabled: false, setBy: doctorId,
            }).catch(console.error);
        } else {
            onChange(entries.filter((e) => !(e.intentId === edge.intentId && e.companionIntentId === edge.companionIntentId && e.source === "curated")));
            clearHospitalCompanionCuration({ hospitalId, intentId: edge.intentId, companionIntentId: edge.companionIntentId }).catch(console.error);
        }
    };

    const removeAuthored = (e: HospitalCompanionDetail) => {
        onChange(entries.filter((x) => !(x.intentId === e.intentId && x.companionIntentId === e.companionIntentId && x.source === "practice_authored")));
        deleteHospitalCompanionEdge({ hospitalId, intentId: e.intentId, companionIntentId: e.companionIntentId }).catch(console.error);
    };

    const submitAuthored = () => {
        if (!trigger || !companion || !reason.trim() || busy) return;
        if (trigger.intentId === companion.intentId) { setError("Pick two different things."); return; }
        setBusy(true);
        setError(null);
        createHospitalCompanionEdge({
            hospitalId, intentId: trigger.intentId, companionIntentId: companion.intentId,
            reason: reason.trim(), setBy: doctorId,
        })
            .then(() => fetchHospitalCompanionDetails(hospitalId).then(onChange).catch(() => {}))
            .then(() => {
                setTrigger(null); setCompanion(null); setReason("");
                triggerSearch.setQuery(""); companionSearch.setQuery("");
            })
            .catch((e) => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => setBusy(false));
    };

    const authoredEntries = entries.filter((e) => e.source === "practice_authored");

    return (
        <PracticeModal
            accent="violet" icon={<Sparkles size={15} />} eyebrow="Clinical Companions"
            title="Companions Cortex may suggest" onClose={onClose} wide
            // Only the "author your own" form is a DRAFT that outside-click
            // could lose — every curated toggle above it saves the instant
            // it's clicked, so there's nothing there to protect.
            dirty={!!trigger || !!companion || !!reason.trim()}
            footer={<button type="button" className="prac-modal-btn is-primary" onClick={onClose}>Done</button>}
        >
            {/* The lists come FIRST. Rebuilt 2026-08-27: the add-a-pairing
                form used to sit above them, which pushed every configured
                companion below the fold — "there is no any way to see where
                our already made companions are". The header stack was cut
                the same day: an eyebrow, a title, an explanatory sentence
                and a section header over the words "None yet" is four
                headings before any content ("too much text, too much
                cramped up things"). */}
            {authoredEntries.length > 0 && (
                <>
                    <div className="prac-modal-section-title">
                        <span>Yours</span>
                        <span className="prac-section-count">
                            {Math.min(COMPANION_VISIBLE, authoredEntries.length)} of {authoredEntries.length}
                            {authoredEntries.length > COMPANION_VISIBLE ? " · scroll for more" : ""}
                        </span>
                    </div>
                    <div className="prac-modal-rows is-companion-list">
                    {authoredEntries.map((e) => (
                        <div key={`${e.intentId}-${e.companionIntentId}`} className="prac-companion-row">
                            <span className="prac-med-icon is-violet" aria-hidden="true"><Sparkles size={13} /></span>
                            <div className="prac-med-info">
                                <span className="prac-row-label">{e.triggerLabel} → {e.companionLabel}</span>
                                <span className="prac-med-brands">{e.reason || "Your practice"}</span>
                            </div>
                            <RemoveBtn label="Remove this pairing" onClick={() => removeAuthored(e)} />
                        </div>
                    ))}
                    </div>
                </>
            )}

            <div className="prac-modal-section-title">
                <span>Common pairings</span>
                {catalogue.length > 0 && (
                    <span className="prac-section-count">
                        {Math.min(COMPANION_VISIBLE, catalogue.length)} of {catalogue.length}
                        {catalogue.length > COMPANION_VISIBLE ? " · scroll for more" : ""}
                    </span>
                )}
            </div>
            {catalogueLoading ? (
                <SkelRows count={5} />
            ) : (
                <div className="prac-modal-rows is-companion-list">
                    {catalogue.map((edge) => {
                        const key = curatedKey(edge.intentId, edge.companionIntentId);
                        const override = curated.get(key);
                        const on = override ? override.enabled : true;
                        return (
                            <div key={key} className="prac-companion-row">
                                <span className="prac-med-icon is-violet" aria-hidden="true"><Sparkles size={13} /></span>
                                <div className="prac-med-info">
                                    <span className="prac-row-label">{edge.triggerLabel} → {edge.companionLabel}</span>
                                    <span className="prac-med-brands">{on ? "Suggested here" : "Turned off for this practice"}</span>
                                </div>
                                <button
                                    type="button" className="prac-companion-toggle" aria-pressed={on}
                                    title={on ? "Turn off for this practice" : "Turn back on"}
                                    onClick={() => toggleGlobal(edge, on)}
                                >
                                    {on ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="prac-modal-section-title"><span>Add your own</span></div>
            <div className="prac-companion-author">
                {error && <p className="prac-modal-error">{error}</p>}
                <div className="prac-modal-field">
                    <label>When prescribing…</label>
                    {trigger ? (
                        <div className="prac-modal-row">
                            <span className="prac-row-label">{trigger.label}</span>
                            <RemoveBtn label="Change" onClick={() => setTrigger(null)} />
                        </div>
                    ) : (
                        <>
                            <IntentSearchField state={triggerSearch} placeholder="Search a medicine, test, advice…" />
                            {triggerSearch.isSearching && (
                                <div className="prac-modal-rows">
                                    {triggerSearch.hits.map((hit) => (
                                        <button
                                            key={hit.intentId} type="button" className="prac-modal-row is-pick"
                                            onClick={() => { setTrigger({ intentId: hit.intentId, label: hit.label }); triggerSearch.setQuery(""); }}
                                        >
                                            <span className={`prac-term-kind is-${hit.type}`}>{intentTypeLabel(hit.type)}</span>
                                            <span className="prac-row-label">{hit.label}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
                <div className="prac-modal-field">
                    <label>Consider…</label>
                    {companion ? (
                        <div className="prac-modal-row">
                            <span className="prac-row-label">{companion.label}</span>
                            <RemoveBtn label="Change" onClick={() => setCompanion(null)} />
                        </div>
                    ) : (
                        <>
                            <IntentSearchField state={companionSearch} placeholder="Search a medicine, test, advice…" />
                            {companionSearch.isSearching && (
                                <div className="prac-modal-rows">
                                    {companionSearch.hits.map((hit) => (
                                        <button
                                            key={hit.intentId} type="button" className="prac-modal-row is-pick"
                                            onClick={() => { setCompanion({ intentId: hit.intentId, label: hit.label }); companionSearch.setQuery(""); }}
                                        >
                                            <span className={`prac-term-kind is-${hit.type}`}>{intentTypeLabel(hit.type)}</span>
                                            <span className="prac-row-label">{hit.label}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
                <div className="prac-modal-field">
                    <label>Why, shown to the doctor as the reason</label>
                    <input
                        type="text" value={reason} placeholder="e.g. Gastric cover"
                        onChange={(e) => setReason(e.target.value)}
                    />
                </div>
                <button
                    type="button" className="prac-modal-btn is-primary is-compact"
                    disabled={!trigger || !companion || !reason.trim() || busy}
                    onClick={submitAuthored}
                >
                    <Plus size={14} /> Add pairing
                </button>
            </div>
        </PracticeModal>
    );
}

// ===========================================================================
// THE PAGE
// ===========================================================================

export function PracticePage({
    logoRef, onOpenSidebar, specialty, onNavigate,
    preferredLabs, onPreferredLabsChange, measurePrefs, onMeasurePrefsChange,
    templates, onTemplatesChange, observables,
}: Props) {
    const identity = useClinicalIdentity();

    const [brands, setBrands] = useState<ClinicBrandDefaultDetail[]>([]);
    const [brandsLoading, setBrandsLoading] = useState(true);

    const [addedMedicines, setAddedMedicines] = useState<HospitalAddedMedicine[]>([]);
    const [addedMedicinesLoading, setAddedMedicinesLoading] = useState(true);

    const [companions, setCompanions] = useState<HospitalCompanionDetail[]>([]);
    const [companionsLoading, setCompanionsLoading] = useState(true);

    const [terms, setTerms] = useState<DoctorFreeTermDetail[]>([]);
    const [termsLoading, setTermsLoading] = useState(true);
    const [showAllTerms, setShowAllTerms] = useState(false);
    const [newTermType, setNewTermType] = useState<DoctorFreeTermType>("finding");
    const [newTermLabel, setNewTermLabel] = useState("");

    const [labsModalOpen, setLabsModalOpen] = useState(false);
    const [addMedicineOpen, setAddMedicineOpen] = useState<{ initialName: string } | null>(null);
    const [addedMedicinesOpen, setAddedMedicinesOpen] = useState(false);
    const [companionModalOpen, setCompanionModalOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<number | "new" | null>(null);
    const [measurementsModalOpen, setMeasurementsModalOpen] = useState(false);
    const [manageTermsOpen, setManageTermsOpen] = useState(false);

    // Every Practice-local overlay, ORed together — the same job
    // `App.tsx`'s `isAnyModalOpen` does for the consult workspace, scoped to
    // this page's own modals. `PreferredMedicinesCard` gates its Ctrl+K /
    // "/" binding on this so it can't steal focus out of, say, Add New
    // Medicine's brand-name field mid-type.
    const anyModalOpen =
        labsModalOpen || addMedicineOpen != null || addedMedicinesOpen ||
        companionModalOpen || editingTemplate != null || measurementsModalOpen ||
        manageTermsOpen;

    useEffect(() => {
        if (!identity.ready) return;
        setBrandsLoading(true);
        fetchClinicBrandDefaultDetails(identity.hospitalId)
            .then(setBrands)
            .catch(console.error)
            .finally(() => setBrandsLoading(false));

        setAddedMedicinesLoading(true);
        fetchHospitalAddedMedicines(identity.hospitalId)
            .then(setAddedMedicines)
            .catch(console.error)
            .finally(() => setAddedMedicinesLoading(false));

        setCompanionsLoading(true);
        fetchHospitalCompanionDetails(identity.hospitalId)
            .then(setCompanions)
            .catch(console.error)
            .finally(() => setCompanionsLoading(false));

        setTermsLoading(true);
        fetchDoctorFreeTermDetails(identity.doctorId)
            .then(setTerms)
            .catch(console.error)
            .finally(() => setTermsLoading(false));
    }, [identity.ready, identity.doctorId, identity.hospitalId]);

    const forgetTerm = (id: number) => {
        setTerms((curr) => curr.filter((t) => t.id !== id));
        deleteDoctorFreeTerm(id).catch(console.error);
    };

    const addTerm = () => {
        const label = newTermLabel.trim();
        if (!label) return;
        if (terms.some((t) => t.type === newTermType && t.label.toLowerCase() === label.toLowerCase())) {
            setNewTermLabel("");
            return;
        }
        const optimistic: DoctorFreeTermDetail = { id: -Date.now(), label, type: newTermType, useCount: 1 };
        setTerms((curr) => [optimistic, ...curr]);
        setNewTermLabel("");
        saveDoctorFreeTerm({
            doctorId: identity.doctorId, hospitalId: identity.hospitalId,
            label, type: newTermType, signalIds: [], acceptedIntentIds: [],
        })
            .then(() => fetchDoctorFreeTermDetails(identity.doctorId).then(setTerms).catch(() => {}))
            .catch(console.error);
    };

    const shownTerms = showAllTerms ? terms : terms.slice(0, TERM_CHIP_CAP);
    const measureCount = measurePrefs && measurePrefs.length
        ? measurePrefs.filter((k) => (specialty.measurements as string[]).includes(k)).length
        : specialty.measurements.length;

    const reduceMotionForScroll = useReducedMotion();
    /** Every header stat pill is a real jump to the card it summarises, not
     *  a static readout — `id` on `PracticeCard` is the landing target. */
    const scrollToCard = (key: string) => {
        document.getElementById(`prac-card-${key}`)
            ?.scrollIntoView({ block: "center", behavior: reduceMotionForScroll ? "auto" : "smooth" });
    };

    return (
        <div className="prac-page">
            {/* A faint node-diagram/constellation texture, not a blown-up
                logo — see `PracticeCanvasArt`'s own doc comment for why
                the earlier attempt (the AREN mark's letterform at 520px)
                didn't survive being cropped at the corner. Sits behind
                every card (`.prac-body` gets `z-index:1` for exactly
                this). */}
            <PracticeCanvasArt />
            <WorkspaceHeader
                logoRef={logoRef}
                onOpenSidebar={onOpenSidebar}
                title="Practice"
                subtitle="Tune Cortex to the way you practice"
                rightSlot={
                    /* On the DARK bar, not on the page. As a light band it
                       read as an undifferentiated strip of the workspace
                       ("that's not the part of a normal screen"); the header
                       is where a count belongs, and `.ws-stat-pill` is the
                       capsule this header already uses for exactly that.
                       Each pill now carries the SAME glyph as the card it
                       summarises (Pill/FlaskConical/Layers/Sparkles) so the
                       header and the page below read as one vocabulary, not
                       four bare numbers — plus a chevron, since every pill
                       is a real jump to that card, not a static readout. */
                    <>
                        <button type="button" className="ws-stat-pill" onClick={() => scrollToCard("medicines")}>
                            <span className="ws-stat-icon"><Pill size={12} /></span>
                            <span className="ws-stat-text">
                                <span className="ws-stat-value">{brands.length}</span>
                                <span className="ws-stat-label">Medicines</span>
                            </span>
                            <ChevronRight size={12} className="ws-stat-chevron" />
                        </button>
                        <button type="button" className="ws-stat-pill" onClick={() => scrollToCard("labs")}>
                            <span className="ws-stat-icon"><FlaskConical size={12} /></span>
                            <span className="ws-stat-text">
                                <span className="ws-stat-value">{preferredLabs.length}</span>
                                <span className="ws-stat-label">Labs</span>
                            </span>
                            <ChevronRight size={12} className="ws-stat-chevron" />
                        </button>
                        <button type="button" className="ws-stat-pill" onClick={() => scrollToCard("templates")}>
                            <span className="ws-stat-icon"><Layers size={12} /></span>
                            <span className="ws-stat-text">
                                <span className="ws-stat-value">{templates.length}</span>
                                <span className="ws-stat-label">Templates</span>
                            </span>
                            <ChevronRight size={12} className="ws-stat-chevron" />
                        </button>
                        <button type="button" className="ws-stat-pill" onClick={() => scrollToCard("companions")}>
                            <span className="ws-stat-icon"><Sparkles size={12} /></span>
                            <span className="ws-stat-text">
                                <span className="ws-stat-value">{companions.filter((c) => c.enabled).length}</span>
                                <span className="ws-stat-label">Companions</span>
                            </span>
                            <ChevronRight size={12} className="ws-stat-chevron" />
                        </button>
                    </>
                }
            />

            <div className="prac-body">
                {/* Reinstated 2026-08-28 against a literal reference image
                    (a prior round's argument for cutting it — the dark
                    header already carries the page title — held for one
                    round, but the reference is now the explicit source of
                    truth and it draws this heading). Kept to one line + one
                    sub, no counts (those stayed in the header, no repeat). */}
                <div className="prac-group">
                    <div className="prac-group-head">
                        <span className="prac-group-icon" aria-hidden="true"><SlidersHorizontal size={17} /></span>
                        <div className="prac-group-head-text">
                            <h2 className="prac-group-title">Clinical Defaults</h2>
                            <p className="prac-group-sub">What Cortex reaches for first during a consultation.</p>
                        </div>
                        <GroupHeadMark />
                    </div>
                    <div className="prac-grid">
                        <PreferredMedicinesCard
                            hospitalId={identity.hospitalId} brands={brands} brandsLoading={brandsLoading}
                            onBrandsChange={setBrands}
                            onOpenAddNew={(initialName) => setAddMedicineOpen({ initialName })}
                            anyModalOpen={anyModalOpen}
                        />

                        <PracticeCard
                            id="labs"
                            icon={<FlaskConical size={14} />} tone="slate" title="Preferred Labs" count={preferredLabs.length} fixed
                            subtitle="Labs Cortex should suggest first for investigations."
                            action={<button type="button" className="prac-card-add" onClick={() => setLabsModalOpen(true)}><Plus size={12} /> Add lab</button>}
                            foot={preferredLabs.length > 0 ? <FootLink label="View all labs" onClick={() => setLabsModalOpen(true)} /> : undefined}
                        >
                            {!identity.ready ? (
                                <SkelRows count={3} />
                            ) : preferredLabs.length > 0 ? (
                                <div className="prac-fill">
                                    {preferredLabs.length <= 2 && <div className="prac-fill-art"><BlankLabArt /></div>}
                                    {/* Two-line rows (icon + name + a real subtitle), same
                                        shape Templates/Companions already use — a bare
                                        34px name-and-remove line was reading as
                                        "tiny, cramped rows" next to those. */}
                                    <CappedRows
                                        items={preferredLabs} cap={4} rowH={MED_ROW_H} rowClassName="is-medicine"
                                        showAllLabel="Show more" keyOf={(l) => l.id}
                                        renderRow={(l) => (
                                            <>
                                                <span className="prac-med-icon is-slate" aria-hidden="true">
                                                    {l.isDefault
                                                        ? <Star size={13} fill="currentColor" />
                                                        : <FlaskConical size={13} />}
                                                </span>
                                                <div className="prac-med-info">
                                                    <span className="prac-row-label">{l.name}</span>
                                                    <span className="prac-med-brands">
                                                        {l.isDefault ? "Preferred" : l.contactNote || "Diagnostic centre"}
                                                    </span>
                                                </div>
                                                <RemoveBtn label={`Remove ${l.name}`} onClick={() => {
                                                    onPreferredLabsChange(preferredLabs.filter((x) => x.id !== l.id));
                                                    removePreferredLab(l.id).catch(console.error);
                                                }} />
                                            </>
                                        )}
                                    />
                                </div>
                            ) : (
                                <EmptyBlock
                                    art={<BlankLabArt />} fact="No preferred labs yet"
                                    next="Add the centres you actually send patients to. Consult prompts for one when a test is on the plan."
                                    action={<button type="button" className="prac-empty-action" onClick={() => setLabsModalOpen(true)}>+ Add a lab</button>}
                                />
                            )}
                        </PracticeCard>

                        <PracticeCard
                            id="templates"
                            icon={<Layers size={14} />} tone="violet" title="Prescription Templates" count={templates.length} fixed
                            subtitle="Saved prescription setups for quick reuse."
                            action={<button type="button" className="prac-card-add" onClick={() => setEditingTemplate("new")}><Plus size={12} /> New</button>}
                        >
                            {!identity.ready ? (
                                <SkelRows count={3} />
                            ) : templates.length > 0 ? (
                                <div className="prac-fill">
                                    {templates.length <= 3 && <div className="prac-fill-art"><BlankTemplateArt /></div>}
                                    <CappedRows
                                        items={templates} cap={3} rowH={MED_ROW_H} rowClassName="is-medicine"
                                        showAllLabel="View all templates" keyOf={(t) => t.id}
                                        renderRow={(t) => (
                                            <button type="button" className="prac-template-row" onClick={() => setEditingTemplate(t.id)}>
                                                <div className="prac-med-info">
                                                    <span className="prac-row-label">{t.name}</span>
                                                    <span className="prac-med-brands">
                                                        {t.itemCount} item{t.itemCount === 1 ? "" : "s"} · triggers on "{t.triggerLabel}"
                                                    </span>
                                                </div>
                                            </button>
                                        )}
                                    />
                                </div>
                            ) : (
                                <EmptyBlock
                                    art={<BlankTemplateArt />} fact="No templates yet"
                                    next="A name, a trigger word, and the items it pre-selects."
                                    action={<button type="button" className="prac-empty-action" onClick={() => setEditingTemplate("new")}>+ New template</button>}
                                />
                            )}
                        </PracticeCard>
                    </div>

                    <div className="prac-grid">
                        <PracticeCard
                            icon={<Plus size={14} />} tone="teal" title="Add New Medicine" fixed
                            subtitle="Can't find the medicine you need? Add it to our database."
                            action={
                                <button type="button" className="prac-card-manage" onClick={() => setAddedMedicinesOpen(true)}>
                                    View added{addedMedicines.length > 0 ? ` (${addedMedicines.length})` : ""}
                                </button>
                            }
                        >
                            <EmptyBlock
                                art={<BlankAddMedicineArt />}
                                fact="Not in our database yet?"
                                next="Submit its details and we'll review and add it."
                                action={
                                    <button type="button" className="prac-empty-action" onClick={() => setAddMedicineOpen({ initialName: "" })}>
                                        <Plus size={14} /> Add new medicine
                                    </button>
                                }
                            />
                        </PracticeCard>

                        <PracticeCard
                            id="companions"
                            icon={<Sparkles size={14} />} tone="violet" title="Clinical Companions" fixed
                            subtitle="Medicines you commonly consider alongside others."
                            count={companions.filter((c) => c.enabled).length}
                            action={<button type="button" className="prac-card-manage" onClick={() => setCompanionModalOpen(true)}>Manage</button>}
                            foot={companions.length > 0 ? <FootLink label="Manage companions" onClick={() => setCompanionModalOpen(true)} /> : undefined}
                        >
                            {companionsLoading ? (
                                <SkelRows count={3} />
                            ) : companions.length > 0 ? (
                                <div className="prac-fill">
                                    {companions.length <= 2 && <div className="prac-fill-art"><BlankCompanionArt /></div>}
                                    <CappedRows
                                        items={companions} cap={3} rowH={MED_ROW_H} rowClassName="is-medicine"
                                        showAllLabel="View all companions" hideTrigger
                                        keyOf={(c) => `${c.intentId}-${c.companionIntentId}`}
                                        renderRow={(c) => (
                                            <button
                                                type="button" className="prac-template-row"
                                                onClick={() => setCompanionModalOpen(true)}
                                            >
                                                <span className="prac-med-icon is-violet" aria-hidden="true"><Sparkles size={13} /></span>
                                                <div className="prac-med-info">
                                                    <span className="prac-row-label">When prescribing {c.triggerLabel} → consider {c.companionLabel}</span>
                                                    <span className="prac-med-brands">
                                                        {!c.enabled ? "Turned off for this practice" : c.source === "practice_authored" ? "Your practice" : "Common pairing"}
                                                    </span>
                                                </div>
                                            </button>
                                        )}
                                    />
                                </div>
                            ) : (
                                <EmptyBlock
                                    art={<BlankCompanionArt />} fact="No companions configured"
                                    next="Cortex only ever suggests these, never adds them."
                                    action={
                                        <button type="button" className="prac-empty-action" onClick={() => setCompanionModalOpen(true)}>
                                            <Sparkles size={14} /> Set up companions
                                        </button>
                                    }
                                />
                            )}
                        </PracticeCard>

                        <PracticeCard
                            icon={<SlidersHorizontal size={13} />} tone="slate" title="Consultation Defaults" fixed
                            subtitle="How Cortex opens a consultation."
                        >
                            <div className="prac-fill">
                                <div className="prac-fill-art"><BlankConsultDefaultsArt /></div>
                                <div className="prac-setting-list">
                                    <button type="button" className="prac-setting-row" onClick={() => onNavigate("settings")}>
                                        <div className="prac-med-info">
                                            <span className="prac-row-label">Consultation profile</span>
                                            <span className="prac-med-brands">Which chart Cortex opens with</span>
                                            <span className="prac-setting-link">Change profile <ChevronRight size={11} /></span>
                                        </div>
                                        <span className="prac-quiet-pill">{specialty.label}</span>
                                    </button>
                                    <button type="button" className="prac-setting-row" onClick={() => setMeasurementsModalOpen(true)}>
                                        <div className="prac-med-info">
                                            <span className="prac-row-label">Default measurements</span>
                                            <span className="prac-med-brands">Shown when a consult opens</span>
                                            <span className="prac-setting-link">Configure measurements <ChevronRight size={11} /></span>
                                        </div>
                                        <span className="prac-quiet-pill is-alt">{measureCount} of {specialty.measurements.length}</span>
                                    </button>
                                </div>
                            </div>
                        </PracticeCard>
                    </div>
                </div>

                {/* Paired, never full-width. A single card stretched across the
                    whole workspace is what made this read as "a very long and
                    stretched horizontal section"; Related Settings moves up
                    beside it instead of sitting alone underneath. */}
                <div className="prac-grid is-2col">
                    <PracticeCard
                        icon={<BookText size={14} />} tone="violet" title="Your Clinical Terms" count={terms.length} fixed
                        subtitle="Your terms, in your words — Synapse remembers them for next time."
                        foot={terms.length > 0 ? (
                            <FootLink label="Manage clinical terms" onClick={() => setManageTermsOpen(true)} />
                        ) : undefined}
                    >
                        <div className="prac-term-add">
                            <select value={newTermType} onChange={(e) => setNewTermType(e.target.value as DoctorFreeTermType)}>
                                {(Object.keys(TERM_TYPE_LABEL) as DoctorFreeTermType[]).map((t) => (
                                    <option key={t} value={t}>{TERM_TYPE_LABEL[t]}</option>
                                ))}
                            </select>
                            <input
                                type="text" value={newTermLabel} placeholder="Type a term you use often…"
                                onChange={(e) => setNewTermLabel(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") addTerm(); }}
                            />
                            <button type="button" className="prac-term-add-btn" disabled={!newTermLabel.trim()} onClick={addTerm}>
                                <Plus size={14} />
                            </button>
                        </div>
                        {termsLoading ? (
                            <SkelRows count={3} />
                        ) : terms.length > 0 ? (
                            <div className="prac-fill">
                                {terms.length <= 3 && <div className="prac-fill-art"><BlankTermArt /></div>}
                                <div className="prac-term-chips">
                                    {shownTerms.map((t) => (
                                        <span key={t.id} className={`prac-term-chip is-${t.type}`}>
                                            {t.label}
                                            <button type="button" aria-label={`Forget "${t.label}"`} onClick={() => forgetTerm(t.id)}>
                                                <X size={10} />
                                            </button>
                                        </span>
                                    ))}
                                    {terms.length > TERM_CHIP_CAP && !showAllTerms && (
                                        <span className="prac-term-chip is-more">+{terms.length - TERM_CHIP_CAP} more</span>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <EmptyBlock art={<BlankTermArt />} fact="Nothing added yet" next="Add one above, or type it during a consult. Either way it is remembered here." />
                        )}
                    </PracticeCard>

                    <PracticeCard
                        icon={<SlidersHorizontal size={13} />} tone="slate" title="Related Settings" fixed
                        subtitle="Other settings that are often used alongside these."
                    >
                        <div className="prac-settings-grid">
                            <button type="button" className="prac-settings-tile" onClick={() => onNavigate("clinic")}>
                                <span className="prac-settings-icon is-violet"><Settings size={15} /></span>
                                <span className="prac-med-info">
                                    <span className="prac-row-label">Clinic Settings</span>
                                    <span className="prac-med-brands">Manage clinic details</span>
                                </span>
                                <ChevronRight size={13} className="prac-settings-chevron" />
                            </button>
                            <button type="button" className="prac-settings-tile" onClick={() => onNavigate("settings")}>
                                <span className="prac-settings-icon is-blue"><User size={15} /></span>
                                <span className="prac-med-info">
                                    <span className="prac-row-label">Doctor Profile</span>
                                    <span className="prac-med-brands">Manage your profile</span>
                                </span>
                                <ChevronRight size={13} className="prac-settings-chevron" />
                            </button>
                            <button type="button" className="prac-settings-tile" onClick={() => onNavigate("communication")}>
                                <span className="prac-settings-icon is-teal"><MessageCircle size={15} /></span>
                                <span className="prac-med-info">
                                    <span className="prac-row-label">Communication</span>
                                    <span className="prac-med-brands">Patient communication</span>
                                </span>
                                <ChevronRight size={13} className="prac-settings-chevron" />
                            </button>
                            <button type="button" className="prac-settings-tile" onClick={() => onNavigate("settings")}>
                                <span className="prac-settings-icon is-violet"><Shield size={15} /></span>
                                <span className="prac-med-info">
                                    <span className="prac-row-label">Account &amp; Security</span>
                                    <span className="prac-med-brands">Access &amp; security</span>
                                </span>
                                <ChevronRight size={13} className="prac-settings-chevron" />
                            </button>
                            {/* Lives on Clinic, not here — this tile is a doorway, not a
                                promise the customiser itself is built yet ("keep it open
                                for now, but it should redirect to Clinic page, which we
                                are building now", 2026-08-29). */}
                            <button type="button" className="prac-settings-tile" onClick={() => onNavigate("clinic")}>
                                <span className="prac-settings-icon is-teal"><Printer size={15} /></span>
                                <span className="prac-med-info">
                                    <span className="prac-row-label">Prescription Pad</span>
                                    <span className="prac-med-brands">Customise the printed layout</span>
                                </span>
                                <ChevronRight size={13} className="prac-settings-chevron" />
                            </button>
                        </div>
                    </PracticeCard>
                </div>
            </div>

            {labsModalOpen && (
                <LabsModal
                    doctorId={identity.doctorId} hospitalId={identity.hospitalId}
                    labs={preferredLabs} onChange={onPreferredLabsChange}
                    onClose={() => setLabsModalOpen(false)}
                />
            )}
            {addMedicineOpen && (
                <AddMedicineModal
                    hospitalId={identity.hospitalId} userId={identity.userId}
                    initialName={addMedicineOpen.initialName}
                    onClose={() => setAddMedicineOpen(null)}
                    onCreated={(row) => setBrands((curr) => [row, ...curr.filter((b) => b.medicineId !== row.medicineId)])}
                    onMedicineAdded={(m) => setAddedMedicines((curr) => [m, ...curr])}
                />
            )}
            {addedMedicinesOpen && (
                <AddedMedicinesModal
                    rows={addedMedicines} loading={addedMedicinesLoading}
                    onClose={() => setAddedMedicinesOpen(false)}
                />
            )}
            {companionModalOpen && (
                <CompanionsModal
                    hospitalId={identity.hospitalId} doctorId={identity.doctorId}
                    entries={companions} onChange={setCompanions}
                    onClose={() => setCompanionModalOpen(false)}
                />
            )}
            {editingTemplate !== null && (
                <TemplateBuilderModal
                    doctorId={identity.doctorId} hospitalId={identity.hospitalId}
                    templateId={editingTemplate} observables={observables}
                    onClose={() => setEditingTemplate(null)}
                    onSaved={onTemplatesChange}
                />
            )}
            {measurementsModalOpen && (
                <MeasurementsModal
                    doctorId={identity.doctorId}
                    specialtyKeys={specialty.measurements}
                    specialtyLabel={specialty.label}
                    currentPrefs={measurePrefs}
                    onClose={() => setMeasurementsModalOpen(false)}
                    onSaved={onMeasurePrefsChange}
                />
            )}
            {manageTermsOpen && (
                <ManageTermsModal
                    terms={terms}
                    onForget={forgetTerm}
                    onClose={() => setManageTermsOpen(false)}
                />
            )}
        </div>
    );
}
