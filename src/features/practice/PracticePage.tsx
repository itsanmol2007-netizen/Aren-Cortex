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
    ArrowDown, ArrowUp, BookText, Check, ChevronDown, FlaskConical, Layers,
    Pill, Plus, SlidersHorizontal, Sparkles, Star, ToggleLeft, ToggleRight, X,
} from "lucide-react";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { useClinicalIdentity } from "../../hooks/useClinicalIdentity";
import {
    addMedicine, addPreferredLab, clearClinicBrandDefault, clearHospitalCompanionCuration,
    createHospitalCompanionEdge, createPrescriptionTemplate, deleteDoctorFreeTerm,
    deleteHospitalCompanionEdge, deletePrescriptionTemplate, duplicatePrescriptionTemplate,
    fetchAuthoredCompanionCatalogue, fetchBrandsForComposition, fetchClinicBrandDefaultDetails,
    fetchDoctorFreeTermDetails, fetchHospitalCompanionDetails, fetchPrescriptionTemplateDetail,
    loadPreferredLabs, loadPrescriptionTemplateSummaries, removePreferredLab,
    replacePrescriptionTemplateItems, reorderPreferredLabs, saveDoctorFreeTerm,
    setClinicBrandDefault, setDefaultPreferredLab, setDoctorMeasurePrefs,
    setHospitalCompanionCuration, updatePrescriptionTemplateMeta,
    type AuthoredCompanionEdgeDetail, type ClinicBrandDefaultDetail, type DoctorFreeTermDetail,
    type DoctorFreeTermType, type HospitalCompanionDetail, type PreferredLab,
    type PrescriptionTemplateSummary,
} from "../../lib/db/synapse";
import type { IntentSearchHit } from "../../lib/db/synapse";
import type { IntentType } from "../../lib/synapse/engine";
import { MEASURE_FIELDS, type MeasureFieldKey } from "../consult/measures";
import {
    BlankAddMedicineArt, BlankCompanionArt, BlankLabArt, BlankMedicineArt, BlankTemplateArt, BlankTermArt,
} from "../consult/BlankArt";
import { IntentSearchField, useIntentSearch } from "../consult/IntentSearch";
import { PinButton } from "../consult/parts";
import { PracticeModal } from "./PracticeModal";
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
    items, cap, rowH = ROW_H, rowClassName, renderRow, keyOf, showAllLabel,
}: {
    items: T[];
    cap: number;
    rowH?: number;
    rowClassName?: string;
    renderRow: (item: T) => ReactNode;
    keyOf: (item: T) => string | number;
    showAllLabel: string;
}) {
    const [showAll, setShowAll] = useState(false);
    const reduce = useReducedMotion();
    const overflowing = items.length > cap;
    // Collapsed is measured exactly (`cap * rowH`). Expanded is deliberately
    // NOT a bigger measured number — it tweens to an arbitrarily large cap
    // (9999) and lets the CARD's own fixed height be what actually bounds
    // it (`.prac-card-body`/`.prac-rows` are `flex:1; min-height:0` in
    // practice.css), so "Show more" reveals the rest by scrolling INSIDE
    // the card's existing footprint — the footprint itself never grows.
    // This replaced an earlier version that grew the box on expand, which
    // was corrected 2026-08-26: a card's outer height must be set by the
    // grid, never by how many rows happen to be in it.
    const EXPANDED_CAP = 9999;

    return (
        <>
            <motion.div
                initial={false}
                animate={{ maxHeight: overflowing && showAll ? EXPANDED_CAP : cap * rowH }}
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 32 }}
                className={"prac-rows" + (overflowing && showAll ? " is-expanded" : "")}
            >
                {items.map((item) => (
                    <div key={keyOf(item)} className={"prac-row" + (rowClassName ? ` ${rowClassName}` : "")}>
                        {renderRow(item)}
                    </div>
                ))}
            </motion.div>
            {overflowing && (
                <button
                    type="button"
                    className="prac-foot-more"
                    onClick={() => setShowAll((v) => !v)}
                >
                    {showAll ? "Show less" : `${showAllLabel} ${items.length}`}
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

// ── The card primitive — every card on the page shares this head/body
//    recipe so it reads as one system, not several. `action` is the
//    optional "Manage" / "+ New" trigger that opens a modal. ─────────────
function PracticeCard({
    icon, tone, title, count, quiet, fixed, action, children,
}: {
    icon: ReactNode;
    tone: "blue" | "teal" | "violet" | "slate";
    title: string;
    count?: number;
    quiet?: boolean;
    /** Gives this card the shared, derived fixed footprint — every
     *  "primary" card in Clinical Defaults except the content-driven
     *  quiet ones (Consultation Defaults). See `.prac-card.is-fixed`. */
    fixed?: boolean;
    action?: ReactNode;
    children: ReactNode;
}) {
    return (
        <section className={"prac-card" + (quiet ? " is-quiet" : "") + (fixed ? " is-fixed" : "")} aria-label={title}>
            <div className="prac-card-head">
                <span className={`prac-glyph is-${tone}`}>{icon}</span>
                <h2 className="prac-card-title">{title}</h2>
                {(count != null || action) && (
                    <div className="prac-card-head-end">
                        {count != null && count > 0 && <span className="prac-count">{count}</span>}
                        {action}
                    </div>
                )}
            </div>
            <div className="prac-card-body">{children}</div>
        </section>
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
    compositionId: number;
    compositionName: string;
    rows: ClinicBrandDefaultDetail[];
}

/** Groups already arrive ordered by `updated_at desc` (the fetch's own
 *  order) — a plain single pass preserves that as "most recently touched
 *  composition first", both across groups and within one. */
function groupByComposition(rows: ClinicBrandDefaultDetail[]): CompositionGroup[] {
    const byId = new Map<number, CompositionGroup>();
    for (const r of rows) {
        const g = byId.get(r.compositionId);
        if (g) g.rows.push(r);
        else byId.set(r.compositionId, { compositionId: r.compositionId, compositionName: r.compositionName, rows: [r] });
    }
    return [...byId.values()];
}

/** One tree row's height, collapsed or a child — same measured 34px as
 *  every other single-line row on this page (`ROW_H`). */
const TREE_ROW_H = ROW_H;

function PreferredMedicinesCard({
    hospitalId, brands, brandsLoading, onBrandsChange, onOpenAddNew,
}: {
    hospitalId: string;
    brands: ClinicBrandDefaultDetail[];
    brandsLoading: boolean;
    onBrandsChange: (next: ClinicBrandDefaultDetail[]) => void;
    /** Opens the Add New Medicine modal with this query pre-filled — the
     *  "not found here either? add it" tail of the search. */
    onOpenAddNew: (initialName: string) => void;
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
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const reduce = useReducedMotion();
    const headerRefs = useRef(new Map<number, HTMLButtonElement>());

    const groups = useMemo(() => groupByComposition(brands), [brands]);

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

    const openDrill = (hit: IntentSearchHit) => {
        if (hit.refId == null) return;
        setDrill({ id: hit.refId, name: hit.label });
        setDrillLoading(true);
        fetchBrandsForComposition(hit.refId).then(setDrillBrands).catch(console.error).finally(() => setDrillLoading(false));
    };

    const togglePreferred = (compositionId: number, compositionName: string, medicineId: number, medicineName: string) => {
        if (isPreferred(compositionId, medicineId)) {
            onBrandsChange(brands.filter((b) => !(b.compositionId === compositionId && b.medicineId === medicineId)));
            clearClinicBrandDefault({ hospitalId, compositionId, medicineId }).catch(console.error);
        } else {
            const optimistic: ClinicBrandDefaultDetail = {
                compositionId, medicineId, medicineName, compositionName,
                form: null, note: null, updatedAt: new Date().toISOString(),
            };
            onBrandsChange([optimistic, ...brands]);
            setExpandedId(compositionId);
            setClinicBrandDefault({ hospitalId, compositionId, medicineId }).catch(console.error);
        }
    };

    return (
        <PracticeCard icon={<Pill size={14} />} tone="teal" title="Preferred Medicines" count={brands.length} fixed>
            <IntentSearchField state={search} placeholder="Search medicine or composition…" />
            {search.isSearching ? (
                <div className="prac-search-results">
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
                                drillBrands.map((b) => {
                                    const pinned = isPreferred(drill.id, b.medicineId);
                                    return (
                                        <div key={b.medicineId} className="prac-modal-row">
                                            <span className="prac-row-label">{b.name}</span>
                                            <PinButton
                                                pinned={pinned} label={b.name}
                                                onToggle={() => togglePreferred(drill.id, drill.name, b.medicineId, b.name)}
                                            />
                                        </div>
                                    );
                                })
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
                        search.hits.map((hit) => (
                            <button
                                key={hit.intentId} type="button" className="prac-modal-row is-pick"
                                onClick={() => openDrill(hit)}
                            >
                                <span className="prac-row-label is-catalogue">{hit.label}</span>
                            </button>
                        ))
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
                                    className="prac-tree-head"
                                    onClick={() => setExpandedId(open ? null : g.compositionId)}
                                >
                                    <ChevronDown size={12} className={open ? "is-flipped" : undefined} />
                                    <span className="prac-row-label is-catalogue">{g.compositionName}</span>
                                    <span className="prac-tree-count">{g.rows.length}</span>
                                </button>
                                <motion.div
                                    initial={false}
                                    animate={{ maxHeight: open ? g.rows.length * TREE_ROW_H : 0 }}
                                    transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 32 }}
                                    className="prac-tree-children"
                                >
                                    {g.rows.map((r) => (
                                        <div key={r.medicineId} className="prac-tree-row">
                                            <span className="prac-row-label">{r.medicineName}</span>
                                            <PinButton
                                                pinned label={r.medicineName}
                                                onToggle={() => togglePreferred(r.compositionId, r.compositionName, r.medicineId, r.medicineName)}
                                            />
                                        </div>
                                    ))}
                                </motion.div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <EmptyBlock
                    art={<BlankMedicineArt />} fact="No preferred medicines yet"
                    next="Search above and mark the concrete brands your practice reaches for — Consult will surface them first."
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
            <button type="button" className="prac-modal-btn is-primary" disabled={!name.trim() || busy} onClick={submitAdd}>
                <Plus size={14} /> Add lab
            </button>

            <div className="prac-modal-section-title">Your labs, in order</div>
            {labs.length === 0 ? (
                <p className="prac-soon">Nothing added yet — the first one becomes your default.</p>
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

function TemplateBuilderModal({
    doctorId, hospitalId, templateId, onClose, onSaved,
}: {
    doctorId: string;
    hospitalId: string;
    templateId: number | "new";
    onClose: () => void;
    onSaved: (templates: PrescriptionTemplateSummary[]) => void;
}) {
    const [loading, setLoading] = useState(templateId !== "new");
    const [name, setName] = useState("");
    const [triggerLabel, setTriggerLabel] = useState("");
    const [items, setItems] = useState<{ intentId: number; type: IntentType; label: string }[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const itemSearch = useIntentSearch(["medicine", "test", "referral", "advice"]);

    useEffect(() => {
        if (templateId === "new") return;
        let cancelled = false;
        fetchPrescriptionTemplateDetail(templateId)
            .then((detail) => {
                if (cancelled || !detail) return;
                setName(detail.name);
                setTriggerLabel(detail.triggerLabel);
                setItems(detail.items.map((i) => ({ intentId: i.intentId, type: i.type, label: i.label })));
            })
            .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [templateId]);

    const addItem = (hit: IntentSearchHit) => {
        if (items.some((i) => i.intentId === hit.intentId)) return;
        const label = hit.matchKind === "brand" && hit.viaLabel ? hit.viaLabel : hit.label;
        setItems((curr) => [...curr, { intentId: hit.intentId, type: hit.type, label }]);
        itemSearch.setQuery("");
    };

    const removeItem = (intentId: number) => setItems((curr) => curr.filter((i) => i.intentId !== intentId));

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
        const payloadItems = items.map((i) => ({ intentId: i.intentId, type: i.type }));
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
                        <label>Trigger word — what you'll type in the case sheet to find it</label>
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
                            Add medicines, investigations, referrals or advice below. Every item still
                            passes the normal safety check when the template is applied — this is a
                            starting point, never a bypass.
                        </p>
                    ) : (
                        <div className="prac-modal-rows">
                            {items.map((it, i) => (
                                <div key={it.intentId} className="prac-modal-row">
                                    <span className={`prac-term-kind is-${it.type}`}>{intentTypeLabel(it.type)}</span>
                                    <span className="prac-row-label">{it.label}</span>
                                    <div className="prac-reorder">
                                        <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp size={12} /></button>
                                        <button type="button" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown size={12} /></button>
                                    </div>
                                    <RemoveBtn label={`Remove ${it.label}`} onClick={() => removeItem(it.intentId)} />
                                </div>
                            ))}
                        </div>
                    )}

                    <IntentSearchField state={itemSearch} placeholder="Add a medicine, test, referral or advice…" />
                    {itemSearch.isSearching && (
                        <div className="prac-modal-rows">
                            {itemSearch.hits.length === 0 ? (
                                <p className="prac-soon">{itemSearch.loading ? "Searching…" : "Nothing matches."}</p>
                            ) : (
                                itemSearch.hits.map((hit) => {
                                    const already = items.some((i) => i.intentId === hit.intentId);
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
    const fields = MEASURE_FIELDS.filter((f) => (specialtyKeys as string[]).includes(f.key));
    const [selected, setSelected] = useState<Set<string>>(
        () => new Set(currentPrefs && currentPrefs.length ? currentPrefs : specialtyKeys)
    );
    const [busy, setBusy] = useState(false);

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
            footer={<button type="button" className="prac-modal-btn is-primary" onClick={save} disabled={busy}>Save</button>}
        >
            <p className="prac-soon">
                On by default for {specialtyLabel}. Uncheck the ones you rarely use — every field
                stays one tap away from "+ Add" in Consult regardless.
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
    hospitalId, doctorId, initialName, onClose, onCreated,
}: {
    hospitalId: string;
    doctorId: string;
    initialName: string;
    onClose: () => void;
    onCreated: (row: ClinicBrandDefaultDetail) => void;
}) {
    const [name, setName] = useState(initialName);
    const [compositions, setCompositions] = useState<CompositionPick[]>([]);
    const [form, setForm] = useState("");
    const [dosage, setDosage] = useState("");
    const [markPreferred, setMarkPreferred] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const compSearch = useIntentSearch(["medicine"]);

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
                if (markPreferred && created) {
                    const primary = compositions[0];
                    return setClinicBrandDefault({
                        hospitalId, compositionId: primary.compositionId, medicineId: created.id, setBy: doctorId,
                    }).then(() => onCreated({
                        compositionId: primary.compositionId,
                        medicineId: created.id,
                        medicineName: created.name,
                        compositionName: primary.label,
                        form: created.form,
                        note: null,
                        updatedAt: new Date().toISOString(),
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
    const [authoring, setAuthoring] = useState(false);
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
                setAuthoring(false); setTrigger(null); setCompanion(null); setReason("");
                triggerSearch.setQuery(""); companionSearch.setQuery("");
            })
            .catch((e) => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => setBusy(false));
    };

    const authoredEntries = entries.filter((e) => e.source === "practice_authored");

    return (
        <PracticeModal
            accent="violet" icon={<Sparkles size={15} />} eyebrow="Clinical Companions"
            title="Configure this practice's companions" onClose={onClose} wide
            footer={<button type="button" className="prac-modal-btn is-primary" onClick={onClose}>Done</button>}
        >
            <p className="prac-soon">
                Companions are suggestions, never automatic — the doctor always chooses whether to
                add one. Turn a common pairing off if this practice never wants it suggested, or add
                your own from things Cortex already knows.
            </p>

            <div className="prac-modal-section-title">Your practice's own pairings ({authoredEntries.length})</div>
            {authoredEntries.length === 0 ? (
                <p className="prac-soon">None yet — add one below.</p>
            ) : (
                <div className="prac-modal-rows">
                    {authoredEntries.map((e) => (
                        <div key={`${e.intentId}-${e.companionIntentId}`} className="prac-modal-row">
                            <span className="prac-row-label">When prescribing {e.triggerLabel} → consider {e.companionLabel}</span>
                            <RemoveBtn label="Remove this pairing" onClick={() => removeAuthored(e)} />
                        </div>
                    ))}
                </div>
            )}

            {authoring ? (
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
                        <label>Why — shown to the doctor as the reason</label>
                        <input
                            type="text" value={reason} placeholder="e.g. Gastric cover"
                            onChange={(e) => setReason(e.target.value)}
                        />
                    </div>
                    <button
                        type="button" className="prac-modal-btn is-primary"
                        disabled={!trigger || !companion || !reason.trim() || busy}
                        onClick={submitAuthored}
                    >
                        <Plus size={14} /> Add pairing
                    </button>
                </div>
            ) : (
                <button type="button" className="prac-modal-back" onClick={() => setAuthoring(true)}>
                    + Author a new pairing
                </button>
            )}

            <div className="prac-modal-section-title">Common pairings — every Cortex clinic</div>
            {catalogueLoading ? (
                <SkelRows count={4} />
            ) : (
                <div className="prac-modal-rows">
                    {catalogue.map((edge) => {
                        const key = curatedKey(edge.intentId, edge.companionIntentId);
                        const override = curated.get(key);
                        const on = override ? override.enabled : true;
                        return (
                            <div key={key} className="prac-modal-row">
                                <span className="prac-row-label">When prescribing {edge.triggerLabel} → consider {edge.companionLabel}</span>
                                <button
                                    type="button" className="prac-companion-toggle" aria-pressed={on}
                                    title={on ? "Turn off for this practice" : "Turn back on"}
                                    onClick={() => toggleGlobal(edge, on)}
                                >
                                    {on ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </PracticeModal>
    );
}

// ===========================================================================
// THE PAGE
// ===========================================================================

export function PracticePage({
    logoRef, onOpenSidebar, specialty, onNavigate,
    preferredLabs, onPreferredLabsChange, measurePrefs, onMeasurePrefsChange,
    templates, onTemplatesChange,
}: Props) {
    const identity = useClinicalIdentity();

    const [brands, setBrands] = useState<ClinicBrandDefaultDetail[]>([]);
    const [brandsLoading, setBrandsLoading] = useState(true);

    const [companions, setCompanions] = useState<HospitalCompanionDetail[]>([]);
    const [companionsLoading, setCompanionsLoading] = useState(true);

    const [terms, setTerms] = useState<DoctorFreeTermDetail[]>([]);
    const [termsLoading, setTermsLoading] = useState(true);
    const [showAllTerms, setShowAllTerms] = useState(false);
    const [newTermType, setNewTermType] = useState<DoctorFreeTermType>("finding");
    const [newTermLabel, setNewTermLabel] = useState("");

    const [labsModalOpen, setLabsModalOpen] = useState(false);
    const [addMedicineOpen, setAddMedicineOpen] = useState<{ initialName: string } | null>(null);
    const [companionModalOpen, setCompanionModalOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<number | "new" | null>(null);
    const [measurementsModalOpen, setMeasurementsModalOpen] = useState(false);

    useEffect(() => {
        if (!identity.ready) return;
        setBrandsLoading(true);
        fetchClinicBrandDefaultDetails(identity.hospitalId)
            .then(setBrands)
            .catch(console.error)
            .finally(() => setBrandsLoading(false));

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

    return (
        <div className="prac-page">
            <WorkspaceHeader
                logoRef={logoRef}
                onOpenSidebar={onOpenSidebar}
                title="Practice"
                subtitle="Tune Cortex to the way you practice"
            />

            <div className="prac-body">
                {/* ── OVERVIEW — a designed intro, not floating prose. The
                    3px rule is the SAME pink→violet→indigo gradient every
                    other surface in this app uses as its signature mark
                    (`.topbar-stripe`, modal stripes, `vp-stripe`) — the
                    "subtle Cortex visual anchor," not a new one invented
                    for this page. Two ideas, never a stats dashboard: one
                    lede sentence, a handful of plain-text counts. */}
                <div className="prac-overview">
                    <div className="prac-overview-mark" aria-hidden="true" />
                    <div className="prac-overview-body">
                        <div className="prac-overview-lede">
                            <span className="prac-overview-eyebrow">Practice workspace</span>
                            <strong>Customize the clinical defaults Cortex uses, and how it opens.</strong>
                            <span className="prac-overview-sub">Everything below is live the next time you start a consultation.</span>
                        </div>
                        <div className="prac-overview-counts">
                            <span><b>{brands.length}</b> preferred medicine{brands.length === 1 ? "" : "s"}</span>
                            <span><b>{preferredLabs.length}</b> preferred lab{preferredLabs.length === 1 ? "" : "s"}</span>
                            <span><b>{templates.length}</b> template{templates.length === 1 ? "" : "s"}</span>
                            <span><b>{companions.filter((c) => c.enabled).length}</b> companion{companions.filter((c) => c.enabled).length === 1 ? "" : "s"}</span>
                        </div>
                    </div>
                </div>

                {/* ── CLINICAL DEFAULTS — what Cortex reaches for first during a
                    consultation. Two rows of three, same `.prac-grid` shape:
                    the practice's concrete preferences, then the surfaces that
                    extend or configure them. */}
                <div className="prac-group">
                    <div className="prac-group-head">
                        <h2 className="prac-group-title">Clinical defaults</h2>
                        <p className="prac-group-sub">What Cortex reaches for first during a consultation.</p>
                    </div>
                    <div className="prac-grid">
                        <PreferredMedicinesCard
                            hospitalId={identity.hospitalId} brands={brands} brandsLoading={brandsLoading}
                            onBrandsChange={setBrands}
                            onOpenAddNew={(initialName) => setAddMedicineOpen({ initialName })}
                        />

                        <PracticeCard
                            icon={<FlaskConical size={14} />} tone="slate" title="Preferred Labs" count={preferredLabs.length} fixed
                            action={<button type="button" className="prac-card-manage" onClick={() => setLabsModalOpen(true)}>Manage</button>}
                        >
                            {!identity.ready ? (
                                <SkelRows count={3} />
                            ) : preferredLabs.length > 0 ? (
                                <CappedRows
                                    items={preferredLabs} cap={4} showAllLabel="Show all" keyOf={(l) => l.id}
                                    renderRow={(l) => (
                                        <>
                                            {l.isDefault && <Star size={12} className="prac-lab-default-mark" fill="currentColor" />}
                                            <span className="prac-row-label">{l.name}</span>
                                            <RemoveBtn label={`Remove ${l.name}`} onClick={() => {
                                                onPreferredLabsChange(preferredLabs.filter((x) => x.id !== l.id));
                                                removePreferredLab(l.id).catch(console.error);
                                            }} />
                                        </>
                                    )}
                                />
                            ) : (
                                <EmptyBlock
                                    art={<BlankLabArt />} fact="No preferred labs yet"
                                    next="Add the diagnostic centres you actually send patients to — Consult will prompt for one whenever a test is on the plan."
                                    action={<button type="button" className="prac-empty-action" onClick={() => setLabsModalOpen(true)}>+ Add a lab</button>}
                                />
                            )}
                        </PracticeCard>

                        <PracticeCard
                            icon={<Layers size={14} />} tone="violet" title="Prescription Templates" count={templates.length} fixed
                            action={<button type="button" className="prac-card-manage" onClick={() => setEditingTemplate("new")}>+ New</button>}
                        >
                            {!identity.ready ? (
                                <SkelRows count={3} />
                            ) : templates.length > 0 ? (
                                <CappedRows
                                    items={templates} cap={4} rowH={MED_ROW_H} rowClassName="is-medicine"
                                    showAllLabel="Show all" keyOf={(t) => t.id}
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
                            ) : (
                                <EmptyBlock
                                    art={<BlankTemplateArt />} fact="No templates yet"
                                    next="Build a reusable starting point — a name, a trigger word, and the items it pre-selects."
                                    action={<button type="button" className="prac-empty-action" onClick={() => setEditingTemplate("new")}>+ New template</button>}
                                />
                            )}
                        </PracticeCard>
                    </div>

                    <div className="prac-grid">
                        <PracticeCard icon={<Plus size={14} />} tone="teal" title="Add New Medicine" fixed>
                            <EmptyBlock
                                art={<BlankAddMedicineArt />}
                                fact="Can't find the medicine you need?"
                                next="Add it to our database — we'll check it isn't already there first."
                                action={<button type="button" className="prac-empty-action" onClick={() => setAddMedicineOpen({ initialName: "" })}>+ Add new medicine</button>}
                            />
                        </PracticeCard>

                        <PracticeCard
                            icon={<Sparkles size={14} />} tone="violet" title="Clinical Companions" fixed
                            count={companions.filter((c) => c.enabled).length}
                            action={<button type="button" className="prac-card-manage" onClick={() => setCompanionModalOpen(true)}>Manage</button>}
                        >
                            {companionsLoading ? (
                                <SkelRows count={3} />
                            ) : companions.length > 0 ? (
                                <CappedRows
                                    items={companions} cap={4} rowH={MED_ROW_H} rowClassName="is-medicine"
                                    showAllLabel="Show all" keyOf={(c) => `${c.intentId}-${c.companionIntentId}`}
                                    renderRow={(c) => (
                                        <>
                                            <span className="prac-med-icon" aria-hidden="true"><Sparkles size={13} /></span>
                                            <div className="prac-med-info">
                                                <span className="prac-row-label">When prescribing {c.triggerLabel} → consider {c.companionLabel}</span>
                                                <span className="prac-med-brands">
                                                    {!c.enabled ? "Turned off for this practice" : c.source === "practice_authored" ? "Your practice" : "Common pairing"}
                                                </span>
                                            </div>
                                        </>
                                    )}
                                />
                            ) : (
                                <EmptyBlock
                                    art={<BlankCompanionArt />} fact="No companions configured"
                                    next="Curate existing pairings or author your own — Consult offers them as suggestions, never automatically."
                                    action={<button type="button" className="prac-empty-action" onClick={() => setCompanionModalOpen(true)}>Manage companions</button>}
                                />
                            )}
                        </PracticeCard>

                        <PracticeCard icon={<SlidersHorizontal size={13} />} tone="slate" title="Consultation Defaults" quiet>
                            <div className="prac-defaults-row">
                                <div className="prac-quiet-row">
                                    <span className="prac-quiet-pill">{specialty.label}</span>
                                    <span className="prac-quiet-sub">Which chart Cortex opens with.</span>
                                    <button type="button" className="prac-quiet-link" onClick={() => onNavigate("settings")}>
                                        Change specialty in Settings →
                                    </button>
                                </div>
                                <div className="prac-quiet-row">
                                    <span className="prac-quiet-pill is-alt">{measureCount} of {specialty.measurements.length}</span>
                                    <span className="prac-quiet-sub">Measurements shown by default.</span>
                                    <button type="button" className="prac-quiet-link" onClick={() => setMeasurementsModalOpen(true)}>
                                        Configure measurements →
                                    </button>
                                </div>
                            </div>
                        </PracticeCard>
                    </div>
                </div>

                {/* ── TIER 3: PRACTICE VOCABULARY ─────────────────────────────── */}
                <div className="prac-group">
                    <div className="prac-group-head">
                        <h2 className="prac-group-title">Practice vocabulary</h2>
                        <p className="prac-group-sub">Your own words, remembered for next time.</p>
                    </div>
                    <PracticeCard icon={<BookText size={14} />} tone="violet" title="Your Clinical Terms" count={terms.length}>
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
                            <>
                                <div className="prac-term-chips">
                                    {shownTerms.map((t) => (
                                        <span key={t.id} className={`prac-term-chip is-${t.type}`}>
                                            {t.label}
                                            <button type="button" aria-label={`Forget "${t.label}"`} onClick={() => forgetTerm(t.id)}>
                                                <X size={10} />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                                {terms.length > TERM_CHIP_CAP && (
                                    <button type="button" className="prac-foot-more" onClick={() => setShowAllTerms((v) => !v)}>
                                        {showAllTerms ? "Show less" : `Show all ${terms.length}`}
                                        <ChevronDown size={12} className={showAllTerms ? "is-flipped" : undefined} />
                                    </button>
                                )}
                            </>
                        ) : (
                            <EmptyBlock art={<BlankTermArt />} fact="Nothing added yet" next="Add a term above, or type one Cortex doesn't have during a consult — it's remembered here either way." />
                        )}
                    </PracticeCard>
                </div>

                {/* ── RELATED SETTINGS — real navigation today, dedicated pages
                    to come. Never a dead card: each of these already exists. */}
                <div className="prac-related">
                    <span className="prac-related-title">Related settings</span>
                    <div className="prac-related-links">
                        <button type="button" onClick={() => onNavigate("clinic")}>Clinic Settings</button>
                        <button type="button" onClick={() => onNavigate("settings")}>Doctor Profile</button>
                        <button type="button" onClick={() => onNavigate("communication")}>Communication</button>
                        <button type="button" onClick={() => onNavigate("settings")}>Account &amp; Security</button>
                    </div>
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
                    hospitalId={identity.hospitalId} doctorId={identity.doctorId}
                    initialName={addMedicineOpen.initialName}
                    onClose={() => setAddMedicineOpen(null)}
                    onCreated={(row) => setBrands((curr) => [row, ...curr.filter((b) => b.medicineId !== row.medicineId)])}
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
                    templateId={editingTemplate}
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
        </div>
    );
}
