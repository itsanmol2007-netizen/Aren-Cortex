// ---------------------------------------------------------------------------
// CLINIC UI PRIMITIVES — Tailwind, no stylesheet.
//
// Everything the Clinic page and the Prescription Editor are made of lives
// here as components carrying Tailwind classes, rather than in a `clinic.css`
// of hand-written selectors. That is the convention the front-desk suite
// already follows (`FrontDeskPage`, `PrintRxPage`, …) and the one this feature
// now follows too: restructuring a layout means editing the markup you are
// already looking at, not hunting a selector in a second file.
//
// The VALUES are still the design system's, not new ones. Every colour, radius
// and spacing step below is `var(--cs-*)` read through an arbitrary value
// (`bg-[var(--cs-card)]`), so these screens keep tracking the same tokens
// Consult and Practice do — a token change still reaches them, and there is no
// second palette to drift.
//
// ── One rule to keep in mind when editing this file ───────────────────────
// Tailwind finds classes by SCANNING THE SOURCE TEXT. A class assembled at
// runtime (`` `hover:${tone.soft}` ``) is never generated, because that exact
// string appears nowhere for the scanner to find. So every class string —
// variants included — is written out whole in the `TONE` table below, and the
// components only ever interpolate a whole entry. Never build a variant prefix
// by concatenation.
// ---------------------------------------------------------------------------

import { useId, useRef } from "react";
import type { ReactNode } from "react";
import { Upload, X } from "lucide-react";
import { compressImage, formatBytes, type CompressedImage } from "../../lib/image/compress";

// ── The one cascade trap on this codebase, and how these files dodge it ────
// `src/styles/base.css` is UNLAYERED and styles bare elements:
//   h2 { font-size: 12px; text-transform: uppercase }
//   input, select { height: 31px; padding: 0 9px; font-size: 13px; … }
// Tailwind's utilities live in the `utilities` cascade layer, and unlayered
// CSS beats every layer regardless of specificity — so `text-[17px]` on an
// `<h2>` silently rendered at 12px (measured live, 2026-08-29: every clinic
// and doctor name on this page was 12px and shouting in caps).
//
// Two dodges, both local to this feature so no legacy page's cascade moves:
//   * Headings render as `<div role="heading" aria-level>` — a real heading in
//     the accessibility tree, with no element selector to lose to.
//   * Form controls mark the colliding declarations `!` (Tailwind v4's
//     trailing-bang), which is what actually outranks an unlayered rule.
// The real fix is to move base.css's bare-element block into `@layer base`;
// that is a cross-cutting change to every legacy screen's cascade, so it is
// flagged rather than done here.

/** A heading that survives `base.css`. Same semantics as `<h2>`/`<h3>` for a
 *  screen reader, no element selector for the legacy stylesheet to grab. */
export function Heading({
    level = 2, className, children,
}: { level?: 2 | 3; className?: string; children: ReactNode }) {
    return (
        <div role="heading" aria-level={level} className={className}>
            {children}
        </div>
    );
}

export type Tone = "blue" | "teal" | "violet" | "slate";

/** The four tones, threaded through every accent ON a card rather than
 *  defaulting everything to blue (colour.md: "thread the tone through, don't
 *  re-pick blue everywhere"). Still the seven semantic colours — slate is the
 *  neutral utility step, not an eighth hue. */
export const TONE: Record<Tone, {
    /** the tinted 26px glyph tile */
    glyph: string;
    /** text accents on this card — links, actions */
    text: string;
    /** the card's own hover glow, tinted to the card rather than one flat blue */
    glow: string;
    /** a soft tinted fill, and the same fill as a hover variant */
    soft: string;
    softHover: string;
    /** border in the tone, for outlined actions */
    border: string;
    borderHover: string;
    ring: string;
}> = {
    blue: {
        glyph: "bg-[var(--cs-blue-soft)] text-[var(--cs-blue)]",
        text: "text-[var(--cs-blue)]",
        glow: "hover:shadow-[0_6px_20px_rgba(18,104,232,0.09),0_1px_2px_rgba(16,28,46,0.06)]",
        soft: "bg-[var(--cs-blue-soft)]",
        softHover: "hover:bg-[var(--cs-blue-soft)]",
        border: "border-[var(--cs-blue)]",
        borderHover: "group-hover:border-[var(--cs-blue)]",
        ring: "focus-visible:shadow-[0_0_0_3px_var(--cs-blue-soft)]",
    },
    teal: {
        glyph: "bg-[var(--cs-teal-soft)] text-[var(--cs-teal)]",
        text: "text-[var(--cs-teal)]",
        glow: "hover:shadow-[0_6px_20px_rgba(15,118,110,0.10),0_1px_2px_rgba(16,28,46,0.06)]",
        soft: "bg-[var(--cs-teal-soft)]",
        softHover: "hover:bg-[var(--cs-teal-soft)]",
        border: "border-[var(--cs-teal)]",
        borderHover: "group-hover:border-[var(--cs-teal)]",
        ring: "focus-visible:shadow-[0_0_0_3px_var(--cs-teal-soft)]",
    },
    violet: {
        glyph: "bg-[var(--cs-violet-soft)] text-[var(--cs-violet)]",
        text: "text-[var(--cs-violet)]",
        glow: "hover:shadow-[0_6px_20px_rgba(124,58,237,0.09),0_1px_2px_rgba(16,28,46,0.06)]",
        soft: "bg-[var(--cs-violet-soft)]",
        softHover: "hover:bg-[var(--cs-violet-soft)]",
        border: "border-[var(--cs-violet)]",
        borderHover: "group-hover:border-[var(--cs-violet)]",
        ring: "focus-visible:shadow-[0_0_0_3px_var(--cs-violet-soft)]",
    },
    slate: {
        glyph: "bg-[#f1f5f9] text-[#475569]",
        text: "text-[#475569]",
        glow: "hover:shadow-[0_6px_20px_rgba(71,85,105,0.09),0_1px_2px_rgba(16,28,46,0.06)]",
        soft: "bg-[#f1f5f9]",
        softHover: "hover:bg-[#f1f5f9]",
        border: "border-[#94a3b8]",
        borderHover: "group-hover:border-[#94a3b8]",
        ring: "focus-visible:shadow-[0_0_0_3px_#f1f5f9]",
    },
};

/** The card shell, once. Same anatomy every Cortex card has — one border, one
 *  radius, one shadow, a head row with a glyph tile, one descriptive line, a
 *  body that absorbs the remaining height, an optional footer row.
 *
 *  No fixed height, ever: the grid's `items-stretch` gives a row its parity
 *  and the row is as tall as its tallest card's REAL content. A constant
 *  height is what produced 295px of measured dead space on Practice
 *  (panel-structure.md, 2026-08-27). */
export function Card({
    id, tone, icon, title, subtitle, action, foot, bodyClass = "", children,
}: {
    id?: string;
    tone: Tone;
    icon: ReactNode;
    title: string;
    subtitle: string;
    action?: ReactNode;
    foot?: ReactNode;
    bodyClass?: string;
    children: ReactNode;
}) {
    return (
        <section
            id={id}
            aria-label={title}
            className={
                "flex min-w-0 flex-col rounded-[var(--cs-radius)] border border-[var(--cs-line)] " +
                "bg-[var(--cs-card)] shadow-[var(--cs-shadow)] " +
                "transition-[box-shadow,border-color] duration-[180ms] ease-out " +
                TONE[tone].glow
            }
        >
            <div className="flex flex-none items-center gap-[6px] px-[12px] pt-[9px]">
                <span className={`grid h-[26px] w-[26px] flex-none place-items-center rounded-[8px] ${TONE[tone].glyph}`}>
                    {icon}
                </span>
                <Heading className="text-[13.5px] font-bold uppercase leading-[1.2] tracking-[0.04em] text-[var(--cs-ink)]">
                    {title}
                </Heading>
                {action && <div className="ml-auto flex flex-none items-center gap-[6px]">{action}</div>}
            </div>
            <p className="m-0 mt-[3px] px-[12px] text-[11px] font-normal leading-[1.4] text-[var(--cs-faint)]">
                {subtitle}
            </p>
            <div className={`flex min-h-0 flex-1 flex-col gap-[6px] p-[12px] ${bodyClass}`}>{children}</div>
            {foot && <div className="flex-none border-t border-[var(--cs-line)] px-[12px] pb-[9px] pt-[6px]">{foot}</div>}
        </section>
    );
}

/** The text trigger in a card's head — "Customise prescription →". Tone-
 *  coloured by its card, never a blanket blue. */
export function CardAction({
    tone, onClick, children,
}: { tone: Tone; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={
                "inline-flex cursor-pointer items-center gap-[3px] rounded-[6px] border-0 bg-transparent px-[4px] py-[3px] " +
                `text-[11px] font-semibold outline-none hover:underline ${TONE[tone].text} ${TONE[tone].ring}`
            }
        >
            {children}
        </button>
    );
}

/** The small outlined trigger — "Edit hours". Same shape on every card. */
export function CardPillButton({
    tone, onClick, children,
}: { tone: Tone; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={
                "inline-flex cursor-pointer items-center gap-[4px] rounded-full border bg-transparent px-[10px] py-[4px] " +
                `text-[11px] font-semibold outline-none transition-colors ` +
                `${TONE[tone].border} ${TONE[tone].text} ${TONE[tone].softHover} ${TONE[tone].ring}`
            }
        >
            {children}
        </button>
    );
}

/** The persistent "go here instead →" link at a card's foot. */
export function FootLink({
    tone, onClick, children,
}: { tone: Tone; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={
                "inline-flex cursor-pointer items-center gap-[2px] rounded-[6px] border-0 bg-transparent p-0 " +
                `text-[11.5px] font-semibold outline-none transition-[gap] hover:gap-[5px] ${TONE[tone].text} ${TONE[tone].ring}`
            }
        >
            {children}
        </button>
    );
}

/** Empty state: one bold fact, one short next action, never three sentences
 *  (empty-states.md / typography.md). */
export function EmptyBlock({
    art, fact, next, action,
}: { art?: ReactNode; fact: string; next: string; action?: ReactNode }) {
    return (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[5px] px-[6px] py-[9px] text-center">
            {art}
            <strong className="text-[13px] font-semibold text-[var(--cs-ink)]">{fact}</strong>
            <span className="max-w-[34ch] text-[11.5px] font-normal leading-[1.5] text-[var(--cs-muted)]">{next}</span>
            {action}
        </div>
    );
}

/** The bordered-pill call to action inside an empty state. One style for every
 *  card's empty action — a bordered pill on one and a text link on its
 *  neighbour is the "this symmetry doesn't match" complaint from 2026-08-27. */
export function EmptyAction({
    tone, onClick, children,
}: { tone: Tone; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={
                "mt-[6px] inline-flex cursor-pointer items-center gap-[6px] rounded-full border-[1.5px] bg-white " +
                `px-[18px] py-[9px] text-[12.5px] font-semibold outline-none transition-colors ` +
                `${TONE[tone].border} ${TONE[tone].text} ${TONE[tone].softHover} ${TONE[tone].ring}`
            }
        >
            {children}
        </button>
    );
}

/** Two-line row content — a label over a muted sub-line. The single most
 *  repeated shape on both screens. */
export function RowText({ label, sub }: { label: string; sub?: string | null }) {
    return (
        <div className="flex min-w-0 flex-col gap-[1px]">
            <span className="truncate text-[12px] font-semibold text-[var(--cs-ink)]">{label}</span>
            {sub && <span className="text-[10.5px] font-normal leading-[1.4] text-[var(--cs-faint)]">{sub}</span>}
        </div>
    );
}

export function SkeletonRows({ count }: { count: number }) {
    return (
        <div className="flex flex-col gap-[6px]">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="h-[22px] animate-pulse rounded-[6px] bg-[#eef0f5]" />
            ))}
        </div>
    );
}

/** The small X that removes a row. Removal gets its own control rather than
 *  riding a whole-row click, because it undoes a choice the doctor already
 *  made (panel-structure.md, 2026-08-29). */
export function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            onClick={onClick}
            className={
                "grid h-[22px] w-[22px] flex-none cursor-pointer place-items-center rounded-[6px] border-0 " +
                "bg-transparent text-[var(--cs-faint)] outline-none transition-colors " +
                "hover:bg-[var(--cs-red-soft)] hover:text-[var(--cs-red)] " +
                "focus-visible:shadow-[0_0_0_3px_var(--cs-red-soft)]"
            }
        >
            <X size={12} />
        </button>
    );
}

// ── Form fields (used by the three Clinic modals) ──────────────────────────
// Sized to match the app's existing modal inputs exactly — 40px tall, 11px
// radius, the same tinted fill and focus ring — so a Clinic modal and a
// Practice modal are indistinguishable side by side.

// Every declaration `base.css`'s bare `input` rule also sets carries a
// trailing `!` — see the cascade note at the top of this file. The ones it
// doesn't set (width, transition, focus ring) need no bang.
export const INPUT_CLASS =
    "h-[40px]! w-full rounded-[11px]! border! border-[var(--cs-line)]! bg-[rgba(248,250,252,0.9)]! px-[12px]! " +
    "text-[13px]! text-[var(--cs-ink)] outline-none transition-shadow " +
    "focus:border-[#a855f7]! focus:shadow-[0_0_0_3px_rgba(168,85,247,0.14)]! focus:bg-white!";

export function Field({
    id, label, value, placeholder, onChange,
}: {
    id: string;
    label: string;
    value: string;
    placeholder?: string;
    onChange: (v: string) => void;
}) {
    return (
        <div className="flex min-w-0 flex-col gap-[5px]">
            <label htmlFor={id} className="text-[11px] font-semibold text-[var(--cs-muted)]">{label}</label>
            <input
                id={id}
                type="text"
                value={value}
                placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)}
                className={INPUT_CLASS}
            />
        </div>
    );
}

export function FieldRow({ children }: { children: ReactNode }) {
    return <div className="grid grid-cols-2 gap-[9px]">{children}</div>;
}

export function FormError({ message }: { message: string }) {
    return <p className="m-0 text-[11.5px] font-semibold text-[var(--cs-red)]">{message}</p>;
}

/** The one place a form is allowed a sentence — and only to say something the
 *  fields themselves can't (where a value ends up, not what to type). */
export function FormNote({ children }: { children: ReactNode }) {
    return (
        <p className="m-0 text-[11px] font-normal leading-[1.5] text-[var(--cs-faint)]">{children}</p>
    );
}

// ── Logo / photo picker ─────────────────────────────────────────────────────
//
// One component, used by both `EditClinicModal` (the logo) and
// `EditDoctorModal` (the photo) — the two need the identical shape (a square
// preview, a "Change photo" trigger, a size readout, a Remove link), so this
// is written once rather than as two near-identical blocks.
//
// It owns PICKING and COMPRESSING (`compressImage`, `lib/image/compress.ts`)
// but never uploads anything itself — the actual upload happens on the
// modal's own Save, alongside every other field on the form, so cancelling
// the modal can never leave an orphaned file in storage from a pick nobody
// committed. The parent holds the resulting `CompressedImage` in state and
// passes it back in here as `picked`.
export function ImagePicker({
    tone, currentUrl, picked, busy, error, fallbackIcon, onPick, onClear,
}: {
    tone: Tone;
    /** The already-stored image (`hospitals.logo_url` / `doctors.avatar_url`),
     *  shown until a new one is picked. */
    currentUrl: string | null | undefined;
    /** A freshly compressed, not-yet-uploaded pick. Takes over the preview
     *  and shows its own size — the whole point of doing this client-side is
     *  a number the doctor can actually see before it ever leaves the
     *  device. */
    picked: CompressedImage | null;
    busy?: boolean;
    error?: string | null;
    /** What shows in the square when there is neither `currentUrl` nor
     *  `picked` — an icon in this card's own tone, never a generic blank box. */
    fallbackIcon: ReactNode;
    onPick: (image: CompressedImage) => void;
    /** Clears a staged pick, or — if there was no pick — marks the EXISTING
     *  image for removal. The caller can't tell these apart from its own
     *  state alone, so this fires unconditionally whenever there is
     *  something to clear (`currentUrl || picked`). */
    onClear: () => void;
}) {
    const inputId = useId();
    // Revoked on every new pick and on unmount — an object URL nobody revokes
    // is a blob the tab never frees for the rest of the session.
    const lastPreviewUrl = useRef<string | null>(null);

    const handleFile = async (file: File) => {
        try {
            const image = await compressImage(file);
            if (lastPreviewUrl.current) URL.revokeObjectURL(lastPreviewUrl.current);
            lastPreviewUrl.current = image.previewUrl;
            onPick(image);
        } catch (e) {
            // The modal surfaces this through its own `error` prop — this
            // component only forwards the file, the parent owns error state
            // alongside the rest of its form.
            console.error("ImagePicker:", e);
        }
    };

    const previewUrl = picked?.previewUrl ?? currentUrl ?? null;
    const clearable = !!(picked || currentUrl);

    return (
        <div className="flex items-center gap-[12px]">
            <div className={`grid h-[64px] w-[64px] flex-none place-items-center overflow-hidden rounded-[12px] border ${TONE[tone].border} bg-[var(--cs-page)] ${TONE[tone].text}`}>
                {previewUrl ? (
                    <img src={previewUrl} alt="" className="h-full w-full object-cover" />
                ) : fallbackIcon}
            </div>
            <div className="flex min-w-0 flex-col gap-[4px]">
                <div className="flex items-center gap-[10px]">
                    <label
                        htmlFor={inputId}
                        /* `inline-flex!`/`gap-[5px]!`: base.css's bare
                           `label { display: grid; gap: 3px }` is unlayered and
                           beats Tailwind's utility layer regardless of
                           specificity (see ui.tsx's cascade note up top) — a
                           1-column grid stacked the icon over the text instead
                           of beside it. Every OTHER `<label>` in this file
                           wraps a single text node, where grid vs. flex is
                           invisible, which is why this one spot was missed. */
                        className={
                            "inline-flex! cursor-pointer items-center gap-[5px]! rounded-full border bg-transparent " +
                            `px-[12px] py-[6px] text-[11.5px] font-semibold transition-colors ` +
                            `${TONE[tone].border} ${TONE[tone].text} ${TONE[tone].softHover}`
                        }
                    >
                        <Upload size={12} /> {busy ? "Compressing…" : previewUrl ? "Change photo" : "Upload photo"}
                    </label>
                    <input
                        id={inputId}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={busy}
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = ""; // lets the same file be re-picked later
                            if (file) void handleFile(file);
                        }}
                    />
                    {clearable && !busy && (
                        <button
                            type="button"
                            onClick={onClear}
                            className="cursor-pointer border-0 bg-transparent p-0 text-[11px] font-semibold text-[var(--cs-faint)] hover:text-[var(--cs-red)]"
                        >
                            Remove
                        </button>
                    )}
                </div>
                {error ? (
                    <span className="text-[10.5px] font-medium text-[var(--cs-red)]">{error}</span>
                ) : picked ? (
                    <span className="text-[10.5px] text-[var(--cs-green)]">
                        {formatBytes(picked.blob.size)} · ready to save
                    </span>
                ) : (
                    <span className="text-[10.5px] text-[var(--cs-faint)]">
                        Compressed automatically, under ~180 KB
                    </span>
                )}
            </div>
        </div>
    );
}
