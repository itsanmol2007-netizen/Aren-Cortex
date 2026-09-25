// ---------------------------------------------------------------------------
// RESULT SHEET — "the X-ray is back": what it showed, the image, a note.
//
// A result is not a sentence typed into a box. What an X-ray shows IS an
// assessment ("Fracture - Right wrist, distal radius, displaced, dorsal
// angulation"), and the product already has one way to make those: the
// catalogue, the family's detail fields, the composed line. So the sheet
// brings that mechanism to the order instead of sending the doctor off to
// the Assessment card and back (the order they were resulting would be lost
// on the way, and nothing would tie the two together):
//
//   What it showed   search the assessments that can sit at the order's
//                    site; a pick is made AT that site on today's
//                    Assessment and its details open right here
//                    (SiteAssessmentDetails, the body map's own editor).
//                    Or "No abnormality" in one press.
//   Report / image   the visit's Attachments, the same upload and the same
//                    list, labelled with the order and its side.
//   Note             what the report says that is not an assessment.
//
// Saving writes the composed result onto the order (its "result awaited"
// closes) from the linked lines and the note; the assessments are already
// on today's sheet, where they belong.
// ---------------------------------------------------------------------------

import { Check, FileImage, FlaskConical, Loader2, Paperclip, Plus, Search, Stethoscope, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChartSurface } from "./ChartSurface";
import { SiteAssessmentDetails } from "./SiteAssessmentDetails";
import { familyFor, siteAllowed, type AssessmentDetails } from "./assessmentFamilies";
import type { AssessmentLine } from "./assessmentPlan";
import type { AcceptPayload } from "./types";
import { clinicalSiteLabel, sameSite, siteFromLabel, type SiteRef } from "../../lib/body/clinicalSite";
import type { IntentSearchHit } from "../../lib/db/synapse";
import type { VisitOrder } from "../../lib/db";
import type { AttachmentType } from "../../lib/attachments/types";

/** The order's site, from its composed name: "X-Ray Hand / Wrist - Right wrist". */
export function orderSite(name: string): SiteRef | null {
    const i = name.lastIndexOf(" - ");
    return i > 0 ? siteFromLabel(name.slice(i + 3)) : null;
}

function attachmentTypeFor(name: string): AttachmentType {
    const n = name.toLowerCase();
    if (/x-?ray|radiograph/.test(n)) return "xray";
    if (/mri|ct\b|usg|ultrasound|scan|doppler|echo/.test(n)) return "scan";
    return "lab_report";
}

interface Upload { key: string; name: string; state: "uploading" | "done" | "failed" }

export function ResultSheet({
    order, orderedAt, assessmentLines, find, onAddAt, onAccept, onDetails, onRemove, onUpload, onSave, onClose,
}: {
    order: VisitOrder;
    orderedAt: string;
    /** today's assessment lines, to link and to edit */
    assessmentLines: AssessmentLine[];
    find: (query: string) => Promise<IntentSearchHit[]>;
    onAddAt: (payload: AcceptPayload, site: SiteRef) => string | null;
    /** an assessment with no site (a lab result's "Anaemia"): the ordinary accept */
    onAccept: (payload: AcceptPayload) => void;
    onDetails: (id: string, details: AssessmentDetails) => void;
    onRemove: (text: string) => void;
    /** the visit's own attachment upload; absent when there is no visit yet */
    onUpload?: (file: File, meta: { type: AttachmentType; label: string; site: SiteRef | null }) => Promise<void>;
    onSave: (text: string) => void;
    onClose: () => void;
}) {
    const site = useMemo(() => orderSite(order.name), [order.name]);
    const [query, setQuery] = useState("");
    const [hits, setHits] = useState<IntentSearchHit[]>([]);
    const [searching, setSearching] = useState(false);
    const [active, setActive] = useState(0);
    /** lines made or linked from this sheet, by id; plain labels for unsited ones */
    const [linked, setLinked] = useState<string[]>([]);
    const [plain, setPlain] = useState<string[]>([]);
    /** what this sheet itself put on today's assessment (a cancel takes it back) */
    const [made, setMade] = useState<string[]>([]);
    const [openId, setOpenId] = useState<string | null>(null);
    const [normal, setNormal] = useState(false);
    const [note, setNote] = useState("");
    const [uploads, setUploads] = useState<Upload[]>([]);
    const fileRef = useRef<HTMLInputElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // After ChartSurface has taken focus onto its panel (useOverlayFocus),
    // hand it to the search: the first thing a result needs is what it showed.
    useEffect(() => {
        const t = window.setTimeout(() => inputRef.current?.focus(), 60);
        return () => window.clearTimeout(t);
    }, []);

    useEffect(() => {
        const q = query.trim();
        if (q.length < 2) { setHits([]); setSearching(false); return; }
        let live = true;
        setSearching(true);
        const t = window.setTimeout(() => {
            find(q)
                .then((h) => {
                    if (!live) return;
                    setHits(h.filter((x) => {
                        const f = familyFor(x.label);
                        return site ? !f || siteAllowed(f, site) : true;
                    }).slice(0, 6));
                })
                .catch(() => { if (live) setHits([]); })
                .finally(() => { if (live) setSearching(false); });
        }, 160);
        return () => { live = false; window.clearTimeout(t); };
    }, [query, find, site]);
    useEffect(() => { setActive(0); }, [hits]);

    const lines = linked.map((id) => assessmentLines.find((l) => l.id === id)).filter((l): l is AssessmentLine => !!l);
    // Already on today's sheet at this place, not yet linked: one press to use.
    const nearby = site
        ? assessmentLines.filter((l) => l.site && sameSite(l.site, site) && !linked.includes(l.id))
        : [];

    const pick = (h: IntentSearchHit) => {
        setQuery("");
        setHits([]);
        setNormal(false);
        const payload: AcceptPayload = {
            intentId: h.intentId, type: h.type, label: h.label, refTable: h.refTable, refId: h.refId,
            medicine: null, viaSearch: true, overridden: false,
        };
        if (site && familyFor(h.label)) {
            const existed = new Set(assessmentLines.map((l) => l.id));
            const id = onAddAt(payload, site);
            if (id) {
                if (!existed.has(id)) setMade((c) => [...c, id]);
                setLinked((c) => (c.includes(id) ? c : [...c, id]));
                setOpenId(id);
            }
            return;
        }
        onAccept(payload);
        setPlain((c) => (c.includes(h.label) ? c : [...c, h.label]));
    };

    // Leaving without saving takes back what the sheet added; a line that
    // was already on today's assessment stays as it was.
    const cancel = () => {
        for (const id of made) {
            const l = assessmentLines.find((x) => x.id === id);
            if (l) onRemove(l.text);
        }
        for (const p of plain) onRemove(p);
        onClose();
    };

    const upload = async (files: FileList | null) => {
        if (!files || !onUpload) return;
        for (const file of Array.from(files)) {
            const key = `${file.name}-${file.size}-${Date.now()}`;
            setUploads((c) => [...c, { key, name: file.name, state: "uploading" }]);
            try {
                await onUpload(file, { type: attachmentTypeFor(order.name), label: order.name, site });
                setUploads((c) => c.map((u) => (u.key === key ? { ...u, state: "done" } : u)));
            } catch {
                setUploads((c) => c.map((u) => (u.key === key ? { ...u, state: "failed" } : u)));
            }
        }
    };

    const parts = [
        ...(normal ? ["No abnormality detected"] : []),
        ...lines.map((l) => l.text),
        ...plain,
        ...(note.trim() ? [note.trim()] : []),
    ];
    const attached = uploads.filter((u) => u.state === "done").length;
    const text = parts.length ? parts.join("; ") : attached ? "Report attached" : "";
    const busy = uploads.some((u) => u.state === "uploading");

    return (
        <ChartSurface
            title={order.name}
            eyebrow="Add result"
            icon={<FlaskConical size={15} />}
            expanded
            onClose={cancel}
            maxWidth={640}
        >
            <div className="cs-rs">
                <p className="cs-rs-ordered">
                    Ordered {new Date(orderedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    {site && <> · at the <b>{clinicalSiteLabel(site).toLowerCase()}</b></>}
                </p>

                {/* ── What it showed ─────────────────────────────── */}
                <section className="cs-rs-sec">
                    <header className="cs-rs-sechead">
                        <span>What it showed</span>
                        <button
                            type="button"
                            className={`cs-rs-normal${normal ? " is-on" : ""}`}
                            aria-pressed={normal}
                            onClick={() => setNormal((v) => !v)}
                        >
                            {normal && <Check size={12} strokeWidth={2.6} aria-hidden="true" />}
                            No abnormality
                        </button>
                    </header>

                    {(lines.length > 0 || plain.length > 0) && (
                        <div className="cs-jf-tokens cs-rs-tokens">
                            {lines.map((l) => (
                                <span key={l.id} className={`cs-jf-token is-assessment${openId === l.id ? " is-open" : ""}`}>
                                    <button
                                        type="button"
                                        className="cs-jf-token-open"
                                        aria-expanded={openId === l.id}
                                        title={l.text}
                                        onClick={() => setOpenId((c) => (c === l.id ? null : l.id))}
                                    >
                                        <Stethoscope size={12} aria-hidden="true" />
                                        {l.label}
                                        {openId !== l.id && l.text.includes(", ") && (
                                            <em className="cs-jf-token-sub">{l.text.split(", ").slice(1).join(", ")}</em>
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={made.includes(l.id) ? `Take ${l.label} off this result and today's assessment` : `Unlink ${l.label} from this result`}
                                        onClick={() => {
                                            setLinked((c) => c.filter((x) => x !== l.id));
                                            if (openId === l.id) setOpenId(null);
                                            if (made.includes(l.id)) { setMade((c) => c.filter((x) => x !== l.id)); onRemove(l.text); }
                                        }}
                                    >
                                        <X size={12} />
                                    </button>
                                </span>
                            ))}
                            {plain.map((p) => (
                                <span key={p} className="cs-jf-token is-assessment">
                                    <span className="cs-rs-plain"><Stethoscope size={12} aria-hidden="true" />{p}</span>
                                    <button
                                        type="button"
                                        aria-label={`Take ${p} off this result and today's assessment`}
                                        onClick={() => { setPlain((c) => c.filter((x) => x !== p)); onRemove(p); }}
                                    >
                                        <X size={12} />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}

                    {(() => {
                        const open = lines.find((l) => l.id === openId);
                        return open ? (
                            <SiteAssessmentDetails
                                key={open.id}
                                line={open}
                                onChange={(d) => onDetails(open.id, d)}
                                onDone={() => setOpenId(null)}
                            />
                        ) : null;
                    })()}

                    <div className="cs-rs-search">
                        <div className="cs-jf-field">
                            {searching ? <Loader2 size={15} className="cs-spin" aria-hidden="true" /> : <Search size={15} aria-hidden="true" />}
                            <input
                                ref={inputRef}
                                className="cs-jf-input"
                                value={query}
                                placeholder={site ? `An assessment at the ${clinicalSiteLabel(site).toLowerCase()}: fracture, dislocation…` : "An assessment: fracture, anaemia…"}
                                aria-label="Search assessments for this result"
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (!hits.length) return;
                                    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, hits.length - 1)); }
                                    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
                                    else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); pick(hits[active]); }
                                }}
                            />
                        </div>
                        {hits.length > 0 && (
                            <div className="cs-rs-hits" role="listbox">
                                {hits.map((h, i) => (
                                    <button
                                        key={h.intentId}
                                        type="button"
                                        role="option"
                                        aria-selected={i === active}
                                        className={`cs-jf-row is-assessment${i === active ? " is-active" : ""}`}
                                        onMouseEnter={() => setActive(i)}
                                        onClick={() => pick(h)}
                                    >
                                        <span className="cs-jf-check" aria-hidden="true"><Stethoscope size={11} /></span>
                                        <span className="cs-jf-rowlabel">{h.label}</span>
                                        {site && familyFor(h.label) && <em>at {clinicalSiteLabel(site).toLowerCase()}</em>}
                                    </button>
                                ))}
                            </div>
                        )}
                        {query.trim().length >= 2 && !searching && hits.length === 0 && (
                            <p className="cs-rs-none">No assessment matches “{query.trim()}”. Say it in the note below.</p>
                        )}
                    </div>

                    {nearby.length > 0 && (
                        <div className="cs-rs-nearby">
                            <span>Already in today's assessment</span>
                            {nearby.map((l) => (
                                <button
                                    key={l.id}
                                    type="button"
                                    className="cs-rs-link"
                                    onClick={() => { setLinked((c) => [...c, l.id]); setOpenId(l.id); setNormal(false); }}
                                >
                                    <Plus size={12} aria-hidden="true" /> {l.text}
                                </button>
                            ))}
                        </div>
                    )}
                </section>

                {/* ── Report / image ────────────────────────────── */}
                <section className="cs-rs-sec">
                    <header className="cs-rs-sechead"><span>Report / image</span><em>Saved to this visit's attachments</em></header>
                    <input
                        ref={fileRef}
                        type="file"
                        accept="image/*,application/pdf"
                        multiple
                        hidden
                        onChange={(e) => { upload(e.target.files); e.target.value = ""; }}
                    />
                    <div className="cs-rs-files">
                        {uploads.map((u) => (
                            <span key={u.key} className={`cs-rs-file is-${u.state}`}>
                                {u.state === "uploading" ? <Loader2 size={13} className="cs-spin" aria-hidden="true" />
                                    : u.state === "done" ? <Check size={13} strokeWidth={2.6} aria-hidden="true" />
                                        : <X size={13} aria-hidden="true" />}
                                <FileImage size={13} aria-hidden="true" />
                                <span className="cs-rs-file-name">{u.name}</span>
                                {u.state === "failed" && <em>Upload failed</em>}
                            </span>
                        ))}
                        <button
                            type="button"
                            className="cs-rs-attach"
                            disabled={!onUpload}
                            title={onUpload ? undefined : "Start the consult to attach files"}
                            onClick={() => fileRef.current?.click()}
                        >
                            <Paperclip size={14} aria-hidden="true" />
                            {uploads.length ? "Attach another" : "Attach the image or report"}
                        </button>
                    </div>
                </section>

                {/* ── Note ──────────────────────────────────────── */}
                <section className="cs-rs-sec">
                    <header className="cs-rs-sechead"><span>Note</span><em>Optional</em></header>
                    <input
                        className="cs-rs-note"
                        value={note}
                        placeholder="Anything else the report says, e.g. ulnar styloid also fractured"
                        onChange={(e) => setNote(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && text && !busy) { e.preventDefault(); onSave(text); } }}
                    />
                </section>

                <footer className="cs-rs-foot">
                    <p className="cs-rs-preview" aria-live="polite">
                        <span>Result</span>
                        <b className={text ? "" : "is-empty"} title={text || undefined}>{text || "Nothing yet"}</b>
                    </p>
                    <div className="cs-rs-actions">
                        <button type="button" className="cs-addmed-cancel" onClick={cancel}>Cancel</button>
                        <button
                            type="button"
                            className="cs-rs-save"
                            disabled={!text || busy}
                            onClick={() => onSave(text)}
                        >
                            <Check size={15} aria-hidden="true" />
                            Save result
                        </button>
                    </div>
                </footer>
            </div>
        </ChartSurface>
    );
}
