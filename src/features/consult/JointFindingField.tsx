// ---------------------------------------------------------------------------
// JOINT FINDING FIELD — "what is at the left knee", on the body map panel.
//
// Replaces a wall of option chips (13 on a knee) with the pattern the rest
// of the product uses for anything past a handful of options:
//
//   Recorded here    only what IS recorded at this place, as removable
//                    tokens in the Case Sheet's own colours — data, not
//                    options
//   Add at …         one field; focusing it opens this place's findings as a
//                    list (the joint's own first: pain, swelling, bony
//                    tenderness…), typing filters it and reaches the rest
//                    of the local findings. ↑ ↓ Enter, Esc. It stays open
//                    after a pick, so three findings are three Enters.
//
// A local finding is recorded AT this place (`onToggleAt`); a complaint
// like "Knee pain" is a plain chart toggle. The list is portalled and fixed,
// so the panel's own scroll never crops it.
//
// ── Assessments, from the same field (2026-09-26)
//
// The body map is the GUI twin of the command bar, so what the bar can do
// this field can do: typing "fracture" also finds the catalogue's
// assessments that can sit at this place, under their own heading. Picking
// one makes the assessment AT this site at once (no modal: the site is the
// one question already answered) and opens its details right under its
// token, SiteAssessmentDetails. Clicking the token later opens them again.
//
// ── Not in the list (2026-09-27)
//
// Whatever is typed that matches nothing exactly can still be recorded, in
// the doctor's own words, as what they mean it to be: what the patient
// reports, what was found, or the assessment. The likeliest reading leads
// (`guessCustomKind`: "osteoarthritis" reads as an assessment, "clicking"
// as reported, "tenderness" as found) and the other two sit under it. A
// finding becomes the clinic's own catalogue term (add_clinic_observable)
// and an assessment the doctor's remembered term, so either is offered by
// search the next time.
// ---------------------------------------------------------------------------

import { Check, ChevronDown, MapPin, Plus, Stethoscope, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { IntentSearchHit, Observable } from "../../lib/db/synapse";
import type { AssessmentLine } from "./assessmentPlan";
import type { AssessmentDetails } from "./assessmentFamilies";
import { SiteAssessmentDetails } from "./SiteAssessmentDetails";

type RowKind = Observable["kind"] | "assessment" | "custom";
type CustomKind = "symptom" | "finding" | "assessment";

interface Row {
    key: string;
    kind: RowKind;
    label: string;
    /** a finding or complaint */
    o?: Observable;
    /** a catalogue assessment */
    hit?: IntentSearchHit;
    /** recorded at THIS place (or, for a complaint, on the chart) */
    here: boolean;
    /** recorded somewhere else — "at Right knee", "no place yet" */
    away: string | null;
    /** "not in the list": record the typed words as this */
    custom?: CustomKind;
    /** a remembered term of the doctor's own (an assessment) */
    ownTerm?: boolean;
}

const KIND_LABEL: Record<RowKind, string> = {
    symptom: "Reported",
    finding: "On examination",
    history: "History",
    assessment: "Assessment",
    custom: "Not in the list? Add it as",
};
const KIND_RANK: Record<RowKind, number> = { symptom: 0, history: 0, finding: 1, assessment: 2, custom: 3 };

const CUSTOM_LABEL: Record<CustomKind, string> = {
    symptom: "Reported",
    finding: "On examination",
    assessment: "Assessment",
};

/**
 * What a doctor most likely means by words the catalogue lacks. A reading,
 * not a verdict: it only decides which of the three rows leads.
 */
export function guessCustomKind(text: string): CustomKind {
    const t = text.toLowerCase();
    if (/(itis|osis|pathy|oma\b|syndrome|tear|rupture|fracture|sprain|strain|lesion|injury|disease|disorder|arthritis|\boa\b|impingement|instability|dislocation|deformity|bursitis|tendin)/.test(t)) {
        return "assessment";
    }
    if (/(pain|ache|aching|stiff|clicking|catching|locking|giving way|weak|numb|tingling|burning|cramp|difficulty|unable|can't|cannot|feels)/.test(t)) {
        return "symptom";
    }
    return "finding";
}

/** What the field needs to make assessments at this place. */
export interface SiteAssessmentApi {
    /** the assessments already made at this place */
    recorded: AssessmentLine[];
    /** the catalogue's assessments matching a query that can sit here */
    find: (query: string) => Promise<IntentSearchHit[]>;
    /** make one here; the new (or existing) line's id */
    onAdd: (hit: IntentSearchHit) => string | null;
    /** a doctor's own assessment here (not in the catalogue); the line's id */
    onAddCustom?: (label: string) => string | null;
    /** the doctor's remembered assessments, searched alongside the catalogue */
    ownTerms?: string[];
    onDetails: (id: string, details: AssessmentDetails) => void;
    onRemove: (line: AssessmentLine) => void;
}

export function JointFindingField({
    placeLabel, suggested, catalogue, isHere, awayNote, onToggle, assessment, onAddCustomFinding, disabled = false,
}: {
    /** "Left knee" — names the field and the empty state */
    placeLabel: string;
    /** this place's own findings, most likely first (regionFindings.ts) */
    suggested: Observable[];
    /** everything else that can be recorded at a place, reached by typing */
    catalogue: Observable[];
    isHere: (o: Observable) => boolean;
    awayNote: (o: Observable) => string | null;
    onToggle: (o: Observable) => void;
    assessment?: SiteAssessmentApi;
    /** records typed words as a new finding or complaint at this place;
     *  resolves to an error message, or null when it was recorded */
    onAddCustomFinding?: (label: string, kind: "symptom" | "finding") => Promise<string | null>;
    disabled?: boolean;
}) {
    const [customBusy, setCustomBusy] = useState(false);
    const [customError, setCustomError] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null);
    const fieldRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    /** the assessment whose details are open under its token */
    const [openDx, setOpenDx] = useState<string | null>(null);
    const [dxHits, setDxHits] = useState<IntentSearchHit[]>([]);

    // The catalogue's assessments for what is typed — debounced, and only
    // once there is a word to search for.
    const find = assessment?.find;
    useEffect(() => {
        const q = query.trim();
        if (!find || q.length < 2) { setDxHits([]); return; }
        let live = true;
        const t = window.setTimeout(() => {
            find(q).then((h) => { if (live) setDxHits(h); }).catch(() => { if (live) setDxHits([]); });
        }, 160);
        return () => { live = false; window.clearTimeout(t); };
    }, [query, find]);
    const recordedDx = assessment?.recorded ?? [];
    const shownDx = recordedDx.find((l) => l.id === openDx) ?? null;

    const recorded = useMemo(
        () => [...suggested, ...catalogue]
            .filter((o, i, all) => all.findIndex((x) => x.id === o.id) === i && isHere(o))
            // Reported, then found: the case sheet's order.
            .sort((a, b) => (a.kind === "finding" ? 1 : 0) - (b.kind === "finding" ? 1 : 0)),
        [suggested, catalogue, isHere],
    );

    const rows = useMemo<Row[]>(() => {
        const q = query.trim().toLowerCase();
        const words = q.split(/\s+/).filter(Boolean);
        const hit = (o: Observable) => {
            const l = o.label.toLowerCase();
            return words.every((w) => l.split(/[\s/()-]+/).some((p) => p.startsWith(w)) || l.includes(w));
        };
        const seen = new Set<number>();
        const out: Row[] = [];
        const push = (o: Observable) => {
            if (seen.has(o.id)) return;
            seen.add(o.id);
            out.push({ key: `o${o.id}`, kind: o.kind, label: o.label, o, here: isHere(o), away: awayNote(o) });
        };
        // This place's own list first, in its clinical order; typing then
        // reaches every other local finding.
        for (const o of suggested) if (!q || hit(o)) push(o);
        if (q) for (const o of catalogue) if (hit(o)) push(o);
        // What the patient reports, then what is found, then what the doctor
        // makes of it — the case sheet's order, so each heading appears once.
        const obs = out
            .map((r, i) => ({ r, i }))
            .sort((a, b) => KIND_RANK[a.r.kind] - KIND_RANK[b.r.kind] || a.i - b.i)
            .map((x) => x.r)
            .slice(0, q ? 8 : 20);
        const dx: Row[] = q ? dxHits.slice(0, 5).map((h) => ({
            key: `a${h.intentId}`,
            kind: "assessment",
            label: h.label,
            hit: h,
            here: recordedDx.some((l) => l.label.toLowerCase() === h.label.toLowerCase()),
            away: null,
        })) : [];
        // The doctor's own assessments from earlier consults, by the same
        // word-start match, under the catalogue's.
        const own: Row[] = q && assessment?.onAddCustom
            ? (assessment.ownTerms ?? [])
                .filter((t) => {
                    const l = t.toLowerCase();
                    return words.every((w) => l.split(/[\s/()-]+/).some((p) => p.startsWith(w)) || l.includes(w))
                        && !dx.some((d) => d.label.toLowerCase() === l);
                })
                .slice(0, 3)
                .map((t) => ({
                    key: `own:${t}`, kind: "assessment" as const, label: t, ownTerm: true, away: null,
                    here: recordedDx.some((l) => l.label.toLowerCase() === t.toLowerCase()),
                }))
            : [];
        const listed = [...obs, ...dx, ...own];
        // Not in the list: anything typed that no row names exactly.
        const typed = query.trim().replace(/\s+/g, " ");
        const exact = listed.some((r) => r.label.toLowerCase() === typed.toLowerCase());
        const kinds: CustomKind[] = [];
        if (typed.length >= 3 && !exact) {
            const can = (k: CustomKind) => (k === "assessment" ? !!assessment?.onAddCustom : !!onAddCustomFinding);
            const lead = guessCustomKind(typed);
            for (const k of [lead, ...(["finding", "symptom", "assessment"] as CustomKind[]).filter((k) => k !== lead)]) {
                if (can(k)) kinds.push(k);
            }
        }
        const custom: Row[] = kinds.map((k) => ({
            key: `c:${k}`, kind: "custom", label: typed, custom: k, here: false, away: null,
        }));
        return [...listed, ...custom];
    }, [query, suggested, catalogue, isHere, awayNote, dxHits, recordedDx, assessment, onAddCustomFinding]);

    useEffect(() => { setActive(0); }, [query, open]);

    // Placed under the field, or above it when the window has no room below.
    useLayoutEffect(() => {
        if (!open) return;
        const place = () => {
            const r = fieldRef.current?.getBoundingClientRect();
            if (!r) return;
            const h = Math.min(listRef.current?.scrollHeight ?? 300, 300);
            const up = r.bottom + 6 + h > window.innerHeight - 8 && r.top - 6 - h > 8;
            setPos({ top: up ? r.top - 6 - h : r.bottom + 6, left: r.left, width: r.width, up });
        };
        place();
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        return () => {
            window.removeEventListener("resize", place);
            window.removeEventListener("scroll", place, true);
        };
    }, [open, rows.length]);

    useEffect(() => {
        if (!open) return;
        const away = (e: MouseEvent) => {
            const t = e.target as Node;
            if (fieldRef.current?.contains(t) || listRef.current?.contains(t)) return;
            setOpen(false);
        };
        document.addEventListener("mousedown", away);
        return () => document.removeEventListener("mousedown", away);
    }, [open]);

    // Keep the highlighted row in view while arrowing through the list.
    useEffect(() => {
        listRef.current?.querySelector<HTMLElement>(`[data-row="${active}"]`)?.scrollIntoView({ block: "nearest" });
    }, [active]);

    const pick = (r: Row) => {
        setCustomError(null);
        // Typed words are kept as typed, only sentence-cased: "medial joint
        // line tenderness" is recorded as "Medial joint line tenderness".
        const words = r.custom ? r.label.charAt(0).toUpperCase() + r.label.slice(1) : r.label;
        if (r.custom === "assessment" || (r.ownTerm && assessment?.onAddCustom)) {
            setQuery("");
            const existing = recordedDx.find((l) => l.label.toLowerCase() === words.toLowerCase());
            const id = existing?.id ?? assessment?.onAddCustom?.(words) ?? null;
            if (id) { setOpenDx(id); setOpen(false); inputRef.current?.blur(); }
            return;
        }
        if (r.custom && onAddCustomFinding) {
            if (customBusy) return;
            setCustomBusy(true);
            onAddCustomFinding(words, r.custom).then((err) => {
                if (err) { setCustomError(err); return; }
                setQuery("");
                inputRef.current?.focus();
            }).finally(() => setCustomBusy(false));
            return;
        }
        setQuery("");
        if (r.hit && assessment) {
            // Made here, or already here: either way its details open under
            // it, and the list steps aside so they can be seen.
            const existing = recordedDx.find((l) => l.label.toLowerCase() === r.label.toLowerCase());
            const id = existing?.id ?? assessment.onAdd(r.hit);
            if (id) { setOpenDx(id); setOpen(false); inputRef.current?.blur(); }
            return;
        }
        if (r.o) onToggle(r.o);
        inputRef.current?.focus();
    };

    // Rows grouped under the kind the case sheet uses, in list order.
    let lastKind: RowKind | null = null;

    return (
        <div className="cs-jf">
            {(recorded.length > 0 || recordedDx.length > 0) && (
                <div className="cs-jf-tokens" aria-label={`Recorded at ${placeLabel.toLowerCase()}`}>
                    {recordedDx.map((l) => (
                        <span key={l.id} className={`cs-jf-token is-assessment${openDx === l.id ? " is-open" : ""}`}>
                            <button
                                type="button"
                                className="cs-jf-token-open"
                                aria-expanded={openDx === l.id}
                                title={l.text}
                                onClick={() => setOpenDx((c) => (c === l.id ? null : l.id))}
                            >
                                <Stethoscope size={12} aria-hidden="true" />
                                {l.label}
                                {/* The details, when folded: "displaced, closed". */}
                                {openDx !== l.id && l.text.includes(", ") && (
                                    <em className="cs-jf-token-sub">{l.text.split(", ").slice(1).join(", ")}</em>
                                )}
                                <ChevronDown size={12} className="cs-jf-token-chev" aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                aria-label={`Remove ${l.label} at ${placeLabel.toLowerCase()}`}
                                disabled={disabled}
                                onClick={() => { if (openDx === l.id) setOpenDx(null); assessment?.onRemove(l); }}
                            >
                                <X size={12} />
                            </button>
                        </span>
                    ))}
                    {recorded.map((o) => (
                        <span key={o.id} className={`cs-jf-token is-${o.kind}`}>
                            {o.label}
                            <button
                                type="button"
                                aria-label={`Remove ${o.label} from ${placeLabel.toLowerCase()}`}
                                disabled={disabled}
                                onClick={() => onToggle(o)}
                            >
                                <X size={12} />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            {shownDx && assessment && (
                <SiteAssessmentDetails
                    key={shownDx.id}
                    line={shownDx}
                    disabled={disabled}
                    onChange={(d) => assessment.onDetails(shownDx.id, d)}
                    onDone={() => setOpenDx(null)}
                />
            )}

            <div
                ref={fieldRef}
                className={`cs-jf-field${open ? " is-open" : ""}`}
                onClick={() => { if (!disabled) { setOpen(true); inputRef.current?.focus(); } }}
            >
                <Plus size={15} aria-hidden="true" />
                <input
                    ref={inputRef}
                    className="cs-jf-input"
                    value={query}
                    disabled={disabled}
                    placeholder={assessment
                        ? `Add at ${placeLabel.toLowerCase()}: swelling, tenderness, fracture…`
                        : `Add at ${placeLabel.toLowerCase()}: swelling, tenderness…`}
                    role="combobox"
                    aria-expanded={open}
                    aria-controls="cs-jf-list"
                    aria-label={`Add a finding at ${placeLabel.toLowerCase()}`}
                    onFocus={() => setOpen(true)}
                    onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") {
                            if (open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
                            return;
                        }
                        if (!open && (e.key === "ArrowDown" || e.key === "Enter")) { e.preventDefault(); setOpen(true); return; }
                        if (!rows.length) return;
                        if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, rows.length - 1)); }
                        else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
                        else if (e.key === "Enter") { e.preventDefault(); pick(rows[active]); }
                    }}
                />
            </div>

            {open && createPortal(
                <div
                    ref={listRef}
                    id="cs-jf-list"
                    role="listbox"
                    className="cs-jf-list"
                    style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: pos?.width }}
                >
                    {!query.trim() && (
                        <p className="cs-jf-listhead">
                            <MapPin size={12} aria-hidden="true" /> Found at the {placeLabel.toLowerCase()}
                        </p>
                    )}
                    {customError && <p className="cs-jf-none is-error">{customError}</p>}
                    {rows.length === 0 ? (
                        <p className="cs-jf-none">Nothing matches “{query.trim()}”</p>
                    ) : rows.map((r, i) => {
                        const head = r.kind !== lastKind ? KIND_LABEL[r.kind] : null;
                        lastKind = r.kind;
                        return (
                            <div key={r.key}>
                                {head && <p className="cs-jf-group">{head}</p>}
                                <button
                                    type="button"
                                    role="option"
                                    data-row={i}
                                    aria-selected={i === active}
                                    className={`cs-jf-row is-${r.kind}${i === active ? " is-active" : ""}${r.here ? " is-here" : ""}`}
                                    onMouseEnter={() => setActive(i)}
                                    onMouseDown={(e) => { e.preventDefault(); pick(r); }}
                                >
                                    <span className="cs-jf-check" aria-hidden="true">
                                        {r.custom
                                            ? <Plus size={12} strokeWidth={2.4} />
                                            : r.kind === "assessment"
                                                ? (r.here ? <Check size={12} strokeWidth={2.6} /> : <Stethoscope size={11} />)
                                                : r.here && <Check size={12} strokeWidth={2.6} />}
                                    </span>
                                    {r.custom ? (
                                        <span className="cs-jf-rowlabel">
                                            <b className={`cs-jf-customkind is-${r.custom}`}>{CUSTOM_LABEL[r.custom]}</b>
                                            “{r.label}”
                                        </span>
                                    ) : (
                                        <span className="cs-jf-rowlabel">{r.label}</span>
                                    )}
                                    {r.custom && i === rows.findIndex((x) => x.custom) && (
                                        <em>{customBusy ? "adding…" : `at ${placeLabel.toLowerCase()}`}</em>
                                    )}
                                    {r.ownTerm && !r.here && <em>yours · at {placeLabel.toLowerCase()}</em>}
                                    {r.kind === "assessment" && !r.ownTerm && <em>{r.here ? "open details" : `at ${placeLabel.toLowerCase()}`}</em>}
                                    {r.ownTerm && r.here && <em>open details</em>}
                                    {r.away && <em>{r.away}</em>}
                                </button>
                            </div>
                        );
                    })}
                    {assessment && !query.trim() && (
                        <p className="cs-jf-listfoot">
                            <Stethoscope size={11} aria-hidden="true" /> Type an assessment too, e.g. fracture, sprain
                        </p>
                    )}
                </div>,
                document.body,
            )}
        </div>
    );
}
