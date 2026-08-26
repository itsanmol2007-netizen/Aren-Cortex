// ---------------------------------------------------------------------------
// PRACTICE — "this is where I tune Cortex to the way I practice."
//
// Rebuilt 2026-08-26 as a real configuration workspace (per the "Turn the
// Preview into a Real Workspace" brief) — every card on this page is a
// genuine add/edit/remove/reorder/configure surface, backed by a real table,
// never an informational summary and never a dead-end "not built yet."
//
// ── Three tiers, per the brief's information hierarchy ─────────────────────
//  * CLINICAL DEFAULTS — Pinned Medicines, Preferred Labs, Prescription
//    Templates, Clinic Default Brands. Things that directly influence a
//    consultation's outcome.
//  * CONSULTATION BEHAVIOUR — Consultation Defaults: which chart Cortex
//    opens with, and which measurements are on by default within it.
//  * PRACTICE VOCABULARY — Your Clinical Terms: this doctor's own words,
//    remembered so Cortex can offer them back.
//
// ── What's real, checked against the live schema, not assumed ─────────────
//  * Pinned Medicines      — `doctor_pinned_intent` (same pin RecommendationsCard sets)
//  * Clinic Default Brands — `clinic_brand_preference` (same default BrandSheet sets)
//  * Preferred Labs        — `doctor_preferred_labs` + `diagnostic_orders.lab_name`,
//    the foundation for Consult's own "order from" prompt (PlanCard) — see
//    the `add_doctor_preferred_labs` migration's header for the "Lab Node"
//    framing this is a foundation for, not the whole of.
//  * Prescription Templates — `prescription_templates` / `_items`; applying
//    one in Consult (CaseSheet's search) still runs every item through the
//    normal guarded accept path — see useConsultPlan's `handleApplyTemplate`.
//  * Your Clinical Terms   — `doctor_free_terms`, the same free-text fallback
//    Assessment/Clinical Suggestions remember mid-consult.
//  * Consultation Defaults — chart: `hospitals.specialty_profile` (read-only
//    here, SettingsPage owns the write); measurements:
//    `doctors.preferred_measure_keys`, read AND written here, and the SAME
//    column `App.tsx` reads to build `defaultMeasureKeys` for Consult's own
//    MeasurementsCard — a real default, not a preference that only Practice
//    itself ever looks at.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
    ArrowDown, ArrowUp, BookText, Check, ChevronDown, FlaskConical, Layers,
    PackageCheck, Pill, Plus, SlidersHorizontal, Star, X,
} from "lucide-react";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { useClinicalIdentity } from "../../hooks/useClinicalIdentity";
import {
    addPreferredLab, clearClinicBrandDefault, createPrescriptionTemplate,
    deleteDoctorFreeTerm, deletePrescriptionTemplate, duplicatePrescriptionTemplate,
    fetchBrandsForComposition, fetchClinicBrandDefaultDetails, fetchDoctorFreeTermDetails,
    fetchPinnedMedicineDetails, fetchPrescriptionTemplateDetail, loadPreferredLabs,
    loadPrescriptionTemplateSummaries, removePreferredLab, replacePrescriptionTemplateItems,
    reorderPreferredLabs, saveDoctorFreeTerm, setClinicBrandDefault, setDefaultPreferredLab,
    setDoctorMeasurePrefs, setPinnedIntent, updatePrescriptionTemplateMeta,
    type ClinicBrandDefaultDetail, type DoctorFreeTermDetail, type DoctorFreeTermType,
    type PinnedMedicineDetail, type PreferredLab, type PrescriptionTemplateSummary,
} from "../../lib/db/synapse";
import type { IntentSearchHit } from "../../lib/db/synapse";
import type { IntentType } from "../../lib/synapse/engine";
import { MEASURE_FIELDS, type MeasureFieldKey } from "../consult/measures";
import {
    BlankBrandArt, BlankLabArt, BlankMedicineArt, BlankTemplateArt, BlankTermArt,
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
/** Pinned Medicines' own row is two lines (molecule + real brand names) —
 *  a single shared row height would either clip that second line or
 *  under-cap every OTHER list to match it. Measured against the actual
 *  rendered row (icon tile + two text lines + row padding). */
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

/**
 * One catalogue search hit, offered as something to PIN — not to prescribe.
 * Deliberately NOT `IntentSearchResults` (Consult's own search-hit list):
 * that component checks every hit against a ruleset and a patient's active
 * signals to compute a guard verdict, for an ACTIVE consult. Neither concept
 * exists here (Practice has no patient, no chart, no plan).
 */
function MedicineHitRow({
    hit, isPinned, onTogglePin,
}: {
    hit: IntentSearchHit;
    isPinned: boolean;
    onTogglePin: () => void;
}) {
    const name = hit.matchKind === "brand" && hit.viaLabel ? hit.viaLabel : hit.label;
    const subtitle =
        hit.matchKind === "brand" && hit.viaLabel ? hit.label
            : hit.matchKind === "symptom" && hit.viaLabel ? `Treats ${hit.viaLabel.toLowerCase()}`
                : "Matched by name";

    return (
        <div className={`cs-sug is-hit${isPinned ? " is-added" : ""}`}>
            <span className="cs-sug-icon" aria-hidden="true"><Pill size={13} /></span>
            <div className="cs-sug-main">
                <div className="cs-sug-name"><span>{name}</span></div>
                <span className="cs-sug-rel">{subtitle}</span>
            </div>
            <div className="cs-sug-actions">
                <PinButton pinned={isPinned} label={name} onToggle={onTogglePin} />
            </div>
        </div>
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
    icon, tone, title, count, quiet, action, children,
}: {
    icon: ReactNode;
    tone: "blue" | "teal" | "violet" | "slate";
    title: string;
    count?: number;
    quiet?: boolean;
    action?: ReactNode;
    children: ReactNode;
}) {
    return (
        <section className={"prac-card" + (quiet ? " is-quiet" : "")} aria-label={title}>
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

/** Covers every type a template item or the term-add form can carry.
 *  A function rather than a `Record<IntentType,…>` — the search this page
 *  runs is scoped to four types, so an exhaustive record would carry three
 *  keys (`exercise`, `modality`, `impairment`) nothing here ever produces. */
function intentTypeLabel(type: IntentType): string {
    switch (type) {
        case "medicine": return "Medicine";
        case "test": return "Investigation";
        case "referral": return "Referral";
        case "advice": return "Advice";
        case "finding": return "Condition";
        default: return type;
    }
}

const TERM_CHIP_CAP = 16;

// ===========================================================================
// MODALS — one PracticeModal-shaped body per deeper management surface.
// Kept as sibling components in this file rather than split out: each is a
// short form + a short list, and none is reused outside this page.
// ===========================================================================

function ClinicBrandModal({
    hospitalId, onClose, onSaved,
}: {
    hospitalId: string;
    onClose: () => void;
    onSaved: (row: ClinicBrandDefaultDetail) => void;
}) {
    const search = useIntentSearch(["medicine"]);
    const [composition, setComposition] = useState<{ id: number; name: string } | null>(null);
    const [brands, setBrands] = useState<{ medicineId: number; name: string }[]>([]);
    const [brandsLoading, setBrandsLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const pickComposition = (hit: IntentSearchHit) => {
        if (hit.refId == null) return;
        setComposition({ id: hit.refId, name: hit.label });
        setBrandsLoading(true);
        fetchBrandsForComposition(hit.refId)
            .then(setBrands)
            .catch(console.error)
            .finally(() => setBrandsLoading(false));
    };

    const pickBrand = (medicineId: number, name: string) => {
        if (!composition || saving) return;
        setSaving(true);
        setClinicBrandDefault({ hospitalId, compositionId: composition.id, medicineId })
            .then(() => {
                onSaved({
                    compositionId: composition.id,
                    medicineId,
                    medicineName: name,
                    compositionName: composition.name,
                    form: null,
                    note: null,
                    updatedAt: new Date().toISOString(),
                });
                onClose();
            })
            .catch((e) => { console.error(e); setSaving(false); });
    };

    return (
        <PracticeModal
            accent="blue"
            icon={<PackageCheck size={15} />}
            eyebrow="Clinic Default Brands"
            title={composition ? `Default brand for ${composition.name}` : "Set a clinic default"}
            onClose={onClose}
        >
            {!composition ? (
                <>
                    <p className="prac-soon">
                        Search the molecule your clinic wants a standing brand for — every doctor here will dispense it by default.
                    </p>
                    <IntentSearchField state={search} placeholder="Search a medicine or molecule…" />
                    <div className="prac-modal-rows">
                        {search.isSearching && (
                            search.hits.length === 0 ? (
                                <p className="prac-soon">{search.loading ? "Searching…" : `Nothing matches "${search.query.trim()}"`}</p>
                            ) : (
                                search.hits.map((hit) => (
                                    <button
                                        key={hit.intentId}
                                        type="button"
                                        className="prac-modal-row is-pick"
                                        onClick={() => pickComposition(hit)}
                                    >
                                        <span className="prac-row-label is-catalogue">{hit.label}</span>
                                    </button>
                                ))
                            )
                        )}
                    </div>
                </>
            ) : (
                <>
                    <button type="button" className="prac-modal-back" onClick={() => setComposition(null)}>
                        ← Different molecule
                    </button>
                    <div className="prac-modal-section-title">Choose the clinic's brand</div>
                    <div className="prac-modal-rows">
                        {brandsLoading ? (
                            <SkelRows count={3} />
                        ) : brands.length === 0 ? (
                            <p className="prac-soon">No catalogue brand carries this molecule yet.</p>
                        ) : (
                            brands.map((b) => (
                                <button
                                    key={b.medicineId}
                                    type="button"
                                    className="prac-modal-row is-pick"
                                    disabled={saving}
                                    onClick={() => pickBrand(b.medicineId, b.name)}
                                >
                                    <span className="prac-row-label">{b.name}</span>
                                </button>
                            ))
                        )}
                    </div>
                </>
            )}
        </PracticeModal>
    );
}

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

// ===========================================================================
// THE PAGE
// ===========================================================================

export function PracticePage({
    logoRef, onOpenSidebar, specialty, onNavigate,
    preferredLabs, onPreferredLabsChange, measurePrefs, onMeasurePrefsChange,
    templates, onTemplatesChange,
}: Props) {
    const identity = useClinicalIdentity();

    const [pinned, setPinned] = useState<PinnedMedicineDetail[]>([]);
    const [pinnedLoading, setPinnedLoading] = useState(true);

    const [brands, setBrands] = useState<ClinicBrandDefaultDetail[]>([]);
    const [brandsLoading, setBrandsLoading] = useState(true);

    const [terms, setTerms] = useState<DoctorFreeTermDetail[]>([]);
    const [termsLoading, setTermsLoading] = useState(true);
    const [showAllTerms, setShowAllTerms] = useState(false);
    const [newTermType, setNewTermType] = useState<DoctorFreeTermType>("finding");
    const [newTermLabel, setNewTermLabel] = useState("");

    const [labsModalOpen, setLabsModalOpen] = useState(false);
    const [brandModalOpen, setBrandModalOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<number | "new" | null>(null);
    const [measurementsModalOpen, setMeasurementsModalOpen] = useState(false);

    useEffect(() => {
        if (!identity.ready) return;
        setPinnedLoading(true);
        fetchPinnedMedicineDetails(identity.doctorId)
            .then(setPinned)
            .catch(console.error)
            .finally(() => setPinnedLoading(false));

        setBrandsLoading(true);
        fetchClinicBrandDefaultDetails(identity.hospitalId)
            .then(setBrands)
            .catch(console.error)
            .finally(() => setBrandsLoading(false));

        setTermsLoading(true);
        fetchDoctorFreeTermDetails(identity.doctorId)
            .then(setTerms)
            .catch(console.error)
            .finally(() => setTermsLoading(false));
    }, [identity.ready, identity.doctorId, identity.hospitalId]);

    const unpinMedicine = (intentId: number) => {
        setPinned((curr) => curr.filter((p) => p.intentId !== intentId));
        setPinnedIntent({ doctorId: identity.doctorId, hospitalId: identity.hospitalId, intentId, pinned: false })
            .catch(console.error);
    };

    const medSearch = useIntentSearch(["medicine"]);

    const pinMedicine = (hit: IntentSearchHit) => {
        if (pinned.some((p) => p.intentId === hit.intentId)) return;
        const optimistic: PinnedMedicineDetail = {
            intentId: hit.intentId, label: hit.label, pinnedAt: new Date().toISOString(),
            brandNames: [], brandCount: 0,
        };
        setPinned((curr) => [optimistic, ...curr]);
        medSearch.setQuery("");
        setPinnedIntent({ doctorId: identity.doctorId, hospitalId: identity.hospitalId, intentId: hit.intentId, pinned: true })
            .then(() => fetchPinnedMedicineDetails(identity.doctorId).then(setPinned).catch(() => {}))
            .catch(console.error);
    };

    const clearBrand = (row: ClinicBrandDefaultDetail) => {
        setBrands((curr) => curr.filter((b) => b.medicineId !== row.medicineId));
        clearClinicBrandDefault({ hospitalId: identity.hospitalId, compositionId: row.compositionId, medicineId: row.medicineId })
            .catch(console.error);
    };

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
                            <span><b>{pinned.length}</b> pinned</span>
                            <span><b>{brands.length}</b> brand default{brands.length === 1 ? "" : "s"}</span>
                            <span><b>{preferredLabs.length}</b> lab{preferredLabs.length === 1 ? "" : "s"}</span>
                            <span><b>{templates.length}</b> template{templates.length === 1 ? "" : "s"}</span>
                        </div>
                    </div>
                </div>

                {/* ── TIER 1: CLINICAL DEFAULTS ──────────────────────────────── */}
                <div className="prac-group">
                    <div className="prac-group-head">
                        <h2 className="prac-group-title">Clinical defaults</h2>
                        <p className="prac-group-sub">What Cortex reaches for first during a consultation.</p>
                    </div>
                    <div className="prac-grid is-2col">
                        <PracticeCard icon={<Pill size={14} />} tone="teal" title="Pinned Medicines" count={pinned.length}>
                            <IntentSearchField state={medSearch} placeholder="Search medicine to pin…" />
                            {medSearch.isSearching ? (
                                <div className="prac-search-results">
                                    {medSearch.loading && medSearch.hits.length === 0 ? (
                                        <p className="prac-soon">Searching…</p>
                                    ) : medSearch.hits.length === 0 ? (
                                        <EmptyBlock art={<BlankMedicineArt />} fact={`Nothing matches "${medSearch.query.trim()}"`} next="Try the molecule name or a brand." />
                                    ) : (
                                        medSearch.hits.map((hit) => (
                                            <MedicineHitRow
                                                key={hit.intentId} hit={hit}
                                                isPinned={pinned.some((p) => p.intentId === hit.intentId)}
                                                onTogglePin={() =>
                                                    pinned.some((p) => p.intentId === hit.intentId)
                                                        ? unpinMedicine(hit.intentId)
                                                        : pinMedicine(hit)
                                                }
                                            />
                                        ))
                                    )}
                                </div>
                            ) : pinnedLoading ? (
                                <SkelRows count={3} />
                            ) : pinned.length > 0 ? (
                                <CappedRows
                                    items={pinned} cap={4} rowH={MED_ROW_H} rowClassName="is-medicine"
                                    showAllLabel="Show all" keyOf={(p) => p.intentId}
                                    renderRow={(p) => (
                                        <>
                                            <span className="prac-med-icon" aria-hidden="true"><Pill size={13} /></span>
                                            <div className="prac-med-info">
                                                <span className="prac-row-label is-catalogue">{p.label}</span>
                                                <span className="prac-med-brands">
                                                    {p.brandNames.length > 0
                                                        ? p.brandNames.join(" · ") + (p.brandCount > p.brandNames.length ? ` +${p.brandCount - p.brandNames.length} more` : "")
                                                        : "No catalogue brand yet"}
                                                </span>
                                            </div>
                                            <RemoveBtn label={`Unpin ${p.label}`} onClick={() => unpinMedicine(p.intentId)} />
                                        </>
                                    )}
                                />
                            ) : (
                                <EmptyBlock art={<BlankMedicineArt />} fact="Nothing pinned yet" next="Search above to pin one, or pin it from Consult's Recommendations." />
                            )}
                        </PracticeCard>

                        <PracticeCard
                            icon={<FlaskConical size={14} />} tone="slate" title="Preferred Labs" count={preferredLabs.length}
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
                            icon={<Layers size={14} />} tone="violet" title="Prescription Templates" count={templates.length}
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

                        <PracticeCard
                            icon={<PackageCheck size={14} />} tone="blue" title="Clinic Default Brands" count={brands.length}
                            action={<button type="button" className="prac-card-manage" onClick={() => setBrandModalOpen(true)}>+ Set default</button>}
                        >
                            {brandsLoading ? (
                                <SkelRows count={3} />
                            ) : brands.length > 0 ? (
                                <CappedRows
                                    items={brands} cap={4} showAllLabel="Show all" keyOf={(b) => `${b.compositionId}-${b.medicineId}`}
                                    renderRow={(b) => (
                                        <>
                                            <span className="prac-row-label is-catalogue"><em>{b.compositionName}</em> → {b.medicineName}</span>
                                            <RemoveBtn label={`Remove the clinic default for ${b.compositionName}`} onClick={() => clearBrand(b)} />
                                        </>
                                    )}
                                />
                            ) : (
                                <EmptyBlock
                                    art={<BlankBrandArt />} fact="No clinic default set"
                                    next="Declare one and every doctor here dispenses it by default."
                                    action={<button type="button" className="prac-empty-action" onClick={() => setBrandModalOpen(true)}>+ Set a default</button>}
                                />
                            )}
                        </PracticeCard>
                    </div>
                </div>

                {/* ── TIER 2: CONSULTATION BEHAVIOUR ─────────────────────────── */}
                <div className="prac-group">
                    <div className="prac-group-head">
                        <h2 className="prac-group-title">Consultation behaviour</h2>
                        <p className="prac-group-sub">How Cortex opens and behaves during a visit.</p>
                    </div>
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
            {brandModalOpen && (
                <ClinicBrandModal
                    hospitalId={identity.hospitalId}
                    onClose={() => setBrandModalOpen(false)}
                    onSaved={(row) => setBrands((curr) => [row, ...curr.filter((b) => b.medicineId !== row.medicineId)])}
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
