// ---------------------------------------------------------------------------
// PAST VISIT CARD — one previous consultation, opened from anywhere.
//
// Extracted from `PatientHeader.tsx` on 2026-08-16, unchanged in appearance.
// It lived inside that component as local state and local JSX, which was
// correct while the past-visit chips in the dark header were the ONLY way to
// reach a previous visit.
//
// The longitudinal band added a second way in (its visit timeline), and
// `cortex-longitudinal-spec.md` §3.1 is explicit about what must not happen
// next: "click to expand into the existing per-visit detail view we already
// have. Do not build a second detail view." Two views of one visit is how a
// product ends up with two different accounts of the same consultation.
//
// So the view moved here, the state moved up to `App.tsx`, and both entry
// points open this same component with the same data.
//
// The anchor `x` is where the popup points — the centre of whatever was
// clicked. Callers pass their own, which is why a chip in the header and a row
// in the band can both open it in a sensible place without this component
// knowing either of them exists.
//
// ── Two tones, one card (2026-08-31)
//
// This card is dark because of WHERE it was born: it drops out of the
// consult screen's dark patient header, directly under the chip that opened
// it, so it reads as that header's own surface extending downward. That is
// still exactly right for that entry point and is NOT being changed.
//
// It has since gained a second entry point in a completely different
// context — the Patient Record page's Progress Trend graphs, which are
// light-theme cards on a light page, opening through `TrendDetailModal`
// (also light). A dark slab landing on top of that read as a different
// application, not a detail view — Anmol: "this screen was dark only coz
// when clicking on the past visit shown on dark header... but now is also
// being opened when clicking on graph elements which are obviously in light
// theme."
//
// So `tone` picks the surface, and NOTHING else changes: same component,
// same sections, same data, same order. `"dark"` is the default so the
// consult header keeps its behaviour without any caller opting in; `"light"`
// swaps the palette to the shared light-modal family (`.cs-chartmodal-*`'s
// panel/stripe/scrim values — see `.pv-*.is-light` in past-visit.css) and
// centres the card instead of anchoring it to `x`, because in that context
// it is drilling in from a centred modal rather than dropping out of a chip.
// ---------------------------------------------------------------------------

import { useRef } from "react";
import { Activity, Calendar, Dumbbell, FlaskConical, MapPin, Pill, Quote, Stethoscope, Wrench, X, RefreshCw } from "lucide-react";
import { useOverlayFocus } from "../hooks/useOverlayFocus";
import type { RealVisit } from "../lib/db";
import { freqSlotToLabel } from "../lib/db";
import { FIELD_BY_KEY, type MeasureFieldKey } from "../features/consult/measures";
import { dashText } from "../lib/clinicalText";

/** `--rail-w` (60px, sidebar.css) plus a small gutter — the dark tone's own
 *  left clamp keeps clear of the nav rail's actual footprint rather than
 *  relying on z-index, which the rail deliberately wins (see below). */
const RAIL_CLEARANCE = 76;

export function formatVisitDate(isoString: string): string {
    const d = new Date(isoString);
    const day = d.getDate();
    const month = d.toLocaleString("en-IN", { month: "short" });
    const year = d.getFullYear();
    const thisYear = new Date().getFullYear();
    return year === thisYear ? `${day} ${month}` : `${day} ${month} ${year}`;
}

function buildMedDetail(med: RealVisit["medicines"][0]): string {
    const parts: string[] = [];
    if (med.dosage_mg) parts.push(`${med.dosage_mg}mg`);
    if (med.frequency) parts.push(freqSlotToLabel(med.frequency));
    if (med.duration_days) parts.push(`${med.duration_days}d`);
    return parts.join(" · ");
}

/** A vitals blob with at least one real value — see `visitHasContent` below. */
function hasRecordedVitals(vitals: RealVisit["vitals"]): boolean {
    if (!vitals) return false;
    return Object.values(vitals).some((v) => String(v ?? "").trim() !== "");
}

/**
 * The non-blank entries of a visit's `vitals` blob, labelled off the same
 * `MEASURE_FIELDS` catalogue every input card and the longitudinal band
 * read (rule 19 — one catalogue, not a second hand-written label map). A
 * key no longer in the catalogue (an older build wrote it) still shows,
 * under its own raw key, rather than silently disappearing.
 */
function recordedMeasurements(vitals: RealVisit["vitals"]): { label: string; unit: string; value: string }[] {
    if (!vitals) return [];
    return Object.entries(vitals)
        .map(([key, raw]) => ({ key, value: String(raw ?? "").trim() }))
        .filter((e) => e.value !== "")
        .map((e) => {
            const field = FIELD_BY_KEY.get(e.key as MeasureFieldKey);
            return { label: field?.shortLabel ?? e.key, unit: field?.unit ?? "", value: e.value };
        });
}

/**
 * Does this visit have anything a doctor would actually want to see?
 *
 * Extracted 2026-08-24 so the top past-visits strip, the longitudinal band
 * and this card's own footer all agree on what "empty" means — before this
 * they each checked a different subset (this card checked only symptoms/
 * findings/medicines, which is why a physio visit that was ALL exercises and
 * body sites, or a visit that only carried a measurement reading, still
 * showed this card's "No detailed records found" line despite genuinely
 * having a record).
 */
export function visitHasContent(visit: RealVisit): boolean {
    return (
        !!visit.isStub ||
        (visit.assessments?.length ?? 0) > 0 ||
        (visit.procedures?.length ?? 0) > 0 ||
        visit.symptoms.length > 0 ||
        visit.findings.length > 0 ||
        visit.medicines.length > 0 ||
        (visit.diagnoses != null && visit.diagnoses.length > 0) ||
        (visit.tests != null && visit.tests.length > 0) ||
        visit.body_sites.length > 0 ||
        visit.exercise_names.length > 0 ||
        visit.impairment_names.length > 0 ||
        !!visit.story_mechanism ||
        !!visit.story_duration ||
        hasRecordedVitals(visit.vitals)
    );
}

export function PastVisitCard({
    visit, x, onClose, onRepeatRx, tone = "dark",
}: {
    visit: RealVisit;
    /** viewport x to point at — the centre of whatever opened this. Ignored
     *  by the light tone, which centres instead (see the header). */
    x: number;
    onClose: () => void;
    onRepeatRx?: (visit: RealVisit) => void;
    /** which surface this is landing on — see the header's "Two tones" note */
    tone?: "dark" | "light";
}) {
    const light = tone === "light";
    const panelRef = useRef<HTMLDivElement>(null);

    // Takes focus, and hands it back on close.
    //
    // It did NOT do this while it lived inside PatientHeader, and that was a
    // latent instance of §14.22e: the card is now listed in `isAnyModalOpen`
    // (it never was before, being local state), so the global keyboard handler
    // correctly stands down while it is open — which would leave the keyboard
    // dead entirely if nothing here held focus. Taking focus is what makes
    // Escape below reachable and stops Tab walking into the page behind the
    // scrim.
    useOverlayFocus(panelRef, true);

    // Repeat Rx only ever pre-fills these three (its own footer hint says
    // so) — kept separate from `visitHasContent` below, which is broader and
    // decides whether the card has ANYTHING to show, not whether Repeat Rx
    // specifically applies.
    const hasImportable =
        visit.symptoms.length > 0 ||
        visit.findings.length > 0 ||
        visit.medicines.length > 0;

    const measurements = recordedMeasurements(visit.vitals);

    // ── What this visit was ABOUT, most specific first (2026-09-25) ──────
    // An orthopaedic visit reads by its assessment and what was done
    // ("Fracture - Right knee, displaced", "Cast - Right knee, backslab"),
    // not by the symptom that brought the patient in.
    const assessments = visit.assessments ?? [];
    const procedures = visit.procedures ?? [];
    const done = procedures.filter((p) => p.status === "performed");
    const planned = procedures.filter((p) => p.status === "planned");
    // Found on examination, WITH where ("Joint swelling / effusion - Right
    // knee") when the visit recorded it; the legacy names otherwise.
    const found = visit.sitedFindings?.length ? visit.sitedFindings : visit.findings.map((f) => f.name);
    // A visit without structured assessments keeps its written diagnosis —
    // minus anything that is already one of its own findings or complaints,
    // which the saved text also carries.
    const onRecord = new Set([...visit.symptoms, ...found].map((x) => x.toLowerCase().split(" - ")[0]));
    const diagnosisText = assessments.length ? [] : (visit.diagnoses ?? []).filter((d) => !onRecord.has(d.toLowerCase().split(" - ")[0]));
    const exercises = visit.exercises?.length ? visit.exercises : visit.exercise_names;
    const headline = assessments.length ? assessments[0].short
        : diagnosisText.length ? diagnosisText[0]
            : done.length ? dashText(done[0].text).split(",")[0]
                : null;
    // One diagnosis that IS the headline is not said twice; an assessment
    // with detail ("…, displaced") or several are.
    const dxLines = assessments.length ? assessments.map((a) => a.text) : diagnosisText;
    const showDx = dxLines.length > 1 || (dxLines.length === 1 && dxLines[0] !== headline);
    const dueText = (d: string | null) => d
        ? `Due ${new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
        : "Planned";
    // Sections are separated by a rule, never led by one.
    let sections = 0;
    const rule = () => (sections++ > 0 ? <hr className="pv-divider" /> : null);

    return (
        <div className={`pv-overlay${light ? " is-light" : ""}`} onClick={onClose}>
            <div
                ref={panelRef}
                className={`pv-card cx-kbd-surface${light ? " is-light" : ""}`}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-label="Past consultation"
                onClick={(e) => e.stopPropagation()}
                // `stopPropagation` matters once this can open ON TOP of another
                // overlay (the light tone drills in from `TrendDetailModal`):
                // `ChartSurface` closes on a WINDOW keydown listener, so without
                // this, one Escape would dismiss both this card and the graph
                // modal it was opened from, instead of stepping back one level.
                onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } }}
                // Anchored under whatever chip opened it — dark tone only. The
                // light tone is centred by the overlay's own flex box instead.
                style={light ? undefined : {
                    position: "fixed",
                    top: 90,
                    // The lower clamp used to be a flat 12px — enough room from
                    // the viewport edge, but not from the nav rail (`--rail-w`,
                    // 60px), which sits at z-index 10000 ABOVE every modal on
                    // purpose (sidebar.css: "Above the modals... toasts still
                    // win"). A chip clicked near the left edge clamped this
                    // card's left portion right under the rail's own opaque
                    // surface, clipping the text it covered ("Calpol" reading
                    // as "o...") rather than a z-index fight this card cannot
                    // win. RAIL_CLEARANCE keeps the card entirely to the
                    // rail's right instead.
                    left: Math.min(Math.max(x - 210, RAIL_CLEARANCE), window.innerWidth - 432),
                }}
            >
                <div className="pv-stripe" aria-hidden="true" />
                <div className="pv-orb" aria-hidden="true" />

                <div className="pv-header">
                    <div className="pv-header-left">
                        <div className="pv-icon-wrap"><Calendar size={14} /></div>
                        <div>
                            <p className="pv-eyebrow">Past consultation</p>
                            <h3 className="pv-title">
                                {/* Same priority a physio visit actually reasons in:
                                    a prescription is the headline when there is one,
                                    otherwise whatever this visit's own record is
                                    ABOUT — exercises, a functional limitation,
                                    symptoms, findings — rather than always falling
                                    back to a title that says nothing (see
                                    `visitTypeLabel` in features/patients/visitStatus.ts
                                    for the same ordering, badge-shaped). */}
                                {headline
                                    ? headline
                                    : visit.medicines.length > 0
                                    ? `${visit.medicines.length} medicine${visit.medicines.length > 1 ? "s" : ""} prescribed`
                                    : visit.exercise_names.length > 0
                                        ? `${visit.exercise_names.length} exercise${visit.exercise_names.length > 1 ? "s" : ""} prescribed`
                                        : visit.symptoms.length > 0
                                            ? visit.symptoms[0]
                                            : visit.impairment_names.length > 0
                                                ? visit.impairment_names[0]
                                                : visit.findings.length > 0
                                                    ? visit.findings[0].name
                                                    : "Visit record"}
                            </h3>
                        </div>
                    </div>
                    <button type="button" className="pv-close" onClick={onClose} aria-label="Close">
                        <X size={14} />
                    </button>
                </div>

                <div className="pv-meta">
                    <span className="pv-date-badge">{formatVisitDate(visit.created_at)}</span>
                    {visit.doctor_name && (
                        <span className="pv-doctor">
                            <span className="pv-doctor-dot" />
                            {visit.doctor_name}
                        </span>
                    )}
                </div>

                <div className="pv-body">
                    {showDx && (
                        <div>
                            {rule()}
                            <p className="pv-section-label pv-label-icon">
                                <Stethoscope size={10} /> {assessments.length ? "Assessment" : "Diagnosis"}
                            </p>
                            <div className="pv-rows">
                                {dxLines.map((d, i) => (
                                    <div key={i} className="pv-line is-dx">{d}</div>
                                ))}
                            </div>
                        </div>
                    )}

                    {procedures.length > 0 && (
                        <div>
                            {rule()}
                            <p className="pv-section-label pv-label-icon">
                                <Wrench size={10} /> Procedures
                            </p>
                            <div className="pv-rows">
                                {done.map((p) => (
                                    <div key={p.id} className="pv-line">
                                        <span>{p.text}</span>
                                        <em className="pv-status is-done">{p.removesId ? "Removed" : "Done"}</em>
                                    </div>
                                ))}
                                {planned.map((p) => (
                                    <div key={p.id} className="pv-line">
                                        <span>{p.text}</span>
                                        <em className="pv-status is-planned">{dueText(p.dueDate)}</em>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {visit.tests.length > 0 && (
                        <div>
                            {rule()}
                            <p className="pv-section-label pv-label-icon">
                                <FlaskConical size={10} /> Investigations ordered
                            </p>
                            <div className="pv-chips">
                                {visit.tests.map((t) => (
                                    <span key={t} className="pv-chip">{t}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {(visit.symptoms.length > 0 || found.length > 0) && (
                        <div>
                            {rule()}
                            {visit.symptoms.length > 0 && (
                                <>
                                    <p className="pv-section-label">Reported</p>
                                    <div className="pv-chips">
                                        {visit.symptoms.map((s) => (
                                            <span key={s} className="pv-chip">{s}</span>
                                        ))}
                                    </div>
                                </>
                            )}
                            {found.length > 0 && (
                                <div style={{ marginTop: visit.symptoms.length > 0 ? 10 : 0 }}>
                                    <p className="pv-section-label">On examination</p>
                                    <div className="pv-chips">
                                        {found.map((f) => (
                                            <span key={f} className="pv-chip abnormal">{f}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* The patient's own account — physiotherapy's Story intake
                        (visit_story). Not every specialty records one, so this
                        only shows on the visits that actually have it. */}
                    {(visit.story_mechanism || visit.story_duration) && (
                        <div>
                            {rule()}
                            <p className="pv-section-label pv-label-icon">
                                <Quote size={10} /> Patient&apos;s account
                            </p>
                            {visit.story_duration && (
                                <p className="pv-med-detail" style={{ marginBottom: visit.story_mechanism ? 3 : 0 }}>
                                    Going on {visit.story_duration}
                                </p>
                            )}
                            {visit.story_mechanism && (
                                <p className="pv-med-name" style={{ fontWeight: 500, lineHeight: 1.4 }}>
                                    {visit.story_mechanism}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Body sites marked on the map. Once findings carry their
                        own place the site is already in them, so the bare
                        list only shows for a visit that has no such findings. */}
                    {((visit.body_sites.length > 0 && !visit.sitedFindings?.length) || visit.impairment_names.length > 0) && (
                        <div>
                            {rule()}
                            {visit.body_sites.length > 0 && !visit.sitedFindings?.length && (
                                <div>
                                    <p className="pv-section-label pv-label-icon">
                                        <MapPin size={10} /> Body site
                                    </p>
                                    <div className="pv-chips">
                                        {visit.body_sites.map((s) => (
                                            <span key={s} className="pv-chip">{s}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {visit.impairment_names.length > 0 && (
                                <div style={{ marginTop: visit.body_sites.length > 0 && !visit.sitedFindings?.length ? 10 : 0 }}>
                                    <p className="pv-section-label pv-label-icon">
                                        <Activity size={10} /> Functional limitation
                                    </p>
                                    <div className="pv-chips">
                                        {visit.impairment_names.map((s) => (
                                            <span key={s} className="pv-chip abnormal">{s}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {visit.medicines.length > 0 && (
                        <div>
                            {rule()}
                            <p className="pv-section-label pv-label-icon">
                                <Pill size={10} /> Medicines prescribed
                            </p>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {visit.medicines.map((med, i) => {
                                    const detail = buildMedDetail(med);
                                    return (
                                        <div key={i} className="pv-med-row">
                                            <span className="pv-med-name">{med.name}</span>
                                            {detail && <span className="pv-med-detail">{detail}</span>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {exercises.length > 0 && (
                        <div>
                            {rule()}
                            <p className="pv-section-label pv-label-icon">
                                <Dumbbell size={10} /> Exercises prescribed
                            </p>
                            <div className="pv-rows">
                                {exercises.map((e, i) => (
                                    <div key={`${e}-${i}`} className="pv-line">{e}</div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Every number actually recorded this visit — the same
                        catalogue the longitudinal band trends off, so a
                        reading that shows up in a trend card can always be
                        traced back to the visit it came from here. */}
                    {measurements.length > 0 && (
                        <div>
                            {rule()}
                            <p className="pv-section-label">Measurements recorded</p>
                            <div className="pv-chips">
                                {measurements.map((m) => (
                                    <span key={m.label} className="pv-chip">
                                        {m.label}: {m.value}{m.unit && ` ${m.unit}`}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {!visitHasContent(visit) && (
                        <p className="pv-empty">No detailed records found for this visit.</p>
                    )}
                </div>

                {hasImportable && onRepeatRx && (
                    <div className="pv-footer">
                        <button type="button" className="pv-repeat-btn" onClick={() => onRepeatRx(visit)}>
                            <RefreshCw size={13} />
                            Repeat Rx
                        </button>
                        <span className="pv-repeat-hint">
                            Pre-fills symptoms, medicines &amp; findings
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
