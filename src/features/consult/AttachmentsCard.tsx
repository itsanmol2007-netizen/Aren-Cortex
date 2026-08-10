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
import { Paperclip, FileText, Image as ImageIcon, Loader2, Trash2, ExternalLink } from "lucide-react";
import { listAttachments, uploadAttachment, getViewUrl, deleteAttachment } from "../../lib/db/attachments";
import { ATTACHMENT_TYPES, ATTACHMENT_TYPE_LABEL, ACCEPTED_MIME_ACCEPT } from "../../lib/attachments/types";
import type { Attachment, AttachmentType } from "../../lib/attachments/types";

interface Props {
    visitId: string | null;
    disabled?: boolean;
}

function formatBytes(n: number | null): string {
    if (n == null) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentsCard({ visitId, disabled = false }: Props) {
    const [items, setItems] = useState<Attachment[]>([]);
    const [menuOpen, setMenuOpen] = useState(false);
    const [pendingType, setPendingType] = useState<AttachmentType | null>(null);
    const [busy, setBusy] = useState<string | null>(null); // status text while uploading
    const [error, setError] = useState<string | null>(null);
    const [viewing, setViewing] = useState<number | null>(null); // attachment id being fetched
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    return (
        <section className="cs-card" aria-label="Attachments">
            <div className="cs-card-head">
                <h2 className="cs-card-title">
                    <span className="cs-glyph is-slate"><Paperclip size={12} /></span>
                    Attachments
                </h2>
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_MIME_ACCEPT}
                className="cs-attach-input-hidden"
                onChange={onFileChosen}
            />

            <div className="cs-attach-body">
                {items.length === 0 && !busy && (
                    <p className="cs-attach-empty">
                        X-rays, lab reports, ultrasound images — attached when a chip or a
                        number can't say it.
                    </p>
                )}

                {items.map((att) => (
                    <div key={att.id} className="cs-attach-row">
                        <span className="cs-attach-icon">
                            {att.mimeType?.startsWith("image/") ? <ImageIcon size={14} /> : <FileText size={14} />}
                        </span>
                        <span className="cs-attach-meta">
                            <span className="cs-attach-label">
                                {att.attachmentType ? ATTACHMENT_TYPE_LABEL[att.attachmentType] : "Attachment"}
                            </span>
                            <span className="cs-attach-size">{formatBytes(att.sizeBytes)}</span>
                        </span>
                        <button
                            type="button"
                            className="cs-attach-action"
                            disabled={viewing === att.id}
                            onClick={() => onView(att)}
                            aria-label="View"
                            title="View"
                        >
                            {viewing === att.id ? <Loader2 size={13} className="cs-spin" /> : <ExternalLink size={13} />}
                        </button>
                        <button
                            type="button"
                            className="cs-attach-action is-danger"
                            onClick={() => onDelete(att)}
                            aria-label="Remove"
                            title="Remove"
                        >
                            <Trash2 size={13} />
                        </button>
                    </div>
                ))}

                {busy && (
                    <div className="cs-attach-row is-busy">
                        <Loader2 size={13} className="cs-spin" />
                        <span className="cs-attach-label">{busy}</span>
                    </div>
                )}

                <div className="cs-attach-add">
                    <button
                        type="button"
                        className="cs-meas-add"
                        disabled={disabled || !visitId || !!busy}
                        aria-expanded={menuOpen}
                        onClick={() => setMenuOpen((v) => !v)}
                    >
                        <Paperclip size={13} />
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

                {error && <p className="cs-attach-error">{error}</p>}
            </div>
        </section>
    );
}
