// ---------------------------------------------------------------------------
// LAB ORDER PAGE — what a lab opens from the WhatsApp order
// (`/lab-orders/:token`).
//
// An investigation request on the clinic's letterhead: who the patient is
// and how to reach them (the lab schedules the test), what is ordered with
// its place and side, how urgently, why, today's minimal story, and the
// ordering doctor with registration and signature. Reads well on a phone
// at the lab's front desk and prints cleanly on A4 (the Print button and
// the page chrome drop out of print).
//
// Data: `lab-order-preview` (public, token is the credential, read-only).
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle, CalendarClock, FlaskConical, Phone, Printer, User } from "lucide-react";
import { RxMonogram } from "../../components/RxMarks";
import { dashText } from "../../lib/clinicalText";

interface LabOrder {
    ref: string | null;
    orderedAt: string;
    labName: string;
    priority: "routine" | "urgent" | "stat";
    indication: string | null;
    context: string | null;
    tests: { name: string; site: string | null; side: string | null }[];
    patient: { name: string; age: number | null; gender: string | null; phone: string | null };
    clinic: { name: string; tagline: string | null; address: string | null; phone: string | null; email: string | null; logoUrl: string | null };
    doctor: { name: string; specialization: string | null; qualification: string | null; registrationNumber: string | null; signatureUrl: string | null } | null;
}

const FUNCTIONS_URL = `${(import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, "")}/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const PRIORITY: Record<LabOrder["priority"], { label: string; cls: string }> = {
    routine: { label: "Routine", cls: "bg-slate-100 text-slate-700 border-slate-200" },
    urgent: { label: "Urgent", cls: "bg-amber-50 text-amber-800 border-amber-300" },
    stat: { label: "STAT", cls: "bg-rose-50 text-rose-700 border-rose-300" },
};

function Label({ children }: { children: React.ReactNode }) {
    return <p className="mb-1.5 text-[10.5px] font-black uppercase tracking-[0.09em] text-slate-400">{children}</p>;
}

export function LabOrderPage() {
    const { token = "" } = useParams();
    const [state, setState] = useState<{ kind: "loading" } | { kind: "error"; notFound: boolean } | { kind: "ok"; order: LabOrder }>({ kind: "loading" });

    useEffect(() => {
        let live = true;
        fetch(`${FUNCTIONS_URL}/lab-order-preview`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
            body: JSON.stringify({ token }),
        })
            .then((r) => r.json())
            .then((d) => { if (live) setState(d?.ok ? { kind: "ok", order: d.order } : { kind: "error", notFound: d?.error === "not_found" }); })
            .catch(() => { if (live) setState({ kind: "error", notFound: false }); });
        return () => { live = false; };
    }, [token]);

    useEffect(() => { document.title = "Investigation request"; }, []);

    if (state.kind === "loading") {
        return (
            <main className="grid min-h-dvh place-items-center bg-slate-50">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" aria-label="Loading" />
            </main>
        );
    }
    if (state.kind === "error") {
        return (
            <main className="grid min-h-dvh place-items-center bg-slate-50 px-6 text-center">
                <div>
                    <FlaskConical className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                    <p className="text-base font-bold text-slate-800">{state.notFound ? "This order link is not valid" : "Could not load the order"}</p>
                    <p className="mt-1 text-sm text-slate-500">{state.notFound ? "Please ask the clinic to send it again." : "Check the connection and open the link again."}</p>
                </div>
            </main>
        );
    }

    const o = state.order;
    const when = new Date(o.orderedAt);
    const whenText = `${when.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}, ${when.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
    const pr = PRIORITY[o.priority] ?? PRIORITY.routine;
    const ageSex = [o.patient.age != null ? `${o.patient.age} y` : null, o.patient.gender].filter(Boolean).join(" · ");
    const phoneDigits = (o.patient.phone ?? "").replace(/\D/g, "");

    return (
        <main className="min-h-dvh bg-slate-100 px-3 py-5 print:bg-white print:p-0 sm:px-6 sm:py-8">
            <div className="mx-auto mb-3 flex max-w-[760px] justify-end print:hidden">
                <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                    <Printer className="h-4 w-4" /> Print
                </button>
            </div>

            <article className="mx-auto max-w-[760px] overflow-hidden rounded-2xl bg-white shadow-[0_10px_40px_-12px_rgba(15,23,42,0.25)] print:max-w-none print:rounded-none print:shadow-none">
                {/* Letterhead */}
                <header className="flex items-center gap-4 border-b-[3px] border-blue-600 px-6 py-5 sm:px-8">
                    {o.clinic.logoUrl
                        ? <img src={o.clinic.logoUrl} alt="" className="h-14 w-14 rounded-xl object-contain" />
                        : <span className="grid h-14 w-14 place-items-center rounded-xl bg-blue-600"><RxMonogram color="#fff" className="h-8 w-8" /></span>}
                    <div className="min-w-0 flex-1">
                        <h1 className="text-xl font-black leading-tight text-slate-900">{o.clinic.name}</h1>
                        {o.clinic.tagline && <p className="text-xs font-semibold text-blue-700">{o.clinic.tagline}</p>}
                        <p className="mt-0.5 text-xs text-slate-500">{[o.clinic.address, o.clinic.phone].filter(Boolean).join(" · ")}</p>
                    </div>
                </header>

                <div className="px-6 py-6 sm:px-8">
                    {/* Title row */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-blue-700">Investigation request</p>
                            <p className="mt-1 text-sm text-slate-600">To <b className="text-slate-900">{o.labName}</b></p>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:flex-col sm:items-end">
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide ${pr.cls}`}>
                                {o.priority !== "routine" && <AlertTriangle className="h-3.5 w-3.5" />} {pr.label}
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
                                <CalendarClock className="h-3.5 w-3.5" /> {whenText}
                            </span>
                            {o.ref && <span className="font-mono text-[11px] font-bold text-slate-400">Ref {o.ref}</span>}
                        </div>
                    </div>

                    {/* Patient */}
                    <section className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                        <Label>Patient</Label>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="flex items-center gap-2 text-base font-extrabold text-slate-900">
                                <User className="h-4 w-4 text-slate-400" /> {o.patient.name}
                                {ageSex && <span className="text-sm font-semibold text-slate-500">({ageSex})</span>}
                            </p>
                            {phoneDigits && (
                                <a href={`tel:${phoneDigits}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-blue-700 print:border-0 print:p-0">
                                    <Phone className="h-3.5 w-3.5" /> {o.patient.phone}
                                </a>
                            )}
                        </div>
                    </section>

                    {/* Investigations */}
                    <section className="mt-5">
                        <Label>Investigations requested</Label>
                        <ol className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                            {o.tests.map((t, i) => (
                                <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-50 text-xs font-black text-blue-700">{i + 1}</span>
                                    <span className="min-w-0 flex-1 text-[15px] font-bold text-slate-900">{dashText(t.name)}</span>
                                    {t.site && (
                                        <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-bold text-violet-700">
                                            {t.site}{t.side === "both" ? " (both sides)" : ""}
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ol>
                    </section>

                    {o.indication && (
                        <section className="mt-5">
                            <Label>Clinical indication</Label>
                            <p className="rounded-xl border-l-4 border-blue-600 bg-blue-50/60 px-4 py-2.5 text-[14.5px] font-semibold leading-relaxed text-slate-900">
                                {dashText(o.indication)}
                            </p>
                        </section>
                    )}

                    {o.context && (
                        <section className="mt-5">
                            <Label>Clinical context</Label>
                            <ul className="space-y-1 text-[14px] leading-relaxed text-slate-700">
                                {o.context.split(/;\s*/).filter(Boolean).map((c, i) => (
                                    <li key={i} className="flex gap-2"><span className="text-slate-300">•</span>{dashText(c)}</li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {/* Ordering doctor */}
                    {o.doctor && (
                        <footer className="mt-8 flex items-end justify-between gap-4 border-t border-slate-200 pt-5">
                            <div>
                                <Label>Ordered by</Label>
                                <p className="text-[15px] font-extrabold text-slate-900">{o.doctor.name}</p>
                                {(o.doctor.qualification || o.doctor.specialization) && (
                                    <p className="text-xs font-semibold text-slate-600">{[o.doctor.qualification, o.doctor.specialization].filter(Boolean).join(" · ")}</p>
                                )}
                                {o.doctor.registrationNumber && <p className="text-xs text-slate-500">Reg. No. {o.doctor.registrationNumber}</p>}
                            </div>
                            {o.doctor.signatureUrl && (
                                <img src={o.doctor.signatureUrl} alt="Signature" className="h-14 max-w-[160px] object-contain" />
                            )}
                        </footer>
                    )}
                </div>

                <p className="border-t border-slate-100 bg-slate-50 px-6 py-3 text-center text-[11px] font-semibold text-slate-400 print:bg-white">
                    Sent securely with Arenode
                </p>
            </article>
        </main>
    );
}
