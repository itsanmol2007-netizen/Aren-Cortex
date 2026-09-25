// ---------------------------------------------------------------------------
// JOINT MAP — where on the patient, AND what's wrong with it, as chips.
//
// Built 2026-08-17, copied from `BodyMapCard.tsx` on purpose rather than
// branched inside it — the standing rule (`GeneralOpdInputs.tsx`'s own
// header, applied here to a smaller pair of files) is copy the day a screen
// genuinely diverges, and this one does. `BodyMapCard` marks a skin site for
// a description a dermatologist writes in their own words; free text IS the
// right tool there, because a lesion's appearance is not in the chip
// catalogue. A physiotherapist marking a joint is doing something the
// catalogue already has words for — "Knee pain", "Restricted range of
// motion" — and Anmol's complaint was exactly this: "if you add [a] manual
// comment, how will Synapse know what to do with it and what to rank?
// There is no any chips." Free text there was silently answering "never."
//
// So this card's panel is chips FIRST, wired to the exact same
// `onObservableToggle` the Case Sheet uses — clicking "Shoulder pain" here
// is indistinguishable to Synapse from typing it in search. Free text stays,
// same field the derm card has, but last, for what a chip cannot capture —
// doctrine's own standing rule, restated for a body part instead of a note.
//
// ── Side is recorded, not ranked
//
// Anmol confirmed (2026-08-17): laterality should stay exactly where it is
// everywhere else in this product today — nowhere in Synapse. No observable
// in the catalogue distinguishes "Right knee pain" from "Left knee pain",
// and inventing that distinction for physiotherapy alone, while every other
// specialty's chips stay side-agnostic, would be a new axis this one screen
// invented rather than a rule the product already has. So a chip toggle
// carries no side. The site itself is still recorded, once, with its side
// (2026-09-26: automatically, the moment anything is recorded there; the
// old "Mark site" button inserted a duplicate row) — into the same
// `visit_body_sites` row the
// dermatology card writes, now with physio's joints added to the region
// list (2026-08-17 migration) — because a physio's OWN note, and a future
// reader of the chart, still needs to know it was the right knee. That is
// the record/rank boundary this file draws: chips rank, the site row
// records.
//
// ── Geometry: every major peripheral joint, as of 2026-08-17b
//
// `lib/body/anatomy.ts`'s figure was authored for dermatology's fourteen
// skin regions, and the first cut of this card could therefore only offer a
// specific pain chip for the five that happened to line up — neck,
// shoulder, knee, and the two spine regions. Elbow, wrist, hip and ankle
// are now real zones in that figure (carved out of the segments that
// already covered them, outline unchanged), so all nine joint-pain
// observables in the catalogue are reachable by pointing at them.
//
// Every zone still offers the GENERIC finding chips — restricted ROM,
// swelling, stiffness, instability — regardless of whether it has a
// specific pain chip, because those four are not joint-specific and a zone
// with no chips at all would read as broken.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPin, PersonStanding, Loader2, Trash2, X, Maximize2 } from "lucide-react";
import { ChartSurface } from "./ChartSurface";
import { listBodySites, addBodySite, deleteBodySite, updateBodySiteNote } from "../../lib/db/bodySites";
import type { BodySiteFinding } from "../../lib/db/bodySites";
import { searchIntents, type IntentSearchHit } from "../../lib/db/synapse";
import type { AssessmentLine } from "./assessmentPlan";
import { familyFor, siteAllowed, type AssessmentDetails } from "./assessmentFamilies";
import type { AcceptPayload } from "./types";
import type { SiteAssessmentApi } from "./JointFindingField";
import { BODY_ZONES, FIGURE_VIEWBOX, regionLabel, siteLabel } from "../../lib/body/anatomy";
import type { BodyAspect, BodyRegion, BodySide } from "../../lib/body/anatomy";
import type { Observable } from "../../lib/db/synapse";
import type { CaseSheetEntry } from "./CaseSheet";
import { clinicalSiteLabel, isMidline, normalizeSite, sameSite, siteKey, type SiteRef } from "../../lib/body/clinicalSite";
import { regionChips } from "./regionFindings";
import { JointFindingField } from "./JointFindingField";
import { NeurovascularCheck, NV_CHECKS, NV_REGIONS, nvKey } from "./NeurovascularCheck";
import { RegionExam, examCounts } from "./ExaminationCard";
import { REGION_BY_KEY } from "./examination";
import type { ExaminationHook } from "../../hooks/useExamination";

/**
 * Which specific pain chip a zone offers — `null` where the catalogue has no
 * observable that means exactly that.
 *
 * ── It takes the ASPECT, and that is not decoration
 *
 * The first cut of this file keyed on region alone and was WRONG on two of
 * them: `torso_upper` is "Chest" from the front and "Upper back" from
 * behind, `torso_lower` is "Abdomen" and "Lower back". Offering "Upper back
 * pain" to a doctor who clicked a patient's chest is exactly the confident
 * wrong answer the trend module's header warns about, one layer up — so the
 * two torso regions answer only on the back view, and the front view falls
 * through to the generic chips. Every limb region means the same thing from
 * either side and ignores the argument.
 *
 * `hand` and `foot` deliberately share their neighbouring joint's chip:
 * the catalogue's observables are "Wrist / hand pain" and "Ankle / foot
 * pain", one each, so the wrist and the hand genuinely are one chip.
 */
function jointPainChip(region: BodyRegion, aspect: BodyAspect): string | null {
    switch (region) {
        case "neck": return "Neck pain";
        case "shoulder": return "Shoulder pain";
        case "elbow": return "Elbow pain";
        case "wrist":
        case "hand": return "Wrist / hand pain";
        case "hip": return "Hip pain";
        case "knee": return "Knee pain";
        case "ankle":
        case "foot": return "Ankle / foot pain";
        // Back only — see above.
        case "torso_upper": return aspect === "back" ? "Upper back pain" : null;
        case "torso_lower": return aspect === "back" ? "Low back pain" : null;
        default: return null;
    }
}


interface Props {
    visitId: string | null;
    doctorId?: string | null;
    observables: Observable[];
    caseSheetEntries: CaseSheetEntry[];
    onObservableToggle: (o: Observable) => void;
    /**
     * A local finding clicked here is found HERE: "Joint swelling / effusion"
     * on the right knee's panel is the right knee's swelling (sited findings,
     * 2026-09-25). Optional; without it every chip toggles bare, as before.
     */
    onObservableToggleAt?: (o: Observable, site: SiteRef) => void;
    presentation?: "card" | "modal";
    open?: boolean;
    onClose?: () => void;
    /**
     * The examination, recorded HERE (2026-08-20).
     *
     * Optional, so dermatology-style callers get the map alone. When it is
     * passed and the selected zone has an entry in `EXAM_REGIONS`, the whole
     * range / strength / special-test surface renders inside the panel for
     * that joint — which is the point of brief §5 and §6: an examination is
     * something done to a site, so the site is the context, and a knee flexion
     * of 95 degrees can never again be recorded without saying which knee.
     */
    examination?: ExaminationHook;
    /**
     * Assessments made at a site from its panel (2026-09-26): the body map
     * can do what the command bar and the Assessment card do. Optional; a
     * caller without them gets findings and examination only.
     */
    assessmentLines?: AssessmentLine[];
    onAddAssessmentAt?: (payload: AcceptPayload, site: SiteRef) => string | null;
    onAssessmentDetails?: (id: string, details: AssessmentDetails) => void;
    /** takes the line's text, as the Assessment card's own remove does */
    onRemoveAssessment?: (text: string) => void;
    /** the catalogue search; injectable for tests, `searchIntents` otherwise */
    searchAssessments?: (query: string) => Promise<IntentSearchHit[]>;
    disabled?: boolean;
}

const searchFindingIntents = (query: string) =>
    searchIntents({ query, types: ["finding"], limit: 24 }).then((r) => r.hits);

interface Selection {
    region: BodyRegion;
    side: BodySide | null;
}

export function JointMapCard({
    visitId, doctorId, observables, caseSheetEntries, onObservableToggle, onObservableToggleAt,
    presentation = "card", open = false, onClose, examination, disabled = false,
    assessmentLines, onAddAssessmentAt, onAssessmentDetails, onRemoveAssessment,
    searchAssessments = searchFindingIntents,
}: Props) {
    const [items, setItems] = useState<BodySiteFinding[]>([]);
    const [aspect, setAspect] = useState<BodyAspect>("front");
    const [sel, setSel] = useState<Selection | null>(null);
    const [note, setNote] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState(false);
    /** sites whose auto-mark insert is in flight or done — see the effect below */
    const autoMarking = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!visitId) { setItems([]); setSel(null); return; }
        let cancelled = false;
        listBodySites(visitId)
            .then((rows) => { if (!cancelled) setItems(rows); })
            .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
        return () => { cancelled = true; };
    }, [visitId]);

    useEffect(() => { setSel(null); }, [aspect]);

    const byLabel = useMemo(() => {
        const m = new Map<string, Observable>();
        for (const o of observables) m.set(o.label, o);
        return m;
    }, [observables]);

    const onChart = useMemo(
        () => new Set(caseSheetEntries.map((e) => e.label)),
        [caseSheetEntries]
    );
    const sitesByLabel = useMemo(
        () => new Map(caseSheetEntries.map((e) => [e.label, e.sites ?? []] as const)),
        [caseSheetEntries]
    );
    const selSite: SiteRef | null = sel ? normalizeSite({ region: sel.region, side: sel.side, aspect }) : null;
    /** A local finding is lit on the zone it was found at, not on every zone. */
    const litHere = (o: Observable) =>
        o.localizable && onObservableToggleAt && selSite
            ? (sitesByLabel.get(o.label) ?? []).some((s) => sameSite(s, selSite))
            : onChart.has(o.label);

    /** Where else a local finding already is — "at Right knee", "no place yet". */
    const awayNote = (o: Observable): string | null => {
        if (!o.localizable || !onObservableToggleAt || !onChart.has(o.label)) return null;
        const at = sitesByLabel.get(o.label) ?? [];
        if (!at.length) return "no place yet";
        return `at ${clinicalSiteLabel(at[0])}${at.length > 1 ? ` +${at.length - 1}` : ""}`;
    };


    /**
     * The chips for the selected zone (Step 3, 2026-09-25): its own pain
     * chip, then what is examined at that KIND of place (`regionFindings.ts`)
     * — split by the observable's own kind into what the patient reports and
     * what is found, the Case Sheet's two groups. `byLabel.get` misses a
     * label not in the catalogue and it is skipped, never thrown: content
     * can lag code and must never crash the consult.
     */
    const panelChips = useMemo(() => {
        if (!sel) return null;
        const specific = jointPainChip(sel.region, aspect);
        const { primary, more } = regionChips(sel.region, aspect);
        const pick = (labels: string[]) =>
            labels.map((l) => byLabel.get(l)).filter((o): o is Observable => !!o);
        return pick([...(specific ? [specific] : []), ...primary, ...more]);
    }, [sel, aspect, byLabel]);

    /** Every other local finding, reached by typing in the panel's field. */
    const localCatalogue = useMemo(() => observables.filter((o) => o.localizable), [observables]);

    // Stable per site, so the field's search does not re-run on every render.
    const selKey = selSite ? siteKey(selSite) : null;
    /** The assessments made at the selected site. */
    const dxHere = useMemo(
        () => (selSite && assessmentLines ? assessmentLines.filter((l) => l.site && sameSite(l.site, selSite)) : []),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [assessmentLines, selKey],
    );
    const findDx = useCallback(async (q: string) => {
        if (!selSite) return [];
        const hits = await searchAssessments(q);
        // Only what can sit HERE: a meniscal tear is offered at a knee, not
        // at a wrist; "Knee osteoarthritis" not at a hip.
        return hits.filter((h) => {
            const f = familyFor(h.label);
            return !!f && siteAllowed(f, selSite);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selKey, searchAssessments]);

    const assessmentApi: SiteAssessmentApi | undefined = selSite && onAddAssessmentAt && onAssessmentDetails && onRemoveAssessment
        ? {
            recorded: dxHere,
            find: findDx,
            onAdd: (h) => onAddAssessmentAt({
                intentId: h.intentId, type: h.type, label: h.label, refTable: h.refTable, refId: h.refId,
                medicine: null, viaSearch: true, overridden: false,
            }, selSite),
            onDetails: onAssessmentDetails,
            onRemove: (l) => onRemoveAssessment(l.text),
        }
        : undefined;

    const hereCount = dxHere.length + (!panelChips ? 0
        : [...panelChips, ...localCatalogue].filter((o, i, all) => all.findIndex((x) => x.id === o.id) === i && litHere(o)).length);

    const marked = useMemo(() => {
        const s = new Set<string>();
        for (const f of items) {
            if (f.aspect === aspect) s.add(`${f.region}-${f.side ?? "mid"}`);
        }
        // A finding recorded AT a place marks that place too: the figure
        // shows everywhere something was found, not only the joints that
        // were marked by hand. A limb reads the same from either side; the
        // spine only from behind, the chest only from the front.
        for (const e of caseSheetEntries) {
            for (const st of e.sites ?? []) {
                const limb = st.region !== "neck" && st.region !== "torso_upper" && st.region !== "torso_lower"
                    && st.region !== "head_top" && st.region !== "head_bottom" && st.region !== "pelvis";
                if (!limb && st.aspect !== aspect) continue;
                const sides = st.side === "both" || st.side === null ? ["left", "right", "mid"] : [st.side];
                for (const sd of sides) s.add(`${st.region}-${sd}`);
            }
        }
        return s;
    }, [items, aspect, caseSheetEntries]);

    const shown = useMemo(
        () => items.filter((f) => f.aspect === aspect),
        [items, aspect]
    );

    /** This zone's one row in `visit_body_sites`, if it is marked yet. */
    const siteRow = sel
        ? items.find((f) => f.region === sel.region && f.side === sel.side && f.aspect === aspect) ?? null
        : null;

    /**
     * Mark the selected site — once. Every path that records something AT a
     * place comes through here (an examination reading, a finding, a note),
     * so a site is never marked twice: the old "Mark site" button inserted a
     * second row for a joint that recording the pain score had already
     * marked. The ref is checked and set synchronously because `items` only
     * updates once an insert resolves, and two quick readings would otherwise
     * both see an unmarked site.
     */
    const ensureSite = async (note?: string | null): Promise<BodySiteFinding | null> => {
        if (!visitId || !sel || disabled) return null;
        if (siteRow) {
            if (note === undefined || (note || null) === (siteRow.note || null)) return siteRow;
            const updated = await updateBodySiteNote(siteRow.id, note || null);
            setItems((curr) => curr.map((i) => (i.id === updated.id ? updated : i)));
            return updated;
        }
        const slot = `${sel.region}|${sel.side ?? "-"}|${aspect}`;
        if (autoMarking.current.has(slot)) return null;
        autoMarking.current.add(slot);
        try {
            const site = await addBodySite({
                visitId, region: sel.region, aspect, side: sel.side,
                note: note || undefined, doctorId,
            });
            setItems((curr) => [site, ...curr]);
            return site;
        } catch (err) {
            // Cleared on failure, so a transient network error does not stop
            // this joint from ever being marked.
            autoMarking.current.delete(slot);
            throw err;
        }
    };

    // The note belongs to the site row: shown when the zone opens, saved on
    // Enter or when the field is left. No button — there is nothing else to do.
    useEffect(() => { setNote(siteRow?.note ?? ""); }, [siteRow?.id, siteRow?.note, sel?.region, sel?.side]);
    const commitNote = async () => {
        const next = note.trim();
        if (next === (siteRow?.note ?? "") || (!siteRow && !next)) return;
        setSaving(true);
        setError(null);
        try {
            await ensureSite(next);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save the note");
        } finally {
            setSaving(false);
        }
    };

    /**
     * Recording something at a joint IS marking that joint — an examination
     * reading, or a finding recorded here. Without this, the flow the brief
     * describes (open the map, click the right knee, enter flexion and
     * strength, close) left `visit_body_sites` empty, so the summary strip
     * reported nothing examined while readings sat against an undeclared site.
     */
    const foundHere = !!selSite && (dxHere.length > 0
        || caseSheetEntries.some((e) => (e.sites ?? []).some((st) => sameSite(st, selSite))));
    useEffect(() => {
        if (!sel || !visitId || disabled || siteRow) return;
        const c = examination && REGION_BY_KEY.has(sel.region) ? examCounts(examination, sel.region, sel.side) : null;
        const nv = !!examination && NV_REGIONS.has(sel.region)
            && NV_CHECKS.some((k) => examination.getText(nvKey(k.key, sel.region), sel.side) !== null);
        const examined = nv || (!!c && (c.rom > 0 || c.strength > 0 || c.tests > 0 || c.pain !== null));
        if (!examined && !foundHere) return;
        ensureSite().catch(() => {});
        // `examination.numbers` / `.texts` are the identities that change when a
        // reading lands — the hook itself is stable across those writes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [examination?.numbers, examination?.texts, sel, visitId, aspect, siteRow, disabled, foundHere]);

    const onDelete = async (f: BodySiteFinding) => {
        setItems((curr) => curr.filter((i) => i.id !== f.id));
        try {
            await deleteBodySite(f.id);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Delete failed");
            setItems((curr) => [f, ...curr]);
        }
    };

    const body = (
            <div className="cs-attach-body">
                {/* ── Fixed two-column layout, on purpose (2026-09-23) ──────
                    Selecting a joint used to insert the whole detail panel
                    (chips + exam fields + note) into this same vertical flow,
                    right below the figure. That grew the panel's own height,
                    which grew the modal's height, which — because the modal
                    is centered on screen — re-centered the WHOLE thing,
                    visibly shifting the joint the doctor had just clicked.
                    Reported directly: "you click on it and then it moves...
                    because the thing inside of it is grown up." The figure
                    column and the detail column are now fixed-size siblings:
                    the detail column has its own reserved height and its own
                    scroll, so filling it in never changes what the figure
                    column — or the modal around both of them — is doing. */}
                <div className="cs-jmap-layout">
                    <div className={`cs-body cs-jmap-figure-col${disabled || !visitId ? " is-disabled" : ""}`}>
                        <div className="cs-attach-tagrow cs-body-aspect">
                            {(["front", "back"] as BodyAspect[]).map((a) => (
                                <button
                                    key={a}
                                    type="button"
                                    className={`cs-attach-chip${aspect === a ? " is-on" : ""}`}
                                    onClick={() => setAspect(a)}
                                >
                                    {a === "front" ? "Front" : "Back"}
                                </button>
                            ))}
                        </div>

                        <svg viewBox={FIGURE_VIEWBOX} className="cs-body-svg" role="img"
                            aria-label="Joint map — click a joint to record what it is doing">
                            {BODY_ZONES.map((z) => {
                                const isMarked = marked.has(`${z.region}-${z.side ?? "mid"}`);
                                // The spine has no side: a click on either half of
                                // the back selects the whole level, both halves lit.
                                const isSel = sel?.region === z.region
                                    && (sel?.side === z.side || isMidline(z.region, aspect));
                                return (
                                    <path
                                        key={z.key}
                                        d={z.path}
                                        data-region={z.region}
                                        data-side={z.side ?? "mid"}
                                        className={
                                            "cs-body-zone" +
                                            (isMarked ? " is-marked" : "") +
                                            (isSel ? " is-sel" : "")
                                        }
                                        onClick={() => {
                                            if (disabled || !visitId) return;
                                            setSel((c) =>
                                                c && c.region === z.region && (c.side === z.side || isMidline(z.region, aspect))
                                                    ? null
                                                    : { region: z.region, side: z.side }
                                            );
                                        }}
                                    >
                                        <title>{siteLabel(z.region, aspect, z.side)}</title>
                                    </path>
                                );
                            })}
                        </svg>
                        <span className="cs-body-orient">
                            {aspect === "front"
                                ? "Facing you — the patient's right is on your left"
                                : "From behind — the patient's right is on your right"}
                        </span>
                    </div>

                    <div className="cs-jmap-detail-col">
                        {sel ? (
                            <div className="cs-dchart-panel cs-jmap-panel" key={`${sel.region}|${sel.side ?? "-"}`}>
                                <div className="cs-jmap-panel-head">
                                    <span className="cs-jmap-panel-pin" aria-hidden="true"><MapPin size={14} /></span>
                                    <span className="cs-jmap-panel-titles">
                                        <span className="cs-jmap-panel-title">
                                            {selSite ? clinicalSiteLabel(selSite) : siteLabel(sel.region, aspect, sel.side)}
                                        </span>
                                        <span className="cs-jmap-panel-sub">
                                            {hereCount > 0
                                                ? `${hereCount} recorded here`
                                                : "Nothing recorded here yet"}
                                        </span>
                                    </span>
                                    <button type="button" className="cs-dchart-panel-close"
                                        onClick={() => setSel(null)} aria-label="Close">
                                        <X size={14} />
                                    </button>
                                </div>

                                {/* What is here, then one field to add more —
                                    never a wall of option chips. Each pick IS
                                    the Case Sheet's own toggle, so what is
                                    recorded here is on the sheet too, and a
                                    local finding is recorded AT this place. */}
                                {panelChips && selSite && (
                                    <JointFindingField
                                        key={`${sel.region}|${sel.side ?? "-"}|${aspect}`}
                                        placeLabel={clinicalSiteLabel(selSite)}
                                        suggested={panelChips}
                                        catalogue={localCatalogue}
                                        isHere={litHere}
                                        awayNote={awayNote}
                                        disabled={disabled}
                                        onToggle={(o) => (o.localizable && onObservableToggleAt
                                            ? onObservableToggleAt(o, selSite)
                                            : onObservableToggle(o))}
                                        assessment={assessmentApi}
                                    />
                                )}

                                {/* Distal to an injured limb: pulse, refill,
                                    motor, sensation — see NeurovascularCheck. */}
                                {examination && NV_REGIONS.has(sel.region) && (
                                    <NeurovascularCheck
                                        exam={examination}
                                        region={sel.region}
                                        side={sel.side}
                                        disabled={disabled}
                                    />
                                )}

                                {/* ── The examination for THIS joint ────────
                                    Pain, range, strength and special tests,
                                    scoped to the zone that was just clicked
                                    and to the side it was clicked on. This is
                                    the whole of brief §4's "generic ROM card
                                    is ambiguous" complaint answered: there is
                                    no way to reach these fields except
                                    through a site, so they cannot be recorded
                                    without one. Renders nothing for a zone
                                    the catalogue has no movements for (a
                                    hand, the chest). */}
                                {examination && REGION_BY_KEY.has(sel.region) && (
                                    <RegionExam
                                        exam={examination}
                                        regionKey={sel.region}
                                        side={sel.side}
                                        disabled={disabled}
                                    />
                                )}

                                {/* Last resort, not the only option —
                                    doctrine's own rule, applied here instead
                                    of a note field. */}
                                <div className="cs-attach-tagrow">
                                    <input
                                        className="cs-attach-region-input"
                                        placeholder={`Note for the ${(selSite ? clinicalSiteLabel(selSite) : "site").toLowerCase()} (optional)`}
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                                        onBlur={commitNote}
                                    />
                                    {saving && <Loader2 size={13} className="cs-spin cs-jmap-note-busy" aria-label="Saving" />}
                                </div>
                            </div>
                        ) : (
                            <p className="cs-attach-empty">
                                Click the joint. Side and site are recorded here; what's wrong with it
                                is a chip, the same ones Synapse ranks from everywhere else.
                            </p>
                        )}
                    </div>
                </div>

                {/* Reserved height, same principle as the two-column split
                    above — Anmol, live (re: the same shift happening again
                    here): "whenever you are adding more and more joints, you
                    click on that and the model expands." This list used to
                    grow the surrounding column with every site marked, which
                    grew the modal, which re-centered it. One row's worth of
                    height is reserved even when nothing is marked yet; past
                    three rows it scrolls internally instead of pushing the
                    modal taller. */}
                <div className="cs-jmap-marked">
                    {shown.length === 0 ? (
                        <p className="cs-jmap-marked-empty">No sites marked yet on this view.</p>
                    ) : (
                        shown.map((f) => (
                            <div key={f.id} className="cs-attach-row">
                                {/* Was `.cs-dchart-dot` — an 8px legend dot
                                    borrowed from the dental chart, where it
                                    distinguishes SEVERAL condition colours in
                                    one legend. There is only ever one kind of
                                    thing marked here, so the dot had nothing
                                    to distinguish and just read as an icon
                                    tile with nothing in it — Anmol, live:
                                    "you are trying to give some icon... that
                                    is not appearing." A real icon, matching
                                    the strip that opens this card. */}
                                <span className="cs-attach-icon">
                                    <PersonStanding size={16} />
                                </span>
                                <span className="cs-attach-meta">
                                    <span className="cs-attach-label">
                                        {siteLabel(f.region, f.aspect, f.side)}
                                        <i className="cs-attach-tagbadge">{regionLabel(f.region, f.aspect)}</i>
                                    </span>
                                    {f.note && <span className="cs-attach-size">{f.note}</span>}
                                </span>
                                <button type="button" className="cs-attach-action is-danger"
                                    onClick={() => onDelete(f)} aria-label="Remove site" title="Remove">
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {items.length > shown.length && (
                    <p className="cs-odo-scope">
                        {items.length - shown.length} more marked on the{" "}
                        {aspect === "front" ? "back" : "front"}.
                    </p>
                )}

                {error && <p className="cs-attach-error">{error}</p>}
            </div>
    );

    if (presentation === "modal") {
        if (!open) return null;
        return (
            <ChartSurface title="Body map & examination" icon={<PersonStanding size={15} />} expanded onClose={onClose ?? (() => {})} maxWidth={800}>
                {body}
            </ChartSurface>
        );
    }

    return (
        <section className="cs-card" aria-label="Joint map">
            <div className="cs-card-head">
                <h2 className="cs-card-title">
                    <span className="cs-glyph is-slate"><PersonStanding size={16} /></span>
                    Joint Map
                    <em>{items.length > 0 ? `${items.length} site${items.length > 1 ? "s" : ""}` : "which joint, and what it's doing"}</em>
                </h2>
                <button
                    type="button"
                    className="cs-chart-expand"
                    onClick={() => setExpanded(true)}
                    aria-label="Open the map larger"
                    title="Open larger"
                >
                    <Maximize2 size={16} />
                </button>
            </div>

            <ChartSurface title="Joint map" icon={<PersonStanding size={15} />} expanded={expanded} onClose={() => setExpanded(false)} maxWidth={800}>
                {body}
            </ChartSurface>
        </section>
    );
}
