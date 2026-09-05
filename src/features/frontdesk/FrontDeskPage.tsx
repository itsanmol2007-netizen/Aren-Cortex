import { useEffect, useState } from "react";
import {
    type DBPatient,
    type TodayVisit,
} from "@/lib/db";
import { useHospitalId } from "./hooks/useHospitalId";
import { useQueue } from "./hooks/useQueue";
import { useVisitActions } from "./hooks/useVisitActions";
import { useCachedDoctors } from "./operational/referenceCache";
import { PatientLauncher } from "./components/PatientLauncher";
import { StatStrip } from "./components/StatStrip";
import { QueuePanel } from "./components/QueuePanel";
import { Sidebar } from "./components/Sidebar";
import { WorkspaceShell } from "./components/WorkspaceShell";
import { VisitDetailModal } from "./components/VisitDetailModal";
import { CreateVisitModal } from "./components/CreateVisitModal";
import { VisitAttachmentsModal } from "./components/VisitAttachmentsModal";
import { MeasurementsModal } from "./components/MeasurementsModal";
import { saveVisitMeasurements } from "@/lib/db";
import { vitalsToMeasurements } from "@/lib/synapse/consultInput";
import type { Vitals } from "@/types";
import { toast } from "sonner";
import { I18nProvider } from "./i18n/i18n";

type CreateState = { existingPatient: DBPatient | null; prefillName: string };

export function FrontDeskPage() {
    return (
        <I18nProvider>
            <FrontDeskInner />
        </I18nProvider>
    );
}

// The composition root of the live queue page. Page chrome (ink header,
// navigation rail, dawn background) lives in WorkspaceShell — this component
// owns the queue data, the 20s row clock, and the two modals.
function FrontDeskInner() {
    const hospitalId = useHospitalId();
    const { visits, setVisits, loading, refetch } = useQueue(hospitalId);
    const actions = useVisitActions({ visits, setVisits, refetch });

    // Cache-fresh doctor list: instant from this computer's copy, refreshed
    // whenever online — so the intake dropdown is never empty during an outage.
    const doctors = useCachedDoctors(hospitalId).data;

    // Measurements left the registration form on 2026-09-05 and live here
    // instead: the visit already exists, so they write straight through rather
    // than being staged. Best-effort, same as every other visit side-write.
    const [measureVisit, setMeasureVisit] = useState<TodayVisit | null>(null);
    const [openVisit, setOpenVisit] = useState<TodayVisit | null>(null);
    const [createState, setCreateState] = useState<CreateState | null>(null);
    const [attachmentsVisit, setAttachmentsVisit] = useState<TodayVisit | null>(null);
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 20000);
        return () => clearInterval(t);
    }, []);

    // Ctrl+K opens (or refocuses) the intake modal — the same binding Cortex
    // uses to jump to its own search (lib/keyboard/keymap.ts), so a
    // receptionist coming from the consult side finds the same shortcut here.
    // Skipped while any modal is already open (its own field order + Enter-
    // to-advance already owns the keyboard then) or while typing elsewhere.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "k") return;
            if (createState || openVisit || attachmentsVisit) return;
            e.preventDefault();
            setCreateState({ existingPatient: null, prefillName: "" });
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [createState, openVisit, attachmentsVisit]);

    // Keep the open detail modal in sync with the live queue (optimistic status
    // changes + silent refresh) so its buttons reflect the current status.
    const liveOpenVisit = openVisit ? visits.find((v) => v.visit_id === openVisit.visit_id) ?? openVisit : null;

    return (
        <WorkspaceShell>
            {/* The right sidebar rises to the top of the workspace (aligned with
                the search bar), and the launcher + stat strip + queue share the
                left column — so the search bar is the width of the queue, not
                the full page. Reference: 2026-09-03. */}
            <div className="mx-auto grid min-h-0 w-full max-w-[1320px] flex-1 grid-cols-[1fr_248px] items-stretch gap-[14px] px-4 pb-4 pt-3 max-[1040px]:grid-cols-1">
                <div className="flex min-h-0 flex-col">
                    <PatientLauncher
                        onSelectExisting={(p) => setCreateState({ existingPatient: p, prefillName: "" })}
                        onCreateNew={(prefillName) => setCreateState({ existingPatient: null, prefillName })}
                    />

                    <StatStrip visits={visits} />

                    <div className="min-h-0 flex-1">
                        <QueuePanel
                            visits={visits}
                            now={now}
                            loading={loading}
                            onOpen={(v) => setOpenVisit(v)}
                            onCancel={actions.cancelVisit}
                            onAttachments={(v) => setAttachmentsVisit(v)}
                            onMeasurements={(v) => setMeasureVisit(v)}
                            selectedVisitId={openVisit?.visit_id ?? null}
                            onAddPatient={() => setCreateState({ existingPatient: null, prefillName: "" })}
                        />
                    </div>
                </div>
                <Sidebar doctors={doctors} visits={visits} now={now} hospitalId={hospitalId} />
            </div>

            {measureVisit && (
                <MeasurementsModal
                    values={{}}
                    /* No "relevant" hint from the queue: the chips that drove
                       it live on the intake form, which is closed by now. The
                       modal degrades to its full catalogue, which is correct
                       here — the desk is choosing what to measure, not being
                       prompted. */
                    relevantKeys={new Set()}
                    relevantBecause={new Map()}
                    onClose={() => setMeasureVisit(null)}
                    onCommit={(values) => {
                        const rows = vitalsToMeasurements(values as Vitals);
                        if (!rows.length) return;
                        const id = measureVisit.visit_id;
                        saveVisitMeasurements(id, rows)
                            .then(() => toast.success("Measurements saved"))
                            .catch((err) => {
                                console.warn("saveVisitMeasurements failed:", err);
                                toast.error("Could not save those measurements.");
                            });
                    }}
                />
            )}

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
                    defaultDoctorId={doctors[0]?.id ?? ""}
                    onClose={() => setCreateState(null)}
                    onUseExisting={(p) => setCreateState({ existingPatient: p, prefillName: "" })}
                    onCreate={actions.createNewVisit}
                />
            )}

            {attachmentsVisit && (
                <VisitAttachmentsModal
                    visit={attachmentsVisit}
                    onClose={() => setAttachmentsVisit(null)}
                />
            )}
        </WorkspaceShell>
    );
}
