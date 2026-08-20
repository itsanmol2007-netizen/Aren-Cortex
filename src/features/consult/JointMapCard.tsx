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
// carries no side. The "Mark site" action below the chips still records
// which side was clicked — into the same `visit_body_sites` row the
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

import { useEffect, useMemo, useRef, useState } from "react";
import { PersonStanding, Loader2, Trash2, X, Maximize2 } from "lucide-react";
import { ChartSurface } from "./ChartSurface";
import { listBodySites, addBodySite, deleteBodySite } from "../../lib/db/bodySites";
import type { BodySiteFinding } from "../../lib/db/bodySites";
import { BODY_ZONES, FIGURE_VIEWBOX, regionLabel, siteLabel } from "../../lib/body/anatomy";
import type { BodyAspect, BodyRegion, BodySide } from "../../lib/body/anatomy";
import type { Observable } from "../../lib/db/synapse";
import type { CaseSheetEntry } from "./CaseSheet";
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

/** Not joint-specific — offered for every zone. */
const GENERIC_FINDING_LABELS = [
    "Restricted range of motion",
    "Joint swelling / effusion",
    "Joint stiffness",
    "Joint gives way",
];

interface Props {
    visitId: string | null;
    doctorId?: string | null;
    observables: Observable[];
    caseSheetEntries: CaseSheetEntry[];
    onObservableToggle: (o: Observable) => void;
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
    disabled?: boolean;
}

interface Selection {
    region: BodyRegion;
    side: BodySide | null;
}

export function JointMapCard({
    visitId, doctorId, observables, caseSheetEntries, onObservableToggle,
    presentation = "card", open = false, onClose, examination, disabled = false,
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
    useEffect(() => { setNote(""); }, [sel?.region, sel?.side]);

    const byLabel = useMemo(() => {
        const m = new Map<string, Observable>();
        for (const o of observables) m.set(o.label, o);
        return m;
    }, [observables]);

    const onChart = useMemo(
        () => new Set(caseSheetEntries.map((e) => e.label)),
        [caseSheetEntries]
    );

    /** The chips for the currently selected zone — specific first, generic after. */
    const chipsFor = (region: BodyRegion): Observable[] => {
        const specific = jointPainChip(region, aspect);
        const labels = [
            ...(specific ? [specific] : []),
            ...GENERIC_FINDING_LABELS,
        ];
        // `byLabel.get` returns undefined for a label not in the catalogue —
        // skipped rather than thrown, same defensive posture as every other
        // chip lookup in this app (content can lag code; it must never crash
        // the consult).
        return labels.map((l) => byLabel.get(l)).filter((o): o is Observable => !!o);
    };

    const marked = useMemo(() => {
        const s = new Set<string>();
        for (const f of items) {
            if (f.aspect === aspect) s.add(`${f.region}-${f.side ?? "mid"}`);
        }
        return s;
    }, [items, aspect]);

    const shown = useMemo(
        () => items.filter((f) => f.aspect === aspect),
        [items, aspect]
    );

    const onAdd = async () => {
        if (!visitId || !sel) return;
        setSaving(true);
        setError(null);
        try {
            const site = await addBodySite({
                visitId, region: sel.region, aspect, side: sel.side,
                note: note.trim() || undefined, doctorId,
            });
            setItems((curr) => [site, ...curr]);
            setNote("");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save site");
        } finally {
            setSaving(false);
        }
    };

    /**
     * Recording an examination at a joint IS marking that joint.
     *
     * Without this, the flow the brief describes — open the map, click the
     * right knee, enter flexion and strength, close — leaves `visit_body_sites`
     * empty, so the consultation's summary strip reports nothing examined
     * while three readings sit in the database against a site nobody declared.
     * "Mark site" stays for the case it was built for (a site worth naming
     * with a note and no measurements), but it is no longer the only way in,
     * because making the doctor press it after they have already typed the
     * numbers is asking them to tell the software something it just watched
     * them do.
     */
    useEffect(() => {
        if (!examination || !sel || !visitId || disabled) return;
        if (!REGION_BY_KEY.has(sel.region)) return;
        const already = items.some(
            (f) => f.region === sel.region && f.side === sel.side && f.aspect === aspect
        );
        if (already) return;
        const c = examCounts(examination, sel.region, sel.side);
        if (c.rom === 0 && c.strength === 0 && c.tests === 0 && c.pain === null) return;

        // `items` only updates once the insert RESOLVES, so two readings typed
        // in quick succession would both see an unmarked site and both insert
        // one. The ref is checked and set synchronously, which the state cannot
        // be — this is the same reason `saving` above is not enough here.
        const slot = `${sel.region}|${sel.side ?? "-"}|${aspect}`;
        if (autoMarking.current.has(slot)) return;
        autoMarking.current.add(slot);

        addBodySite({ visitId, region: sel.region, aspect, side: sel.side, doctorId })
            .then((site) => setItems((curr) => [site, ...curr]))
            // Left in the set on success (the site is marked, nothing more to
            // do) and cleared on failure, so a transient network error does not
            // permanently stop this joint from ever being marked.
            .catch(() => { autoMarking.current.delete(slot); });
        // `examination.numbers` / `.texts` are the identities that change when a
        // reading lands — the hook itself is stable across those writes.
    }, [examination?.numbers, examination?.texts, sel, visitId, aspect, items, disabled, doctorId, examination]);

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

                <div className={`cs-body${disabled || !visitId ? " is-disabled" : ""}`}>
                    <svg viewBox={FIGURE_VIEWBOX} className="cs-body-svg" role="img"
                        aria-label="Joint map — click a joint to record what it is doing">
                        {BODY_ZONES.map((z) => {
                            const isMarked = marked.has(`${z.region}-${z.side ?? "mid"}`);
                            const isSel = sel?.region === z.region && sel?.side === z.side;
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
                                            c && c.region === z.region && c.side === z.side
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

                {sel ? (
                    <div className="cs-dchart-panel">
                        <div className="cs-dchart-panel-head">
                            <span className="cs-dchart-panel-title">
                                {siteLabel(sel.region, aspect, sel.side)}
                            </span>
                            <button type="button" className="cs-dchart-panel-close"
                                onClick={() => setSel(null)} aria-label="Close">
                                <X size={13} />
                            </button>
                        </div>

                        {/* Chips first — see file header. Each one IS the
                            Case Sheet's own toggle, so a chip lit here is lit
                            there too, and vice versa. */}
                        <div className="cs-attach-tagrow">
                            {chipsFor(sel.region).map((o) => (
                                <button
                                    key={o.id}
                                    type="button"
                                    className={`cs-attach-chip${onChart.has(o.label) ? " is-on" : ""}`}
                                    onClick={() => onObservableToggle(o)}
                                >
                                    {o.label}
                                </button>
                            ))}
                        </div>

                        {/* ── The examination for THIS joint ────────────────
                            Pain, range, strength and special tests, scoped to
                            the zone that was just clicked and to the side it
                            was clicked on. This is the whole of brief §4's
                            "generic ROM card is ambiguous" complaint answered:
                            there is no way to reach these fields except
                            through a site, so they cannot be recorded without
                            one. Renders nothing for a zone the catalogue has
                            no movements for (a hand, the chest). */}
                        {examination && REGION_BY_KEY.has(sel.region) && (
                            <RegionExam
                                exam={examination}
                                regionKey={sel.region}
                                side={sel.side}
                                disabled={disabled}
                            />
                        )}

                        {/* Last resort, not the only option — doctrine's own
                            rule, applied here instead of a note field. */}
                        <div className="cs-attach-tagrow">
                            <input
                                className="cs-attach-region-input"
                                placeholder="Anything a chip doesn't capture"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") onAdd(); }}
                            />
                            <button type="button" className="cs-attach-tagsave" disabled={saving} onClick={onAdd}>
                                {saving ? <Loader2 size={13} className="cs-spin" /> : "Mark site"}
                            </button>
                        </div>
                    </div>
                ) : (
                    <p className="cs-attach-empty">
                        Click the joint. Side and site are recorded here; what's wrong with it
                        is a chip, the same ones Synapse ranks from everywhere else.
                    </p>
                )}

                {shown.map((f) => (
                    <div key={f.id} className="cs-attach-row">
                        <span className="cs-attach-icon">
                            <i className="cs-dchart-dot is-cond-teal" />
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
                ))}

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
            <ChartSurface title="Body map & examination" icon={<PersonStanding size={15} />} expanded onClose={onClose ?? (() => {})}>
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

            <ChartSurface title="Joint map" icon={<PersonStanding size={15} />} expanded={expanded} onClose={() => setExpanded(false)}>
                {body}
            </ChartSurface>
        </section>
    );
}
