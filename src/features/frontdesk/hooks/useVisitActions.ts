import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import {
    createPatient,
    findPatientByPhone,
    createVisit,
    markVisitServing,
    updateVisitStatus,
    reassignVisitDoctor,
    saveVisitSymptoms,
    saveVisitObservations,
    legacySymptomIdsFor,
    type DBPatient,
} from "@/lib/db";
import type { TodayVisit } from "../types/frontdesk";
import { useT } from "../i18n/i18n";
import { padToken } from "../utils";

type UseVisitActionsArgs = {
    visits: TodayVisit[];
    setVisits: Dispatch<SetStateAction<TodayVisit[]>>;
    refetch: () => void;
};

// Optimistically patches the in-memory queue, then reconciles against the
// server. On failure, the queue is rolled back to its pre-action snapshot —
// the next silent 25s refresh will also self-correct either way.
export function useVisitActions({ visits, setVisits, refetch }: UseVisitActionsArgs) {
    const t = useT();

    const patch = (visitId: string, fields: Partial<TodayVisit>) => {
        setVisits((vs) => vs.map((v) => (v.visit_id === visitId ? { ...v, ...fields } : v)));
    };

    const startConsultation = async (visit: TodayVisit) => {
        const prev = visits;
        patch(visit.visit_id, { status: "serving" });
        try {
            await markVisitServing(visit.visit_id);
            toast.success(t("toastStatus", { name: visit.patient_name, status: t("stConsult") }));
        } catch (err: any) {
            setVisits(prev);
            toast.error(`Could not start consultation: ${err.message}`);
        }
    };

    const completeVisit = async (visit: TodayVisit) => {
        const prev = visits;
        patch(visit.visit_id, { status: "completed" });
        try {
            await updateVisitStatus(visit.visit_id, "completed");
            toast.success(t("toastStatus", { name: visit.patient_name, status: t("stCompleted") }));
        } catch (err: any) {
            setVisits(prev);
            toast.error(`Could not complete visit: ${err.message}`);
        }
    };

    const cancelVisit = async (visit: TodayVisit, silent = false) => {
        const prev = visits;
        patch(visit.visit_id, { status: "discarded" });
        try {
            await updateVisitStatus(visit.visit_id, "discarded");
            if (!silent) toast(t("toastStatus", { name: visit.patient_name, status: t("stCancelled") }));
        } catch (err: any) {
            setVisits(prev);
            toast.error(`Could not cancel visit: ${err.message}`);
        }
    };

    const reassignDoctor = async (visit: TodayVisit, doctorId: string, doctorName: string) => {
        const prev = visits;
        patch(visit.visit_id, { assigned_doctor_id: doctorId, doctor_name: doctorName });
        try {
            await reassignVisitDoctor(visit.visit_id, doctorId);
        } catch (err: any) {
            setVisits(prev);
            toast.error(`Could not reassign doctor: ${err.message}`);
        }
    };

    const createNewVisit = async (opts: {
        existingPatient: DBPatient | null;
        name: string;
        phone: string;
        age: string;
        dateOfBirth?: string;
        gender: string;
        observableIds: number[];
        doctorId: string;
    }): Promise<{ patientName: string } | null> => {
        try {
            let patient = opts.existingPatient;
            if (!patient) {
                const byPhone = await findPatientByPhone(opts.phone.trim());
                patient =
                    byPhone ??
                    (await createPatient({
                        name: opts.name.trim(),
                        age: Number(opts.age) || 0,
                        gender: opts.gender,
                        phone: opts.phone.trim(),
                        date_of_birth: opts.dateOfBirth || null,
                    }));
            }

            const visit = await createVisit(patient.id, "waiting", opts.doctorId);

            // Symptoms are structured entities — the picker hands us observable
            // ids from the shared catalogue, never typed strings.
            //
            // Two writes. `visit_observations` is canonical and holds anything the
            // receptionist entered; `visit_symptoms` mirrors the subset that has a
            // v1 row, so the queue row and visit detail keep rendering while those
            // tables still exist. Best-effort throughout: losing a symptom must
            // never lose the visit.
            if (opts.observableIds.length) {
                const ids = opts.observableIds;
                saveVisitObservations(visit.id, ids)
                    .then(() => legacySymptomIdsFor(ids))
                    .then((legacy) => (legacy.length ? saveVisitSymptoms(visit.id, legacy) : undefined))
                    .catch((err) => console.warn("saveVisitObservations failed (non-fatal):", err));
            }

            refetch();

            const patientName = patient.name;
            toast.success(t("toastCreated", { name: patientName, t: padToken(visit.token_number ?? null) }), {
                action: {
                    label: t("undo"),
                    onClick: () => {
                        cancelVisit(
                            { visit_id: visit.id, patient_name: patientName } as TodayVisit,
                            true
                        );
                        toast(t("toastUndone"));
                    },
                },
            });

            return { patientName };
        } catch (err: any) {
            toast.error(`Could not create visit: ${err.message}`);
            return null;
        }
    };

    return { startConsultation, completeVisit, cancelVisit, reassignDoctor, createNewVisit };
}
