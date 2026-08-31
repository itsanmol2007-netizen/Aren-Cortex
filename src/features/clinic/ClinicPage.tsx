// ---------------------------------------------------------------------------
// CLINIC — "what I need to manage about my clinic."
//
// A sibling of Practice, not a settings application. Practice answers "how do
// I practise"; Clinic answers six questions and nothing else —
//
//   What is my clinic?         → the identity surface, clinic half
//   Who is the doctor?         → the identity surface, doctor half
//   What does my Rx look like? → Prescription Pad → the Prescription Editor
//   When am I open?            → Clinic Hours (a modal, not a page)
//   How do I reach patients?   → a doorway into the Communication Center
//   How will they book?        → a restrained Coming Soon
//
// ── What is deliberately NOT here ─────────────────────────────────────────
// No Contact Details card (that IS clinic information), no Branding,
// Documents, Reports, Billing, Staff, Inventory, public presence or "clinic
// preferences". If a thing belongs to clinic information it lives in that
// modal; if it belongs to another module this page links to that module; if it
// does not exist in the MVP there is no configuration surface pretending it
// does.
//
// ── The identity surface is ONE surface ───────────────────────────────────
// Clinic and Doctor are two rows in two different tables, and the UI does not
// mirror that: they sit inside one bordered card, sharing a hairline, the same
// type hierarchy and the same visual weight. The distinction the doctor should
// feel is conceptual (where I practise / who practises there), not structural.
//
// Each half is the click target for its own edit modal. The "Edit …"
// affordance inside it is a `<span>`, NOT a `<button>` — a real button nested
// inside a clickable `role="button"` container is the invalid-DOM/hydration
// trap this codebase has already hit twice (SESSION-HANDOFF 2026-08-29, item
// 0), and the half's own click already does exactly what that button's would.
//
// Styling is Tailwind, values from `--cs-*`. See `ui.tsx` for the shared
// primitives and the one scanner rule that governs how tone classes are built.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import type { ReactNode, RefObject } from "react";
import {
    ArrowRight, Award, Building2, CalendarDays, ChevronRight, Clock, FileSignature,
    Globe, GraduationCap, Mail, MapPin, MessageCircle, MessageSquare, Monitor,
    Pencil, Phone, ScrollText, Stethoscope,
} from "lucide-react";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { CommunicationArt } from "../../components/PlaceholderArt";
import { useClinicalIdentity } from "../../hooks/useClinicalIdentity";
import { RxPreview } from "./RxPreview";
import { ClinicHoursModal, EditClinicModal, EditDoctorModal } from "./ClinicModals";
import { Card, CardAction, CardPillButton, EmptyAction, EmptyBlock, FootLink, Heading, RowText, SkeletonRows } from "./ui";
import {
    DEFAULT_PRESCRIPTION_CONFIG, WEEKDAYS, emptyClinicHours, fetchClinicHours,
    fetchPrescriptionConfig, type ClinicDayHours, type PrescriptionConfig,
} from "../../lib/db/clinic";
import type { DBDoctor, DBHospital } from "../../lib/db";
import type { SidebarPage } from "../sidebar/SidebarNav";

interface Props {
    logoRef: RefObject<HTMLDivElement>;
    onOpenSidebar: () => void;
    /** Loaded once in App.tsx — the same two rows Consult and the prescription
     *  renderer already read. This page edits them; it keeps no second copy. */
    hospital: DBHospital | null;
    doctor: DBDoctor | null;
    onHospitalChange: (patch: Partial<DBHospital>) => void;
    onDoctorChange: (patch: Partial<DBDoctor>) => void;
    /** The sidebar's own navigate — Patient Communication is a REDIRECT to a
     *  module that exists, never a second copy of its controls. */
    onNavigate: (page: SidebarPage) => void;
    /** Opens the Prescription Editor, a full page under Clinic. The dashboard
     *  card is a preview and a doorway; it is never an inline editor. */
    onOpenPrescriptionEditor: () => void;
}

// ── Formatting ─────────────────────────────────────────────────────────────

/** "14:30" → "2:30 PM". An Indian clinic's board reads in 12-hour time; the
 *  input and the column store 24-hour, so the conversion happens once, here. */
function clockLabel(hhmm: string): string {
    const [h, m] = hhmm.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
    const suffix = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** One labelled fact inside the identity surface. Icon + value, never a
 *  "Label: value" pair — the icon IS the label (typography.md: a label beats a
 *  sentence), and a fact with no value simply isn't rendered rather than
 *  printing a grey placeholder. */
function IdentityFact({ icon, value }: { icon: ReactNode; value: string | null | undefined }) {
    if (!value) return null;
    return (
        <div className="flex min-w-0 items-start gap-[7px]">
            <span className="mt-[1px] grid flex-none place-items-center text-[var(--cs-faint)]" aria-hidden="true">
                {icon}
            </span>
            <span className="text-[12px] font-medium leading-[1.45] break-words text-[var(--cs-muted)]">{value}</span>
        </div>
    );
}

// ── The page ───────────────────────────────────────────────────────────────

export function ClinicPage({
    logoRef, onOpenSidebar, hospital, doctor,
    onHospitalChange, onDoctorChange, onNavigate, onOpenPrescriptionEditor,
}: Props) {
    const identity = useClinicalIdentity();

    const [week, setWeek] = useState<ClinicDayHours[]>(emptyClinicHours);
    const [hoursLoading, setHoursLoading] = useState(true);
    const [rxConfig, setRxConfig] = useState<PrescriptionConfig>(DEFAULT_PRESCRIPTION_CONFIG);

    const [clinicModalOpen, setClinicModalOpen] = useState(false);
    const [doctorModalOpen, setDoctorModalOpen] = useState(false);
    const [hoursModalOpen, setHoursModalOpen] = useState(false);

    useEffect(() => {
        if (!identity.ready) return;
        setHoursLoading(true);
        fetchClinicHours(identity.hospitalId)
            .then(setWeek)
            .catch(console.error)
            .finally(() => setHoursLoading(false));

        // The dashboard preview renders through the SAME config the editor
        // writes and the printer honours — a preview showing anything else
        // would be a picture of a prescription this clinic does not have.
        fetchPrescriptionConfig(identity.hospitalId)
            .then(setRxConfig)
            .catch(console.error);
    }, [identity.ready, identity.hospitalId]);

    const openDays = week.filter((d) => d.sessions.length > 0).length;
    const anyHoursSet = openDays > 0;

    const clinicPlace = [hospital?.city, hospital?.state].filter(Boolean).join(", ");
    const clinicAddressLine = [hospital?.address, clinicPlace].filter(Boolean).join(", ");

    /* Chips are the clinic's own words for itself, and only the ones it has
       actually said. A clinic with none of these set gets no chip row at all,
       rather than three grey placeholders standing in for content. */
    const chips = [hospital?.clinic_type, hospital?.facility_type, hospital?.tagline]
        .filter((c): c is string => !!c && !!c.trim());

    const scrollTo = (id: string) => {
        document.getElementById(id)?.scrollIntoView({ block: "center", behavior: "smooth" });
    };

    /* One half of the identity surface. Written once and called twice so the
       two halves cannot drift into different treatments — the brief's "same
       visual treatment, same typography hierarchy, similar visual weight" is
       enforced by there being literally one implementation. */
    const identityHalf = (opts: {
        /** DOM anchor, so the Settings page's search can deep-link straight
         *  to this half (see features/settings/settingsRegistry.ts). */
        id: string;
        eyebrow: string;
        eyebrowClass: string;
        image: ReactNode;
        title: string;
        role?: string | null;
        facts: ReactNode;
        chips?: ReactNode;
        cta: string;
        ctaHoverClass: string;
        onOpen: () => void;
    }) => (
        <div
            id={opts.id}
            role="button"
            tabIndex={0}
            aria-label={opts.cta}
            onClick={opts.onOpen}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); opts.onOpen(); }
            }}
            className={
                "group relative flex min-w-0 cursor-pointer flex-col gap-[9px] px-[15px] py-[12px] text-left " +
                "outline-none transition-colors hover:bg-[var(--cs-page)] focus-visible:bg-[var(--cs-page)] " +
                "focus-visible:shadow-[inset_0_0_0_2px_var(--cs-blue-soft)]"
            }
        >
            <span className={`text-[10px] font-bold uppercase tracking-[0.09em] ${opts.eyebrowClass}`}>
                {opts.eyebrow}
            </span>

            <div className="flex min-w-0 items-center gap-[9px]">
                {opts.image}
                <div className="flex min-w-0 flex-col gap-[2px]">
                    {/* `Heading`, not `<h2>` — see the cascade note in ui.tsx.
                        base.css's unlayered `h2 { font-size:12px; text-transform:
                        uppercase }` beat every utility here and rendered both
                        names at 12px in caps (measured live, 2026-08-29). */}
                    <Heading className="text-[17px] font-extrabold leading-[1.2] tracking-[-0.012em] break-words text-[var(--cs-ink)]">
                        {opts.title}
                    </Heading>
                    {opts.role && (
                        <span className="text-[12px] font-medium text-[var(--cs-muted)]">{opts.role}</span>
                    )}
                </div>
            </div>

            <div className="flex min-w-0 flex-col gap-[5px]">{opts.facts}</div>
            {opts.chips}

            {/* Not a <button>. Its container is already role="button" and
                already does exactly this; a real button nested inside a
                clickable container is the invalid-DOM trap noted at the top of
                this file. It carries the affordance, the half carries the
                click and the keyboard focus. */}
            <span
                className={
                    "mt-auto inline-flex items-center gap-[6px] self-start rounded-[9px] border " +
                    "border-[var(--cs-line-strong)] px-[13px] py-[7px] text-[11.5px] font-semibold " +
                    `text-[var(--cs-label)] transition-colors group-hover:bg-[var(--cs-card)] ${opts.ctaHoverClass}`
                }
            >
                <Pencil size={12} /> {opts.cta}
            </span>
        </div>
    );

    return (
        <div className="relative flex min-h-screen flex-col bg-[var(--cs-page)]">
            <WorkspaceHeader
                logoRef={logoRef}
                onOpenSidebar={onOpenSidebar}
                title="Clinic"
                subtitle="Your clinic, your profile and what your patients see"
                rightSlot={
                    /* Two pills, both real counts of things configured ON this
                       page, both a real jump to the card that owns them.
                       Practice carries four because Practice has four
                       countable collections; inventing two more here to match
                       that shape would be filling space with numbers that mean
                       nothing. `.ws-stat-pill` is the dark header's own
                       component, shared by every page that mounts it. */
                    <>
                        <button type="button" className="ws-stat-pill" onClick={() => scrollTo("clin-card-hours")}>
                            <span className="ws-stat-icon"><Clock size={12} /></span>
                            <span className="ws-stat-text">
                                <span className="ws-stat-value">{openDays}</span>
                                <span className="ws-stat-label">Open days</span>
                            </span>
                            <ChevronRight size={12} className="ws-stat-chevron" />
                        </button>
                        <button type="button" className="ws-stat-pill" onClick={() => scrollTo("clin-card-rx")}>
                            <span className="ws-stat-icon"><ScrollText size={12} /></span>
                            <span className="ws-stat-text">
                                <span className="ws-stat-value">{rxConfig.defaultAdvice.length}</span>
                                <span className="ws-stat-label">Rx advice</span>
                            </span>
                            <ChevronRight size={12} className="ws-stat-chevron" />
                        </button>
                    </>
                }
            />

            {/* One scroll region. The 56px gutter is the same one Practice and
                Patients already take inside `.app-shell`'s single container
                width — not a third number invented for this page. */}
            <div className="flex w-full flex-1 flex-col gap-[12px] overflow-y-auto px-[56px] pb-[44px] pt-[15px] max-[900px]:px-[12px]">

                {/* ══ ONE identity surface, two halves ═══════════════════════
                    Not two cards side by side: they share the border, the
                    background, the radius and the shadow, and the only thing
                    between them is a 1px rule.

                    Columns are deliberately NOT 1fr 1fr — the clinic half
                    carries an address, which wraps; the doctor half carries
                    short single-line facts. Equal columns would pad the doctor
                    side out with air to match a wrap that only ever happens on
                    the left. */}
                <section
                    aria-label="Clinic and doctor"
                    className={
                        "grid grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] overflow-hidden " +
                        "rounded-[var(--cs-radius)] border border-[var(--cs-line)] bg-[var(--cs-card)] " +
                        "shadow-[var(--cs-shadow)] max-[900px]:grid-cols-1 " +
                        "[&>*+*]:border-l [&>*+*]:border-[var(--cs-line)] " +
                        "max-[900px]:[&>*+*]:border-l-0 max-[900px]:[&>*+*]:border-t"
                    }
                >
                    {identityHalf({
                        id: "clin-identity-clinic",
                        eyebrow: "Clinic",
                        eyebrowClass: "text-[var(--cs-blue)]",
                        /* The logo and the doctor's photo are the SAME square,
                           same radius, same size — "same visual treatment" is
                           literal here. A wordmark is contained (it must not be
                           cropped); a face is covered. */
                        image: (
                            <div
                                aria-hidden="true"
                                className="grid h-[54px] w-[54px] flex-none place-items-center overflow-hidden rounded-[12px] border border-[var(--cs-line)] bg-[var(--cs-page)] text-[var(--cs-blue)]"
                            >
                                {hospital?.logo_url
                                    ? <img src={hospital.logo_url} alt="" className="block h-full w-full object-contain" />
                                    : <Building2 size={22} />}
                            </div>
                        ),
                        title: hospital?.name ?? "Your clinic",
                        role: hospital?.facility_type,
                        facts: (
                            <>
                                <IdentityFact icon={<MapPin size={13} />} value={clinicAddressLine} />
                                <IdentityFact icon={<Phone size={13} />} value={hospital?.phone} />
                                <IdentityFact icon={<Mail size={13} />} value={hospital?.email} />
                                <IdentityFact icon={<Globe size={13} />} value={hospital?.website} />
                            </>
                        ),
                        chips: chips.length > 0 ? (
                            <div className="flex flex-wrap gap-[5px]">
                                {chips.map((c) => (
                                    <span
                                        key={c}
                                        className="rounded-full border border-[var(--cs-line-strong)] bg-[var(--cs-page)] px-[10px] py-[3px] text-[10.5px] font-semibold text-[var(--cs-label)]"
                                    >
                                        {c}
                                    </span>
                                ))}
                            </div>
                        ) : undefined,
                        cta: "Edit clinic information",
                        ctaHoverClass: "group-hover:border-[var(--cs-blue)] group-hover:text-[var(--cs-blue)]",
                        onOpen: () => setClinicModalOpen(true),
                    })}

                    {identityHalf({
                        id: "clin-identity-doctor",
                        eyebrow: "Doctor",
                        eyebrowClass: "text-[var(--cs-violet)]",
                        image: (
                            <div
                                aria-hidden="true"
                                className="grid h-[54px] w-[54px] flex-none place-items-center overflow-hidden rounded-[12px] border border-[var(--cs-line)] bg-[var(--cs-page)] text-[var(--cs-violet)]"
                            >
                                {doctor?.avatar_url
                                    ? <img src={doctor.avatar_url} alt="" className="block h-full w-full object-cover" />
                                    : <Stethoscope size={22} />}
                            </div>
                        ),
                        title: doctor?.name ?? identity.doctorName,
                        role: doctor?.specialization,
                        facts: (
                            <>
                                <IdentityFact icon={<GraduationCap size={13} />} value={doctor?.qualification} />
                                <IdentityFact
                                    icon={<Award size={13} />}
                                    value={doctor?.registration_number ? `Reg. No. ${doctor.registration_number}` : null}
                                />
                                <IdentityFact icon={<Phone size={13} />} value={doctor?.phone} />
                                <IdentityFact
                                    icon={<FileSignature size={13} />}
                                    value={doctor?.signature_image_url ? "Signature on file" : null}
                                />
                            </>
                        ),
                        cta: "Edit doctor profile",
                        ctaHoverClass: "group-hover:border-[var(--cs-violet)] group-hover:text-[var(--cs-violet)]",
                        onOpen: () => setDoctorModalOpen(true),
                    })}
                </section>

                {/* ══ The two working surfaces ══════════════════════════════
                    Asymmetric on purpose: the prescription is a page of paper
                    (portrait), the week is a list of seven rows. Forcing both
                    to 50/50 would give one of them dead space it hasn't
                    earned. `items-stretch` gives the row its parity without
                    either card declaring a height. */}
                {/* Reverted back to `items-stretch` (2026-08-30) — the
                    `items-start` swap above documented a real bug at the
                    time ("a 519px well around a 200px empty state"), but
                    `RxPreview`'s own `maxHeight={440}` cap below did not
                    exist yet when that measurement was taken; today the tall
                    side of this row can never exceed 440px, so stretching no
                    longer reproduces that well — it gives Clinic Hours a
                    height matched to an already-bounded neighbour instead of
                    an unbounded one. Anmol, live: "if two related cards are
                    side by side, their heights should remain visually
                    aligned... don't have one card become 40px tall while its
                    neighbour is substantially taller" — `EmptyBlock` (see
                    ui.tsx) already centers itself in whatever height it's
                    given, so the empty state fills this properly instead of
                    sitting in unexplained dead space. */}
                <div className="grid grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)] items-stretch gap-[12px] max-[980px]:grid-cols-1">
                    <Card
                        id="clin-card-rx"
                        tone="violet"
                        icon={<ScrollText size={14} />}
                        title="Prescription Pad"
                        subtitle="See and customise how your prescriptions look."
                        action={
                            <CardAction tone="violet" onClick={onOpenPrescriptionEditor}>
                                Customise prescription <ArrowRight size={11} />
                            </CardAction>
                        }
                    >
                        {/* The real renderer at true paper size, scaled — not a
                            landscape dashboard tile pretending to be a
                            prescription. Clicking it goes to the editor, same
                            as the head action; it is not editable in place and
                            never will be. */}
                        <button
                            type="button"
                            aria-label="Customise prescription"
                            onClick={onOpenPrescriptionEditor}
                            className={
                                "group block w-full cursor-pointer border-0 bg-transparent p-0 outline-none " +
                                "transition-transform hover:-translate-y-[2px] motion-reduce:transform-none motion-reduce:transition-none"
                            }
                        >
                            <RxPreview
                                hospital={hospital}
                                doctor={doctor}
                                config={rxConfig}
                                format="a5"
                                /* A dashboard preview, not a reading copy —
                                   capped so the card beside it isn't dragged
                                   to a 994px row through `items-stretch`. */
                                maxHeight={440}
                                frameClass={
                                    "transition-[border-color,box-shadow] group-hover:border-[var(--cs-violet)] " +
                                    "group-hover:shadow-[0_6px_20px_rgba(124,58,237,0.12)] " +
                                    "group-focus-visible:border-[var(--cs-violet)] " +
                                    "group-focus-visible:shadow-[0_0_0_3px_var(--cs-violet-soft)]"
                                }
                            />
                        </button>
                    </Card>

                    <Card
                        id="clin-card-hours"
                        tone="blue"
                        icon={<Clock size={14} />}
                        title="Clinic Hours"
                        subtitle="When your clinic is open, day by day."
                        action={
                            <CardPillButton tone="blue" onClick={() => setHoursModalOpen(true)}>
                                <Pencil size={11} /> Edit hours
                            </CardPillButton>
                        }
                    >
                        {hoursLoading ? (
                            <SkeletonRows count={5} />
                        ) : anyHoursSet ? (
                            /* Bounded, per layout-composition.md: seven days
                               with several sessions each is the growable
                               region on this card, so it is the thing that
                               scrolls rather than the card that grows. */
                            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                                {week.map((d) => {
                                    // `WEEKDAYS` is Monday-first; `getDay()` is
                                    // Sunday-first. Rotating by 6 is the whole
                                    // conversion, and getting it wrong would
                                    // highlight the wrong row every day.
                                    const isToday = d.day === (new Date().getDay() + 6) % 7;
                                    const closed = d.sessions.length === 0;
                                    return (
                                        <div
                                            key={d.day}
                                            className={`flex items-center justify-between gap-[10px] rounded-[8px] border-b border-[var(--cs-line)] px-[10px] py-[13px] last:border-b-0 ${
                                                isToday ? "bg-[var(--cs-blue-soft)]" : ""
                                            }`}
                                        >
                                            <span className="flex items-center gap-[9px]">
                                                {/* Open/closed at a glance, in the
                                                    card's OWN tone rather than a
                                                    fifth colour — colour.md's
                                                    "thread the tone through". */}
                                                <span
                                                    className={`h-[7px] w-[7px] shrink-0 rounded-full ${
                                                        closed ? "bg-[var(--cs-line-strong)]" : "bg-[var(--cs-blue)]"
                                                    }`}
                                                    aria-hidden="true"
                                                />
                                                <span className="text-[14.5px] font-semibold text-[var(--cs-ink)]">
                                                    {WEEKDAYS[d.day]}
                                                </span>
                                                {isToday && (
                                                    <span className="rounded-[5px] bg-[var(--cs-blue)] px-[6px] py-[1px] text-[9.5px] font-bold uppercase tracking-[0.06em] text-white">
                                                        Today
                                                    </span>
                                                )}
                                            </span>
                                            {closed ? (
                                                /* Closed is a real state, not an
                                                   error — the muted step, never
                                                   red. Red would say something
                                                   went wrong on a Sunday. */
                                                <span className="text-[13.5px] font-semibold text-[var(--cs-label)]">Closed</span>
                                            ) : (
                                                <span className="flex flex-col items-end gap-[3px]">
                                                    {d.sessions.map((sess, i) => (
                                                        <span
                                                            key={i}
                                                            className="whitespace-nowrap text-[13.5px] font-semibold tabular-nums text-[var(--cs-muted)]"
                                                        >
                                                            {clockLabel(sess.opensAt)} – {clockLabel(sess.closesAt)}
                                                        </span>
                                                    ))}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <EmptyBlock
                                art={<CalendarDays size={30} strokeWidth={1.4} className="text-[var(--cs-line-strong)]" aria-hidden="true" />}
                                fact="No hours set yet"
                                next="Set which days you see patients, and when."
                                action={
                                    <EmptyAction tone="blue" onClick={() => setHoursModalOpen(true)}>
                                        <Clock size={14} /> Set clinic hours
                                    </EmptyAction>
                                }
                            />
                        )}
                    </Card>
                </div>

                {/* ══ Two quiet surfaces: one doorway, one honest "not yet" ══ */}
                <div className="grid grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] items-stretch gap-[12px] max-[980px]:grid-cols-1">
                    <Card
                        tone="teal"
                        icon={<MessageCircle size={14} />}
                        title="Patient Communication"
                        subtitle="Messages, reminders and templates for your patients."
                        action={
                            <CardAction tone="teal" onClick={() => onNavigate("communication")}>
                                Open Communication <ArrowRight size={11} />
                            </CardAction>
                        }
                        foot={
                            <FootLink tone="teal" onClick={() => onNavigate("communication")}>
                                Go to Communication Center <ChevronRight size={12} />
                            </FootLink>
                        }
                    >
                        {/* An entry point, not a second copy of that module's
                            controls. What a prescription PRINTS (advice,
                            footer) is the Prescription Editor's job — a doctor
                            should never have to wonder why prescription advice
                            would be filed under Communication. */}
                        <EmptyBlock
                            art={<CommunicationArt />}
                            fact="Patient messaging lives in one place"
                            next="Every conversation, reminder and template for your patients — configured there, not here."
                        />
                    </Card>

                    <Card
                        tone="slate"
                        icon={<CalendarDays size={14} />}
                        title="Patient Booking"
                        subtitle="Let patients book appointments with your clinic."
                    >
                        {/* No fake configuration, no roadmap panel, no
                            explanation nobody asked for. Two lines and the
                            truth. When booking ships, this same surface
                            becomes the entry point to its configuration. */}
                        <div className="flex flex-1 flex-col justify-center gap-[6px]">
                            {[
                                {
                                    icon: <Monitor size={15} />,
                                    tint: "bg-[var(--cs-blue-soft)] text-[var(--cs-blue)]",
                                    label: "Online booking",
                                    sub: "Appointments booked from a link you share.",
                                },
                                {
                                    icon: <MessageSquare size={15} />,
                                    tint: "bg-[var(--cs-teal-soft)] text-[var(--cs-teal)]",
                                    label: "WhatsApp booking",
                                    sub: "Patients book in the chat they already use.",
                                },
                            ].map((row) => (
                                <div
                                    key={row.label}
                                    className="flex min-w-0 items-center gap-[9px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[9px] py-[10px]"
                                >
                                    <span className={`grid h-[28px] w-[28px] flex-none place-items-center rounded-[8px] ${row.tint}`}>
                                        {row.icon}
                                    </span>
                                    <RowText label={row.label} sub={row.sub} />
                                    <span className="ml-auto flex-none rounded-full border border-[var(--cs-line-strong)] bg-[var(--cs-card)] px-[10px] py-[3px] text-[10px] font-bold uppercase tracking-[0.05em] text-[var(--cs-label)]">
                                        Coming soon
                                    </span>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
            </div>

            {clinicModalOpen && (
                <EditClinicModal
                    hospitalId={identity.hospitalId}
                    hospital={hospital}
                    onClose={() => setClinicModalOpen(false)}
                    onSaved={onHospitalChange}
                />
            )}
            {doctorModalOpen && (
                <EditDoctorModal
                    hospitalId={identity.hospitalId}
                    doctorId={identity.doctorId}
                    doctor={doctor}
                    onClose={() => setDoctorModalOpen(false)}
                    onSaved={onDoctorChange}
                />
            )}
            {hoursModalOpen && (
                <ClinicHoursModal
                    hospitalId={identity.hospitalId}
                    week={week}
                    onClose={() => setHoursModalOpen(false)}
                    onSaved={setWeek}
                />
            )}
        </div>
    );
}
