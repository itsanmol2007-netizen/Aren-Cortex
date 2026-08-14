// ---------------------------------------------------------------------------
// ATTACHMENTS — the one place a file (X-ray, lab report, photo) enters a
// consultation. Deliberately a secondary action, not a primary input — the
// UI philosophy agreed with Anmol 2026-08-08: "structured first, artifact
// when necessary." Chips and measurements stay the default; this exists for
// when the clinical reality genuinely cannot be represented by either.
//
// The interaction mirrors MeasurementsCard's "Add Measurement" pattern on
// purpose (button -> small menu -> action) rather than inventing a new one:
// tap "+ Attach", pick what kind of file this is, the native file picker
// opens for that type immediately. The type has to be picked FIRST, not
// asked after the file is already chosen, because it drives the compression
// profile (compress.ts) — an X-ray compressed as if it were a lab report
// would lose the detail it was taken for.
//
// Thumbnails are not eagerly fetched. Every visible file would mean an
// immediate signed-URL round trip on load, for detail nobody asked to see
// yet — the same restraint already applied to brand candidate windows
// elsewhere in this codebase. A file shows its type icon, label and size;
// viewing it is one click, lazy, on demand.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { Paperclip, FileText, Image as ImageIcon, Loader2, Trash2, ExternalLink, Tag, Plus, ChevronDown } from "lucide-react";
import { listAttachments, uploadAttachment, getViewUrl, deleteAttachment, updateAttachmentTags } from "../../lib/db/attachments";
import { ATTACHMENT_TYPES, ATTACHMENT_TYPE_LABEL, ACCEPTED_MIME_ACCEPT, LATERALITY_LABEL } from "../../lib/attachments/types";
import type { Attachment, AttachmentType, Laterality } from "../../lib/attachments/types";
import { ChartSurface } from "./ChartSurface";
import { BlankAttachmentArt } from "./BlankArt";
import { useDismiss } from "./useDismiss";

const LATERALITIES: Laterality[] = ["left", "right", "bilateral"];

interface Props {
    visitId: string | null;
    disabled?: boolean;
    /**
     * How many files list inline before the rest move behind a modal.
     *
     * This card used to grow one row per file, forever, in a column shared
     * with Measurements. Five reports pushed the Assessment a screen further
     * down the page for something the philosophy calls secondary evidence.
     * Past this count the card stops growing and a single row opens the full
     * list over the page instead. Omitted means no cap, which is what the
     * legacy full-width surface still wants.
     */
    maxInline?: number;
    /**
     * Render files as a horizontal STRIP of small cards rather than as full
     * rows.
     *
     * The row form costs one line of page height per file, forever, in a
     * column that must not grow. The strip costs one row total: type icon,
     * name, size, and the way in sitting beside them. Tagging, viewing and
     * deleting move into the modal, which is where a file actually needs room.
     */
    strip?: boolean;
}

function formatBytes(n: number | null): string {
    if (n == null) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentsCard({ visitId, disabled = false, maxInline, strip = false }: Props) {
    /** the full list, opened over the page rather than expanded in place */
    const [showAll, setShowAll] = useState(false);
    const [items, setItems] = useState<Attachment[]>([]);
    const [menuOpen, setMenuOpen] = useState(false);
    const [pendingType, setPendingType] = useState<AttachmentType | null>(null);
    const [busy, setBusy] = useState<string | null>(null); // status text while uploading
    const [error, setError] = useState<string | null>(null);
    const [viewing, setViewing] = useState<number | null>(null); // attachment id being fetched
    const [tagging, setTagging] = useState<number | null>(null); // attachment id whose tag panel is open
    const [regionDraft, setRegionDraft] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const headRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Clicking the page behind the type list closes it. It used to stay open
    // until something was picked, so the only ways out were choosing a file
    // type you did not want or finding the trigger again.
    useDismiss(menuOpen, () => setMenuOpen(false), [headRef, menuRef]);

    useEffect(() => {
        if (!visitId) { setItems([]); return; }
        let cancelled = false;
        listAttachments(visitId)
            .then((rows) => { if (!cancelled) setItems(rows); })
            .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
        return () => { cancelled = true; };
    }, [visitId]);

    const openPickerFor = (type: AttachmentType) => {
        setPendingType(type);
        setMenuOpen(false);
        // Reset first — selecting the same file twice in a row does not fire
        // `change` on an unreset input.
        if (fileInputRef.current) fileInputRef.current.value = "";
        fileInputRef.current?.click();
    };

    const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        const type = pendingType;
        if (!file || !type || !visitId) return;

        setError(null);
        try {
            const attachment = await uploadAttachment(
                { visitId, file, attachmentType: type },
                (p) => setBusy(p.stage === "compressing" ? "Compressing…" : p.stage === "uploading" ? "Uploading…" : "Saving…")
            );
            setItems((curr) => [attachment, ...curr]);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Upload failed");
        } finally {
            setBusy(null);
            setPendingType(null);
        }
    };

    const onView = async (att: Attachment) => {
        setViewing(att.id);
        setError(null);
        try {
            const url = await getViewUrl(att.storagePath);
            window.open(url, "_blank", "noopener,noreferrer");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not open attachment");
        } finally {
            setViewing(null);
        }
    };

    const openTagPanel = (att: Attachment) => {
        setTagging((curr) => (curr === att.id ? null : att.id));
        setRegionDraft(att.bodyRegion ?? "");
    };

    const setLaterality = async (att: Attachment, laterality: Laterality) => {
        // toggling the same value off — a doctor un-tagging a mis-click
        const next = att.laterality === laterality ? null : laterality;
        setItems((curr) => curr.map((i) => (i.id === att.id ? { ...i, laterality: next } : i)));
        try {
            await updateAttachmentTags(att.id, { laterality: next });
        } catch {
            setItems((curr) => curr.map((i) => (i.id === att.id ? { ...i, laterality: att.laterality } : i)));
        }
    };

    const saveBodyRegion = async (att: Attachment) => {
        const next = regionDraft.trim() || null;
        setItems((curr) => curr.map((i) => (i.id === att.id ? { ...i, bodyRegion: next } : i)));
        try {
            await updateAttachmentTags(att.id, { bodyRegion: next });
        } catch {
            setItems((curr) => curr.map((i) => (i.id === att.id ? { ...i, bodyRegion: att.bodyRegion } : i)));
        }
        setTagging(null);
    };

    const onDelete = async (att: Attachment) => {
        setError(null);
        // Optimistic — a doctor deleting a mis-attached file wants it gone
        // from the list immediately, not after a round trip.
        setItems((curr) => curr.filter((i) => i.id !== att.id));
        try {
            await deleteAttachment(att.storagePath);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Delete failed");
            setItems((curr) => [att, ...curr]); // put it back — the delete didn't actually happen
        }
    };

    // Empty is the overwhelmingly common case — "structured first, artifact
    // when necessary" means most consultations attach nothing at all. So an
    // empty card collapses to a single row: title, the Attach control, and
    // nothing else. It used to spend a full card and a two-line explanation
    // on saying "there is nothing here", directly above the ranked columns
    // that actually needed the room.
    const isEmpty = items.length === 0 && !busy;

    // Sliced for the card, whole for the modal. One renderer for both, so the
    // two can never drift into showing different controls for the same file.
    const visible = maxInline != null ? items.slice(0, maxInline) : items;
    const overflow = items.length - visible.length;

    const renderItem = (att: Attachment) => (
        <div key={att.id} className="cs-attach-item">
            <div className="cs-attach-row">
                <span className="cs-attach-icon">
                    {att.mimeType?.startsWith("image/") ? <ImageIcon size={17} /> : <FileText size={17} />}
                </span>
                <span className="cs-attach-meta">
                    <span className="cs-attach-label">
                        {att.attachmentType ? ATTACHMENT_TYPE_LABEL[att.attachmentType] : "Attachment"}
                        {att.laterality && <i className="cs-attach-tagbadge">{LATERALITY_LABEL[att.laterality]}</i>}
                        {att.bodyRegion && <i className="cs-attach-tagbadge">{att.bodyRegion}</i>}
                    </span>
                    <span className="cs-attach-size">{formatBytes(att.sizeBytes)}</span>
                </span>
                <button
                    type="button"
                    className={`cs-attach-action${tagging === att.id ? " is-active" : ""}`}
                    onClick={() => openTagPanel(att)}
                    aria-label="Tag"
                    aria-expanded={tagging === att.id}
                    title="Which side / where"
                >
                    <Tag size={15} />
                </button>
                <button
                    type="button"
                    className="cs-attach-action"
                    disabled={viewing === att.id}
                    onClick={() => onView(att)}
                    aria-label="View"
                    title="View"
                >
                    {viewing === att.id ? <Loader2 size={15} className="cs-spin" /> : <ExternalLink size={15} />}
                </button>
                <button
                    type="button"
                    className="cs-attach-action is-danger"
                    onClick={() => onDelete(att)}
                    aria-label="Remove"
                    title="Remove"
                >
                    <Trash2 size={15} />
                </button>
            </div>

            {tagging === att.id && (
                <div className="cs-attach-tagpanel">
                    <div className="cs-attach-tagrow">
                        {LATERALITIES.map((l) => (
                            <button
                                key={l}
                                type="button"
                                className={`cs-attach-chip${att.laterality === l ? " is-on" : ""}`}
                                onClick={() => setLaterality(att, l)}
                            >
                                {LATERALITY_LABEL[l]}
                            </button>
                        ))}
                    </div>
                    <div className="cs-attach-tagrow">
                        <input
                            className="cs-attach-region-input"
                            placeholder="Body region — e.g. face, palms, forearm"
                            value={regionDraft}
                            onChange={(e) => setRegionDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") saveBodyRegion(att); }}
                        />
                        <button type="button" className="cs-attach-tagsave" onClick={() => saveBodyRegion(att)}>
                            Save
                        </button>
                    </div>
                </div>
            )}
        </div>
    );

    /** One file as a small card in the strip. Opens the full list on click. */
    const renderTile = (att: Attachment) => (
        <button
            key={att.id}
            type="button"
            className="cs-attach-tile"
            onClick={() => setShowAll(true)}
            title={`${formatBytes(att.sizeBytes)} — open`}
        >
            <span className="cs-attach-tile-icon">
                {att.mimeType?.startsWith("image/") ? <ImageIcon size={15} /> : <FileText size={15} />}
            </span>
            <span className="cs-attach-tile-meta">
                <span className="cs-attach-tile-name">
                    {att.attachmentType ? ATTACHMENT_TYPE_LABEL[att.attachmentType] : "Attachment"}
                </span>
                <span className="cs-attach-tile-size">{formatBytes(att.sizeBytes)}</span>
            </span>
        </button>
    );

    if (strip) {
        return (
            <section className="cs-card cs-attach is-strip" aria-label="Attachments">
                {/* THE HEADING IS THE BUTTON.
                    A separate "Attach" row below the title cost a whole line of
                    a card that must not grow, to say a second time what the
                    paperclip already says. Pressing anywhere on the heading
                    opens the type list. */}
                {/* `is-utility` puts this title in the second tier. Attachments
                    is supporting evidence — "structured first, artifact when
                    necessary" — and it was rendering its heading at exactly the
                    weight of ASSESSMENT two cards below. See the hierarchy note
                    in consult.css. */}
                <div className="cs-card-head is-trigger is-utility" ref={headRef}>
                    <button
                        type="button"
                        className="cs-head-action"
                        disabled={disabled || !visitId || !!busy}
                        aria-expanded={menuOpen}
                        aria-haspopup="menu"
                        onClick={() => setMenuOpen((v) => !v)}
                    >
                        <span className="cs-glyph is-slate">
                            {busy ? <Loader2 size={16} className="cs-spin" /> : <Paperclip size={16} />}
                        </span>
                        <span className="cs-card-title">Attachments</span>
                        {items.length > 0 && <em className="cs-head-count">{items.length} files</em>}
                        <Plus size={15} className="cs-head-plus" />
                    </button>

                    {menuOpen && (
                        <div className="cs-meas-menu" role="menu" ref={menuRef}>
                            {ATTACHMENT_TYPES.map((t) => (
                                <button key={t} type="button" role="menuitem" onClick={() => openPickerFor(t)}>
                                    {ATTACHMENT_TYPE_LABEL[t]}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_MIME_ACCEPT}
                    className="cs-attach-input-hidden"
                    onChange={onFileChosen}
                />

                {visible.length > 0 && (
                    <div className="cs-attach-strip">{visible.map(renderTile)}</div>
                )}

                {items.length === 0 && !busy && (
                    <div className="cs-attach-blank">
                        <BlankAttachmentArt />
                        <p className="cs-attach-hint">
                            X-rays, scans and reports — when structured entry cannot
                            carry it.
                        </p>
                    </div>
                )}

                {/* The footer exists so a CAPPED card can never silently imply
                    it is showing everything. With no files there is nothing to
                    cap, so "0 / 0 shown" was a hairline and 31px of page height
                    spent counting nothing — on the exact screen state this pass
                    is about. It comes back the moment a file does. */}
                {items.length > 0 && (
                    <div className="cs-card-foot">
                        <span className="cs-card-foot-count">
                            {visible.length} / {items.length} shown
                        </span>
                        <button
                            type="button"
                            className="cs-card-foot-more"
                            onClick={() => setShowAll(true)}
                        >
                            More
                            <ChevronDown size={13} />
                        </button>
                    </div>
                )}

                {error && <p className="cs-attach-error">{error}</p>}

                {showAll && (
                    <ChartSurface title="Attachments" expanded onClose={() => setShowAll(false)}>
                        <div className="cs-attach-body">{items.map(renderItem)}</div>
                    </ChartSurface>
                )}
            </section>
        );
    }

    return (
        <section
            className={`cs-card cs-attach${isEmpty ? " is-compact" : ""}`}
            aria-label="Attachments"
        >
            <div className="cs-card-head">
                <h2 className="cs-card-title">
                    <span className="cs-glyph is-slate"><Paperclip size={16} /></span>
                    Attachments
                    {items.length > 0 && (
                        <em>{items.length} file{items.length > 1 ? "s" : ""}</em>
                    )}
                </h2>

                {/* The way in lives in the header when there is nothing to
                    show, so the empty state costs one row instead of a card. */}
                {isEmpty && (
                    <div className="cs-attach-add is-inhead">
                        <button
                            type="button"
                            className="cs-attach-trigger"
                            disabled={disabled || !visitId}
                            aria-expanded={menuOpen}
                            onClick={() => setMenuOpen((v) => !v)}
                        >
                            <Paperclip size={15} />
                            Attach
                        </button>
                        {menuOpen && (
                            <div className="cs-meas-menu" role="menu">
                                {ATTACHMENT_TYPES.map((t) => (
                                    <button key={t} type="button" role="menuitem" onClick={() => openPickerFor(t)}>
                                        {ATTACHMENT_TYPE_LABEL[t]}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_MIME_ACCEPT}
                className="cs-attach-input-hidden"
                onChange={onFileChosen}
            />

            <div className="cs-attach-body">

                {visible.map(renderItem)}

                {/* The card stops growing here. A modal costs no page height
                    and gives the files more room than the column ever could. */}
                {overflow > 0 && (
                    <button
                        type="button"
                        className="cs-attach-more"
                        onClick={() => setShowAll(true)}
                    >
                        {overflow} more file{overflow > 1 ? "s" : ""}
                    </button>
                )}

                {busy && (
                    <div className="cs-attach-row is-busy">
                        <Loader2 size={13} className="cs-spin" />
                        <span className="cs-attach-label">{busy}</span>
                    </div>
                )}

                {/* Once there IS something here, the way in returns to the
                    body, below the list it adds to. */}
                {!isEmpty && (
                    <div className="cs-attach-add">
                        <button
                            type="button"
                            className="cs-meas-add"
                            disabled={disabled || !visitId || !!busy}
                            aria-expanded={menuOpen}
                            onClick={() => setMenuOpen((v) => !v)}
                        >
                            <Paperclip size={16} />
                            <span className="cs-meas-label">Attach</span>
                        </button>
                        {menuOpen && (
                            <div className="cs-meas-menu" role="menu">
                                {ATTACHMENT_TYPES.map((t) => (
                                    <button key={t} type="button" role="menuitem" onClick={() => openPickerFor(t)}>
                                        {ATTACHMENT_TYPE_LABEL[t]}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {error && <p className="cs-attach-error">{error}</p>}
            </div>

            {/* Same rows, same controls, all of them. Reuses ChartSurface so
                attachments and the odontogram cannot look like they were
                built by different people. */}
            {showAll && (
                <ChartSurface title="Attachments" expanded onClose={() => setShowAll(false)}>
                    <div className="cs-attach-body">{items.map(renderItem)}</div>
                </ChartSurface>
            )}
        </section>
    );
}
