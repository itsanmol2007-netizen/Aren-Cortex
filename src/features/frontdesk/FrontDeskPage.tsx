import { useEffect, useRef, useState } from "react";
import { Globe, ChevronDown, Check } from "lucide-react";
import {
    fetchDoctorsByHospital,
    fetchHospital,
    HOSPITAL_ID,
    DOCTOR_ID,
    type DBDoctor,
    type DBHospital,
    type DBPatient,
    type TodayVisit,
} from "@/lib/db";
import { useQueue } from "./hooks/useQueue";
import { useVisitActions } from "./hooks/useVisitActions";
import { PatientLauncher } from "./components/PatientLauncher";
import { StatStrip } from "./components/StatStrip";
import { QueuePanel } from "./components/QueuePanel";
import { Sidebar } from "./components/Sidebar";
import { VisitDetailModal } from "./components/VisitDetailModal";
import { CreateVisitModal } from "./components/CreateVisitModal";
import { FrontDeskStyles } from "./components/FrontDeskStyles";
import { I18nProvider, useI18n, useT } from "./i18n/i18n";
import { LANGS } from "./i18n/strings";

type CreateState = { existingPatient: DBPatient | null; prefillName: string };

export function FrontDeskPage() {
    return (
        <I18nProvider>
            <FrontDeskInner />
        </I18nProvider>
    );
}

function FrontDeskInner() {
    const { visits, setVisits, loading, refetch } = useQueue(HOSPITAL_ID);
    const actions = useVisitActions({ visits, setVisits, refetch });

    const [doctors, setDoctors] = useState<DBDoctor[]>([]);
    const [hospital, setHospital] = useState<DBHospital | null>(null);
    const [openVisit, setOpenVisit] = useState<TodayVisit | null>(null);
    const [createState, setCreateState] = useState<CreateState | null>(null);
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        fetchDoctorsByHospital(HOSPITAL_ID)
            .then(setDoctors)
            .catch((err) => console.warn("fetchDoctorsByHospital failed (non-fatal):", err));
        fetchHospital(HOSPITAL_ID)
            .then(setHospital)
            .catch((err) => console.warn("fetchHospital failed (non-fatal):", err));
    }, []);

    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 20000);
        return () => clearInterval(t);
    }, []);

    // Keep the open detail modal in sync with the live queue (optimistic status
    // changes + silent refresh) so its buttons reflect the current status.
    const liveOpenVisit = openVisit ? visits.find((v) => v.visit_id === openVisit.visit_id) ?? openVisit : null;

    return (
        <div
            className="min-h-screen bg-[#f4f4f8] font-[Inter,system-ui,sans-serif] text-[#161d29]"
            style={{
                // Dawn residue (§3.4): three faint washes bleeding down from the
                // horizon, over the ratified dot grid. Static, near-invisible.
                backgroundImage:
                    "radial-gradient(900px 240px at 12% 0%, rgba(139,92,246,0.05), transparent 70%)," +
                    "radial-gradient(760px 220px at 55% 0%, rgba(244,114,182,0.04), transparent 70%)," +
                    "radial-gradient(640px 200px at 92% 0%, rgba(242,169,134,0.05), transparent 70%)," +
                    "radial-gradient(rgba(20,30,50,0.045) 1px, transparent 1px)",
                backgroundSize: "auto, auto, auto, 22px 22px",
                backgroundRepeat: "no-repeat, no-repeat, no-repeat, repeat",
            }}
        >
            <FrontDeskStyles />
            <Header hospital={hospital} now={now} />
            <div className="mx-auto max-w-[1480px] px-6 pb-12 pt-4">
                <PatientLauncher
                    onSelectExisting={(p) => setCreateState({ existingPatient: p, prefillName: "" })}
                    onCreateNew={(prefillName) => setCreateState({ existingPatient: null, prefillName })}
                />

                <StatStrip visits={visits} />

                <div className="grid grid-cols-[1fr_296px] items-start gap-[14px] max-[1040px]:grid-cols-1">
                    <QueuePanel
                        visits={visits}
                        loading={loading}
                        onOpen={(v) => setOpenVisit(v)}
                        onComplete={actions.completeVisit}
                        onCancel={actions.cancelVisit}
                        selectedVisitId={openVisit?.visit_id ?? null}
                    />
                    <Sidebar doctors={doctors} visits={visits} />
                </div>
            </div>

            {liveOpenVisit && (
                <VisitDetailModal
                    visit={liveOpenVisit}
                    doctors={doctors}
                    onClose={() => setOpenVisit(null)}
                    onReassignDoctor={actions.reassignDoctor}
                    onStartConsultation={actions.startConsultation}
                    onComplete={actions.completeVisit}
                    onCancel={actions.cancelVisit}
                />
            )}

            {createState && (
                <CreateVisitModal
                    existingPatient={createState.existingPatient}
                    prefillName={createState.prefillName}
                    doctors={doctors}
                    defaultDoctorId={DOCTOR_ID}
                    onClose={() => setCreateState(null)}
                    onCreate={actions.createNewVisit}
                />
            )}
        </div>
    );
}

function Header({ hospital, now }: { hospital: DBHospital | null; now: Date }) {
    const t = useT();
    const time = now.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
    const date = now.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });

    // Two-tone wordmark (§3.3): "AREN" white / rest dawn pink. appTitle is the
    // same string in every language, so splitting on the first space is stable.
    const title = t("appTitle");
    const [brandWord, ...productWords] = title.split(" ");

    return (
        <header
            className="relative"
            style={{
                // The ink band (§3.1): Cortex's exact ink, warmed by dawn
                // atmospherics (apricot / pink / violet instead of pink / violet
                // / indigo). Same sky, different hour.
                background:
                    "radial-gradient(ellipse 340px 150px at 15% -30%, rgba(242,169,134,0.12), transparent 70%)," +
                    "radial-gradient(ellipse 420px 200px at 55% 130%, rgba(244,114,182,0.10), transparent 65%)," +
                    "radial-gradient(ellipse 280px 160px at 90% -15%, rgba(139,92,246,0.10), transparent 60%)," +
                    "linear-gradient(135deg, #0d1b35 0%, #120f28 38%, #170d27 62%, #0b1525 100%)",
                boxShadow: "0 4px 28px rgba(8,16,44,0.28), 0 6px 40px rgba(139,92,246,0.05)",
            }}
        >
            <div className="mx-auto flex max-w-[1480px] items-center gap-[18px] px-6 py-3">
                <div className="group flex shrink-0 items-center gap-[11px]">
                    <div className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] bg-[linear-gradient(155deg,#7c5cf0,#2f6bed)] shadow-[0_3px_10px_rgba(124,92,240,0.38)] transition-shadow duration-150 group-hover:shadow-[0_3px_16px_rgba(124,92,240,0.55)]">
                        <svg viewBox="0 0 24 24" fill="none" className="h-[21px] w-[21px]">
                            <path d="M12 3L20 9V21H4V9L12 3Z" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
                            <path d="M9 21V13H15V21" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <div>
                        <div className="font-[Manrope,sans-serif] text-[16px] font-extrabold leading-[1.1] tracking-[-0.01em]">
                            <span className="text-white">{brandWord}</span>
                            {productWords.length > 0 && <span className="text-[#f0abc8]"> {productWords.join(" ")}</span>}
                        </div>
                        <div className="mt-[1px] text-[11.5px] font-medium text-[rgba(199,195,224,0.62)]">{t("appSub")}</div>
                    </div>
                </div>

                <div className="flex-1" />

                <div className="flex shrink-0 items-center gap-[14px]">
                    <div className="whitespace-nowrap text-[13px] font-semibold text-white/90">{hospital?.name ?? "Clinic"}</div>
                    <div className="h-6 w-px bg-white/10" />
                    <div className="flex items-center gap-[6px] whitespace-nowrap text-[12.5px] font-medium text-white/55">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
                            <path d="M12 7V12L15.5 14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                        </svg>
                        <span>{date}</span>
                        <span className="text-white/30">·</span>
                        <span className="tabular-nums">{time}</span>
                    </div>
                    <div className="h-6 w-px bg-white/10" />
                    <LanguageDropdown />
                    <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-[rgba(99,102,241,0.28)] text-[12px] font-bold text-[#c7d2fe]">
                        RS
                    </div>
                </div>
            </div>

            {/* The dawn thread at the horizon (§3.2): dawn breaks *under* the
                night — Cortex wears the same thread as a crown on top. */}
            <div
                className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px]"
                style={{
                    background: "linear-gradient(90deg, #f2a986 0%, #f472b6 32%, #a855f7 68%, #6366f1 100%)",
                    boxShadow: "0 1px 10px rgba(168,85,247,0.45), 0 2px 20px rgba(244,114,182,0.18)",
                }}
            />
        </header>
    );
}

function LanguageDropdown() {
    const { lang, setLang, t } = useI18n();
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDocClick = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDocClick);
        return () => document.removeEventListener("mousedown", onDocClick);
    }, [open]);

    const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];

    return (
        <div ref={wrapRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex h-[34px] items-center gap-[6px] rounded-[9px] border border-white/15 bg-transparent px-[10px] text-[12.5px] font-semibold text-[#c7c3e0] transition-colors hover:border-white/30 hover:bg-white/5 focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(99,102,241,0.28)]"
            >
                <Globe size={14} className="text-[#8f8bb0]" />
                {t(current.labelKey)}
                <ChevronDown size={13} className={`text-white/40 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>

            {open && (
                <div className="absolute right-0 top-[40px] z-[80] min-w-[168px] rounded-[9px] border border-[#e4e7ee] bg-white p-[5px] shadow-[0_24px_60px_rgba(16,24,40,0.24)]">
                    {LANGS.map((l) => {
                        const active = l.code === lang;
                        return (
                            <button
                                key={l.code}
                                type="button"
                                disabled={l.soon}
                                onClick={() => {
                                    if (l.soon) return;
                                    setLang(l.code);
                                    setOpen(false);
                                }}
                                className={`flex w-full items-center gap-2 rounded-[7px] px-[11px] py-[9px] text-left text-[13px] font-medium transition-colors ${
                                    l.soon
                                        ? "cursor-default text-[#c4c9d3]"
                                        : active
                                          ? "bg-[rgba(47,107,237,0.055)] text-[#1d51c9]"
                                          : "text-[#5a6472] hover:bg-[#f5f6f9] hover:text-[#161d29]"
                                }`}
                            >
                                <span className="flex-1">{t(l.labelKey)}</span>
                                {l.soon && (
                                    <span className="rounded-[5px] border border-[#eef0f5] bg-[#f5f6f9] px-[6px] py-[1px] text-[10px] font-semibold text-[#a8aeba]">
                                        {t("langSoon")}
                                    </span>
                                )}
                                {active && !l.soon && <Check size={14} className="text-[#1d51c9]" />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
