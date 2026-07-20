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

// Doctor Requests: reads from the real `doctor_requests` table once it exists
// (see docs/Supabase Wiring TODO.md). Until then the query auto-disables and
// the card shows a real "no requests" state — no more simulator.
export type DoctorRequest = {
    id: string;
    doctor_name: string;
    text: string;
    created_at: number; // epoch ms (parsed from the row's created_at)
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
