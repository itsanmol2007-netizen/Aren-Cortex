import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
    type DBPatient,
} from "@/lib/db";
import { useHospitalId } from "./hooks/useHospitalId";
import { useQueue } from "./hooks/useQueue";
import { useVisitActions } from "./hooks/useVisitActions";
import { usePatientDirectory } from "./hooks/usePatientDirectory";
import { usePatientHistory } from "./hooks/usePatientHistory";
import { useCachedDoctors } from "./operational/referenceCache";
import { WorkspaceShell } from "./components/WorkspaceShell";
import { PatientBrowser } from "./components/patients/PatientBrowser";
import { PatientWorkspace } from "./components/patients/PatientWorkspace";
import { TimelineModal } from "./components/patients/TimelineModal";
import { EditPatientModal } from "./components/patients/EditPatientModal";
import { CreateVisitModal } from "./components/CreateVisitModal";
import { I18nProvider, useT } from "./i18n/i18n";

// The Patients page — the receptionist's archive. Front Desk asks "what is
// happening today?"; this room asks "tell me about this patient." Same shell,
// same design language, different tempo: find one person fast, verify their
// details, act, and go back.
export function PatientsPage() {
    return (
        <I18nProvider>
            <PatientsInner />
        </I18nProvider>
    );
}

function PatientsInner() {
    const t = useT();
    const directory = usePatientDirectory();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const hospitalId = useHospitalId();
    const doctors = useCachedDoctors(hospitalId).data;

    // The live queue rides along quietly: creating a visit from here reuses
    // the exact optimistic create/undo flow Front Desk runs on.
    const { visits, setVisits, refetch: refetchQueue } = useQueue(hospitalId);
    const actions = useVisitActions({ visits, setVisits, refetch: refetchQueue });

    const selected = useMemo(
        () => directory.entries.find((e) => e.id === selectedId) ?? null,
        [directory.entries, selectedId]
    );
    const history = usePatientHistory(selected?.id ?? null);

    const [createFor, setCreateFor] = useState<DBPatient | null>(null);
    const [editing, setEditing] = useState(false);
    const [timelineOpen, setTimelineOpen] = useState(false);

    const handleCreate: typeof actions.createNewVisit = async (opts) => {
        const result = await actions.createNewVisit(opts);
        if (result) {
            // The archive's aggregates just changed — refresh both quietly.
            history.refetch();
            directory.refetch();
        }
        return result;
    };

    return (
        <WorkspaceShell>
            <div className="mx-auto flex min-h-0 w-full max-w-[1480px] flex-1 flex-col px-6 pb-5 pt-5">
                <div className="mb-4 shrink-0">
                    <h1 className="m-0 font-[Manrope,sans-serif] text-[22px] font-extrabold leading-[1.15] tracking-[-0.01em] text-[#161d29]">
                        {t("patientsTitle")}
                    </h1>
                    <p className="m-0 mt-[3px] text-[13px] font-medium text-[#8a91a0]">{t("patientsSub")}</p>
                </div>

                <div className="grid min-h-0 flex-1 grid-cols-[minmax(340px,420px)_minmax(0,1fr)] items-stretch gap-[14px] max-[1040px]:grid-cols-1">
                    <PatientBrowser
                        entries={directory.entries}
                        loading={directory.loading}
                        failed={directory.failed}
                        onRetry={directory.retry}
                        doctors={doctors}
                        selectedId={selectedId}
                        onSelect={(p) => setSelectedId(p.id)}
                    />
                    <PatientWorkspace
                        patient={selected}
                        history={history.visits}
                        historyLoading={history.loading}
                        onNewVisit={(p) => setCreateFor({ id: p.id, name: p.name, age: p.age, gender: p.gender, phone: p.phone })}
                        onEdit={() => setEditing(true)}
                        onOpenTimeline={() => setTimelineOpen(true)}
                    />
                </div>
            </div>

            {createFor && (
                <CreateVisitModal
                    existingPatient={createFor}
                    prefillName=""
                    doctors={doctors}
                    defaultDoctorId={selected?.primary_doctor_id ?? doctors[0]?.id ?? ""}
                    onClose={() => setCreateFor(null)}
                    onUseExisting={(p) => setCreateFor(p)}
                    onCreate={handleCreate}
                />
            )}

            {editing && selected && (
                <EditPatientModal
                    patient={selected}
                    onClose={() => setEditing(false)}
                    onSaved={(fresh) => {
                        directory.patchEntry(fresh.id, {
                            name: fresh.name,
                            age: fresh.age,
                            gender: fresh.gender,
                            phone: fresh.phone,
                        });
                        setEditing(false);
                        toast.success(t("toastPatientSaved", { name: fresh.name }));
                    }}
                />
            )}

            {timelineOpen && selected && (
                <TimelineModal patient={selected} visits={history.visits} onClose={() => setTimelineOpen(false)} />
            )}
        </WorkspaceShell>
    );
}
