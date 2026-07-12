import type { TodayVisit, DBPatient, DBDoctor } from "@/lib/db";

export type { TodayVisit, DBPatient, DBDoctor };

// Real values used in visits.status (plain TEXT column, no DB enum).
// Front Desk queue tabs only surface waiting/serving/completed — "discarded"
// and "referred" still render correctly in the "All" list and in VisitRow,
// they just don't get a dedicated tab (matches the HTML prototype's tab set).
export type VisitStatus = "waiting" | "serving" | "completed" | "discarded" | "referred";

export const STATUS_LABEL: Record<VisitStatus, string> = {
    waiting: "Waiting",
    serving: "In Consultation",
    completed: "Completed",
    discarded: "Cancelled",
    referred: "Referred",
};

export type QueueTab = "all" | "waiting" | "serving" | "completed";

export type DoctorActivity = "busy" | "free" | "off";

export type DoctorSummary = {
    id: string;
    name: string;
    avatar_url: string | null;
    activity: DoctorActivity;
    current_token: number | null;
    queue_count: number;
};

// Doctor Requests has no backing DB table yet (per architecture doc, this is a
// "future communication bridge" — not built). This type only ever lives in
// client-side session state; nothing here is persisted.
export type DoctorRequest = {
    id: string;
    doctor_name: string;
    text: string;
    created_at: number;
};

export type PatientMatch = DBPatient & {
    visit_count: number;
    last_visit_at: string | null;
};

export type CreateVisitFormValues = {
    name: string;
    phone: string;
    age: string;
    gender: string;
    symptoms: string;
    doctorId: string;
};
