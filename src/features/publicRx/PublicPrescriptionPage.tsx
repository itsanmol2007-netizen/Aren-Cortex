// ---------------------------------------------------------------------------
// THE PUBLIC PRESCRIPTION PAGE — `/prescriptions/:token`.
//
// What a patient sees when they tap "View Your Prescription" on the WhatsApp
// message. No login, no app shell, no sidebar — a single mobile-first page,
// built for a low-literacy audience per Anmol's brief: visuals carry the
// meaning (a Sun/Moon/Plate icon row for WHEN and WHETHER to eat with each
// dose), text backs them up, nothing is washed-out or faint. Tailwind
// utilities only — no custom stylesheet, per the same brief.
//
// Data comes from ONE call (`fetchPublicPrescription`) to the
// `prescription-preview` edge function — the token in the URL is the only
// credential, exactly like `/portal/gateway/:token` elsewhere in this app.
// See docs/prescription-render-spec.md for the document's own section order
// and rules (§3, "Public patient page") — this page follows the same advice
// rule (doctor's own notes only, never canned standing advice) and the same
// QR rule (encodes THIS page's own URL, not the prescription's details).
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
    Sunrise, Sun, Sunset, Moon, Utensils, UtensilsCrossed,
    Pill, ClipboardList, CalendarClock, Stethoscope, ShieldAlert, IndianRupee,
    FlaskConical, Bandage, Dumbbell, MapPin, Navigation,
} from "lucide-react";
import { fetchPublicPrescription, type PublicRxData, type PublicRxMedicine, type PublicRxBilling } from "./api";
import { rxLabels, localizeTiming, RX_LANGUAGE_OPTIONS, hiName, type RxLanguage } from "../../lib/i18n/prescriptionLabels";
// The same clinic-agnostic marks the printed prescription and the doctor's
// on-screen review already carry (`ReviewModal`/`PrescriptionDocument`) —
// reused here, not reinvented, so the sheet a patient opens on their phone
// is visibly the same family of document as the one printed at the clinic.
// Anmol, 2026-09-19: "can't we have some modern look of the prescription...
// and some SVG and all for all kind of users" — for every language, not
// only the English typography pass done separately.
import { RxMonogram, RxWatermark } from "../../components/RxMarks";
import { dashText } from "../../lib/clinicalText";

type SlotKey = "M" | "A" | "E" | "N";

// docs/prescription-render-spec.md's QR treatment section: the print/review
// surfaces caption their QR "Scan to verify this prescription" (it encodes
// the prescription's own details); THIS page's QR instead encodes its own
// URL, so the caption has to say something different — `RxLabels.qrCaption`
// is shared by all three surfaces and already carries the #1/#2 wording, so
// this page keeps its own small override rather than repurposing that field.
const QR_CAPTION: Record<RxLanguage, string> = {
    en: "Scan to open this prescription",
    hi: "पर्ची खोलने के लिए स्कैन करें",
    "hi-Latn": "Parchi kholne ke liye scan karein",
};

const SLOT_META: Record<SlotKey, { icon: typeof Sun; label: Record<RxLanguage, string> }> = {
    M: { icon: Sunrise, label: { en: "Morning", hi: "सुबह", "hi-Latn": "Subah" } },
    A: { icon: Sun, label: { en: "Afternoon", hi: "दोपहर", "hi-Latn": "Dopahar" } },
    E: { icon: Sunset, label: { en: "Evening", hi: "शाम", "hi-Latn": "Shaam" } },
    N: { icon: Moon, label: { en: "Night", hi: "रात", "hi-Latn": "Raat" } },
};

/** "1-0-1-0" -> [true, false, true, false], in M/A/E/N order — same slot
 *  convention lib/db/reference.ts's freqSlotToLabel/freqLabelToSlot use. */
function parseSlots(slot: string | null): boolean[] | null {
    if (!slot) return null;
    const parts = slot.split("-");
    if (parts.length !== 4) return null;
    return parts.map((p) => p === "1");
}

function DoseChips({ slot }: { slot: string | null }) {
    const flags = parseSlots(slot);
    if (!flags || flags.every((f) => !f)) return null;
    const keys: SlotKey[] = ["M", "A", "E", "N"];
    return (
        <div className="flex gap-2">
            {keys.map((k, i) => {
                const on = flags[i];
                const Icon = SLOT_META[k].icon;
                return (
                    <div
                        key={k}
                        className={
                            "flex flex-1 flex-col items-center gap-1 rounded-xl border-2 py-2 " +
                            (on
                                ? "border-amber-500 bg-amber-50 text-amber-900"
                                : "border-slate-200 bg-slate-50 text-slate-300")
                        }
                    >
                        <Icon className="h-5 w-5" strokeWidth={2.5} />
                        <span className="text-[11px] font-bold leading-none">{k}</span>
                    </div>
                );
            })}
        </div>
    );
}

function TimingBadge({ instructions, language }: { instructions: string; language: RxLanguage }) {
    if (!instructions.trim()) return null;
    const label = localizeTiming(instructions, language);
    const isEmpty = instructions.trim().toLowerCase() === "empty stomach";
    const Icon = isEmpty ? UtensilsCrossed : Utensils;
    return (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-emerald-900">
            <Icon className="h-4 w-4 shrink-0" strokeWidth={2.5} />
            <span className="text-sm font-semibold">{label}</span>
        </div>
    );
}

function MedicineCard({ med, language, labels, bold }: { med: PublicRxMedicine; language: RxLanguage; labels: ReturnType<typeof rxLabels>; bold: string }) {
    return (
        <div className="rounded-2xl border-2 border-slate-900 bg-white p-4 shadow-[3px_3px_0_0_rgba(15,23,42,1)]">
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                    <Pill className="h-5 w-5 shrink-0 text-indigo-700" strokeWidth={2.5} />
                    <h3 className={`text-lg ${bold} leading-tight text-slate-900`}>{med.name}</h3>
                </div>
                {med.isSos ? (
                    <span className="shrink-0 rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-black text-white">
                        SOS
                    </span>
                ) : null}
            </div>
            {med.composition ? (
                <p className="mt-0.5 pl-7 text-xs font-medium text-slate-500">{med.composition}</p>
            ) : null}

            <div className="mt-3">
                <DoseChips slot={med.frequencySlot} />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
                <TimingBadge instructions={med.instructions} language={language} />
                {med.durationDays ? (
                    <div className="flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-indigo-900">
                        <CalendarClock className="h-4 w-4" strokeWidth={2.5} />
                        <span className="text-sm font-semibold">{labels.durationDays(med.durationDays)}</span>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

const SECTION_TONE = {
    slate: "bg-slate-100 text-slate-700",
    indigo: "bg-indigo-100 text-indigo-700",
    purple: "bg-purple-100 text-purple-700",
    amber: "bg-amber-100 text-amber-700",
    emerald: "bg-emerald-100 text-emerald-700",
    teal: "bg-teal-100 text-teal-700",
    violet: "bg-violet-100 text-violet-700",
} as const;

/** The investigations card and the way to the lab, in plain words. */
const LAB_LABELS: Record<RxLanguage, { showAtLab: string; getDoneAt: string; navigate: string; openMap: string }> = {
    en: {
        showAtLab: "Show this at the lab",
        getDoneAt: "Get these tests done at",
        navigate: "Navigate to the lab",
        openMap: "Opens Google Maps with the way there",
    },
    hi: {
        showAtLab: "यह लैब में दिखाएँ",
        getDoneAt: "ये जाँचें यहाँ करवाएँ",
        navigate: "लैब का रास्ता देखें",
        openMap: "Google Maps में रास्ता खुलेगा",
    },
    "hi-Latn": {
        showAtLab: "Yeh lab mein dikhayein",
        getDoneAt: "Ye jaanch yahan karwayein",
        navigate: "Lab ka rasta dekhein",
        openMap: "Google Maps mein rasta khulega",
    },
};

/** Where the Navigate button goes: the doctor's own map link, else directions
 *  to the lab's name and address. No Maps API either way. */
function labMapHref(lab: { name: string; address: string | null; mapsUrl: string | null }): string | null {
    if (lab.mapsUrl && /^https?:\/\//i.test(lab.mapsUrl)) return lab.mapsUrl;
    if (lab.address) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lab.name}, ${lab.address}`)}`;
    return null;
}

const BILLING_LABELS: Record<RxLanguage, {
    title: string; fee: string; medicine: string; discount: string; total: string;
}> = {
    en: { title: "Billing", fee: "Consultation Fee", medicine: "Medicine Charges", discount: "Discount", total: "Total" },
    hi: { title: "बिल", fee: "परामर्श शुल्क", medicine: "दवाई का शुल्क", discount: "छूट", total: "कुल" },
    "hi-Latn": { title: "Bill", fee: "Consultation Fee", medicine: "Dawai ka Charge", discount: "Discount", total: "Total" },
};

/** One billing line — label left, amount right, same shape the printed
 *  document's own `BillingRow` uses, redrawn in this page's bolder,
 *  higher-contrast idiom instead of imported wholesale. */
function BillingLine({ label, amount, muted, negative }: { label: string; amount: number; muted?: boolean; negative?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-3 py-1">
            <span className={`text-sm font-semibold ${muted ? "text-slate-400" : "text-slate-700"}`}>{label}</span>
            <span className={`text-sm font-bold ${negative ? "text-rose-600" : "text-slate-900"}`}>
                {negative ? "−" : ""}₹{Math.abs(amount).toFixed(2)}
            </span>
        </div>
    );
}

/** One medicine's own price line — name and line total on top, the
 *  quantity × rate it was computed from underneath, same "show the working,
 *  not just the number" ask that drove `ClinicalLine` (Anmol, 2026-09-20:
 *  "detailed breakdown of medicine pricing per medicine... right now just
 *  showing that medicine pricing and consumer pricing no everything"). Its
 *  own row shape rather than `BillingLine` — a bare label/amount pair has
 *  nowhere to put the qty × rate working without cramming both onto one
 *  line and risking a long medicine name colliding with the amount. */
function MedicineBillingLine({ name, qty, unitPrice }: { name: string; qty: number; unitPrice: number }) {
    return (
        <div className="py-1.5">
            <div className="flex items-start justify-between gap-3">
                <span className="text-sm font-semibold text-slate-700">{name}</span>
                <span className="shrink-0 text-sm font-bold text-slate-900">₹{(qty * unitPrice).toFixed(2)}</span>
            </div>
            <p className="text-xs font-medium text-slate-400">{qty} × ₹{unitPrice.toFixed(2)}</p>
        </div>
    );
}

function BillingCard({ billing, medicines, language }: { billing: PublicRxBilling; medicines: PublicRxMedicine[]; language: RxLanguage }) {
    const t = BILLING_LABELS[language];
    // Only medicines this billing pass actually priced — most clinics never
    // turn dispensing billing on, in which case every medicine here has
    // `unitPrice: null` and the card falls back to `billing.medicineTotal`
    // as one lump line, same as before this itemization existed.
    const pricedMedicines = medicines.filter(
        (m): m is PublicRxMedicine & { quantityDispensed: number; unitPrice: number } =>
            m.quantityDispensed != null && m.unitPrice != null
    );
    return (
        <div className="rounded-2xl border-2 border-slate-200 bg-white p-4">
            <div className="divide-y divide-slate-100">
                {billing.consultationFee != null && <BillingLine label={t.fee} amount={billing.consultationFee} />}
                {billing.feeGstAmount > 0 && <BillingLine label="GST" amount={billing.feeGstAmount} muted />}
                {pricedMedicines.length > 0 ? (
                    pricedMedicines.map((m, i) => (
                        <MedicineBillingLine key={`${m.name}-${i}`} name={m.name} qty={m.quantityDispensed} unitPrice={m.unitPrice} />
                    ))
                ) : (
                    billing.medicineTotal > 0 && <BillingLine label={t.medicine} amount={billing.medicineTotal} />
                )}
                {billing.medicineGstAmount > 0 && <BillingLine label="GST" amount={billing.medicineGstAmount} muted />}
                {billing.additionalCharges.map((c, i) => (
                    <BillingLine key={`${c.label}-${i}`} label={c.label} amount={c.amount} />
                ))}
                {billing.discountAmount > 0 && (
                    <BillingLine
                        label={`${t.discount}${billing.discountPercent != null ? ` (${billing.discountPercent}%)` : ""}`}
                        amount={billing.discountAmount} negative
                    />
                )}
            </div>
            <div className="mt-2 flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2.5">
                <span className="text-xs font-black uppercase tracking-wide text-emerald-800">{t.total}</span>
                <span className="text-lg font-black text-emerald-800">₹{billing.total.toFixed(2)}</span>
            </div>
        </div>
    );
}

/** One labelled line inside the Clinical Notes card — Complaints
 *  (symptoms), Findings (what examination turned up) and Assessment (the
 *  confirmed diagnosis) used to be joined into one undifferentiated
 *  sentence with " · " (Anmol, 2026-09-20: "distinguish between Symptoms
 *  and what doctor examined... and obviously Assessment"). A small
 *  uppercase micro-label ahead of each, same idiom `BillingLine` already
 *  uses for its own label/value pairs just above — never a full second
 *  `Section` per group, which would mean three illustrated empty states in
 *  a row for a visit that only has one of the three ("avoiding adding
 *  unnecessary empty state" — each line already only renders when it has
 *  something to say). `alert` matches the printed document's own red
 *  treatment for findings (`PrescriptionDocument.tsx`'s `⚠` rows). */
function ClinicalLine({ label, text, alert }: { label: string; text: string; alert?: boolean }) {
    return (
        <p className="text-sm leading-relaxed">
            <span className="mr-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">{label}:</span>
            <span className={`font-medium ${alert ? "text-rose-700" : "text-slate-700"}`}>{text}</span>
        </p>
    );
}

/** A soft rounded chip behind each section's icon, rather than the icon
 *  floating bare — same "give the icon its own surface" idiom used for the
 *  Patients page search field (2026-09-19), so this page's headings read as
 *  designed sections rather than a plain bolded label with a glyph next to
 *  it. Every language gets the same chip; only the label text changes. */
function Section({
    icon: Icon, title, bold, tone = "slate", children,
}: { icon: typeof Pill; title: string; bold: string; tone?: keyof typeof SECTION_TONE; children: React.ReactNode }) {
    return (
        <section className="mt-6">
            <div className="mb-2.5 flex items-center gap-2.5">
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${SECTION_TONE[tone]}`}>
                    <Icon className="h-4 w-4" strokeWidth={2.5} />
                </span>
                <h2 className={`text-sm ${bold} uppercase tracking-wide text-slate-700`}>{title}</h2>
            </div>
            {children}
        </section>
    );
}

function LanguagePicker({ value, onChange }: { value: RxLanguage; onChange: (l: RxLanguage) => void }) {
    return (
        <div className="flex gap-1.5 rounded-full bg-slate-100 p-1">
            {RX_LANGUAGE_OPTIONS.map((opt) => (
                <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChange(opt.value)}
                    className={
                        "flex-1 rounded-full px-3 py-1.5 text-xs font-bold transition-colors " +
                        (value === opt.value
                            ? "bg-slate-900 text-white"
                            : "text-slate-500 hover:text-slate-700")
                    }
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
}

function Skeleton() {
    return (
        <main className="min-h-dvh bg-slate-50 px-4 py-8">
            <div className="mx-auto max-w-md animate-pulse space-y-4">
                <div className="h-20 rounded-2xl bg-slate-200" />
                <div className="h-16 rounded-2xl bg-slate-200" />
                <div className="h-32 rounded-2xl bg-slate-200" />
                <div className="h-32 rounded-2xl bg-slate-200" />
            </div>
        </main>
    );
}

function ErrorScreen() {
    return (
        <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
            <div className="w-full max-w-md rounded-2xl border-2 border-slate-900 bg-white p-8 text-center shadow-[4px_4px_0_0_rgba(15,23,42,1)]">
                <ShieldAlert className="mx-auto h-10 w-10 text-rose-600" strokeWidth={2} />
                <h1 className="mt-3 text-lg font-black text-slate-900">This link isn't valid</h1>
                <p className="mt-2 text-sm font-medium text-slate-500">
                    It may have expired or been mistyped. Please ask your clinic to resend it, or use your printed copy.
                </p>
            </div>
        </main>
    );
}

export function PublicPrescriptionPage() {
    const { token } = useParams<{ token: string }>();
    const [state, setState] = useState<
        { phase: "loading" } | { phase: "error" } | { phase: "ready"; rx: PublicRxData }
    >({ phase: "loading" });
    const [language, setLanguage] = useState<RxLanguage>("en");
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    // Once true, the fetched prescription's own defaultLanguage has already
    // set the starting language — never overwrite a language the PATIENT
    // then picked for themselves via the switcher.
    const langInitialized = useRef(false);

    useEffect(() => {
        if (!token) { setState({ phase: "error" }); return; }
        let live = true;
        fetchPublicPrescription(token).then((r) => {
            if (!live) return;
            setState(r.ok ? { phase: "ready", rx: r.rx } : { phase: "error" });
        });
        return () => { live = false; };
    }, [token]);

    // Open in whichever language the doctor actually sent this prescription
    // in — a doctor who picked Hindi on send must not hand a patient a link
    // that opens in English by default (see migration
    // 20260919_prescription_last_sent_language.sql). The switcher still
    // works either way; this only sets the STARTING point.
    useEffect(() => {
        if (state.phase === "ready" && !langInitialized.current) {
            langInitialized.current = true;
            setLanguage(state.rx.defaultLanguage);
        }
    }, [state]);

    // The QR encodes THIS PAGE'S OWN URL (docs/prescription-render-spec.md's
    // QR treatment: "#3 patient page: the QR encodes this page's own URL, so
    // it can be handed to a pharmacist/family without forwarding the
    // WhatsApp") — never the prescription's contents, which is what the
    // print/review surfaces encode instead.
    useEffect(() => {
        if (state.phase !== "ready") return;
        let live = true;
        (async () => {
            try {
                const QRCode = await import("qrcode");
                const url = await QRCode.toDataURL(window.location.href, { width: 160, margin: 1 });
                if (live) setQrDataUrl(url);
            } catch { /* silently skip — the page still works without it */ }
        })();
        return () => { live = false; };
    }, [state.phase]);

    if (state.phase === "loading") return <Skeleton />;
    if (state.phase === "error") return <ErrorScreen />;

    // Lines saved before 2026-09-25 carry an em dash ("Fracture — Right
    // knee"); the page speaks the consult's current form, " - ".
    const rx = {
        ...state.rx,
        assessments: state.rx.assessments?.map(dashText),
        procedures: state.rx.procedures?.map((p) => ({ ...p, text: dashText(p.text) })),
        results: state.rx.results?.map((r) => ({ name: dashText(r.name), text: dashText(r.text) })),
    };
    const labels = rxLabels(language);

    // `rx.diagnosisText` is `findings_text` on the `prescriptions` row — a
    // legacy column written as `[...plan.diagnoses, ...chart.selectedFindings]
    // .join(", ")` (see useConsultLifecycle.ts's `findingsText`), so it's
    // ALREADY a blend of the confirmed diagnosis and the very same findings
    // `rx.findings` lists separately and cleanly. Showing it verbatim next to
    // `rx.findings` would print most findings twice, under two different
    // labels — worse than the run-on sentence this replaces. Stripping out
    // any comma-separated part that exact-matches (case-insensitive) a
    // symptom or finding already shown elsewhere leaves just the doctor's
    // own diagnosis words for the Assessment line — an honest reading of a
    // combined field, not a perfect one (a diagnosis whose name happens to
    // equal a finding's name would drop here too), but it beats duplicating
    // the same text under a second heading.
    const namedElsewhere = new Set(
        [...rx.symptoms, ...rx.findings].map((s) => s.toLowerCase().trim())
    );
    const assessmentText = (rx.diagnosisText ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s && !namedElsewhere.has(s.toLowerCase()))
        .join(", ");
    const dateStr = new Date(rx.date).toLocaleDateString(
        language === "en" ? "en-IN" : "hi-IN",
        { day: "2-digit", month: "short", year: "numeric" }
    );
    const doctorName = rx.doctor ? hiName(language, rx.doctor.name, rx.doctor.nameHi) : null;
    const clinicName = hiName(language, rx.clinic.name, rx.clinic.nameHi);

    // Same rule PrescriptionDocument.tsx/ReviewModal.tsx already apply: Noto
    // Sans Devanagari (loaded in index.html) for real conjunct/matra shaping
    // instead of whatever the OS happens to substitute, plus taller line
    // height — Devanagari's matras and conjuncts extend further above and
    // below the baseline than Latin text needs. Deliberately covers "hi"
    // only, not "hi-Latn" — Hinglish stays on the same large, high-contrast
    // treatment as Devanagari (Anmol, 2026-09-19: "for better readability
    // for Hindi users especially" — Hinglish readers are that same audience,
    // just typing it in Roman letters).
    //
    // English gets its own, deliberately different pass: the same Geist face
    // the rest of this app already uses for its own "modern" identity
    // (index.html's login-screen comment), a touch tighter tracking, and one
    // notch down from the Hindi/Hinglish track's maximum boldness (900 ->
    // 800) — "slightly modern," not a different design language, per the
    // same brief: keep everything patients already found readable, just
    // refine the English pass.
    const isDevanagari = language === "hi";
    const modernEnglish = language === "en";
    const boldWeight = modernEnglish ? "font-extrabold" : "font-black";
    const mainStyle: React.CSSProperties | undefined = isDevanagari
        ? { fontFamily: "'Noto Sans Devanagari', sans-serif", lineHeight: 1.6 }
        : modernEnglish
            ? { fontFamily: "'Geist', sans-serif", letterSpacing: "-0.01em" }
            : undefined;

    return (
        <main
            className="min-h-dvh bg-slate-50 px-4 pb-10 pt-6"
            style={mainStyle}
        >
            <div className="mx-auto max-w-md">
                <div className="mb-4 flex justify-end">
                    <LanguagePicker value={language} onChange={setLanguage} />
                </div>

                {/* Letterhead — bold, high-contrast, the clinic's identity first. */}
                <header className="relative overflow-hidden rounded-2xl border-2 border-slate-900 bg-slate-900 p-5 text-white shadow-[4px_4px_0_0_rgba(79,70,229,1)]">
                    {/* The same caduceus monogram the printed letterhead's own
                        fallback crest draws (RxMonogram) — held faint in the
                        corner as a mark of provenance, never competing with
                        the clinic's own logo beside it. */}
                    <RxMonogram
                        color="#ffffff"
                        className="pointer-events-none absolute -right-2 -top-2 h-20 w-20 opacity-[0.08]"
                    />
                    <div className="relative flex items-center gap-3">
                        {rx.clinic.logoUrl ? (
                            <img src={rx.clinic.logoUrl} alt="" className="h-11 w-11 shrink-0 rounded-xl bg-white object-contain p-1" />
                        ) : null}
                        <div className="min-w-0">
                            <h1 className={`truncate text-xl ${boldWeight} leading-tight`}>{clinicName}</h1>
                            {doctorName ? (
                                <p className="truncate text-sm font-semibold text-slate-300">
                                    {doctorName}
                                    {rx.doctor?.specialization ? ` · ${rx.doctor.specialization}` : ""}
                                </p>
                            ) : null}
                        </div>
                    </div>
                    {(rx.clinic.address || rx.clinic.phone) ? (
                        <p className="mt-3 border-t border-white/15 pt-2 text-xs font-medium text-slate-300">
                            {[rx.clinic.address, rx.clinic.phone].filter(Boolean).join("  ·  ")}
                        </p>
                    ) : null}
                </header>

                {/* Patient strip */}
                <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border-2 border-slate-900 bg-white px-4 py-3 shadow-[3px_3px_0_0_rgba(15,23,42,1)]">
                    <div className="min-w-0">
                        <p className={`truncate text-base ${boldWeight} text-slate-900`}>{rx.patient.name}</p>
                        <p className="text-xs font-semibold text-slate-500">
                            {[rx.patient.age != null ? `${rx.patient.age} ${language === "en" ? "yrs" : "साल"}` : null, rx.patient.gender]
                                .filter(Boolean).join(" · ")}
                        </p>
                    </div>
                    <div className="shrink-0 text-right text-xs font-semibold text-slate-500">
                        {rx.ref ? <p>#{rx.ref}</p> : null}
                        <p>{dateStr}</p>
                    </div>
                </div>

                {(rx.symptoms.length || rx.findings.length || rx.negatives?.length || assessmentText) ? (
                    <Section icon={Stethoscope} title={labels.findings} bold={boldWeight} tone="slate">
                        <div className="space-y-1.5 rounded-2xl border-2 border-slate-200 bg-white p-4">
                            {rx.symptoms.length > 0 && (
                                <ClinicalLine label={labels.complaints} text={rx.symptoms.join(", ")} />
                            )}
                            {rx.negatives?.length ? (
                                <ClinicalLine
                                    label={labels.absent}
                                    text={rx.negatives.map((n) => (/^[A-Z][a-z]/.test(n) ? n.charAt(0).toLowerCase() + n.slice(1) : n)).join(", ")}
                                />
                            ) : null}
                            {rx.findings.length > 0 && (
                                <ClinicalLine label={labels.findings} text={rx.findings.join(", ")} alert />
                            )}
                            {/* Structured assessments (with place and details)
                                when the visit has them; the older blended
                                text otherwise. Set apart as the conclusion. */}
                            {rx.assessments?.length ? (
                                <div className="mt-2 rounded-xl border-l-4 border-violet-500 bg-violet-50 px-3 py-2">
                                    <p className="mb-0.5 text-[10px] font-black uppercase tracking-wide text-violet-500">{labels.assessment}</p>
                                    {rx.assessments.map((a, i) => (
                                        <p key={i} className={`text-sm ${boldWeight} leading-snug text-violet-950`}>{a}</p>
                                    ))}
                                </div>
                            ) : assessmentText ? (
                                <ClinicalLine label={labels.assessment} text={assessmentText} />
                            ) : null}
                        </div>
                    </Section>
                ) : null}

                {rx.results?.length ? (
                    <Section icon={FlaskConical} title={labels.results} bold={boldWeight} tone="teal">
                        <ul className="space-y-2 rounded-2xl border-2 border-slate-200 bg-white p-4">
                            {rx.results.map((r, i) => (
                                <li key={i} className="text-sm leading-relaxed">
                                    <span className={`block ${boldWeight} text-slate-900`}>{r.name}</span>
                                    <span className="font-medium text-slate-700">{r.text}</span>
                                </li>
                            ))}
                        </ul>
                    </Section>
                ) : null}

                {rx.medicines.length ? (
                    <Section icon={Pill} title={labels.prescription} bold={boldWeight} tone="indigo">
                        {/* The watermark behind the medicines block — the exact
                            same mark, in the same spot relative to this section,
                            that the printed prescription and the doctor's own
                            review already carry (ReviewModal/PrescriptionDocument's
                            `RxWatermark`). Kept faint enough to sit under the
                            dosage text without ever competing with it. */}
                        <div className="relative overflow-hidden rounded-2xl">
                            <RxWatermark
                                color="#4f46e5"
                                className="pointer-events-none absolute -right-3 -top-3 h-28 w-28 opacity-[0.05]"
                            />
                            <div className="relative space-y-3">
                                {rx.medicines.map((m, i) => (
                                    <MedicineCard key={i} med={m} language={language} labels={labels} bold={boldWeight} />
                                ))}
                            </div>
                        </div>
                        <p className="mt-2 text-center text-[11px] font-semibold text-slate-400">{labels.freqLegend}</p>
                    </Section>
                ) : null}

                {rx.tests.length ? (
                    <Section icon={ClipboardList} title={labels.investigations} bold={boldWeight} tone="purple">
                        {/* Highlighted: this is the card a patient shows at the
                            lab's counter, and the way to get there. */}
                        <div className="overflow-hidden rounded-2xl border-2 border-purple-300 bg-gradient-to-b from-purple-50 to-white shadow-[0_6px_20px_-10px_rgba(126,34,206,0.45)]">
                            <p className="flex items-center gap-1.5 border-b border-purple-200 bg-purple-100/70 px-4 py-2 text-[11px] font-black uppercase tracking-wide text-purple-800">
                                <FlaskConical className="h-3.5 w-3.5" strokeWidth={2.5} /> {LAB_LABELS[language].showAtLab}
                            </p>
                            <ul className="space-y-2 px-4 py-3.5">
                                {rx.tests.map((t, i) => (
                                    <li key={i} className={`flex gap-2.5 text-[15px] ${boldWeight} leading-snug text-slate-900`}>
                                        <span className="mt-[3px] grid h-5 w-5 shrink-0 place-items-center rounded-full bg-purple-600 text-[11px] font-black text-white">{i + 1}</span>
                                        {dashText(t)}
                                    </li>
                                ))}
                            </ul>
                            {rx.lab && (() => {
                                const href = labMapHref(rx.lab);
                                return (
                                    <div className="border-t border-purple-200 bg-white px-4 py-3.5">
                                        <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">{LAB_LABELS[language].getDoneAt}</p>
                                        <p className={`mt-0.5 text-base ${boldWeight} text-slate-900`}>{rx.lab.name}</p>
                                        {rx.lab.address && (
                                            <p className="mt-0.5 flex items-start gap-1.5 text-sm font-medium text-slate-600">
                                                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-purple-600" /> {rx.lab.address}
                                            </p>
                                        )}
                                        {href && (
                                            <a
                                                href={href}
                                                target="_blank"
                                                rel="noreferrer"
                                                className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-3 text-[15px] ${boldWeight} text-white shadow-sm active:scale-[0.99]`}
                                            >
                                                <Navigation className="h-4 w-4" strokeWidth={2.5} /> {LAB_LABELS[language].navigate}
                                            </a>
                                        )}
                                        {href && <p className="mt-1.5 text-center text-[11px] font-semibold text-slate-400">{LAB_LABELS[language].openMap}</p>}
                                    </div>
                                );
                            })()}
                        </div>
                    </Section>
                ) : null}

                {rx.procedures?.length ? (
                    <Section icon={Bandage} title={labels.therapyPerformed} bold={boldWeight} tone="teal">
                        <div className="space-y-3 rounded-2xl border-2 border-slate-200 bg-white p-4">
                            {rx.procedures.some((p) => p.status === "performed") && (
                                <div>
                                    <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">{labels.doneToday}</p>
                                    {rx.procedures.filter((p) => p.status === "performed").map((p, i) => (
                                        <p key={i} className="text-sm font-semibold text-slate-800">• {p.text}</p>
                                    ))}
                                </div>
                            )}
                            {rx.procedures.some((p) => p.status === "planned") && (
                                <div>
                                    <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">{labels.plannedNext}</p>
                                    {rx.procedures.filter((p) => p.status === "planned").map((p, i) => (
                                        <p key={i} className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-slate-800">
                                            <span>• {p.text}</span>
                                            {p.due && (
                                                <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-700">
                                                    {labels.dueOn(new Date(`${p.due}T00:00:00`).toLocaleDateString(language === "en" ? "en-IN" : "hi-IN", { day: "numeric", month: "short" }))}
                                                </span>
                                            )}
                                        </p>
                                    ))}
                                </div>
                            )}
                        </div>
                    </Section>
                ) : null}

                {rx.exercises?.length ? (
                    <Section icon={Dumbbell} title={labels.homeExercise} bold={boldWeight} tone="emerald">
                        <ol className="space-y-1.5 rounded-2xl border-2 border-slate-200 bg-white p-4">
                            {rx.exercises.map((e, i) => (
                                <li key={i} className="text-sm font-semibold text-slate-800">{i + 1}. {e}</li>
                            ))}
                        </ol>
                    </Section>
                ) : null}

                {rx.advice.length ? (
                    <Section icon={ShieldAlert} title={labels.advice} bold={boldWeight} tone="amber">
                        <ul className="space-y-2 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
                            {rx.advice.map((a, i) => (
                                <li key={i} className="flex gap-2 text-sm font-semibold text-amber-900">
                                    <span className="text-amber-600">›</span>{a}
                                </li>
                            ))}
                        </ul>
                    </Section>
                ) : null}

                {rx.followUpDays ? (
                    <div className={`mt-4 rounded-2xl bg-indigo-600 px-4 py-3 text-center ${boldWeight} text-white`}>
                        {labels.followUp(rx.followUpDays)}
                    </div>
                ) : null}

                {qrDataUrl ? (
                    <div className="mt-6 flex flex-col items-center gap-2">
                        <div className="rounded-xl border-2 border-slate-300 bg-white p-2">
                            <img src={qrDataUrl} alt="" className="h-24 w-24" />
                        </div>
                        <p className="text-xs font-semibold text-slate-400">{QR_CAPTION[language]}</p>
                    </div>
                ) : null}

                {rx.doctor?.signatureUrl ? (
                    <div className="mt-6 flex justify-end">
                        <div className="text-center">
                            <img src={rx.doctor.signatureUrl} alt="" className="mx-auto h-12 object-contain" />
                            <p className="mt-1 border-t-2 border-slate-900 pt-1 text-xs font-bold text-slate-700">{doctorName}</p>
                        </div>
                    </div>
                ) : null}

                {/* Billing — appended at the bottom, same relative position
                    as the printed document's own Billing card (after
                    signature, before the clinic's closing note). A single-
                    column mobile page has no "beside the prescription"
                    option the way the doctor's on-screen review does, so
                    this follows the printed/thermal placement instead
                    (Anmol, 2026-09-20: "no receipt into... WhatsApp"). */}
                {rx.billing ? (
                    <Section icon={IndianRupee} title={BILLING_LABELS[language].title} bold={boldWeight} tone="emerald">
                        <BillingCard billing={rx.billing} medicines={rx.medicines} language={language} />
                    </Section>
                ) : null}

                {rx.footerNote ? (
                    <p className="mt-6 border-t-2 border-slate-200 pt-3 text-xs font-medium text-slate-400">{rx.footerNote}</p>
                ) : null}

                <p className="mt-6 whitespace-pre-line text-center text-[11px] font-semibold text-slate-300">
                    {labels.footerCredit}
                </p>
            </div>
        </main>
    );
}
