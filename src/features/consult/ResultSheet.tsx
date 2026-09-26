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

import { Check, FileImage, FlaskConical, Loader2, Monitor, Plus, QrCode, Search, Stethoscope, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChartSurface } from "./ChartSurface";
import { SiteAssessmentDetails } from "./SiteAssessmentDetails";
import { familyFor, siteAllowed, type AssessmentDetails } from "./assessmentFamilies";
import type { AssessmentLine } from "./assessmentPlan";
import type { AcceptPayload } from "./types";
import { clinicalSiteLabel, normalizeSite, sameSite, siteFromLabel, type SiteRef } from "../../lib/body/clinicalSite";
import type { BodyRegion } from "../../lib/body/anatomy";
import type { IntentSearchHit } from "../../lib/db/synapse";
import type { VisitOrder } from "../../lib/db";
import type { Attachment, AttachmentType, Laterality } from "../../lib/attachments/types";
import { listAttachments, subscribeAttachments, updateAttachmentTags, uploadAttachment } from "../../lib/db/attachments";
import { UploadFromPhoneModal } from "./UploadFromPhoneModal";
import { AttachmentPreviewModal } from "./AttachmentPreviewModal";

/** Where on the body an order's name points, most specific first. */
const REGION_WORDS: [RegExp, BodyRegion][] = [
    [/wrist/, "wrist"],
    [/hand|finger|thumb|metacarp|phalan|scaphoid/, "hand"],
    [/forearm|radius|ulna/, "forearm"],
    [/elbow/, "elbow"],
    [/humerus|upper arm/, "upper_arm"],
    [/shoulder|clavic|scapul|acromio/, "shoulder"],
    [/cervical|neck/, "neck"],
    [/lumbar|lumbo|sacr|coccy|low back/, "torso_lower"],
    [/thoracic|dorsal spine/, "torso_upper"],
    [/pelvi/, "pelvis"],
    [/hip/, "hip"],
    [/femur|thigh/, "thigh"],
    [/knee|patell/, "knee"],
    [/tibia|fibula|\bleg\b|shin/, "lower_leg"],
    [/ankle/, "ankle"],
    [/foot|heel|calcan|\btoe|metatars/, "foot"],
];

/**
 * The order's site, from its name. Orders are named more than one way:
 * "X-Ray Hand / Wrist - Right wrist" (composed with its site),
 * "X-Ray Hand / Wrist — Left" (an older composition: the side alone),
 * "X-ray Right Knee (AP/Lateral, weight-bearing)". The composed site is
 * read first; otherwise the side and the part are picked out of the words.
 * Null for an order with no part of a limb or spine in it (a chest X-ray,
 * a blood count).
 */
export function orderSite(name: string): SiteRef | null {
    const tail = name.split(/\s[-—–]\s/);
    if (tail.length > 1) {
        const exact = siteFromLabel(tail[tail.length - 1]);
        if (exact) return exact;
    }
    const n = name.toLowerCase();
    const region = REGION_WORDS.find(([re]) => re.test(n))?.[1];
    if (!region) return null;
    const side: SiteRef["side"] = /\b(bilateral|both)\b/.test(n) ? "both"
        : /\b(left|lt)\b/.test(n) ? "left"
            : /\b(right|rt)\b/.test(n) ? "right" : null;
    const aspect = region === "neck" || region === "torso_upper" || region === "torso_lower" ? "back" : "front";
    return normalizeSite({ region, side, aspect });
}

function attachmentTypeFor(name: string): AttachmentType {
    const n = name.toLowerCase();
    if (/x-?ray|radiograph/.test(n)) return "xray";
    if (/mri|ct\b|usg|ultrasound|scan|doppler|echo/.test(n)) return "scan";
    return "lab_report";
}

/**
 * Everything a result was made of, kept by the caller per order so the
 * sheet reopens as it was saved ("Edit result"), not blank.
 */
export interface ResultDraft {
    /** today's assessment lines this result points at */
    linked: string[];
    /** of those, the ones this result itself created (its x takes them off today's assessment) */
    owned: string[];
    /** assessments with no place ("Anaemia"), by name */
    plain: string[];
    normal: boolean;
    note: string;
    /** this visit's attachments that belong to the result */
    attachmentIds: number[];
}

export const EMPTY_RESULT_DRAFT: ResultDraft = { linked: [], owned: [], plain: [], normal: false, note: "", attachmentIds: [] };

interface Upload { key: string; name: string; state: "uploading" | "failed" }

export function ResultSheet({
    order, orderedAt, assessmentLines, find, onAddAt, onAccept, onDetails, onRemove,
    visitId, hospitalId, patientId, initial = EMPTY_RESULT_DRAFT, editing = false, onSave, onClose,
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
    /** the visit the image lands on; without one there is nothing to attach to */
    visitId: string | null;
    /** for "Upload from phone" (the visit gateway QR), as on the Attachments card */
    hospitalId?: string | null;
    patientId?: string | null;
    /** what the result was made of when it was last saved */
    initial?: ResultDraft;
    editing?: boolean;
    onSave: (text: string, draft: ResultDraft) => void;
    onClose: () => void;
}) {
    const site = useMemo(() => orderSite(order.name), [order.name]);
    const [query, setQuery] = useState("");
    const [hits, setHits] = useState<IntentSearchHit[]>([]);
    const [searching, setSearching] = useState(false);
    const [active, setActive] = useState(0);
    /** lines made or linked from this sheet, by id; plain labels for unsited ones */
    const [linked, setLinked] = useState<string[]>(initial.linked);
    const [plain, setPlain] = useState<string[]>(initial.plain);
    /** made by this result, at any sitting */
    const [owned, setOwned] = useState<string[]>(initial.owned);
    /** made at THIS sitting — what a cancel takes back */
    const [made, setMade] = useState<string[]>([]);
    const [madePlain, setMadePlain] = useState<string[]>([]);
    const [openId, setOpenId] = useState<string | null>(null);
    const [normal, setNormal] = useState(initial.normal);
    const [note, setNote] = useState(initial.note);
    const [uploads, setUploads] = useState<Upload[]>([]);
    const fileRef = useRef<HTMLInputElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // ── The image: this visit's attachments, the Attachments card's own ──
    // Two ways in, the same two the Attachments card offers: this computer,
    // or the patient's phone (the visit-gateway QR). A computer upload is
    // labelled with the order and its side; a phone upload arrives over
    // realtime with neither, so anything that lands while the sheet is open
    // is taken as this result's and tagged with the side when it is saved.
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [mine, setMine] = useState<number[]>(initial.attachmentIds);
    const [dropped, setDropped] = useState<number[]>([]);
    const [chooser, setChooser] = useState(false);
    const [phone, setPhone] = useState(false);
    const [preview, setPreview] = useState<Attachment | null>(null);
    const openedAt = useRef(Date.now());
    useEffect(() => {
        if (!visitId) return;
        let live = true;
        const load = () => listAttachments(visitId).then((a) => { if (live) setAttachments(a); }).catch(() => {});
        load();
        const off = subscribeAttachments(visitId, load);
        return () => { live = false; off(); };
    }, [visitId]);
    const arrived = attachments
        .filter((a) => new Date(a.createdAt).getTime() >= openedAt.current - 2000)
        .map((a) => a.id);
    const resultAttachments = attachments.filter(
        (a) => (mine.includes(a.id) || arrived.includes(a.id)) && !dropped.includes(a.id),
    );
    const canPhone = !!visitId && !!hospitalId && !!patientId;

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
                if (!existed.has(id)) { setMade((c) => [...c, id]); setOwned((c) => [...c, id]); }
                setLinked((c) => (c.includes(id) ? c : [...c, id]));
                setOpenId(id);
            }
            return;
        }
        onAccept(payload);
        if (familyFor(h.label)) {
            // No site on the order (a chest X-ray showing a rib fracture):
            // the ordinary accept asks where, in its own modal. The line it
            // makes is linked here when it lands (the effect below).
            waiting.current = { label: h.label.toLowerCase(), before: new Set(assessmentLines.map((l) => l.id)) };
            return;
        }
        setPlain((c) => (c.includes(h.label) ? c : [...c, h.label]));
        setMadePlain((c) => [...c, h.label]);
    };

    const waiting = useRef<{ label: string; before: Set<string> } | null>(null);
    useEffect(() => {
        const w = waiting.current;
        if (!w) return;
        const landed = assessmentLines.find((l) => !w.before.has(l.id) && l.label.toLowerCase() === w.label);
        if (!landed) return;
        waiting.current = null;
        setMade((c) => [...c, landed.id]);
        setOwned((c) => [...c, landed.id]);
        setLinked((c) => (c.includes(landed.id) ? c : [...c, landed.id]));
        setOpenId(landed.id);
    }, [assessmentLines]);

    // Leaving without saving takes back what the sheet added; a line that
    // was already on today's assessment stays as it was.
    const cancel = () => {
        for (const id of made) {
            const l = assessmentLines.find((x) => x.id === id);
            if (l) onRemove(l.text);
        }
        for (const p of madePlain) onRemove(p);
        onClose();
    };

    const laterality: Laterality | undefined = site?.side === "both" ? "bilateral" : site?.side ?? undefined;
    const upload = async (files: FileList | null) => {
        if (!files || !visitId) return;
        for (const file of Array.from(files)) {
            const key = `${file.name}-${file.size}-${Date.now()}`;
            setUploads((c) => [...c, { key, name: file.name, state: "uploading" }]);
            try {
                const att = await uploadAttachment({
                    visitId, file, attachmentType: attachmentTypeFor(order.name), label: order.name,
                    laterality, bodyRegion: site?.region,
                });
                setAttachments((c) => (c.some((x) => x.id === att.id) ? c : [att, ...c]));
                setMine((c) => [...c, att.id]);
                setUploads((c) => c.filter((u) => u.key !== key));
            } catch {
                setUploads((c) => c.map((u) => (u.key === key ? { ...u, state: "failed" } : u)));
            }
        }
    };

    const save = (text: string) => {
        // A phone upload carries no side or place; the order knows both.
        for (const a of resultAttachments) {
            if (!a.laterality && !a.bodyRegion && (laterality || site)) {
                updateAttachmentTags(a.id, { laterality: laterality ?? null, bodyRegion: site?.region ?? null }).catch(() => {});
            }
        }
        onSave(text, {
            linked, owned: owned.filter((id) => linked.includes(id)), plain, normal, note: note.trim(),
            attachmentIds: resultAttachments.map((a) => a.id),
        });
    };

    const parts = [
        ...(normal ? ["No abnormality detected"] : []),
        ...lines.map((l) => l.text),
        ...plain,
        ...(note.trim() ? [note.trim()] : []),
    ];
    const attached = resultAttachments.length;
    const text = parts.length ? parts.join("; ") : attached ? "Report attached" : "";
    const busy = uploads.some((u) => u.state === "uploading");

    return (
        <ChartSurface
            title={order.name}
            eyebrow={editing ? "Edit result" : "Add result"}
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
                                        aria-label={owned.includes(l.id) ? `Take ${l.label} off this result and today's assessment` : `Unlink ${l.label} from this result`}
                                        onClick={() => {
                                            setLinked((c) => c.filter((x) => x !== l.id));
                                            if (openId === l.id) setOpenId(null);
                                            if (owned.includes(l.id)) {
                                                setOwned((c) => c.filter((x) => x !== l.id));
                                                setMade((c) => c.filter((x) => x !== l.id));
                                                onRemove(l.text);
                                            }
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
                        {resultAttachments.map((a) => (
                            <span key={a.id} className="cs-rs-file is-done">
                                <button type="button" className="cs-rs-file-view" onClick={() => setPreview(a)} title="View">
                                    <Check size={13} strokeWidth={2.6} aria-hidden="true" />
                                    <FileImage size={13} aria-hidden="true" />
                                    <span className="cs-rs-file-name">{a.label || (a.mimeType?.includes("pdf") ? "Report (PDF)" : "Image")}</span>
                                </button>
                                <button
                                    type="button"
                                    className="cs-rs-file-x"
                                    aria-label="Not part of this result"
                                    title="Not part of this result (stays in the visit's attachments)"
                                    onClick={() => { setMine((c) => c.filter((x) => x !== a.id)); setDropped((c) => [...c, a.id]); }}
                                >
                                    <X size={12} />
                                </button>
                            </span>
                        ))}
                        {uploads.map((u) => (
                            <span key={u.key} className={`cs-rs-file is-${u.state}`}>
                                {u.state === "uploading" ? <Loader2 size={13} className="cs-spin" aria-hidden="true" /> : <X size={13} aria-hidden="true" />}
                                <FileImage size={13} aria-hidden="true" />
                                <span className="cs-rs-file-name">{u.name}</span>
                                {u.state === "failed" && <em>Upload failed</em>}
                            </span>
                        ))}
                        {/* The Attachments card's own two ways in. */}
                        {chooser ? (
                            <span className="cs-rs-chooser" role="group" aria-label="Upload from">
                                <button type="button" onClick={() => { setChooser(false); fileRef.current?.click(); }}>
                                    <Monitor size={14} aria-hidden="true" /> This computer
                                </button>
                                <button
                                    type="button"
                                    disabled={!canPhone}
                                    title={canPhone ? "Show a QR code the patient scans to upload" : "Phone upload needs a saved patient"}
                                    onClick={() => { setChooser(false); setPhone(true); }}
                                >
                                    <QrCode size={14} aria-hidden="true" /> Phone
                                </button>
                                <button type="button" className="cs-rs-chooser-x" aria-label="Cancel" onClick={() => setChooser(false)}>
                                    <X size={13} />
                                </button>
                            </span>
                        ) : (
                            <button
                                type="button"
                                className="cs-rs-attach"
                                disabled={!visitId}
                                title={visitId ? undefined : "Start the consult to attach files"}
                                onClick={() => (canPhone ? setChooser(true) : fileRef.current?.click())}
                            >
                                <Plus size={14} aria-hidden="true" />
                                {resultAttachments.length || uploads.length ? "Attach another" : "Attach the image or report"}
                            </button>
                        )}
                    </div>
                    {phone && (
                        <p className="cs-rs-phone-note">
                            <QrCode size={12} aria-hidden="true" /> Anything the patient uploads now joins this result.
                        </p>
                    )}
                </section>

                {/* ── Note ──────────────────────────────────────── */}
                <section className="cs-rs-sec">
                    <header className="cs-rs-sechead"><span>Note</span><em>Optional</em></header>
                    <input
                        className="cs-rs-note"
                        value={note}
                        placeholder="Anything else the report says, e.g. ulnar styloid also fractured"
                        onChange={(e) => setNote(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && text && !busy) { e.preventDefault(); save(text); } }}
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
                            onClick={() => save(text)}
                        >
                            <Check size={15} aria-hidden="true" />
                            {editing ? "Update result" : "Save result"}
                        </button>
                    </div>
                </footer>
            </div>
            {phone && visitId && hospitalId && patientId && (
                <UploadFromPhoneModal
                    visitId={visitId}
                    hospitalId={hospitalId}
                    patientId={patientId}
                    onClose={() => setPhone(false)}
                />
            )}
            {preview && <AttachmentPreviewModal attachment={preview} onClose={() => setPreview(null)} />}
        </ChartSurface>
    );
}
