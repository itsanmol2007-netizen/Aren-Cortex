import { Check, FlaskConical, Link2, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { dueInDays, formatDue, type InterventionSide } from "../features/consult/interventionPlan";
import { AnatomyFigure, SiteField } from "../features/consult/AnatomyPicker";
import { DetailInput } from "../features/consult/DetailInput";
import {
    composeAssessmentText, pruneDetails, visibleFields, type AssessmentDetails,
} from "../features/consult/assessmentFamilies";
import {
    interventionFamilyFor, reductionOfFor, removableFamilies, removalWhatFor, suggestedSutureDays,
} from "../features/consult/interventionFamilies";
import type { EarlierIntervention } from "../lib/db/interventions";
import { clinicalSiteLabel, sameSite, siteFromLabel, type SiteRef } from "../lib/body/clinicalSite";
import { useOverlayFocus } from "../hooks/useOverlayFocus";

export interface InterventionDraft {
    site: string;
    side: InterventionSide | null;
    notes: string;
    siteRef: SiteRef | null;
    family: string | null;
    details: AssessmentDetails;
    /** the composed line, or "" for an unconfigured modality */
    text: string;
    removesId: string | null;
    assessmentText: string | null;
    status: "performed" | "planned";
    dueDate: string | null;
    fulfilsId: string | null;
}

/** An assessment already placed on the body this visit. */
export interface SiteAssessment {
    site: SiteRef;
    family: string;
    text: string;
}

type Props = {
    label: string;
    /** an explicit site to open on ("Right knee"), when the caller has one */
    initialSite?: string;
    /** every place already established in this visit — assessments, other
     *  interventions, joints marked on the body map (Phase 3) */
    knownSites?: SiteRef[];
    /** take the one known site without asking; off for "+ Another site" */
    autoPrefill?: boolean;
    /** this visit's placed assessments — a reduction at the fractured site
     *  is pre-set to "Fracture", and every line links to what it treats */
    siteAssessments?: SiteAssessment[];
    /** this patient's earlier interventions, for a removal to point at */
    earlier?: EarlierIntervention[];
    /** performing something an earlier visit planned: its values, and the
     *  planned row this fulfils */
    fromPlanned?: { id: string; siteRef: SiteRef | null; details: AssessmentDetails } | null;
    /** open as Planned (a follow-on "Suture removal on day 10") */
    initialStatus?: "performed" | "planned";
    initialDueDays?: number | null;
    initialDetails?: AssessmentDetails;
    onConfirm: (draft: InterventionDraft) => void;
    onCancel: () => void;
};

/**
 * The Perform step between "this intervention is ranked" and "this is on
 * the plan" — same slot in the flow as MedicineAddSheet, same `.cs-addmed`
 * shell and the same teal accent (colour.md: teal is "examined by the
 * doctor", which a procedure they perform is too; there is no eighth colour).
 *
 * Synapse ranked a FAMILY ("Cast"); the configuration happens here, and
 * the fields depend on the family (interventionFamilies.ts): site first,
 * the family's two-to-four main fields, "+ Add details" for the rest, and
 * a live preview of the exact line that prints. A modality with no family
 * (the physiotherapy ones) keeps the plain site + notes form.
 */
export function InterventionInspector({
    label, initialSite = "", knownSites = [], autoPrefill = false,
    siteAssessments = [], earlier = [], fromPlanned = null,
    initialStatus = "performed", initialDueDays = null, initialDetails,
    onConfirm, onCancel,
}: Props) {
    const family = useMemo(() => interventionFamilyFor(label), [label]);

    // Site context: an explicit site wins; else the visit's single known
    // place; two or more become "Which site?" in the field; none leaves the
    // body map. Never invents one.
    const [site, setSite] = useState<SiteRef | null>(() =>
        fromPlanned?.siteRef
        ?? siteFromLabel(initialSite)
        ?? (autoPrefill && knownSites.length === 1 ? knownSites[0] : null));
    const startDetails = { ...(family?.preset ?? {}), ...(initialDetails ?? {}), ...(fromPlanned?.details ?? {}) };
    const [details, setDetails] = useState<AssessmentDetails>(() => startDetails);
    /** fields the doctor set by hand — a site change never overwrites them */
    const touched = useRef(new Set<string>(Object.keys(startDetails)));

    // ── Lifecycle (Phase 5): done today, or planned for later with a due
    // date. Performing a planned one from an earlier visit is always
    // "performed" — that is the point of opening it.
    const [status, setStatus] = useState<"performed" | "planned">(fromPlanned ? "performed" : initialStatus);
    const [dueN, setDueN] = useState<string>(initialDueDays ? String(initialDueDays) : "");
    const [dueUnit, setDueUnit] = useState<"days" | "weeks">("days");
    const dueDate = status === "planned" && Number(dueN) > 0
        ? dueInDays(Number(dueN) * (dueUnit === "weeks" ? 7 : 1)) : null;
    const [showDetails, setShowDetails] = useState(false);
    const [notes, setNotes] = useState("");
    const [removesId, setRemovesId] = useState<string | null>(null);

    // What this can remove: this patient's earlier casts, sutures, splints…
    const removable = useMemo(() => {
        const fams = family ? removableFamilies(family.key) : [];
        return earlier.filter((e) => fams.includes(e.family));
    }, [earlier, family]);
    const linked = removable.find((e) => e.id === removesId) ?? null;

    // The assessment at this site, if any — what this intervention treats.
    const treats = site ? siteAssessments.find((a) => sameSite(a.site, site)) ?? null : null;

    // Values that follow the site until the doctor sets them: suture
    // removal days by region, and a reduction's "Of" from the assessment.
    useEffect(() => {
        if (!family) return;
        setDetails((d) => {
            const next = { ...d };
            if (family.key === "closure" && !touched.current.has("removalDays")) {
                const days = suggestedSutureDays(site);
                if (days) next.removalDays = String(days); else delete next.removalDays;
            }
            if (family.key === "reduction" && !touched.current.has("what")) {
                const of = treats ? reductionOfFor(treats.family) : null;
                if (of) next.what = of; else delete next.what;
            }
            return next;
        });
    }, [site, family, treats]);

    const pickEarlier = (e: EarlierIntervention) => {
        if (removesId === e.id) { setRemovesId(null); return; }
        setRemovesId(e.id);
        if (e.siteRef) setSite(e.siteRef);
        if (family?.key === "removal") {
            const what = removalWhatFor(e.family, e.details);
            if (what) { touched.current.add("what"); setDetails((d) => ({ ...d, what })); }
        }
    };

    const clean = family ? pruneDetails(family, site, details) : {};
    const baseText = family ? composeAssessmentText(label, family, site, clean) : "";
    const text = baseText && linked ? `${baseText}, from ${linked.when}` : baseText;
    const statusNote = status === "planned" ? ` · planned${dueDate ? `, due ${formatDue(dueDate)}` : ""}` : "";

    const draft = (): InterventionDraft => ({
        site: site ? clinicalSiteLabel(site) : "",
        // No separate Left/Right question: the site already carries its side
        // ("Right knee") wherever a side exists, and the spine has none.
        side: null,
        notes: notes.trim(),
        siteRef: site,
        family: family?.key ?? null,
        details: clean,
        text,
        removesId: linked?.id ?? null,
        assessmentText: treats?.text ?? null,
        status,
        dueDate,
        fulfilsId: fromPlanned?.id ?? null,
    });

    const panelRef = useRef<HTMLDivElement>(null);
    useOverlayFocus(panelRef, true);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onCancel();
                return;
            }
            if (e.key === "Enter") {
                const tag = (e.target as HTMLElement).tagName;
                if (tag === "TEXTAREA" || tag === "INPUT") return;
                e.preventDefault();
                onConfirm(draft());
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    });

    const setField = (key: string, v: string | boolean | undefined) => {
        touched.current.add(key);
        setDetails((d) => {
            const next = { ...d };
            if (v === undefined || v === "" || v === false) delete next[key];
            else next[key] = v;
            return next;
        });
    };

    const fields = family ? visibleFields(family, clean, site) : [];
    const mainKeys = new Set(family?.main ?? []);
    const mainFields = fields.filter((f) => mainKeys.has(f.key));
    const extraFields = fields.filter((f) => !mainKeys.has(f.key));

    const notesInput = (
        <section className="cs-addmed-sec">
            <span className="cs-addmed-label">Notes</span>
            <textarea
                className="cs-addmed-input cs-addmed-textarea"
                value={notes}
                placeholder={family ? "Anything else worth recording…" : "Parameters, duration, anything else…"}
                rows={2}
                onChange={(e) => setNotes(e.target.value)}
            />
        </section>
    );

    const whenInput = (
        <section className="cs-addmed-sec">
            <span className="cs-addmed-label">When</span>
            <div className="cs-intv-when">
                <div className="cs-intv-seg" role="radiogroup" aria-label="When">
                    {(["performed", "planned"] as const).map((st) => (
                        <button
                            key={st}
                            type="button"
                            role="radio"
                            aria-checked={status === st}
                            className={status === st ? "is-on" : undefined}
                            disabled={!!fromPlanned && st === "planned"}
                            onClick={() => setStatus(st)}
                        >
                            {st === "performed" ? "Performed today" : "Planned"}
                        </button>
                    ))}
                </div>
                {status === "planned" && (
                    <span className="cs-intv-due">
                        due in
                        <input
                            className="cs-anat-input is-num"
                            value={dueN}
                            inputMode="numeric"
                            placeholder="—"
                            aria-label="Due in"
                            onChange={(e) => setDueN(e.target.value.replace(/[^0-9]/g, ""))}
                        />
                        <span className="cs-intv-seg is-small" role="radiogroup" aria-label="Unit">
                            {(["days", "weeks"] as const).map((u) => (
                                <button
                                    key={u}
                                    type="button"
                                    role="radio"
                                    aria-checked={dueUnit === u}
                                    className={dueUnit === u ? "is-on" : undefined}
                                    onClick={() => setDueUnit(u)}
                                >
                                    {u}
                                </button>
                            ))}
                        </span>
                    </span>
                )}
            </div>
        </section>
    );

    return (
        <div className="cs-addmed" role="dialog" aria-modal="true" aria-label={`Record ${label}`}>
            {/* Not a button: a half-configured cast lost to a stray click
                outside is worse than one press of Cancel. */}
            <div className="cs-addmed-scrim" aria-hidden="true" />
            <div className="cs-addmed-panel cs-addmed-inspector cs-addmed-anat" ref={panelRef} tabIndex={-1}>
                <div className="cs-addmed-topstripe" />

                <div className="cs-addmed-head">
                    <span className="cs-glyph is-teal"><FlaskConical size={16} /></span>
                    <div className="cs-addmed-title">
                        <span className="cs-addmed-eyebrow">Record intervention</span>
                        <strong>{family?.title ?? label}</strong>
                    </div>
                    <button className="cs-addmed-x" type="button" onClick={onCancel} aria-label="Cancel">
                        <X size={16} />
                    </button>
                </div>

                <div className="cs-addmed-body">
                    <div className="cs-anat-layout">
                        <AnatomyFigure value={site} onChange={setSite} known={knownSites} />
                        <div className="cs-anat-side">
                            {removable.length > 0 && (
                                <section className="cs-addmed-sec">
                                    <span className="cs-addmed-label">
                                        {family?.key === "dressingChange" ? "Changing" : "Removing"} <em>pick to link</em>
                                    </span>
                                    <div className="cs-intv-earlier">
                                        {removable.map((e) => (
                                            <button
                                                key={e.id}
                                                type="button"
                                                aria-pressed={removesId === e.id}
                                                className={`cs-intv-earlier-row${removesId === e.id ? " is-on" : ""}`}
                                                onClick={() => pickEarlier(e)}
                                            >
                                                <span className="cs-intv-earlier-mark" aria-hidden="true">
                                                    {removesId === e.id && <Check size={11} />}
                                                </span>
                                                <span className="cs-intv-earlier-text">{e.text}</span>
                                                <em>{e.when}</em>
                                            </button>
                                        ))}
                                    </div>
                                </section>
                            )}

                            <section className="cs-addmed-sec">
                                <span className="cs-addmed-label">Site</span>
                                <SiteField value={site} onChange={setSite} known={knownSites} />
                                {treats && (
                                    <span className="cs-intv-for">
                                        <Link2 size={11} aria-hidden="true" /> For {treats.text}
                                    </span>
                                )}
                            </section>

                            {family ? (
                                <>
                                    {mainFields.length > 0 && (
                                        <section className="cs-addmed-sec cs-dx-details">
                                            {mainFields.map((f) => (
                                                <DetailInput
                                                    key={f.key}
                                                    field={f}
                                                    site={site}
                                                    value={clean[f.key]}
                                                    onChange={(v) => setField(f.key, v)}
                                                />
                                            ))}
                                        </section>
                                    )}
                                    {whenInput}
                                    {showDetails ? (
                                        <>
                                            {extraFields.length > 0 && (
                                                <section className="cs-addmed-sec cs-dx-details">
                                                    <span className="cs-addmed-label">Details <em>optional</em></span>
                                                    {extraFields.map((f) => (
                                                        <DetailInput
                                                            key={f.key}
                                                            field={f}
                                                            site={site}
                                                            value={clean[f.key]}
                                                            onChange={(v) => setField(f.key, v)}
                                                        />
                                                    ))}
                                                </section>
                                            )}
                                            {notesInput}
                                        </>
                                    ) : (
                                        <button type="button" className="cs-dx-adddetails" onClick={() => setShowDetails(true)}>
                                            <Plus size={14} /> {extraFields.length > 0 ? "Add details" : "Add notes"}
                                        </button>
                                    )}
                                </>
                            ) : (
                                <>
                                    {whenInput}
                                    {notesInput}
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {family && (
                    <div className="cs-dx-preview" aria-live="polite">
                        <span>Will read</span>
                        <b>{text}{statusNote && <em>{statusNote}</em>}</b>
                    </div>
                )}

                <div className="cs-addmed-foot">
                    <button className="cs-addmed-cancel" type="button" onClick={onCancel}>
                        Cancel
                    </button>
                    <button className="cs-addmed-confirm" type="button" onClick={() => onConfirm(draft())}>
                        <Check size={15} />
                        {status === "planned" ? "Add as planned" : fromPlanned ? "Mark performed" : "Add to Plan"}
                        <span className="cs-kbd">Enter</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
