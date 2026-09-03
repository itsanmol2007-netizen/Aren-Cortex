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
    const [openVisit, setOpenVisit] = useState<TodayVisit | null>(null);
    const [createState, setCreateState] = useState<CreateState | null>(null);
    const [attachmentsVisit, setAttachmentsVisit] = useState<TodayVisit | null>(null);
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 20000);
        return () => clearInterval(t);
    }, []);

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
                            onComplete={actions.completeVisit}
                            onCancel={actions.cancelVisit}
                            onAttachments={(v) => setAttachmentsVisit(v)}
                            selectedVisitId={openVisit?.visit_id ?? null}
                            onAddPatient={() => setCreateState({ existingPatient: null, prefillName: "" })}
                        />
                    </div>
                </div>
                <Sidebar doctors={doctors} visits={visits} now={now} hospitalId={hospitalId} />
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
