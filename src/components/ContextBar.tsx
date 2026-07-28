// ---------------------------------------------------------------------------
// CONTEXT BAR — who this patient is, above everything else on the screen.
//
// Spec: docs/aren-cortex-workspace-design.md §4.1.
//
// Pregnancy, diabetes, a drug allergy, a failing kidney — these change what may
// be prescribed more sharply than any symptom does, and until now the only way
// to tell Synapse about them was to hunt for the chip inside the symptom picker
// as though "Known diabetic" were a complaint. It is not a complaint; it is the
// frame the whole consultation sits in. So it gets one permanent row at the top
// and it is never more than one click away.
//
// Two things this bar deliberately does NOT do:
//
//  * It holds no state of its own. A context chip toggles its observable LABEL
//    in and out of the chart (App's `selectedSymptoms`), which is the same
//    array the pickers write and which already flows into the engine and into
//    the v1 compatibility write. A second source of truth for "what is on this
//    chart" is exactly the bug that would be impossible to find later.
//
//  * It never lets a doctor hand-set something the record already answers.
//    Elderly and Child are derived from `patient.age`, which the engine already
//    receives as an AGE measurement on every run (measurement_rules: PEDIATRIC
//    under 12, ELDERLY 65+). They render as a stated badge, not a toggle — a
//    34-year-old must not be markable as elderly.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Plus, Search, ShieldCheck } from "lucide-react";
import type { Observable } from "../lib/db/synapse";

/**
 * The context worth a permanent chip. Ordered by how often it changes a
 * prescription, not alphabetically — pregnancy first because it is the single
 * biggest gate in the guard table.
 */
const PINNED_SLUGS = [
    "pregnancy",
    "known_diabetes",
    "known_hypertension",
    "drug_allergy",
    "smoker",
    "alcohol_dependence",
    "renal_impairment",
    "hepatic_impairment",
    "immunocompromised",
];

/** Answered by the patient record, never by hand. */
const AGE_DERIVED_SLUGS = new Set(["elderly", "pediatric"]);

interface Props {
    /** the whole catalogue; the bar reads the `history` kind out of it */
    observables: Observable[];
    /** labels currently on the chart — App's `selectedSymptoms` */
    selected: string[];
    /** toggle one label on the chart */
    onToggle: (label: string) => void;
    /** from the patient record; null when unknown */
    ageYears: number | null;
    gender?: string;
    /** no patient open yet — the bar is visible but inert */
    disabled?: boolean;
}

export function ContextBar({
    observables, selected, onToggle, ageYears, gender, disabled = false,
}: Props) {
    const [popOpen, setPopOpen] = useState(false);
    const [popRect, setPopRect] = useState<DOMRect | null>(null);
    const [query, setQuery] = useState("");

    const moreBtnRef = useRef<HTMLButtonElement>(null);
    const popRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    const selectedSet = useMemo(() => new Set(selected), [selected]);
    const isMale = (gender ?? "").trim().toLowerCase().startsWith("m");

    const historyObs = useMemo(
        () => observables.filter((o) => o.kind === "history"),
        [observables]
    );

    const bySlug = useMemo(() => {
        const m = new Map<string, Observable>();
        for (const o of historyObs) m.set(o.slug, o);
        return m;
    }, [historyObs]);

    /** Age is known ⇒ the two age chips stop being pickable at all. */
    const ageKnown = ageYears != null;

    const ageBadge = useMemo(() => {
        if (ageYears == null) return null;
        if (ageYears >= 65) return { label: "Elderly", detail: `${ageYears}y` };
        if (ageYears < 12) return { label: "Child", detail: `${ageYears}y` };
        return null;
    }, [ageYears]);

    const hidden = useCallback(
        (o: Observable) =>
            (o.slug === "pregnancy" && isMale) ||
            (ageKnown && AGE_DERIVED_SLUGS.has(o.slug)),
        [isMale, ageKnown]
    );

    const pinned = useMemo(
        () =>
            PINNED_SLUGS
                .map((s) => bySlug.get(s))
                .filter((o): o is Observable => !!o && !hidden(o)),
        [bySlug, hidden]
    );

    const pinnedSlugs = useMemo(() => new Set(pinned.map((o) => o.slug)), [pinned]);

    /** Everything else a doctor can record about this patient. */
    const moreList = useMemo(
        () =>
            historyObs
                .filter((o) => !pinnedSlugs.has(o.slug) && !hidden(o))
                .sort((a, b) => a.label.localeCompare(b.label)),
        [historyObs, pinnedSlugs, hidden]
    );

    /**
     * Anything ticked from the More sheet still belongs on the bar. The chart
     * rails do not render history chips, so this is the only place it would
     * show — and context the doctor cannot see is context they cannot take back.
     */
    const extras = useMemo(
        () => historyObs.filter((o) => selectedSet.has(o.label) && !pinnedSlugs.has(o.slug)),
        [historyObs, selectedSet, pinnedSlugs]
    );

    const filteredMore = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return moreList;
        return moreList.filter(
            (o) =>
                o.label.toLowerCase().includes(q) ||
                (o.searchText ?? "").toLowerCase().includes(q) ||
                o.slug.includes(q)
        );
    }, [moreList, query]);

    // ── popover placement, the measured-rect way the rest of Cortex does it ──
    const updateRect = useCallback(() => {
        if (moreBtnRef.current) setPopRect(moreBtnRef.current.getBoundingClientRect());
    }, []);

    useEffect(() => {
        if (!popOpen) return;
        updateRect();
        window.addEventListener("resize", updateRect);
        window.addEventListener("scroll", updateRect, true);
        return () => {
            window.removeEventListener("resize", updateRect);
            window.removeEventListener("scroll", updateRect, true);
        };
    }, [popOpen, updateRect]);

    useEffect(() => {
        if (!popOpen) { setQuery(""); return; }
        const t = window.setTimeout(() => searchRef.current?.focus(), 0);
        return () => window.clearTimeout(t);
    }, [popOpen]);

    useEffect(() => {
        if (!popOpen) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (popRef.current?.contains(t) || moreBtnRef.current?.contains(t)) return;
            setPopOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                setPopOpen(false);
                moreBtnRef.current?.focus();
            }
        };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [popOpen]);

    const chip = (o: Observable) => {
        const on = selectedSet.has(o.label);
        return (
            <button
                key={o.slug}
                type="button"
                className="cx-ctx-chip"
                aria-pressed={on}
                disabled={disabled}
                onClick={() => onToggle(o.label)}
                title={on ? `Remove ${o.label} from this chart` : `Record ${o.label}`}
            >
                {on && <Check size={11} strokeWidth={3} />}
                {o.label}
            </button>
        );
    };

    const popover = popOpen && popRect ? createPortal(
        <div
            ref={popRef}
            className="cx-ctx-pop"
            style={{
                top: popRect.bottom + 6,
                left: Math.max(12, Math.min(popRect.left, window.innerWidth - 300)),
            }}
            role="dialog"
            aria-label="More patient context"
        >
            <div className="cx-ctx-pop-search">
                <Search size={14} />
                <input
                    ref={searchRef}
                    value={query}
                    placeholder="Search context…"
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && filteredMore[0]) {
                            e.preventDefault();
                            onToggle(filteredMore[0].label);
                            setQuery("");
                        }
                    }}
                    aria-label="Search patient context"
                />
            </div>
            <div className="cx-ctx-pop-list">
                {filteredMore.length === 0 ? (
                    <p className="cx-ctx-pop-empty">Nothing matches “{query.trim()}”</p>
                ) : (
                    filteredMore.map((o) => {
                        const on = selectedSet.has(o.label);
                        return (
                            <button
                                key={o.slug}
                                type="button"
                                className={`cx-ctx-pop-row${on ? " is-on" : ""}`}
                                onClick={() => onToggle(o.label)}
                            >
                                <span>{o.label}</span>
                                {on && <Check size={13} strokeWidth={3} />}
                            </button>
                        );
                    })
                )}
            </div>
        </div>,
        document.body
    ) : null;

    return (
        <section
            className={`cx-panel cx-context${disabled ? " is-disabled" : ""}`}
            aria-label="Patient context"
        >
            <span className="cx-ctx-label">Context</span>

            {ageBadge && (
                <span
                    className="cx-ctx-badge"
                    title="Derived from age — Synapse already knows"
                >
                    <ShieldCheck size={11} />
                    {ageBadge.label}
                    <span className="cx-ctx-badge-detail">{ageBadge.detail}</span>
                </span>
            )}

            {pinned.map(chip)}
            {extras.map(chip)}

            {moreList.length > 0 && (
                <button
                    ref={moreBtnRef}
                    type="button"
                    className="cx-ctx-more"
                    disabled={disabled}
                    aria-expanded={popOpen}
                    onClick={() => setPopOpen((v) => !v)}
                >
                    <Plus size={11} strokeWidth={2.6} />
                    More
                </button>
            )}

            {popover}
        </section>
    );
}
