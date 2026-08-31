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
import { Paperclip, FileText, Image as ImageIcon, Loader2, Trash2, Eye, Tag, Plus, ChevronLeft, QrCode, Monitor, Maximize2 } from "lucide-react";
import { listAttachments, uploadAttachment, deleteAttachment, updateAttachmentTags, subscribeAttachments } from "../../lib/db/attachments";
import { ATTACHMENT_TYPES, ATTACHMENT_TYPE_LABEL, ACCEPTED_MIME_ACCEPT, LATERALITY_LABEL } from "../../lib/attachments/types";
import type { Attachment, AttachmentType, Laterality } from "../../lib/attachments/types";
import { ChartSurface } from "./ChartSurface";
import { BlankAttachmentArt } from "./BlankArt";
import { useDismiss } from "./useDismiss";
import { UploadFromPhoneModal } from "./UploadFromPhoneModal";
import { AttachmentPreviewModal } from "./AttachmentPreviewModal";

const LATERALITIES: Laterality[] = ["left", "right", "bilateral"];

interface Props {
    visitId: string | null;
    /**
     * Needed only for "Upload from phone" (`visit_gateways` is hospital- and
     * patient-scoped, see `lib/db/gateways.ts`). Either missing simply hides
     * that menu item — the computer-upload flow above never needed them.
     */
    hospitalId?: string | null;
    patientId?: string | null;
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

/**
 * Two steps, not one flat list of six. Root asks WHERE the file is coming
 * from (this computer, or the patient's phone); only "This computer" drills
 * into the clinical type list (xray/lab/photo/scan/other), because that
 * choice is what drives compress.ts's profile — "Upload from phone" needs no
 * type at all, the patient's own upload interface asks nothing like it.
 *
 * Anmol, 2026-08-30: "should ask if you wanna upload through the computer or
 * phone, a simple option instead of showing 6 different options... by
 * selecting Computer, now ask if its xray and all, make that front back" —
 * i.e. swap what used to be the one and only menu (the type list) to the
 * SECOND step, behind a first step that used to not exist.
 */
type MenuStep = "root" | "types" | null;

export function AttachmentsCard({ visitId, hospitalId, patientId, disabled = false, maxInline, strip = false }: Props) {
    /** the full list, opened over the page rather than expanded in place */
    const [showAll, setShowAll] = useState(false);
    const [phoneUpload, setPhoneUpload] = useState(false);
    const [preview, setPreview] = useState<Attachment | null>(null);
    const canUploadFromPhone = !!visitId && !!hospitalId && !!patientId;
    const [items, setItems] = useState<Attachment[]>([]);
    const [menuStep, setMenuStep] = useState<MenuStep>(null);
    const menuOpen = menuStep !== null;
    const [pendingType, setPendingType] = useState<AttachmentType | null>(null);
    const [busy, setBusy] = useState<string | null>(null); // status text while uploading
    const [error, setError] = useState<string | null>(null);
    const [tagging, setTagging] = useState<number | null>(null); // attachment id whose tag panel is open
    const [regionDraft, setRegionDraft] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const headRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    /** the empty-state "click anywhere to open" zone — see below */
    const blankRef = useRef<HTMLDivElement>(null);
    /** full (non-strip) mode's whole card — its own "click anywhere" zone */
    const sectionRef = useRef<HTMLElement>(null);

    // Clicking the page behind the type list closes it. It used to stay open
    // until something was picked, so the only ways out were choosing a file
    // type you did not want or finding the trigger again.
    //
    // `blankRef` is listed here for the same reason the trigger button's own
    // wrapper (`headRef`) is: without it, clicking the blank area to OPEN the
    // menu would, on the very same click, also count as an outside click and
    // fire `onClose` — mousedown closes it, then this element's own click
    // handler reopens it, a flicker that reads as the menu refusing to open.
    // Being "inside" here just means a click here is never treated as
    // dismissal; it does not by itself open anything.
    useDismiss(menuOpen, () => setMenuStep(null), [headRef, menuRef, blankRef, sectionRef]);

    const refetch = () => {
        if (!visitId) return;
        listAttachments(visitId)
            .then((rows) => setItems(rows))
            .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    };

    useEffect(() => {
        if (!visitId) { setItems([]); return; }
        let cancelled = false;
        listAttachments(visitId)
            .then((rows) => { if (!cancelled) setItems(rows); })
            .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
        // A phone upload (arenode.com's own interface, entirely outside this
        // app — see `subscribeAttachments`'s own doc) writes this row with
        // nobody here to optimistically update `items` the way `onFileChosen`
        // does for a computer upload. Without this, the new file was invisible
        // until the doctor left this screen and came back and the effect
        // above re-ran.
        return subscribeAttachments(visitId, refetch);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visitId]);

    // Root step: skip straight to the type list when phone upload isn't wired
    // in for this caller (missing hospitalId/patientId) — same behaviour as
    // before this two-step menu existed.
    const openMenu = () => setMenuStep(canUploadFromPhone ? "root" : "types");
    /** Guarded entry point for "click anywhere in the empty card" — see below. */
    const openMenuIfClosed = () => { if (menuStep === null) openMenu(); };

    const openPhoneUpload = () => {
        setMenuStep(null);
        setPhoneUpload(true);
    };

    const openPickerFor = (type: AttachmentType) => {
        setPendingType(type);
        setMenuStep(null);
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

    // Used to be `getViewUrl` + `window.open` — a new browser tab whose
    // address bar reads as leaving Aren entirely. `AttachmentPreviewModal`
    // fetches the presigned URL itself and renders inline instead.
    const onView = (att: Attachment) => setPreview(att);

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
            {/* The row itself is the "open" affordance now — clicking
                anywhere on it (the icon, the name, the empty space)
                previews it, the way a file normally opens; the Eye icon is
                one more way in, not the only one. Every other control on the
                row (Tag/Delete) stops propagation so it fires its own
                action instead of also opening the preview underneath it. */}
            <div
                className="cs-attach-row is-clickable"
                role="button"
                tabIndex={0}
                onClick={() => onView(att)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onView(att); } }}
            >
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
                    onClick={(e) => { e.stopPropagation(); openTagPanel(att); }}
                    aria-label="Tag"
                    aria-expanded={tagging === att.id}
                    title="Which side / where"
                >
                    <Tag size={15} />
                </button>
                <button
                    type="button"
                    className="cs-attach-action"
                    onClick={(e) => { e.stopPropagation(); onView(att); }}
                    aria-label="View"
                    title="View"
                >
                    <Eye size={15} />
                </button>
                <button
                    type="button"
                    className="cs-attach-action is-danger"
                    onClick={(e) => { e.stopPropagation(); onDelete(att); }}
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

    // The menu's actual content, identical wherever it opens (strip header,
    // full-mode empty state, full-mode "Attach" button) — one function so the
    // three call sites can never drift into different steps or wording.
    // `root` only exists when phone upload is wired in (see `openMenu`); the
    // back arrow only shows on `types` when there WAS a root to go back to.
    const renderMenuStep = () => {
        if (menuStep === "root") {
            return (
                <>
                    {/* `.cs-meas-menu button` sets no `display`, so these fell back
                        to the browser default (inline-block); Tailwind's preflight
                        forces every `svg` to `display: block`, so the icon rendered
                        as its own full-width line above the text instead of beside
                        it. `inline-flex` on the button fixes it regardless of the
                        icon's own display — once the button is a flex container,
                        the icon is a flex item and lays out inline no matter what. */}
                    <button type="button" role="menuitem" className="inline-flex w-full items-center gap-1.5" onClick={() => setMenuStep("types")}>
                        <Monitor size={13} />
                        Upload from this computer
                    </button>
                    <button type="button" role="menuitem" className="inline-flex w-full items-center gap-1.5" onClick={openPhoneUpload}>
                        <QrCode size={13} />
                        Upload from phone
                    </button>
                </>
            );
        }
        return (
            <>
                {canUploadFromPhone && (
                    <button type="button" className="cs-meas-menu-back" onClick={() => setMenuStep("root")}>
                        <ChevronLeft size={12} aria-hidden="true" />
                        Back
                    </button>
                )}
                {ATTACHMENT_TYPES.map((t) => (
                    <button key={t} type="button" role="menuitem" onClick={() => openPickerFor(t)}>
                        {ATTACHMENT_TYPE_LABEL[t]}
                    </button>
                ))}
            </>
        );
    };

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
                        onClick={() => (menuOpen ? setMenuStep(null) : openMenu())}
                    >
                        <span className="cs-glyph is-slate">
                            {busy ? <Loader2 size={16} className="cs-spin" /> : <Paperclip size={16} />}
                        </span>
                        <span className="cs-card-title">Attachments</span>
                        {items.length > 0 && <em className="cs-head-count">{items.length} files</em>}
                    </button>

                    {/* "View all" moved up here beside Attach, 2026-08-31 — the
                        downward-chevron "More" row on the card's floor (still
                        there in full/non-strip mode, `.cs-attach-more`) read as a
                        second, weaker add control and cost the card a whole row
                        that changed height with the file count. One icon-button
                        per action, both fixed to the header, so the card's own
                        height stops depending on whether "More" happens to be
                        showing. */}
                    {items.length > 0 && (
                        <button
                            type="button"
                            className="cs-head-view-all"
                            onClick={() => setShowAll(true)}
                            aria-label="View all attachments"
                            title="View all"
                        >
                            <Maximize2 size={13} />
                        </button>
                    )}

                    <button
                        type="button"
                        className="cs-head-add-btn"
                        disabled={disabled || !visitId || !!busy}
                        aria-expanded={menuOpen}
                        aria-haspopup="menu"
                        aria-label="Attach a file"
                        title="Attach"
                        onClick={() => (menuOpen ? setMenuStep(null) : openMenu())}
                    >
                        <Plus size={15} />
                    </button>

                    {menuOpen && (
                        <div className="cs-meas-menu" role="menu" ref={menuRef}>
                            {renderMenuStep()}
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

                {/* Click anywhere in the empty state to open the same menu the
                    header's own trigger opens — Anmol: "should open by
                    clicking anywhere on that attachment section when there
                    is none." `openMenuIfClosed` is a no-op while a step is
                    already showing, so this can never re-open or reset one
                    in progress; `blankRef` (see `useDismiss` above) keeps a
                    click HERE from ever reading as a dismiss in the first
                    place. */}
                {items.length === 0 && !busy && (
                    <div
                        ref={blankRef}
                        className="cs-attach-blank"
                        role={!disabled && visitId ? "button" : undefined}
                        tabIndex={!disabled && visitId ? 0 : undefined}
                        onClick={() => { if (!disabled && visitId) openMenuIfClosed(); }}
                        onKeyDown={(e) => {
                            if (disabled || !visitId) return;
                            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openMenuIfClosed(); }
                        }}
                    >
                        <BlankAttachmentArt />
                        <p className="cs-attach-hint">
                            X-rays, scans and reports — when structured entry cannot
                            carry it.
                        </p>
                    </div>
                )}

                {/* Truncated by `maxInline` — said once, quietly, rather than
                    the old footer row that came and went with the file count
                    and dragged the card's own height with it. The way to the
                    rest is the "view all" icon in the header now, not a
                    second control down here. */}
                {overflow > 0 && (
                    <p className="cs-attach-hint" style={{ margin: "6px 0 0" }}>
                        {visible.length} of {items.length} shown.
                    </p>
                )}

                {error && <p className="cs-attach-error">{error}</p>}

                {/* Fixed width — the default `ChartSurface` cap (800px) is sized
                    for a chart canvas (odontogram/body map), and read as a
                    single file row stretched across most of the screen. A
                    minimum body height too, so deleting the one file here down
                    to zero doesn't shrink the modal around it. */}
                {showAll && (
                    <ChartSurface title="Attachments" eyebrow="Evidence" icon={<Paperclip size={15} />} expanded onClose={() => setShowAll(false)} maxWidth={460}>
                        <div className="cs-attach-body" style={{ minHeight: 120 }}>
                            {items.length > 0 ? items.map(renderItem) : <p className="cs-attach-empty">No attachments.</p>}
                        </div>
                    </ChartSurface>
                )}

                {preview && <AttachmentPreviewModal attachment={preview} onClose={() => setPreview(null)} />}

                {phoneUpload && visitId && hospitalId && patientId && (
                    <UploadFromPhoneModal
                        visitId={visitId}
                        hospitalId={hospitalId}
                        patientId={patientId}
                        onClose={() => setPhoneUpload(false)}
                    />
                )}
            </section>
        );
    }

    return (
        <section
            ref={sectionRef}
            className={`cs-card cs-attach${isEmpty ? " is-compact" : ""}`}
            aria-label="Attachments"
            // Click anywhere on the card while it's empty opens the same menu
            // the "Attach" button does — see the strip-mode blank state's own
            // comment for the reopen-on-dismiss hazard this guards against.
            // `sectionRef` (see `useDismiss` above) keeps every click in this
            // card, menu included, from ever reading as an outside dismiss.
            onClick={() => { if (isEmpty && !disabled && visitId) openMenuIfClosed(); }}
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
                            onClick={() => (menuOpen ? setMenuStep(null) : openMenu())}
                        >
                            <Paperclip size={15} />
                            Attach
                        </button>
                        {menuOpen && (
                            <div className="cs-meas-menu" role="menu" ref={menuRef}>
                                {renderMenuStep()}
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
                            onClick={() => (menuOpen ? setMenuStep(null) : openMenu())}
                        >
                            <Paperclip size={16} />
                            <span className="cs-meas-label">Attach</span>
                        </button>
                        {menuOpen && (
                            <div className="cs-meas-menu" role="menu" ref={menuRef}>
                                {renderMenuStep()}
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
                <ChartSurface title="Attachments" eyebrow="Evidence" icon={<Paperclip size={15} />} expanded onClose={() => setShowAll(false)} maxWidth={460}>
                    <div className="cs-attach-body" style={{ minHeight: 120 }}>
                        {items.length > 0 ? items.map(renderItem) : <p className="cs-attach-empty">No attachments.</p>}
                    </div>
                </ChartSurface>
            )}

            {preview && <AttachmentPreviewModal attachment={preview} onClose={() => setPreview(null)} />}

            {phoneUpload && visitId && hospitalId && patientId && (
                <UploadFromPhoneModal
                    visitId={visitId}
                    hospitalId={hospitalId}
                    patientId={patientId}
                    onClose={() => setPhoneUpload(false)}
                />
            )}
        </section>
    );
}
