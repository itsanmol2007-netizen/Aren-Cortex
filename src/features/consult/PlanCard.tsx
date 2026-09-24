// ---------------------------------------------------------------------------
// CONSULTATION PLAN — the destination of the consultation.
//
// Not merely a prescription: it represents today's clinical decisions, grouped
// by recommendation type. The structure is identical for every specialty; only
// the content changes.
//
// What this column shows is exactly what `saveConsult` writes. There is no
// hidden state between here and the Rx.
//
// The companion slot lives here, and only here: a suggestion that a medicine
// travels with another belongs directly beneath the medicine that triggered it,
// never in a section of its own.
// ---------------------------------------------------------------------------

import { useRef, useState } from "react";
import {
    Activity, CalendarClock, CalendarDays, Clock, FileText, FlaskConical, Keyboard,
    MapPin, NotebookPen, Pill, Printer, Stethoscope, Utensils, Waves, X,
} from "lucide-react";
import type { PrescriptionMedicine } from "../../types";
import type { CompanionSuggestion } from "../../lib/synapse/companions";
import type { PreferredLab } from "../../lib/db/synapse";
import type { InterventionLine } from "./interventionPlan";
import { formatDue, formatSide as formatInterventionSide } from "./interventionPlan";
import type { PlannedIntervention } from "../../lib/db/interventions";
import { freqLabelToKeys, keysToFreqLabel } from "../../lib/db";
import { BlankPlanArt } from "./BlankArt";
import { CompanionLine, MedicineIdentity } from "./parts";
import { useRovingList } from "../../hooks/useRovingList";
import { firedChord, matches } from "../../lib/keyboard/keymap";

const SLOTS = [
    { key: "M", label: "Morning" },
    { key: "A", label: "Noon" },
    { key: "E", label: "Evening" },
    { key: "N", label: "Night" },
];

const FOLLOW_UP_CHOICES = [3, 5, 7, 14];

/**
 * Dose, frequency and duration, edited on the line itself.
 *
 * These three are the whole of a routine edit, and sending the doctor to a
 * modal for them meant every prescription cost a dialog. The modal survives for
 * notes and clinical context, one button away.
 */
function DoseEditor({
    medicine, onUpdate, onMore,
}: {
    medicine: PrescriptionMedicine;
    onUpdate: (m: PrescriptionMedicine) => void;
    onMore: () => void;
}) {
    const slots = freqLabelToKeys(medicine.frequency);
    const days = parseInt(medicine.duration, 10);
    const dayCount = Number.isFinite(days) ? days : 5;

    const setDays = (n: number) =>
        onUpdate({ ...medicine, duration: `${Math.max(1, Math.min(90, n))} days` });

    return (
        <div className="cs-dose" onClick={(e) => e.stopPropagation()}>
            <div className="cs-dose-row">
                <label className="cs-dose-field">
                    <span>Dose</span>
                    <input
                        value={medicine.dosage}
                        placeholder="1 tab"
                        onChange={(e) => onUpdate({ ...medicine, dosage: e.target.value })}
                    />
                </label>
                <div className="cs-dose-field">
                    <span>Days</span>
                    <div className="cs-stepper">
                        <button type="button" onClick={() => setDays(dayCount - 1)} aria-label="Fewer days">−</button>
                        <b>{dayCount}</b>
                        <button type="button" onClick={() => setDays(dayCount + 1)} aria-label="More days">+</button>
                    </div>
                </div>
            </div>

            <div className="cs-dose-field">
                <span>When</span>
                <div className="cs-slots">
                    {SLOTS.map((s) => {
                        const on = slots.includes(s.key);
                        return (
                            <button
                                key={s.key}
                                type="button"
                                className="cs-slot"
                                aria-pressed={on}
                                title={s.label}
                                onClick={() =>
                                    onUpdate({
                                        ...medicine,
                                        frequency: keysToFreqLabel(
                                            on ? slots.filter((k) => k !== s.key) : [...slots, s.key]
                                        ),
                                    })
                                }
                            >{s.key}</button>
                        );
                    })}
                    <button
                        type="button"
                        className={`cs-slot is-sos${medicine.is_sos ? " is-on" : ""}`}
                        aria-pressed={!!medicine.is_sos}
                        title="Only when needed"
                        onClick={() => onUpdate({ ...medicine, is_sos: !medicine.is_sos })}
                    >SOS</button>
                </div>
            </div>

            <button type="button" className="cs-dose-more" onClick={onMore}>
                Notes &amp; details…
            </button>
        </div>
    );
}

function Group({
    icon, tone, title, count, onAdd, children,
}: {
    icon: React.ReactNode;
    tone: "blue" | "teal" | "rose" | "slate";
    title: string;
    count?: number;
    onAdd?: () => void;
    children: React.ReactNode;
}) {
    return (
        <section aria-label={title}>
            <div className="cs-group-head">
                <span className={`cs-glyph is-${tone}`}>{icon}</span>
                <span className="cs-group-title">
                    {title}{count != null && ` (${count})`}
                </span>
                {onAdd && (
                    <button type="button" className="cs-group-add" onClick={onAdd}>+ Add</button>
                )}
            </div>
            {children}
        </section>
    );
}

interface Props {
    /** plan lines added in the last few seconds — see useJustAdded */
    justAdded: Set<string>;
    diagnoses: string[];
    onRemoveDiagnosis: (label: string) => void;
    prescription: PrescriptionMedicine[];
    onSelectMedicine: (id: string) => void;
    onUpdateMedicine: (m: PrescriptionMedicine) => void;
    onRemoveMedicine: (id: string) => void;
    tests: string[];
    onRemoveTest: (label: string) => void;
    /** The doctor's own diagnostic-centre directory — see PracticePage's
     *  Preferred Labs card. Foundation for the future Lab Node: today this
     *  only records which lab an order is FOR, not the order itself. */
    preferredLabs: PreferredLab[];
    selectedLabName: string | null;
    onSelectLabName: (name: string) => void;
    /** "+ Add your preferred lab" when the list is empty — jumps to Practice. */
    onManageLabs: () => void;
    adviceLines: string[];
    interventions: InterventionLine[];
    /** the home programme, already formatted — see exercisePlan.formatLine */
    exerciseLines: { id: string; text: string }[];
    onRemoveExercise: (id: string) => void;
    onRemoveAdviceLine: (line: string) => void;
    onRemoveIntervention: (id: string) => void;
    onAddAnotherInterventionSite: (id: string) => void;
    /** planned at an earlier visit and not yet done — each with Perform */
    plannedEarlier?: PlannedIntervention[];
    onPerformPlanned?: (p: PlannedIntervention) => void;
    followUpDays: number | null;
    onFollowUpChange: (days: number | null) => void;
    notes: string;
    onNotesChange: (v: string) => void;
    /**
     * Companions for one medicine already on the plan. The panel asks per line
     * rather than receiving a flat list, because the whole point of the slot is
     * that a suggestion belongs to the medicine that triggered it — a list the
     * panel had to match up itself would be one mismatched key away from
     * offering a PPI under the wrong drug.
     */
    companionsFor: (intentId: number) => CompanionSuggestion[];
    onAddCompanion: (c: CompanionSuggestion) => void;
    onDismissCompanion: (companionIntentId: number) => void;
    /** jumps focus to the matching picker/search — the "+ Add" affordances */
    onAddMedicine: () => void;
    onAddTest: () => void;
    onReviewRx: () => void;
    onPrint: () => void;
    panelRef?: React.RefObject<HTMLElement>;
    /** Turns today's accepted items into a reusable Prescription Template —
     *  see App.tsx's SaveAsTemplateModal. Absent items list means nothing
     *  worth saving yet, so the button only renders once the plan isn't empty. */
    onSaveAsTemplate?: () => void;
    /** Opens the keyboard map. Lives here since 2026-09-13 — it used to be
     *  the only permanent resident of the bottom status bar. */
    onOpenShortcuts?: () => void;
}

export function PlanCard({
    justAdded,
    diagnoses, onRemoveDiagnosis,
    prescription, onSelectMedicine, onUpdateMedicine, onRemoveMedicine,
    tests, onRemoveTest,
    preferredLabs, selectedLabName, onSelectLabName, onManageLabs,
    adviceLines, onRemoveAdviceLine,
    interventions, onRemoveIntervention, onAddAnotherInterventionSite,
    plannedEarlier = [], onPerformPlanned,
    exerciseLines, onRemoveExercise,
    followUpDays, onFollowUpChange,
    notes, onNotesChange,
    companionsFor, onAddCompanion, onDismissCompanion,
    onAddMedicine, onAddTest, onReviewRx, onPrint, panelRef, onSaveAsTemplate,
    onOpenShortcuts,
}: Props) {
    const [openId, setOpenId] = useState<string | null>(null);

    /**
     * ── The plan, on the keyboard ───────────────────────────────────────────
     *
     * The fourth Tab stop, and the only one that is not a search box: the
     * keyboard hook lands focus on the first `[data-cx-planline]` and the walk
     * carries on from there. Every line is walkable — diagnoses, medicines,
     * tests, advice — because "take that off again" applies to all of them and
     * a cursor that silently skipped three of the four kinds would be worse
     * than none.
     *
     * Only medicines have anything to OPEN, so Enter on the others does
     * nothing rather than something surprising; `[data-cx-planline]` is on the
     * medicine lines alone, which makes that fall out of the selector instead
     * of needing a check.
     *
     * Backspace is bound beside Delete because the plan rail is where a doctor
     * ends up after typing, and on a laptop Delete is a chord. It is safe here
     * for the same reason the digits are safe in the add sheet: `matches()`
     * refuses both keys the moment the event comes from a field, and this
     * panel has a notes textarea at the bottom of it.
     */
    const scrollRef = useRef<HTMLDivElement>(null);
    const roving = useRovingList({
        containerRef: scrollRef,
        rowSelector: ".cs-line",
        actionSelector: "[data-cx-planline]",
    });

    const onListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const move = firedChord(e, "planMove");
        if (move) {
            e.preventDefault();
            e.stopPropagation();
            roving.move(move.key === "ArrowUp" ? -1 : 1);
            return;
        }
        if (matches(e, "planOpen")) {
            if (!roving.current()) return;
            e.preventDefault();
            e.stopPropagation();
            roving.activate();
            return;
        }
        if (matches(e, "planRemove")) {
            const row = roving.current();
            if (!row) return;
            e.preventDefault();
            e.stopPropagation();
            // Step the cursor first, then remove: the row is about to leave the
            // DOM, and a cursor sitting on a detached node means the next ↓
            // restarts from the top of a list the doctor was halfway down.
            const rows = roving.rows();
            const at = rows.indexOf(row);
            const after = rows[at + 1] ?? rows[at - 1] ?? null;
            row.querySelector<HTMLElement>("button.cs-x")?.click();
            if (after) {
                roving.clear();
                after.setAttribute("data-cx-cursor", "on");
            }
        }
    };

    // Interventions and exercises count: a visit that was only a cast is
    // not an empty plan, and must still reach Review & Print.
    const itemCount =
        diagnoses.length + prescription.length + tests.length + adviceLines.length +
        interventions.length + exerciseLines.length +
        (followUpDays != null ? 1 : 0);

    // Performing an earlier plan takes it off "due" the moment it is added.
    const fulfilledIds = new Set(interventions.map((l) => l.fulfilsId).filter(Boolean));
    const dueEarlier = plannedEarlier.filter((p) => !fulfilledIds.has(p.id));
    const doneToday = interventions.filter((l) => l.status !== "planned");
    const plannedNow = interventions.filter((l) => l.status === "planned");

    const isEmpty = itemCount === 0;

    return (
        <aside className="cs-card cs-plan" aria-label="Consultation plan" ref={panelRef}>
            <div className="cs-plan-head">
                {/* Title, count and the shortcut key on one row; "Save as
                    template" on its own beneath it. Anmol, 2026-09-14: "the
                    save as template thing and one item thing is literally
                    pushing that keyboard icon aside... the single button is
                    cramping the whole thing. The word Consultation Plan is in
                    one line but now it's going in two lines."
                    Three controls plus a two-word title never fit this rail's
                    width, so the title wrapped and everything after it slid
                    off centre. The button is the widest and the least often
                    pressed, so it is the one that moves. */}
                <div className="cs-plan-head-top">
                    <h2 className="cs-card-title">Consultation Plan</h2>
                    <div className="cs-plan-head-end">
                    <span className="cs-count is-quiet">
                        {itemCount} item{itemCount === 1 ? "" : "s"}
                    </span>
                    {/* Moved here 2026-09-13 from the bottom status bar, which
                        was holding a whole strip open across the consult to
                        carry this one icon. The plan header is on screen just
                        as permanently, already has a controls row, and is
                        closer to where the hands are. `?` still opens it —
                        the chord is printed on the button so it teaches its
                        own replacement. */}
                    {onOpenShortcuts && (
                        <button
                            type="button"
                            className="cs-plan-keys"
                            onClick={onOpenShortcuts}
                            aria-label="Keyboard shortcuts"
                            title="Keyboard shortcuts"
                        >
                            <Keyboard size={13} />
                            <kbd>?</kbd>
                        </button>
                    )}
                    </div>
                </div>
                {!isEmpty && onSaveAsTemplate && (
                    <button type="button" className="cs-plan-save-template" onClick={onSaveAsTemplate}>
                        Save as template
                    </button>
                )}
            </div>

            {/* The keydown sits on the scroll container rather than on each
                line: focus lands on ONE line (the hook's landing target) and
                the arrows have to keep working from there as the cursor moves
                to lines that were never focused. */}
            <div className="cs-plan-scroll" ref={scrollRef} onKeyDown={onListKeyDown}>
                {isEmpty && dueEarlier.length === 0 ? (
                    <div className="cs-plan-empty">
                        <BlankPlanArt />
                        <strong>Nothing planned yet</strong>
                        {/* Was two full lines restating what "Consultation
                            Plan" and the recommendations beside it already
                            say — Anmol, 2026-08-25: "too much unnecessary
                            information/text in the empty state." */}
                        <span>Taken items land here.</span>
                    </div>
                ) : (
                    <>
                        {diagnoses.length > 0 && (
                            <Group icon={<Stethoscope size={12} />} tone="rose" title="Diagnosis" count={diagnoses.length}>
                                {/* The FIRST confirmed condition is the primary
                                    diagnosis and the rest are secondary. That
                                    convention used to be carried by the
                                    Assessment card's confirmed column, which a
                                    specialty may now replace with its own
                                    instrument (see ConditionsCard's `sideSlot`),
                                    so it is marked here instead — the rail is
                                    the one surface that shows the diagnosis for
                                    every profile, always.

                                    It is a convention and never a derivation:
                                    the engine does not decide which diagnosis is
                                    primary, because that is the one judgement in
                                    this workspace that is entirely the
                                    doctor's. */}
                                {diagnoses.map((dx, i) => (
                                    <div key={dx} className={`cs-line${justAdded.has(dx) ? " is-new" : ""}`}>
                                        <div className="cs-line-main">
                                            <div className="cs-line-name">
                                                <span>{dx}</span>
                                                {i === 0 && diagnoses.length > 1 && (
                                                    <em className="cs-dx-primary">Primary</em>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className="cs-x"
                                            aria-label={`Remove ${dx}`}
                                            onClick={(e) => { e.stopPropagation(); onRemoveDiagnosis(dx); }}
                                        >
                                            <X size={13} />
                                        </button>
                                    </div>
                                ))}
                            </Group>
                        )}

                        {/* No "+ Add" here any more (§9, 2026-08-24): it only
                            ever moved focus to the search field two panels to
                            the left, which is already on screen and already
                            reachable — a second, redundant way to reach the
                            same box, on a rail whose job is showing what was
                            already decided. `onAddMedicine` stays wired for
                            the keyboard shortcut that does the same jump. */}
                        <Group
                            icon={<Pill size={12} />}
                            tone="teal"
                            title="Medicines"
                            count={prescription.length}
                        >
                            {prescription.map((m) => {
                                // Companions attach to the RANKED intent, so a line with
                                // no intent — a Repeat Rx import, never ranked this
                                // consult — simply has none. That is correct, not a gap.
                                const companions =
                                    m.intent_id != null ? companionsFor(m.intent_id) : [];

                                return (
                                    <div
                                        key={m.id}
                                        className={`cs-line is-med is-click${openId === m.id ? " is-active" : ""}${justAdded.has(m.id) ? " is-new" : ""}`}
                                    >
                                        <div
                                            className="cs-line-main"
                                            data-cx-planline=""
                                            role="button"
                                            tabIndex={0}
                                            aria-expanded={openId === m.id}
                                            onClick={() => setOpenId(openId === m.id ? null : m.id)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" || e.key === " ") {
                                                    e.preventDefault();
                                                    setOpenId(openId === m.id ? null : m.id);
                                                }
                                            }}
                                        >
                                            <div className="cs-line-name">
                                                {/* Brand over composition, the same two lines the
                                                    recommendations and the print use. */}
                                                <MedicineIdentity
                                                    brand={m.name}
                                                    composition={m.composition || m.name}
                                                />
                                                {m.is_sos && <span className="cs-pill is-sos">SOS</span>}
                                            </div>
                                            {/* Was one bullet-joined run-on string (dose • freq •
                                                duration • notes) — the exact thing that read as
                                                cluttered once two or three medicines stacked, all
                                                the same weight, all the same grey. Second pass,
                                                2026-09-11 (Anmol, looking at ONE medicine on the
                                                plan: "terribly placed without any visual hierarchy
                                                ... looks like an HTML file without CSS"): three
                                                identical grey boxes read exactly the same way a
                                                run-on string did — nothing told you which number
                                                was WHICH. Each tag now carries its own icon
                                                (dose/frequency/duration are different questions,
                                                not interchangeable facts) and the group's own teal,
                                                so the row reads as "this medicine's" info at a
                                                glance instead of loose data. */}
                                            {/* The instruction (After food / Before food / …) used
                                                to sit on its own row below — a fixed, always-short
                                                vocabulary (see MedicineAddSheet.tsx's own note: "any
                                                of the four") reserving a whole line for itself.
                                                Anmol, 2026-09-11: "move that thing also into the
                                                same row... don't reserve a dedicated vertical space
                                                for just this tiny thing." Folded into the same tag
                                                row as a fourth chip. */}
                                            {(m.dosage || m.frequency || m.duration || m.notes) && (
                                                <div className="cs-line-tags">
                                                    {m.dosage && (
                                                        <span className="cs-line-tag is-dose">
                                                            <Pill size={10} aria-hidden="true" /> {m.dosage}
                                                        </span>
                                                    )}
                                                    {m.frequency && (
                                                        <span className="cs-line-tag is-freq">
                                                            <Clock size={10} aria-hidden="true" /> {m.frequency}
                                                        </span>
                                                    )}
                                                    {m.duration && (
                                                        <span className="cs-line-tag is-dur">
                                                            <CalendarDays size={10} aria-hidden="true" /> {m.duration}
                                                        </span>
                                                    )}
                                                    {m.notes && (
                                                        <span className="cs-line-tag is-notes">
                                                            <Utensils size={10} aria-hidden="true" /> {m.notes}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            className="cs-x"
                                            aria-label={`Remove ${m.name}`}
                                            onClick={(e) => { e.stopPropagation(); onRemoveMedicine(m.id); }}
                                        >
                                            <X size={13} />
                                        </button>

                                        {openId === m.id && (
                                            <div style={{ gridColumn: "1 / -1" }}>
                                                <DoseEditor
                                                    medicine={m}
                                                    onUpdate={onUpdateMedicine}
                                                    onMore={() => onSelectMedicine(m.id)}
                                                />
                                            </div>
                                        )}

                                        {companions.length > 0 && (
                                            <div className="cs-comp-slot">
                                                {companions.map((c) => (
                                                    <CompanionLine
                                                        key={c.companionIntentId}
                                                        suggestion={c}
                                                        onAdd={() => onAddCompanion(c)}
                                                        onDismiss={() => onDismissCompanion(c.companionIntentId)}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </Group>

                        <Group
                            icon={<FlaskConical size={12} />}
                            tone="blue"
                            title="Investigations"
                            count={tests.length}
                        >
                            {tests.map((t) => (
                                <div key={t} className={`cs-line${justAdded.has(t) ? " is-new" : ""}`}>
                                    <div className="cs-line-main">
                                        <div className="cs-line-name"><span>{t}</span></div>
                                    </div>
                                    <button
                                        type="button"
                                        className="cs-x"
                                        aria-label={`Remove ${t}`}
                                        onClick={(e) => { e.stopPropagation(); onRemoveTest(t); }}
                                    >
                                        <X size={13} />
                                    </button>
                                </div>
                            ))}
                            {/* The Lab Node foundation: once an investigation
                                is on the plan, ask which of the doctor's own
                                diagnostic centres it should go to — defaults
                                to whichever was picked last time (see
                                App.tsx's seeding effect), never invented. */}
                            {tests.length > 0 && (
                                <div className={`cs-lab-prompt${selectedLabName ? " is-set" : ""}`}>
                                    <div className="cs-lab-prompt-head">
                                        <FlaskConical size={11} />
                                        <span>Order from</span>
                                    </div>
                                    {preferredLabs.length > 0 ? (
                                        <div className="cs-lab-chips">
                                            {preferredLabs.map((lab) => (
                                                <button
                                                    key={lab.id}
                                                    type="button"
                                                    className={`cs-lab-chip${selectedLabName === lab.name ? " is-active" : ""}`}
                                                    onClick={() => onSelectLabName(lab.name)}
                                                >{lab.name}</button>
                                            ))}
                                        </div>
                                    ) : (
                                        <button type="button" className="cs-lab-chip is-add" onClick={onManageLabs}>
                                            + Add your preferred lab
                                        </button>
                                    )}
                                </div>
                            )}
                        </Group>

                        {/* Delivered in the clinic today, ABOVE advice, because
                            it happened before the patient was given anything to
                            take home — the plan reads in the order the session
                            ran. Teal is the "examined" colour from the doctrine's
                            palette, which is the closest existing meaning: this
                            is something the clinician did with their hands, not
                            an instruction issued. */}
                        {/* The home programme, between what was done in the
                            clinic and the general advice — the order the
                            session ran and the order the patient experiences
                            it. Blue: this is the thing they leave with and act
                            on, which is the action colour's job. */}
                        {exerciseLines.length > 0 && (
                            <Group
                                icon={<Activity size={12} />}
                                tone="blue"
                                title="Home programme"
                                count={exerciseLines.length}
                            >
                                {exerciseLines.map(({ id, text }) => (
                                    <div key={id} className={`cs-line${justAdded.has(text) ? " is-new" : ""}`}>
                                        <div className="cs-line-main">
                                            <div className="cs-line-name"><span>{text}</span></div>
                                        </div>
                                        <button
                                            type="button"
                                            className="cs-x"
                                            aria-label={`Remove ${text}`}
                                            onClick={(e) => { e.stopPropagation(); onRemoveExercise(id); }}
                                        >
                                            <X size={13} />
                                        </button>
                                    </div>
                                ))}
                            </Group>
                        )}

                        {dueEarlier.length > 0 && (
                            <Group
                                icon={<Waves size={12} />}
                                tone="teal"
                                title="Due from earlier visits"
                                count={dueEarlier.length}
                            >
                                {dueEarlier.map((p) => (
                                    <div key={p.id} className="cs-line">
                                        <div className="cs-line-main">
                                            <div className="cs-line-name"><span>{p.text}</span></div>
                                            <div className="cs-line-tags">
                                                <span className="cs-line-tag is-freq">
                                                    {p.dueDate ? `Due ${formatDue(p.dueDate)}` : "Planned"} · from {p.when}
                                                </span>
                                            </div>
                                        </div>
                                        {onPerformPlanned && (
                                            <button
                                                type="button"
                                                className="cs-dose-more"
                                                onClick={(e) => { e.stopPropagation(); onPerformPlanned(p); }}
                                            >
                                                Perform
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </Group>
                        )}

                        {([["Interventions — done today", doneToday], ["Interventions — planned", plannedNow]] as const).map(([title, lines]) =>
                            lines.length > 0 && (
                            <Group
                                key={title}
                                icon={<Waves size={12} />}
                                tone="teal"
                                title={title}
                                count={lines.length}
                            >
                                {lines.map((line) => {
                                    const sideTag = formatInterventionSide(line.side);
                                    return (
                                        <div key={line.id} className={`cs-line${justAdded.has(line.id) ? " is-new" : ""}`}>
                                            <div className="cs-line-main">
                                                {/* A configured intervention carries its whole line
                                                    ("Cast — Left forearm, below-elbow, backslab, POP");
                                                    its site is inside that line, not a second tag. */}
                                                <div className="cs-line-name"><span>{line.text || line.label}</span></div>
                                                {((!line.text && line.site) || sideTag || line.notes || line.status === "planned") && (
                                                    <div className="cs-line-tags">
                                                        {line.status === "planned" && (
                                                            <span className="cs-line-tag is-freq">
                                                                {line.dueDate ? `Due ${formatDue(line.dueDate)}` : "Planned"}
                                                            </span>
                                                        )}
                                                        {!line.text && line.site && (
                                                            <span className="cs-line-tag is-dose">
                                                                <MapPin size={10} aria-hidden="true" /> {line.site}
                                                            </span>
                                                        )}
                                                        {sideTag && (
                                                            <span className="cs-line-tag is-freq">{sideTag}</span>
                                                        )}
                                                        {line.notes && (
                                                            <span className="cs-line-tag is-notes">
                                                                <Utensils size={10} aria-hidden="true" /> {line.notes}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                className="cs-x"
                                                aria-label={`Remove ${line.label}`}
                                                onClick={(e) => { e.stopPropagation(); onRemoveIntervention(line.id); }}
                                            >
                                                <X size={13} />
                                            </button>
                                            <button
                                                type="button"
                                                className="cs-dose-more"
                                                onClick={(e) => { e.stopPropagation(); onAddAnotherInterventionSite(line.id); }}
                                            >
                                                + Another site
                                            </button>
                                        </div>
                                    );
                                })}
                            </Group>
                        ))}

                        {adviceLines.length > 0 && (
                            <Group
                                icon={<NotebookPen size={12} />}
                                tone="slate"
                                title="Advice"
                                count={adviceLines.length}
                            >
                                {adviceLines.map((line) => (
                                    <div key={line} className={`cs-line${justAdded.has(line) ? " is-new" : ""}`}>
                                        <div className="cs-line-main">
                                            <div className="cs-line-name"><span>{line}</span></div>
                                        </div>
                                        <button
                                            type="button"
                                            className="cs-x"
                                            aria-label={`Remove ${line}`}
                                            onClick={(e) => { e.stopPropagation(); onRemoveAdviceLine(line); }}
                                        >
                                            <X size={13} />
                                        </button>
                                    </div>
                                ))}
                            </Group>
                        )}

                        <Group icon={<CalendarClock size={12} />} tone="slate" title="Follow up">
                            <div className="cs-followup">
                                <button
                                    type="button"
                                    className="cs-toggle"
                                    aria-pressed={followUpDays == null}
                                    onClick={() => onFollowUpChange(null)}
                                >None</button>
                                {FOLLOW_UP_CHOICES.map((d) => (
                                    <button
                                        key={d}
                                        type="button"
                                        className="cs-toggle"
                                        aria-pressed={followUpDays === d}
                                        onClick={() => onFollowUpChange(followUpDays === d ? null : d)}
                                    >{d} days</button>
                                ))}
                            </div>
                        </Group>
                    </>
                )}
            </div>

            <div className="cs-plan-foot">
                <textarea
                    className="cs-notes"
                    value={notes}
                    placeholder="Add notes for this visit…"
                    onChange={(e) => onNotesChange(e.target.value)}
                    aria-label="Notes for this visit"
                />
                <div className="cs-plan-actions">
                    <button
                        type="button"
                        className="cs-print"
                        onClick={onPrint}
                        disabled={isEmpty}
                        aria-label="Print"
                        title="Print"
                    >
                        <Printer size={17} />
                    </button>
                    <button
                        type="button"
                        className="cs-review"
                        /* First-run walkthrough anchor. `requireEnabled` on its
                           step means the hint waits until the plan actually has
                           something on it — see features/onboarding. */
                        data-coach="plan.review"
                        disabled={isEmpty}
                        onClick={onReviewRx}
                    >
                        <FileText size={15} />
                        Review &amp; Print
                        <span className="cs-kbd">Ctrl P</span>
                    </button>
                </div>
            </div>
        </aside>
    );
}
