// ---------------------------------------------------------------------------
// PRACTICE — "how does this doctor practice?"
//
// Rebuilt 2026-08-26 per the Cortex Design DNA (`docs/cortex-design-dna/`):
// a 3-column composition of real surfaces, not a "Heading → giant card"
// sequence, and not a generic settings dashboard. Two ideas run the whole
// page — "customize the clinical defaults Cortex uses" and "customize how
// Cortex works for your practice" — and every card on it is one or the
// other, nothing filed here merely to fill space.
//
// ── What's real, and what isn't (checked against the live schema, not
//    assumed — see each fetch function's own doc comment in
//    lib/db/synapse.ts) ──────────────────────────────────────────────────
//
// REAL, read AND write, from here:
//  * Pinned Medicines — `doctor_pinned_intent`, the SAME pin a doctor sets
//    from RecommendationsCard's heart toggle in Consult.
//  * Clinic Default Brands — `clinic_brand_preference`, the SAME default a
//    doctor sets from BrandSheet's "Make this the clinic default" toggle.
//  * Your Clinical Terms — `doctor_free_terms`, the free-text fallback
//    Assessment/Clinical Suggestions remember when a doctor types something
//    the catalogue doesn't have.
//  * Consultation Defaults — `hospitals.specialty_profile`, read-only here
//    (SettingsPage owns the write; this card is the "convenient navigation
//    path" the design brief asks for, not a second picker).
//
// NOT built — no backing table exists for either, checked live 2026-08-23
// and again this pass. They stay on the page (the brief: "these concepts
// should remain central") in the quiet secondary row, honestly labelled,
// rather than removed or faked with local-only state that looks real and
// evaporates on refresh:
//  * Preferred Labs
//  * Prescription Templates
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
    BookText, ChevronDown, FlaskConical, Layers, PackageCheck, Pill,
    SlidersHorizontal, X,
} from "lucide-react";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { useClinicalIdentity } from "../../hooks/useClinicalIdentity";
import {
    clearClinicBrandDefault, deleteDoctorFreeTerm, fetchClinicBrandDefaultDetails,
    fetchDoctorFreeTermDetails, fetchPinnedMedicineDetails, setPinnedIntent,
    type ClinicBrandDefaultDetail, type DoctorFreeTermDetail, type DoctorFreeTermType,
    type PinnedMedicineDetail,
} from "../../lib/db/synapse";
import { BlankBrandArt, BlankMedicineArt, BlankTermArt } from "../consult/BlankArt";
import { IntentSearchField, useIntentSearch } from "../consult/IntentSearch";
import { PinButton } from "../consult/parts";
import type { IntentSearchHit } from "../../lib/db/synapse";
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
     *  consult as a draft, closes overlays) — Consultation Defaults' "change
     *  in Settings" link is a real navigation, not a second nav concept. */
    onNavigate: (page: SidebarPage) => void;
}

// ── The row-list primitive every real card below shares ────────────────────
// One measured row height per list (never guessed — see progressive-
// disclosure.md), a `cap`, and the SAME capped/expand mechanism Consult's
// ranked panels use: collapsed shows `cap` rows with no scrollbar, "Show
// all" unlocks a bounded, scrolling box. Rows here are single-line and
// truncate rather than wrap, so one constant per list is exact, not a
// worst-case guess.
const ROW_H = 34;
/** Pinned Medicines' own row is two lines (molecule + real brand names,
 *  2026-08-26) — a single shared row height would either clip that second
 *  line or under-cap every OTHER list to match it. Measured against the
 *  actual rendered row (icon tile + two text lines + row padding), the
 *  same "measured, not guessed" rule `ROW_H` itself follows. */
const MED_ROW_H = 54;

function CappedRows<T>({
    items, cap, rowH = ROW_H, rowClassName, renderRow, keyOf, showAllLabel,
}: {
    items: T[];
    cap: number;
    /** Defaults to the shared single-line row height; pass `MED_ROW_H` (or
     *  any other measured constant) for a list whose row shape differs —
     *  see `MED_ROW_H`'s own comment for why one constant can't serve
     *  every list on this page. */
    rowH?: number;
    /** Extra class on each row wrapper, for a list whose rows need their
     *  own layout (Pinned Medicines' icon + two-line block vs. everyone
     *  else's single line). */
    rowClassName?: string;
    renderRow: (item: T) => ReactNode;
    keyOf: (item: T) => string | number;
    showAllLabel: string;
}) {
    const [showAll, setShowAll] = useState(false);
    const reduce = useReducedMotion();
    const overflowing = items.length > cap;
    // Consult's identical mechanism (ConditionsCard/SuggestionsCard) expands
    // to a FIXED `4.5 * ROW_H`, which only reads as "more" because their own
    // cap is 4 (4.5 > 4). Copied verbatim here at first, then caught
    // rendered (verification.md's own rule): with this file's caps of 5/6,
    // a fixed 4.5 rows is SHORTER than the collapsed view, so "Show all"
    // visibly shrank the box before scrolling — the opposite of what the
    // control claims to do. `cap + 0.5` scales with the cap instead, so
    // expanded is always taller (shows every capped row in full, plus half
    // of the next one — the same "stops mid-row on purpose" scroll cue,
    // just anchored to THIS list's own cap rather than a borrowed constant).
    const expandedRows = cap + 0.5;

    return (
        <>
            <motion.div
                initial={false}
                animate={{ maxHeight: overflowing && showAll ? expandedRows * rowH : cap * rowH }}
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
 * that component is built for an ACTIVE consult — it checks every hit
 * against a ruleset and a patient's active signals to compute a guard
 * verdict, and its accept path adds to today's plan. Neither concept
 * exists here (Practice has no patient, no chart, no plan) — a guard
 * check with no signals to check against would be theatre, not safety.
 * What DOES carry over, because it is patient-agnostic by construction:
 * `useIntentSearch`/`IntentSearchField` (the same catalogue search RPC
 * Consult's medicine search runs), and the exact visual language of a
 * searched hit (`.cs-sug.is-hit`, grey/unranked — same classes, same
 * meaning, same reason it's grey: search is honestly not a ranking).
 */
function MedicineHitRow({
    hit, isPinned, onTogglePin,
}: {
    hit: IntentSearchHit;
    isPinned: boolean;
    onTogglePin: () => void;
}) {
    // Brand first when the doctor searched by brand — same rule
    // IntentSearchResults itself follows, for the same reason: they typed
    // "Aceto", showing them "paracetamol" as the answer reads as though
    // the thing they searched for doesn't exist.
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
        <button
            type="button"
            className="prac-row-remove"
            aria-label={label}
            title={label}
            onClick={onClick}
        >
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

function EmptyBlock({ art, fact, next }: { art: ReactNode; fact: string; next: string }) {
    return (
        <div className="prac-empty">
            {art}
            <strong>{fact}</strong>
            <span>{next}</span>
        </div>
    );
}

// ── The card primitive — primary (real, does real work) and quiet
//    (secondary configuration, or honestly not-built-yet) share the same
//    head/body recipe so the page reads as one system, not two. ───────────
function PracticeCard({
    icon, tone, title, count, quiet, children,
}: {
    icon: ReactNode;
    tone: "blue" | "teal" | "violet" | "slate";
    title: string;
    count?: number;
    quiet?: boolean;
    children: ReactNode;
}) {
    return (
        <section className={"prac-card" + (quiet ? " is-quiet" : "")} aria-label={title}>
            <div className="prac-card-head">
                <span className={`prac-glyph is-${tone}`}>{icon}</span>
                <h2 className="prac-card-title">{title}</h2>
                {count != null && count > 0 && <span className="prac-count">{count}</span>}
            </div>
            <div className="prac-card-body">{children}</div>
        </section>
    );
}

const TERM_TYPE_LABEL: Record<DoctorFreeTermType, string> = {
    finding: "Condition", test: "Investigation", referral: "Referral", advice: "Advice",
};

export function PracticePage({ logoRef, onOpenSidebar, specialty, onNavigate }: Props) {
    const identity = useClinicalIdentity();

    const [pinned, setPinned] = useState<PinnedMedicineDetail[]>([]);
    const [pinnedLoading, setPinnedLoading] = useState(true);

    const [brands, setBrands] = useState<ClinicBrandDefaultDetail[]>([]);
    const [brandsLoading, setBrandsLoading] = useState(true);

    const [terms, setTerms] = useState<DoctorFreeTermDetail[]>([]);
    const [termsLoading, setTermsLoading] = useState(true);

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
        // Instant, same as every other undo in this app — the row leaves
        // before the write round-trips, and a failed write costs the doctor
        // a stale row on next visit, never a stuck consult.
        setPinned((curr) => curr.filter((p) => p.intentId !== intentId));
        setPinnedIntent({ doctorId: identity.doctorId, hospitalId: identity.hospitalId, intentId, pinned: false })
            .catch(console.error);
    };

    // The catalogue search that pins — same RPC-backed search Consult's own
    // medicine search runs (see MedicineHitRow's doc comment for why it's
    // NOT IntentSearchResults verbatim). Scoped to "medicine" only.
    const medSearch = useIntentSearch(["medicine"]);

    const pinMedicine = (hit: IntentSearchHit) => {
        // Belt and braces against a double-add: `setPinnedIntent(pinned:true)`
        // upserts on (doctor_id, intent_id) so a second call is harmless
        // either way, but a hit already pinned shows "Pinned" via
        // `isPinned` below and this only ever fires from that same button —
        // toggling it again means UNpin, handled by the branch in
        // `onTogglePin` where this is called.
        if (pinned.some((p) => p.intentId === hit.intentId)) return;
        // Instant, same shape as every other add on this page — the row
        // appears before the write round-trips. Brand names are empty until
        // the background refetch resolves them (see below); a composition
        // with no resolved brands yet reads as "No catalogue brand yet",
        // which is also the honest state for one that genuinely has none —
        // never a lie, just briefly incomplete.
        const optimistic: PinnedMedicineDetail = {
            intentId: hit.intentId,
            label: hit.label,
            pinnedAt: new Date().toISOString(),
            brandNames: [],
            brandCount: 0,
        };
        setPinned((curr) => [optimistic, ...curr]);
        medSearch.setQuery("");
        setPinnedIntent({ doctorId: identity.doctorId, hospitalId: identity.hospitalId, intentId: hit.intentId, pinned: true })
            .then(() =>
                // Refetch in the background so the new row's brand names
                // resolve fully, without making the doctor wait for it —
                // the optimistic row above is already on screen.
                fetchPinnedMedicineDetails(identity.doctorId).then(setPinned).catch(() => {})
            )
            .catch(console.error);
    };

    const clearBrand = (row: ClinicBrandDefaultDetail) => {
        setBrands((curr) => curr.filter((b) => b.medicineId !== row.medicineId));
        clearClinicBrandDefault({
            hospitalId: identity.hospitalId,
            compositionId: row.compositionId,
            medicineId: row.medicineId,
        }).catch(console.error);
    };

    const forgetTerm = (id: number) => {
        setTerms((curr) => curr.filter((t) => t.id !== id));
        deleteDoctorFreeTerm(id).catch(console.error);
    };

    return (
        <div className="prac-page">
            <WorkspaceHeader
                logoRef={logoRef}
                onOpenSidebar={onOpenSidebar}
                title="Practice"
                subtitle="How Cortex works for you — defaults, shortcuts & preferences"
            />

            <div className="prac-body">
                {/* ── PRIMARY: the defaults that actually save time in a consult ── */}
                <div className="prac-grid">
                    <PracticeCard icon={<Pill size={14} />} tone="teal" title="Pinned Medicines"
                        count={pinned.length}>
                        {/* Add a medicine — the same catalogue search Consult
                            runs, integrated here so pinning one doesn't mean
                            leaving Practice to find it in a consult first.
                            See MedicineHitRow's doc comment for what carries
                            over from Consult's own search and what doesn't. */}
                        <IntentSearchField
                            state={medSearch}
                            placeholder="Search medicine to pin…"
                        />
                        {medSearch.isSearching ? (
                            <div className="prac-search-results">
                                {medSearch.loading && medSearch.hits.length === 0 ? (
                                    <p className="prac-soon">Searching…</p>
                                ) : medSearch.hits.length === 0 ? (
                                    <EmptyBlock
                                        art={<BlankMedicineArt />}
                                        fact={`Nothing matches "${medSearch.query.trim()}"`}
                                        next="Try the molecule name or a brand."
                                    />
                                ) : (
                                    medSearch.hits.map((hit) => (
                                        <MedicineHitRow
                                            key={hit.intentId}
                                            hit={hit}
                                            // The dedupe the doctor actually asked for: a
                                            // hit already pinned shows as pinned, not as
                                            // a second "Add" waiting to double it up —
                                            // `setPinnedIntent` upserts either way, but
                                            // the UI should never LOOK like it's offering
                                            // a duplicate.
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
                                items={pinned}
                                cap={5}
                                rowH={MED_ROW_H}
                                rowClassName="is-medicine"
                                showAllLabel="Show all"
                                keyOf={(p) => p.intentId}
                                renderRow={(p) => (
                                    <>
                                        <span className="prac-med-icon" aria-hidden="true"><Pill size={13} /></span>
                                        <div className="prac-med-info">
                                            <span className="prac-row-label is-catalogue">{p.label}</span>
                                            <span className="prac-med-brands">
                                                {p.brandNames.length > 0
                                                    ? p.brandNames.join(" · ") +
                                                      (p.brandCount > p.brandNames.length
                                                          ? ` +${p.brandCount - p.brandNames.length} more`
                                                          : "")
                                                    : "No catalogue brand yet"}
                                            </span>
                                        </div>
                                        <RemoveBtn
                                            label={`Unpin ${p.label}`}
                                            onClick={() => unpinMedicine(p.intentId)}
                                        />
                                    </>
                                )}
                            />
                        ) : (
                            <EmptyBlock
                                art={<BlankMedicineArt />}
                                fact="Nothing pinned yet"
                                next="Search above to pin one, or pin it from Consult's Recommendations."
                            />
                        )}
                    </PracticeCard>

                    <PracticeCard icon={<PackageCheck size={14} />} tone="blue" title="Clinic Default Brands"
                        count={brands.length}>
                        {brandsLoading ? (
                            <SkelRows count={3} />
                        ) : brands.length > 0 ? (
                            <CappedRows
                                items={brands}
                                cap={5}
                                showAllLabel="Show all"
                                keyOf={(b) => `${b.compositionId}-${b.medicineId}`}
                                renderRow={(b) => (
                                    <>
                                        <span className="prac-row-label is-catalogue">
                                            <em>{b.compositionName}</em> → {b.medicineName}
                                        </span>
                                        <RemoveBtn
                                            label={`Remove the clinic default for ${b.compositionName}`}
                                            onClick={() => clearBrand(b)}
                                        />
                                    </>
                                )}
                            />
                        ) : (
                            <EmptyBlock
                                art={<BlankBrandArt />}
                                fact="No clinic default set"
                                next="Declare one from “Change brand” in Consult and every doctor here dispenses it by default."
                            />
                        )}
                    </PracticeCard>

                    <PracticeCard icon={<BookText size={14} />} tone="violet" title="Your Clinical Terms"
                        count={terms.length}>
                        {termsLoading ? (
                            <SkelRows count={3} />
                        ) : terms.length > 0 ? (
                            <CappedRows
                                items={terms}
                                cap={6}
                                showAllLabel="Show all"
                                keyOf={(t) => t.id}
                                renderRow={(t) => (
                                    <>
                                        <span className={`prac-term-kind is-${t.type}`}>
                                            {TERM_TYPE_LABEL[t.type]}
                                        </span>
                                        <span className="prac-row-label">{t.label}</span>
                                        <RemoveBtn label={`Forget "${t.label}"`} onClick={() => forgetTerm(t.id)} />
                                    </>
                                )}
                            />
                        ) : (
                            <EmptyBlock
                                art={<BlankTermArt />}
                                fact="Nothing added yet"
                                next="Type a term Cortex doesn't have during a consult, and it's remembered here."
                            />
                        )}
                    </PracticeCard>
                </div>

                {/* ── SECONDARY: related, quieter, still real (or honestly not) ── */}
                <div className="prac-grid">
                    <PracticeCard icon={<SlidersHorizontal size={13} />} tone="slate"
                        title="Consultation Defaults" quiet>
                        <div className="prac-quiet-row">
                            <span className="prac-quiet-pill">{specialty.label}</span>
                            <span className="prac-quiet-sub">
                                Which chart, measurements and outputs Cortex opens with.
                            </span>
                        </div>
                        <button type="button" className="prac-quiet-link" onClick={() => onNavigate("settings")}>
                            Change in Settings →
                        </button>
                    </PracticeCard>

                    <PracticeCard icon={<FlaskConical size={13} />} tone="slate" title="Preferred Labs" quiet>
                        <p className="prac-soon">
                            Not built yet — a shortlist of labs you order most, ready before you search.
                        </p>
                    </PracticeCard>

                    <PracticeCard icon={<Layers size={13} />} tone="slate" title="Prescription Templates" quiet>
                        <p className="prac-soon">
                            Not built yet — a saved combination you reuse, applied to the plan in one move.
                        </p>
                    </PracticeCard>
                </div>
            </div>
        </div>
    );
}
