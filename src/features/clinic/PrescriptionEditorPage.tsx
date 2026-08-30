// ---------------------------------------------------------------------------
// PRESCRIPTION EDITOR — the one place where everything that affects the
// prescription is understandable and editable.
//
// It is a full page, not a modal and not an inline card, because the brief
// draws that line explicitly: "Complex configuration → dedicated page." The
// dashboard's Prescription Pad card is a PREVIEW and a doorway; it is never an
// editor, and nothing here is duplicated back onto it.
//
// ── The split this file exists to hold ────────────────────────────────────
//  Rendering system ≠ editing system.
//  * `PrescriptionDocument` renders. It is the same component that prints,
//    PDFs and WhatsApps a real prescription (standing rule 6) — the preview on
//    the left is that component at true paper size, scaled down, not a mock-up
//    of it. There is no second layout to keep in sync.
//  * This page edits. It manipulates a structured `PrescriptionConfig`
//    (lib/db/clinic.ts) and hands it to the renderer. It knows nothing about
//    how a letterhead is laid out, and the renderer knows nothing about
//    toggles.
//
// ── Why default advice lives HERE and not in Communication ────────────────
//  The doctor's mental model is "I want this to appear automatically on my
//  prescriptions." That is prescription CONTENT — it is printed on the paper.
//  The Communication Center owns messages SENT to a patient. A doctor should
//  never have to wonder why prescription advice is filed under Communication.
//
// Styling is Tailwind, values from `--cs-*`; shared primitives are in `ui.tsx`.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
    Check, FileSignature, Image as ImageIcon, MessageSquareQuote,
    Palette, Plus, ToggleLeft, ToggleRight, UserSquare,
} from "lucide-react";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { BackButton } from "../../components/BackButton";
import { RxPreview } from "./RxPreview";
import { Heading, INPUT_CLASS, RemoveButton, RowText, TONE } from "./ui";
import type { PrintFormat } from "../prescription/usePrintFormat";
import {
    DEFAULT_PRESCRIPTION_CONFIG, fetchPrescriptionConfig, savePrescriptionConfig,
    type PrescriptionConfig,
} from "../../lib/db/clinic";
import type { DBDoctor, DBHospital } from "../../lib/db";

interface Props {
    logoRef: React.RefObject<HTMLDivElement>;
    onOpenSidebar: () => void;
    hospitalId: string;
    hospital: DBHospital | null;
    doctor: DBDoctor | null;
    /** Back to the Clinic dashboard. The editor is a page, but a page UNDER
     *  Clinic — it has no sidebar entry, because a doctor reaches it by asking
     *  "what does my prescription look like", never by navigating to it cold. */
    onBack: () => void;
}

type SaveState = "idle" | "saving" | "saved" | "error";

// ── Control primitives ─────────────────────────────────────────────────────

/** The app's own toggle idiom — the same `ToggleRight`/`ToggleLeft` pair
 *  Clinical Companions already uses for "on for this practice", not a new
 *  switch invented for this page. */
function ToggleRow({
    label, hint, value, disabled, disabledHint, onChange,
}: {
    label: string;
    hint?: string | null;
    value: boolean;
    disabled?: boolean;
    /** Replaces `hint` while disabled — says WHY it can't be changed rather
     *  than leaving a dead control with no explanation. */
    disabledHint?: string;
    onChange: (next: boolean) => void;
}) {
    const shown = disabled ? (disabledHint ?? hint) : hint;
    return (
        <div className="flex min-w-0 items-center gap-[9px]">
            <div className={disabled ? "min-w-0 flex-1 opacity-70" : "min-w-0 flex-1"}>
                <RowText label={label} sub={shown} />
            </div>
            <button
                type="button"
                aria-pressed={value}
                aria-label={label}
                disabled={disabled}
                onClick={() => onChange(!value)}
                className={
                    "grid flex-none cursor-pointer place-items-center rounded-[6px] border-0 bg-transparent p-0 " +
                    "outline-none transition-colors focus-visible:text-[var(--cs-blue)] " +
                    "disabled:cursor-not-allowed disabled:text-[var(--cs-line-strong)] " +
                    (value && !disabled ? "text-[var(--cs-green)]" : "text-[var(--cs-line-strong)]")
                }
            >
                {value && !disabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
            </button>
        </div>
    );
}

/** A radio group that reads as one control, not three loose buttons. Used for
 *  the two genuinely exclusive choices on this page (whose identity, which
 *  image) — never for anything a doctor might want two of. */
function SegmentedChoice<T extends string>({
    label, hint, value, options, onChange,
}: {
    label: string;
    hint?: string;
    value: T;
    options: { value: T; label: string }[];
    onChange: (next: T) => void;
}) {
    return (
        <div className="flex flex-col gap-[6px]">
            <div className="flex flex-col gap-[1px]">
                <span className="text-[12px] font-semibold text-[var(--cs-ink)]">{label}</span>
                {hint && <span className="text-[10.5px] font-normal text-[var(--cs-faint)]">{hint}</span>}
            </div>
            <div
                role="radiogroup"
                aria-label={label}
                className="flex gap-[4px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] p-[4px]"
            >
                {options.map((o) => (
                    <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={value === o.value}
                        onClick={() => onChange(o.value)}
                        className={
                            "inline-flex flex-1 cursor-pointer items-center justify-center gap-[5px] whitespace-nowrap " +
                            "rounded-[7px] border-0 px-[6px] py-[7px] text-[11.5px] font-semibold outline-none transition-colors " +
                            (value === o.value
                                ? "bg-[var(--cs-card)] text-[var(--cs-violet)] shadow-[var(--cs-shadow)]"
                                : "bg-transparent text-[var(--cs-label)] hover:text-[var(--cs-ink)]")
                        }
                    >
                        {value === o.value && <Check size={12} />}
                        {o.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

function ControlGroup({
    icon, title, subtitle, children,
}: { icon: ReactNode; title: string; subtitle: string; children: ReactNode }) {
    return (
        <section className="flex flex-col rounded-[var(--cs-radius)] border border-[var(--cs-line)] bg-[var(--cs-card)] shadow-[var(--cs-shadow)]">
            <div className="flex items-center gap-[6px] border-b border-[var(--cs-line)] px-[12px] py-[9px]">
                <span className={`grid h-[26px] w-[26px] flex-none place-items-center rounded-[8px] ${TONE.violet.glyph}`}>
                    {icon}
                </span>
                <div className="flex min-w-0 flex-col gap-[1px]">
                    <Heading className="text-[13.5px] font-bold uppercase leading-[1.2] tracking-[0.04em] text-[var(--cs-ink)]">
                        {title}
                    </Heading>
                    <span className="text-[10.5px] font-normal leading-[1.4] text-[var(--cs-faint)]">{subtitle}</span>
                </div>
            </div>
            <div className="flex flex-col gap-[9px] p-[12px]">{children}</div>
        </section>
    );
}

// ── The page ───────────────────────────────────────────────────────────────

export function PrescriptionEditorPage({
    logoRef, onOpenSidebar, hospitalId, hospital, doctor, onBack,
}: Props) {
    const [config, setConfig] = useState<PrescriptionConfig>(DEFAULT_PRESCRIPTION_CONFIG);
    const [loaded, setLoaded] = useState(false);
    const [saveState, setSaveState] = useState<SaveState>("idle");
    const [newAdvice, setNewAdvice] = useState("");
    /** Preview-only. Deliberately NOT `usePrintFormat` — that hook persists the
     *  doctor's REAL print choice, and looking at how a prescription would sit
     *  on A4 must not quietly change what the next consult prints. */
    const [previewFormat, setPreviewFormat] = useState<PrintFormat>("a5");

    useEffect(() => {
        let alive = true;
        fetchPrescriptionConfig(hospitalId)
            .then((c) => { if (alive) { setConfig(c); setLoaded(true); } })
            .catch((e) => { console.error(e); if (alive) setLoaded(true); });
        return () => { alive = false; };
    }, [hospitalId]);

    /**
     * Auto-save, debounced.
     *
     * A panel of toggles behind a Save button is a panel where the preview and
     * the stored configuration can silently disagree — the doctor sees their
     * change, walks away, and the prescription still prints the old thing.
     * Saving on change removes that gap. The 600ms debounce is what stops a
     * run of clicks turning into a run of writes; `loaded` gates the very
     * first render so mounting the page never writes a row nobody asked for.
     */
    const firstRun = useRef(true);
    useEffect(() => {
        if (!loaded) return;
        if (firstRun.current) { firstRun.current = false; return; }
        setSaveState("saving");
        const t = setTimeout(() => {
            savePrescriptionConfig(hospitalId, config)
                .then(() => setSaveState("saved"))
                .catch((e) => { console.error(e); setSaveState("error"); });
        }, 600);
        return () => clearTimeout(t);
    }, [config, hospitalId, loaded]);

    const set = <K extends keyof PrescriptionConfig>(key: K, value: PrescriptionConfig[K]) =>
        setConfig((c) => ({ ...c, [key]: value }));

    // Which controls are live depends on what the letterhead is actually
    // showing. A registration-number toggle under a clinic-only letterhead
    // controls nothing — it stays visible (so the doctor can see it exists)
    // but says why it is inert, rather than silently doing nothing.
    const doctorShown = config.identityMode !== "clinic";
    const clinicShown = config.identityMode !== "doctor";

    const addAdvice = () => {
        const line = newAdvice.trim();
        if (!line) return;
        if (config.defaultAdvice.some((a) => a.toLowerCase() === line.toLowerCase())) {
            setNewAdvice("");
            return;
        }
        set("defaultAdvice", [...config.defaultAdvice, line]);
        setNewAdvice("");
    };

    return (
        <div className="relative flex min-h-screen flex-col bg-[var(--cs-page)]">
            <WorkspaceHeader
                logoRef={logoRef}
                onOpenSidebar={onOpenSidebar}
                title="Prescription Pad"
                subtitle="Everything that appears on your printed prescription"
                rightSlot={<BackButton label="Back to Clinic" onClick={onBack} />}
            />

            {/* Used to also carry the back button (top-left, light body) —
                see `BackButton.tsx`'s own header for why that moved into the
                dark header's rightSlot above. This row is now just the
                save-state readout, right-aligned since it has the row to
                itself. */}
            <div className="flex items-center justify-end gap-[9px] border-b border-[#d0d8e8] bg-white px-[56px] py-[10px] max-[900px]:px-[12px]">
                {/* Not a toast and not a Save button — the page saves as you
                    change it, and this says so quietly. */}
                <span
                    className={
                        "whitespace-nowrap text-[11px] font-semibold " +
                        (saveState === "error" ? "text-[var(--cs-red)]"
                            : saveState === "saving" ? "text-[var(--cs-label)]"
                                : "text-[var(--cs-faint)]")
                    }
                >
                    {saveState === "saving" ? "Saving…"
                        : saveState === "error" ? "Not saved"
                            : "Saved automatically"}
                </span>
            </div>

            <div className="flex w-full flex-1 flex-col overflow-y-auto px-[56px] pb-[44px] pt-[15px] max-[900px]:px-[12px]">
                {/* Asymmetric on purpose: the prescription is the subject of
                    this page, the controls are the instrument. A 50/50 split
                    would say they matter equally. Stacks at 1180px — the same
                    breakpoint Consult's own side-by-side pair uses
                    (responsive-grid.md), not a new number for this page. */}
                <div className="grid grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] items-start gap-[12px] max-[1180px]:grid-cols-1">

                    <section
                        /* No `aria-label` here on purpose: `RxPreview`'s own
                           frame already carries "Prescription preview", and
                           two nested regions sharing one accessible name is a
                           screen reader reading the same thing twice. The
                           visible "Live preview" row names this panel. */
                        /* Sticky: the whole point of a live preview is that it
                           is live while you are changing something beside it. */
                        className="sticky top-[12px] flex flex-col gap-[9px] rounded-[var(--cs-radius)] border border-[var(--cs-line)] bg-[var(--cs-card)] p-[12px] shadow-[var(--cs-shadow)] max-[1180px]:static"
                    >
                        <div className="flex items-center gap-[9px]">
                            <RowText label="Live preview" sub="Specimen patient and medicines — your own layout." />
                            <div
                                role="radiogroup"
                                aria-label="Preview paper size"
                                className="ml-auto flex flex-none gap-[3px] rounded-full border border-[var(--cs-line)] bg-[var(--cs-page)] p-[3px]"
                            >
                                {(["a5", "a4", "thermal"] as PrintFormat[]).map((f) => (
                                    <button
                                        key={f}
                                        type="button"
                                        role="radio"
                                        aria-checked={previewFormat === f}
                                        onClick={() => setPreviewFormat(f)}
                                        className={
                                            "cursor-pointer rounded-full border-0 px-[11px] py-[4px] text-[11px] font-semibold transition-colors " +
                                            (previewFormat === f
                                                ? "bg-[var(--cs-card)] text-[var(--cs-ink)] shadow-[var(--cs-shadow)]"
                                                : "bg-transparent text-[var(--cs-label)] hover:text-[var(--cs-ink)]")
                                        }
                                    >
                                        {f === "thermal" ? "Thermal" : f.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {/* The paper sits on a tinted well so the sheet's own
                            white reads as paper rather than as more card. */}
                        <div className="flex justify-center rounded-[var(--cs-radius-sm)] bg-[var(--cs-page)] p-[12px]">
                            <RxPreview
                                hospital={hospital}
                                doctor={doctor}
                                config={config}
                                format={previewFormat}
                                /* Taller than the dashboard's — this IS the
                                   subject of the page — but still bounded, so
                                   the sticky column can't outgrow the
                                   viewport it is meant to stay inside. */
                                maxHeight={720}
                                frameClass="shadow-[0_2px_10px_rgba(16,28,46,0.10)]"
                            />
                        </div>
                    </section>

                    <div className="flex flex-col gap-[12px]">
                        <ControlGroup
                            icon={<UserSquare size={14} />}
                            title="Prescription identity"
                            subtitle="Whose name the letterhead carries."
                        >
                            <SegmentedChoice
                                label="Show"
                                value={config.identityMode}
                                options={[
                                    { value: "clinic", label: "Clinic" },
                                    { value: "doctor", label: "Doctor" },
                                    { value: "both", label: "Both" },
                                ]}
                                onChange={(v) => set("identityMode", v)}
                            />
                            {/* A SELECTION between two images the clinic and
                                doctor profiles already own — never an upload
                                or a crop surface. The images themselves are
                                changed where they belong. */}
                            <SegmentedChoice
                                label="Profile image"
                                hint={
                                    config.printMode === "monochrome"
                                        ? "Not shown while printing black & white — see Print colour below."
                                        : "Managed from the clinic and doctor profiles."
                                }
                                value={config.profileImage}
                                options={[
                                    { value: "clinic_logo", label: "Clinic logo" },
                                    { value: "doctor_photo", label: "Doctor photo" },
                                    { value: "none", label: "None" },
                                ]}
                                onChange={(v) => set("profileImage", v)}
                            />
                        </ControlGroup>

                        <ControlGroup
                            icon={<Palette size={14} />}
                            title="Print colour"
                            subtitle="For a plain A5/A4 printer with no colour ink."
                        >
                            <SegmentedChoice
                                label="Colour"
                                hint="Black & white uses your clinic's initials instead of a logo or photo — a detailed image doesn't print cleanly without colour. Need a receipt-style slip instead? Switch the preview above to Thermal — it's already black & white."
                                value={config.printMode}
                                options={[
                                    { value: "color", label: "Colour" },
                                    { value: "monochrome", label: "Black & white" },
                                ]}
                                onChange={(v) => set("printMode", v)}
                            />
                        </ControlGroup>

                        <ControlGroup
                            icon={<ImageIcon size={14} />}
                            title="Header"
                            subtitle="What sits beside the doctor's name."
                        >
                            <ToggleRow
                                label="Qualification"
                                hint={doctor?.qualification || "Not set on the doctor profile yet"}
                                value={config.showQualification}
                                disabled={!doctorShown}
                                disabledHint="The letterhead is showing the clinic only."
                                onChange={(v) => set("showQualification", v)}
                            />
                            <ToggleRow
                                label="Specialty"
                                hint={doctor?.specialization || "Not set on the doctor profile yet"}
                                value={config.showSpecialty}
                                disabled={!doctorShown}
                                disabledHint="The letterhead is showing the clinic only."
                                onChange={(v) => set("showSpecialty", v)}
                            />
                            <ToggleRow
                                label="Registration number"
                                hint={doctor?.registration_number || "Not set on the doctor profile yet"}
                                value={config.showRegistration}
                                disabled={!doctorShown}
                                disabledHint="The letterhead is showing the clinic only."
                                onChange={(v) => set("showRegistration", v)}
                            />
                        </ControlGroup>

                        <ControlGroup
                            icon={<FileSignature size={14} />}
                            title="Contact & footer"
                            subtitle="How a patient reaches you after they leave."
                        >
                            <ToggleRow
                                label="Address"
                                hint={hospital?.address || "Not set on the clinic profile yet"}
                                value={config.showClinicAddress}
                                onChange={(v) => set("showClinicAddress", v)}
                            />
                            <ToggleRow
                                label="Phone"
                                hint={hospital?.phone || "Not set on the clinic profile yet"}
                                value={config.showClinicPhone}
                                onChange={(v) => set("showClinicPhone", v)}
                            />
                            <ToggleRow
                                label="Email"
                                hint={hospital?.email || "Not set on the clinic profile yet"}
                                value={config.showClinicEmail}
                                disabled={!clinicShown}
                                disabledHint="The letterhead is showing the doctor only."
                                onChange={(v) => set("showClinicEmail", v)}
                            />
                            <ToggleRow
                                label="Website"
                                hint={hospital?.website || "Not set on the clinic profile yet"}
                                value={config.showWebsite}
                                disabled={!clinicShown}
                                disabledHint="The letterhead is showing the doctor only."
                                onChange={(v) => set("showWebsite", v)}
                            />
                            <ToggleRow
                                label="Signature"
                                hint={doctor?.signature_image_url ? "Signature on file" : "A ruled line to sign on"}
                                value={config.showSignature}
                                onChange={(v) => set("showSignature", v)}
                            />
                            <div className="flex flex-col gap-[5px]">
                                <label htmlFor="rxed-footer" className="text-[11px] font-semibold text-[var(--cs-muted)]">
                                    Footer note
                                </label>
                                <textarea
                                    id="rxed-footer"
                                    rows={2}
                                    value={config.footerNote}
                                    placeholder="Emergency number, timings, a closing line…"
                                    onChange={(e) => set("footerNote", e.target.value)}
                                    /* Trailing `!` on everything base.css's bare
                                       `textarea` rule also sets — see ui.tsx's
                                       cascade note. */
                                    className={
                                        "min-h-[52px]! resize-y rounded-[11px]! border! border-[var(--cs-line)]! bg-[rgba(248,250,252,0.9)]! " +
                                        "p-[9px]! px-[12px]! text-[12.5px] leading-[1.5] text-[var(--cs-ink)] outline-none " +
                                        "transition-shadow focus:border-[var(--cs-violet)]! focus:shadow-[0_0_0_3px_var(--cs-violet-soft)]!"
                                    }
                                />
                            </div>
                        </ControlGroup>

                        <ControlGroup
                            icon={<MessageSquareQuote size={14} />}
                            title="Default advice"
                            subtitle="Printed on every prescription, without retyping it."
                        >
                            {config.defaultAdvice.length > 0 ? (
                                <div className="flex flex-col">
                                    {config.defaultAdvice.map((line, i) => (
                                        <div
                                            key={`${line}-${i}`}
                                            className="flex items-center gap-[6px] border-b border-[var(--cs-line)] px-[2px] py-[6px] last:border-b-0"
                                        >
                                            <span className="h-[5px] w-[5px] flex-none rounded-full bg-[var(--cs-violet)]" aria-hidden="true" />
                                            <span className="min-w-0 flex-1 text-[12px] font-medium leading-[1.45] text-[var(--cs-ink)]">
                                                {line}
                                            </span>
                                            <RemoveButton
                                                label={`Remove "${line}"`}
                                                onClick={() => set(
                                                    "defaultAdvice",
                                                    config.defaultAdvice.filter((_, j) => j !== i)
                                                )}
                                            />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="m-0 text-[11.5px] font-normal leading-[1.5] text-[var(--cs-faint)]">
                                    No standing advice. Anything typed during a consult still prints.
                                </p>
                            )}
                            <div className="flex gap-[6px]">
                                <input
                                    type="text"
                                    value={newAdvice}
                                    placeholder="e.g. Take medicines after food."
                                    aria-label="New advice line"
                                    onChange={(e) => setNewAdvice(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") addAdvice(); }}
                                    className={`${INPUT_CLASS} h-[36px]! flex-1 rounded-[10px]! px-[11px]! text-[12.5px]!`}
                                />
                                <button
                                    type="button"
                                    disabled={!newAdvice.trim()}
                                    aria-label="Add advice line"
                                    onClick={addAdvice}
                                    className={
                                        "grid h-[36px] w-[36px] flex-none cursor-pointer place-items-center rounded-[10px] " +
                                        "border border-[var(--cs-violet)] bg-transparent text-[var(--cs-violet)] " +
                                        "transition-colors hover:bg-[var(--cs-violet-soft)] " +
                                        "disabled:cursor-not-allowed disabled:border-[var(--cs-line)] disabled:text-[var(--cs-faint)] disabled:hover:bg-transparent"
                                    }
                                >
                                    <Plus size={14} />
                                </button>
                            </div>
                        </ControlGroup>
                    </div>
                </div>
            </div>
        </div>
    );
}
