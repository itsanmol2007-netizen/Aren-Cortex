// ---------------------------------------------------------------------------
// THE CONSULT QUEUE'S SHARED PIECES.
//
// Two surfaces show the same three things — who this patient is, what the desk
// already recorded about them, and who else is waiting — so those three are
// written once here and composed differently by `QueueSheet` (opened from the
// dark header, on demand) and `TransitionModal` (the handover between two
// consultations). A second copy of a queue row is a second answer to "how long
// has she been waiting".
//
// ── The look, and where every value in it comes from ──────────────────────
// Nothing here is a new visual language. It is the app's OWN two surfaces,
// stacked:
//
//   · The context band is the consult dark header — `#050916`, the same
//     nebula asset, the same white-on-navy type scale (workspace-header.css /
//     `.topbar-unified`). Putting it INSIDE the card is what gives these
//     modals their contrast: a dark hero over a paper body, rather than a
//     white card on a white page with a 4px stripe doing all the work.
//   · Everything below it is `--cs-*` paper — the same tokens, radii, row
//     heights and hairlines every Cortex card already uses.
//   · The 4px accent stripe, the icon tile, the eyebrow, the footer with a
//     ghost and one solid primary: `docs/aren-modal-design.md`'s shape,
//     unchanged. Blue is the accent, because this modal's whole content is
//     "the next action" and blue is this app's declared action colour
//     (colour.md — there is no eighth colour and no new one here).
//
// Tailwind, not a new stylesheet — `cortex-design-dna/README.md` §0a. Headings
// render through `role="heading"` divs because `styles/base.css` is unlayered
// and silently restyles bare `h2`/`h3` (the cascade trap in
// `cortex-gotchas.md`).
// ---------------------------------------------------------------------------

import type { ReactNode } from "react";
import { Clock3, FileText, Paperclip, Stethoscope, User } from "lucide-react";
import type { TodayVisit } from "../../../lib/db";
import type { IntakePreview } from "../../../lib/db/intake";
import { initials, padToken, timeAgo } from "../../frontdesk/utils";

/** Minutes waited, as the number the doctor actually reasons about. */
export function waitedFor(visit: TodayVisit): string {
    return timeAgo(visit.created_at);
}

/** "34y · Female · 98765 43210" — the identity line, once. */
export function patientLine(visit: TodayVisit): string {
    return [visit.age ? `${visit.age}y` : null, visit.gender || null, visit.phone || null]
        .filter(Boolean)
        .join(" · ");
}

// ── The dark context band ──────────────────────────────────────────────────

/**
 * The patient, on the app's own navy.
 *
 * `tone="hero"` is the full band at the top of a modal card; `tone="inline"`
 * is the same treatment at panel width, for the queue sheet's header. One
 * component so the avatar ring, the token pill and the type scale cannot
 * drift between the two places a patient's identity appears.
 */
export function PatientBand({
    visit, waiting, right, tone = "hero",
}: {
    visit: TodayVisit;
    /** the "waiting 14 min" line — omitted for the patient already in the room */
    waiting?: boolean;
    right?: ReactNode;
    tone?: "hero" | "inline";
}) {
    return (
        <div
            className={
                "relative flex items-center gap-[12px] overflow-hidden bg-[#050916] " +
                (tone === "hero" ? "px-[18px] py-[15px]" : "px-[14px] py-[11px]")
            }
        >
            {/* The same asset the page header wears, at the same opacity — this
                is why the band reads as AREN's rather than as a dark box. */}
            <img src="/aren-nebula.svg" alt="" aria-hidden="true"
                className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.55] blur-[0.6px]" />
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{ background: "radial-gradient(ellipse 360px 90px at -40px 50%, rgba(4,8,18,0.78) 0%, rgba(4,8,18,0) 100%)" }}
            />

            <div className={"relative grid flex-none place-items-center rounded-full border border-white/25 bg-white/10 font-extrabold tracking-[0.02em] text-white " +
                (tone === "hero" ? "h-[46px] w-[46px] text-[15px]" : "h-[34px] w-[34px] text-[12px]")}>
                {initials(visit.patient_name)}
            </div>

            <div className="relative flex min-w-0 flex-1 flex-col gap-[2px]">
                <div className="flex items-center gap-[7px]">
                    <span className="rounded-[5px] bg-white/[0.14] px-[6px] py-[1px] text-[10px] font-extrabold tabular-nums tracking-[0.06em] text-white/80">
                        {padToken(visit.token_number)}
                    </span>
                    {waiting && (
                        <span className="flex items-center gap-[3px] text-[10.5px] font-semibold text-[#f5c98a]">
                            <Clock3 size={10} aria-hidden="true" />
                            waiting {waitedFor(visit)}
                        </span>
                    )}
                    {visit.doctor_name && (
                        <span className="flex items-center gap-[3px] truncate text-[10.5px] font-medium text-white/45">
                            <Stethoscope size={10} aria-hidden="true" />
                            {visit.doctor_name}
                        </span>
                    )}
                </div>
                <strong className={"truncate font-bold leading-tight text-white " +
                    (tone === "hero" ? "text-[18px]" : "text-[14px]")}>
                    {visit.patient_name}
                </strong>
                <span className="truncate text-[11.5px] font-normal text-white/55">
                    {patientLine(visit) || "No contact details on file"}
                </span>
            </div>

            {right && <div className="relative flex flex-none items-center gap-[8px]">{right}</div>}
        </div>
    );
}

// ── What the desk recorded ─────────────────────────────────────────────────

function ChipRow({ label, items, tone }: { label: string; items: string[]; tone: "symptom" | "history" }) {
    if (!items.length) return null;
    return (
        <div className="flex flex-col gap-[5px]">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--cs-label)]">{label}</span>
            <div className="flex flex-wrap gap-[5px]">
                {items.map((it) => (
                    <span
                        key={it}
                        /* Rose = reported, violet = history. The Case Sheet's own
                           pairing, so a chip is the same colour at the desk, in
                           this modal, and on the chart it is about to become. */
                        className={
                            "rounded-[7px] border px-[8px] py-[3px] text-[12px] font-semibold leading-tight " +
                            (tone === "history"
                                ? "border-[#d9c9fb] bg-[linear-gradient(180deg,#faf7ff_0%,#eee5fe_100%)] text-[#6127c9]"
                                : "border-[#f6c3cd] bg-[linear-gradient(180deg,#fff8f9_0%,#ffe6ea_100%)] text-[#b3103b]")
                        }
                    >
                        {it}
                    </span>
                ))}
            </div>
        </div>
    );
}

/**
 * The prepared encounter, as one panel.
 *
 * Everything reception entered and nothing else — no placeholders for the
 * parts they left blank. An empty section is not rendered, and a wholly empty
 * intake says the one true thing once (`empty-states.md`) rather than drawing
 * three grey rows that promise data nobody captured.
 */
export function IntakePanel({
    preview, visit, dense = false,
}: {
    preview: IntakePreview | undefined;
    visit: TodayVisit;
    /** the transition modal's tighter column */
    dense?: boolean;
}) {
    const symptoms = preview?.symptoms ?? [];
    const history = preview?.history ?? [];
    const measurements = preview?.measurements ?? [];
    const files = preview?.attachmentCount ?? visit.attachment_count ?? 0;
    const anything = symptoms.length || history.length || measurements.length || files;

    if (!anything) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-[5px] px-[10px] py-[22px] text-center">
                <User size={22} className="text-[var(--cs-line-strong)]" aria-hidden="true" />
                <strong className="text-[13px] font-semibold text-[var(--cs-ink)]">Nothing recorded yet</strong>
                <span className="max-w-[34ch] text-[11.5px] leading-[1.5] text-[var(--cs-muted)]">
                    Start the consultation and chart it here.
                </span>
            </div>
        );
    }

    return (
        <div className={"flex min-h-0 flex-1 flex-col overflow-y-auto " + (dense ? "gap-[10px] p-[13px]" : "gap-[12px] p-[15px]")}>
            <ChipRow label="Reported" items={symptoms} tone="symptom" />
            <ChipRow label="History" items={history} tone="history" />

            {measurements.length > 0 && (
                <div className="flex flex-col gap-[5px]">
                    <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--cs-label)]">Measurements</span>
                    <div className="flex flex-wrap gap-[5px]">
                        {measurements.map((m) => (
                            <span
                                key={m.label}
                                className="flex items-baseline gap-[5px] rounded-[7px] border border-[var(--cs-line-strong)] bg-white px-[8px] py-[3px]"
                            >
                                <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-[var(--cs-faint)]">{m.label}</span>
                                <span className="text-[12.5px] font-bold tabular-nums text-[var(--cs-ink)]">{m.value}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {files > 0 && (
                <div className="flex items-center gap-[6px] rounded-[var(--cs-radius)] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[9px] py-[6px]">
                    <Paperclip size={13} className="flex-none text-[var(--cs-teal)]" aria-hidden="true" />
                    <span className="text-[12px] font-semibold text-[var(--cs-muted)]">
                        {files} file{files === 1 ? "" : "s"} from the front desk
                    </span>
                    <span className="ml-auto text-[11px] font-normal text-[var(--cs-faint)]">opens with the consult</span>
                </div>
            )}

            {visit.visit_count > 1 && (
                <div className="flex items-center gap-[6px] text-[11.5px] font-medium text-[var(--cs-faint)]">
                    <FileText size={12} aria-hidden="true" />
                    {visit.visit_count} previous visit{visit.visit_count - 1 === 1 ? "" : "s"} on file
                </div>
            )}
        </div>
    );
}

// ── One row of the queue ───────────────────────────────────────────────────

/**
 * A waiting patient, as a row.
 *
 * A `<button>` and nothing nested inside it that is also a button — the
 * nested-button hydration trap this codebase has hit twice
 * (`cortex-gotchas.md`). Selecting a row never commits anything on its own:
 * both surfaces that use it treat a click as "show me this one", and the
 * commitment is a separate, named action.
 */
export function QueueRow({
    visit, preview, selected, position, onSelect,
}: {
    visit: TodayVisit;
    preview?: IntakePreview;
    selected?: boolean;
    /** 1-based place in the desk's order, printed so "ahead of queue" is visible */
    position?: number;
    onSelect: (visit: TodayVisit) => void;
}) {
    const complaints = (preview?.symptoms ?? []).slice(0, 3).join(", ");
    return (
        <button
            type="button"
            onClick={() => onSelect(visit)}
            aria-pressed={selected}
            className={
                "flex w-full items-center gap-[10px] rounded-[var(--cs-radius)] border px-[10px] py-[8px] text-left transition-[border-color,background-color,box-shadow] duration-150 " +
                (selected
                    ? "border-[var(--cs-blue)] bg-[var(--cs-blue-soft)] shadow-[0_0_0_3px_rgba(18,104,232,0.10)]"
                    : "border-[var(--cs-line)] bg-white hover:border-[var(--cs-line-strong)] hover:bg-[var(--cs-page)]")
            }
        >
            <span
                className={
                    "grid h-[30px] w-[30px] flex-none place-items-center rounded-[8px] text-[10.5px] font-extrabold tabular-nums " +
                    (selected ? "bg-[var(--cs-blue)] text-white" : "bg-[var(--cs-page)] text-[var(--cs-faint)]")
                }
            >
                {padToken(visit.token_number)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-[1px]">
                <span className="flex items-center gap-[6px]">
                    <span className="truncate text-[13px] font-bold text-[var(--cs-ink)]">{visit.patient_name}</span>
                    {position != null && (
                        <span className="flex-none text-[10px] font-semibold text-[var(--cs-faint)]">#{position}</span>
                    )}
                </span>
                <span className="truncate text-[11px] font-normal text-[var(--cs-muted)]">
                    {complaints || patientLine(visit) || "No complaint recorded"}
                </span>
            </span>
            <span className="flex flex-none flex-col items-end gap-[2px]">
                <span className="flex items-center gap-[3px] text-[10.5px] font-semibold text-[var(--cs-amber)]">
                    <Clock3 size={10} aria-hidden="true" />
                    {waitedFor(visit)}
                </span>
                {(preview?.attachmentCount ?? visit.attachment_count) > 0 && (
                    <span className="flex items-center gap-[3px] text-[10px] font-medium text-[var(--cs-teal)]">
                        <Paperclip size={9} aria-hidden="true" />
                        {preview?.attachmentCount ?? visit.attachment_count}
                    </span>
                )}
            </span>
        </button>
    );
}

/** The queue's own empty state — one true sentence, the family's shape. */
export function QueueEmpty({ note }: { note?: string }) {
    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-[5px] px-[12px] py-[26px] text-center">
            <Clock3 size={22} className="text-[var(--cs-line-strong)]" aria-hidden="true" />
            <strong className="text-[13px] font-semibold text-[var(--cs-ink)]">Nobody is waiting</strong>
            <span className="max-w-[32ch] text-[11.5px] leading-[1.5] text-[var(--cs-muted)]">
                {note ?? "The front desk will add patients as they arrive."}
            </span>
        </div>
    );
}
