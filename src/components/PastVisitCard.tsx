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
// ---------------------------------------------------------------------------

import { useRef } from "react";
import { Activity, Calendar, Dumbbell, MapPin, Pill, Quote, X, RefreshCw } from "lucide-react";
import { useOverlayFocus } from "../hooks/useOverlayFocus";
import type { RealVisit } from "../lib/db";
import { freqSlotToLabel } from "../lib/db";
import { doctorName } from "../lib/format";
import { FIELD_BY_KEY, type MeasureFieldKey } from "../features/consult/measures";

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
        visit.symptoms.length > 0 ||
        visit.findings.length > 0 ||
        visit.medicines.length > 0 ||
        visit.body_sites.length > 0 ||
        visit.exercise_names.length > 0 ||
        visit.impairment_names.length > 0 ||
        !!visit.story_mechanism ||
        !!visit.story_duration ||
        hasRecordedVitals(visit.vitals)
    );
}

export function PastVisitCard({
    visit, x, onClose, onRepeatRx,
}: {
    visit: RealVisit;
    /** viewport x to point at — the centre of whatever opened this */
    x: number;
    onClose: () => void;
    onRepeatRx?: (visit: RealVisit) => void;
}) {
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

    return (
        <div className="pv-overlay" onClick={onClose}>
            <div
                ref={panelRef}
                className="pv-card cx-kbd-surface"
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-label="Past consultation"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } }}
                style={{
                    position: "fixed",
                    top: 90,
                    left: Math.min(Math.max(x - 210, 12), window.innerWidth - 432),
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
                                {visit.medicines.length > 0
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
                            {doctorName(visit.doctor_name)}
                        </span>
                    )}
                </div>

                <div className="pv-body">
                    {visit.symptoms.length > 0 && (
                        <div>
                            <p className="pv-section-label">Symptoms noted</p>
                            <div className="pv-chips">
                                {visit.symptoms.map((s) => (
                                    <span key={s} className="pv-chip">{s}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* The patient's own account — physiotherapy's Story intake
                        (visit_story). Not every specialty records one, so this
                        only shows on the visits that actually have it. */}
                    {(visit.story_mechanism || visit.story_duration) && (
                        <>
                            {visit.symptoms.length > 0 && <hr className="pv-divider" />}
                            <div>
                                <p className="pv-section-label" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                    <Quote size={10} style={{ opacity: 0.5 }} />
                                    Patient&apos;s account
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
                        </>
                    )}

                    {visit.findings.length > 0 && (
                        <>
                            <hr className="pv-divider" />
                            <div>
                                <p className="pv-section-label">Clinical findings</p>
                                <div className="pv-chips">
                                    {visit.findings.map((f) => (
                                        <span key={f.name} className={`pv-chip ${f.is_abnormal ? "abnormal" : "normal"}`}>
                                            {f.name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    {/* Body site + functional limitation — physiotherapy's own
                        record of WHERE and WHAT, alongside the generic findings
                        above rather than replacing them. */}
                    {(visit.body_sites.length > 0 || visit.impairment_names.length > 0) && (
                        <>
                            <hr className="pv-divider" />
                            {visit.body_sites.length > 0 && (
                                <div>
                                    <p className="pv-section-label" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                        <MapPin size={10} style={{ opacity: 0.5 }} />
                                        Body site
                                    </p>
                                    <div className="pv-chips">
                                        {visit.body_sites.map((s) => (
                                            <span key={s} className="pv-chip">{s}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {visit.impairment_names.length > 0 && (
                                <div style={{ marginTop: visit.body_sites.length > 0 ? 10 : 0 }}>
                                    <p className="pv-section-label" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                        <Activity size={10} style={{ opacity: 0.5 }} />
                                        Functional limitation
                                    </p>
                                    <div className="pv-chips">
                                        {visit.impairment_names.map((s) => (
                                            <span key={s} className="pv-chip abnormal">{s}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {visit.medicines.length > 0 && (
                        <>
                            <hr className="pv-divider" />
                            <div>
                                <p className="pv-section-label" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                    <Pill size={10} style={{ opacity: 0.5 }} />
                                    Medicines prescribed
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
                        </>
                    )}

                    {visit.exercise_names.length > 0 && (
                        <>
                            <hr className="pv-divider" />
                            <div>
                                <p className="pv-section-label" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                    <Dumbbell size={10} style={{ opacity: 0.5 }} />
                                    Exercises prescribed
                                </p>
                                <div className="pv-chips">
                                    {visit.exercise_names.map((e, i) => (
                                        <span key={`${e}-${i}`} className="pv-chip normal">{e}</span>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    {/* Every number actually recorded this visit — the same
                        catalogue the longitudinal band trends off, so a
                        reading that shows up in a trend card can always be
                        traced back to the visit it came from here. */}
                    {measurements.length > 0 && (
                        <>
                            <hr className="pv-divider" />
                            <div>
                                <p className="pv-section-label">Measurements recorded</p>
                                <div className="pv-chips">
                                    {measurements.map((m) => (
                                        <span key={m.label} className="pv-chip">
                                            {m.label}: {m.value}{m.unit && ` ${m.unit}`}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </>
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
