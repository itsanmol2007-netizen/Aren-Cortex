import { useRef } from "react";
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
    saveVisitMeasurements,
    legacySymptomIdsFor,
    type DBPatient,
} from "@/lib/db";
import { vitalsToMeasurements } from "@/lib/synapse/consultInput";
import type { Vitals } from "@/types";
import { uploadAttachment } from "@/lib/db/attachments";
import { recordVisitPayment, type PaymentMethod, type VisitType } from "@/lib/db/payments";
import { useAuth } from "@/features/auth/AuthProvider";
import type { AttachmentType } from "@/lib/attachments/types";
import type { TodayVisit } from "../types/frontdesk";
import { useT } from "../i18n/i18n";
import { useHospitalId } from "./useHospitalId";
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
    // `useHospitalId` fixed the reception READS; the writes below still went to
    // the hardcoded clinic, so registering a patient anywhere else was rejected
    // by RLS with a 403. Same null-over-guess rule as the hook itself.
    const hospitalId = useHospitalId();

    // Who is doing this, for the payment audit trail. Held in a ref because
    // the background `attempt()` below runs after this modal has closed and
    // possibly after a re-render — reading auth state through a ref keeps the
    // actor correct without adding auth to every callback dependency list.
    const auth = useAuth();
    const actorRef = useRef<{ id: string | null; name: string | null; role: string | null }>({
        id: null, name: null, role: null,
    });
    actorRef.current = auth.status === "authed"
        ? { id: auth.identity.user.id, name: auth.identity.user.full_name, role: auth.identity.user.role }
        : { id: null, name: null, role: null };

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

    // Fire-and-forget by design (2026-08-24, replacing the old await-then-
    // close flow that held CreateVisitModal open through 2-3 sequential
    // round trips — find/create patient, create visit — the "very slow"
    // complaint). CreateVisitModal now closes the instant Save is clicked;
    // this function inserts an optimistic row into the live queue
    // SYNCHRONOUSLY, before any network call, then does the real work in the
    // background and reconciles:
    //   - success -> refetch() pulls the authoritative row; since it's a
    //     full replace of `visits`, the temp row (which isn't in the server
    //     response) simply stops existing — no manual swap needed.
    //   - failure while offline -> the row stays, marked "offline", and a
    //     one-shot `online` listener retries the exact same attempt once
    //     connectivity returns. Never silently drops a registration because
    //     Wi-Fi blinked.
    //   - failure while online -> the row is removed and a toast carries a
    //     Retry action that re-runs the same attempt.
    const createNewVisit = (opts: {
        existingPatient: DBPatient | null;
        name: string;
        phone: string;
        age: string;
        dateOfBirth?: string;
        gender: string;
        observableIds: number[];
        symptomNames: string[];
        /**
         * observableId -> days, for the complaints where reception asked.
         * Sparse and optional: the desk asks only where `ASKS_DURATION` says
         * a duration changes what the doctor does, and a skipped question
         * writes nothing rather than writing zero.
         */
        observableDurations?: Map<number, number>;
        // Measurements taken at the desk (BP, weight, LMP…), keyed by the
        // consult's own Vitals field keys. Optional — most registrations have
        // none. Reduced to MeasurementRows and written to `visit_measurements`
        // best-effort, exactly like the observations above.
        vitals?: Partial<Vitals>;
        doctorId: string;
        doctorName: string;
        attachments: { file: File; attachmentType: AttachmentType }[];
        /** What the desk charged, or null when no fee is configured for the
         *  assigned doctor. Written after the visit lands, best-effort. */
        payment?: {
            visitType: VisitType;
            base: number;
            discount: number;
            gstAmount: number;
            total: number;
            discountKind: "none" | "percent" | "amount";
            discountPercent: number | null;
            gstPercent: number;
            status: "paid" | "pending";
            method: PaymentMethod | null;
        } | null;
        // Optional — CreateVisitModal itself never sets this (it doesn't
        // await anything anymore), but a caller with its own state that
        // depends on the visit actually existing (PatientsPage refreshing
        // its directory/history aggregates) can hook the real success, once
        // the background attempt lands, without going back to awaiting it.
        onSuccess?: (result: { patientName: string; patientId: string; visitId: string }) => void;
    }): void => {
        if (!hospitalId) {
            toast.error("Not signed in to a clinic — cannot register a visit.");
            return;
        }

        const tempId = `pending-${crypto.randomUUID()}`;
        const nowIso = new Date().toISOString();
        const optimistic: TodayVisit = {
            visit_id: tempId,
            patient_id: opts.existingPatient?.id ?? tempId,
            patient_name: opts.existingPatient?.name ?? opts.name.trim(),
            age: opts.existingPatient?.age ?? (Number(opts.age) || 0),
            gender: opts.existingPatient?.gender ?? opts.gender,
            phone: opts.existingPatient?.phone ?? opts.phone.trim(),
            date_of_birth: opts.existingPatient?.date_of_birth ?? (opts.dateOfBirth || null),
            token_number: null,
            status: "waiting",
            created_at: nowIso,
            started_at: null,
            completed_at: null,
            assigned_doctor_id: opts.doctorId || null,
            doctor_name: opts.doctorName || null,
            symptom_names: opts.symptomNames,
            // Best-effort placeholders — corrected the instant refetch() pulls
            // the real row; nothing here is ever persisted.
            visit_count: opts.existingPatient ? 2 : 1,
            last_visit_at: nowIso,
            attachment_count: opts.attachments.length,
            // Optimistic: the payment row is written after the visit lands, so
            // the badge shows what the desk just chose rather than blinking
            // through "unrecorded" for a second.
            payment_status: opts.payment ? opts.payment.status : null,
            payment_total: opts.payment ? opts.payment.total : null,
            pending: true,
        };
        setVisits((vs) => [optimistic, ...vs]);

        const attempt = async (): Promise<void> => {
            try {
                let patient = opts.existingPatient;
                if (!patient) {
                    const byPhone = await findPatientByPhone(opts.phone.trim());
                    patient =
                        byPhone ??
                        (await createPatient(
                            {
                                name: opts.name.trim(),
                                age: Number(opts.age) || 0,
                                gender: opts.gender,
                                phone: opts.phone.trim(),
                                date_of_birth: opts.dateOfBirth || null,
                            },
                            hospitalId
                        ));
                }

                const visit = await createVisit({
                    patientId: patient.id,
                    hospitalId,
                    doctorId: opts.doctorId,
                    initialStatus: "waiting",
                });

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
                    saveVisitObservations(visit.id, ids, opts.observableDurations)
                        .then(() => legacySymptomIdsFor(ids))
                        .then((legacy) => (legacy.length ? saveVisitSymptoms(visit.id, legacy) : undefined))
                        .catch((err) => console.warn("saveVisitObservations failed (non-fatal):", err));
                }

                // Front-desk measurements — same best-effort contract: a number
                // that fails to write must never fail the visit that is already
                // committed above.
                if (opts.vitals && Object.keys(opts.vitals).length) {
                    const rows = vitalsToMeasurements(opts.vitals as Vitals);
                    if (rows.length) {
                        saveVisitMeasurements(visit.id, rows)
                            .catch((err) => console.warn("saveVisitMeasurements failed (non-fatal):", err));
                    }
                }

                // The fee. Same best-effort contract as everything above: the
                // visit is already committed, and a clinic must never lose a
                // registration because a payment row failed. A gap in the money
                // record is visible and fixable in Parallax; a lost visit is
                // not. Also writes the first audit event — see lib/db/payments.
                if (opts.payment) {
                    const pay = opts.payment;
                    recordVisitPayment({
                        visitId: visit.id,
                        hospitalId,
                        doctorId: opts.doctorId || null,
                        visitType: pay.visitType,
                        breakdown: { base: pay.base, discount: pay.discount, gstAmount: pay.gstAmount, total: pay.total },
                        discountKind: pay.discountKind,
                        discountPercent: pay.discountPercent,
                        gstPercent: pay.gstPercent,
                        status: pay.status,
                        method: pay.method,
                        actor: actorRef.current,
                    }).catch((err) => console.warn("recordVisitPayment failed (non-fatal):", err));
                }

                // Same rule: a failed attachment must never be mistaken for a
                // failed visit — the visit above is already committed by the
                // time this runs. Sequential, not Promise.all, so one huge
                // file compressing doesn't starve the others' network slot.
                for (const a of opts.attachments) {
                    try {
                        await uploadAttachment({ visitId: visit.id, file: a.file, attachmentType: a.attachmentType });
                    } catch (err) {
                        console.warn("intake attachment upload failed (non-fatal):", err);
                        toast.error(t("attachUploadFailed"));
                    }
                }

                refetch();

                const patientName = patient.name;
                opts.onSuccess?.({ patientName, patientId: patient.id, visitId: visit.id });
                toast.success(t("toastCreated", { name: patientName, t: padToken(visit.token_number ?? null) }), {
                    action: {
                        label: t("undo"),
                        onClick: () => {
                            cancelVisit({ visit_id: visit.id, patient_name: patientName } as TodayVisit, true);
                            toast(t("toastUndone"));
                        },
                    },
                });
            } catch (err: any) {
                const offline = typeof navigator !== "undefined" && !navigator.onLine;
                if (offline) {
                    // Still trying, not failed — wait for the browser to say
                    // connectivity is back, then run the exact same attempt
                    // again. One-shot listener; removes itself either way.
                    patch(tempId, { pending: true, offline: true });
                    const onBackOnline = () => {
                        window.removeEventListener("online", onBackOnline);
                        patch(tempId, { offline: false });
                        attempt();
                    };
                    window.addEventListener("online", onBackOnline);
                    return;
                }
                setVisits((vs) => vs.filter((v) => v.visit_id !== tempId));
                toast.error(`Could not create visit: ${err.message}`, {
                    action: { label: t("retry"), onClick: () => attempt() },
                });
            }
        };

        attempt();
    };

    return { startConsultation, completeVisit, cancelVisit, reassignDoctor, createNewVisit };
}
