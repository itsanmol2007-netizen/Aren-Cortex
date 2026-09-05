// ---------------------------------------------------------------------------
// CLINIC — the clinic's own details, from the admin side.
//
// ── Why this reuses Cortex's modals rather than growing its own
//
// `EditClinicModal` and `ClinicHoursModal` already exist, already validate,
// already upload a logo correctly, and already write the same two rows the
// prescription renderer reads. A second editor here would be a second set of
// rules about what a clinic name may be — and the first time they disagreed,
// a printed prescription would disagree with the screen that set it.
//
// So this page is a READ surface plus two doors into editors that already
// exist. Standing rule 19 in its plainest form: make one read the other.
//
// ── What is deliberately absent
//
// The prescription pad. It is a full-page editor with a live preview, it is
// clinical output, and it belongs to the doctor who signs it — an office
// manager reformatting a prescription is not a workflow this product wants.
// The page says so rather than silently omitting it.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
    Building2, Clock, Globe, Mail, MapPin, Phone, ScrollText, Stethoscope,
} from "lucide-react";
import { toast } from "sonner";
import { useClinicalIdentity } from "../../../hooks/useClinicalIdentity";
import { Card, CardPillButton, EmptyBlock, RowText, SkeletonRows } from "../../clinic/ui";
import { ClinicHoursModal, EditClinicModal } from "../../clinic/ClinicModals";
import {
    emptyClinicHours, fetchClinicHours, type ClinicDayHours,
} from "../../../lib/db/clinic";
import { supabase } from "../../../lib/supabase";
import type { DBHospital } from "../../../lib/db";
import { fetchFeeSettings, type FeeSettings } from "../../../lib/db/admin";

const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Detail({ icon, value }: { icon: ReactNode; value: string | null | undefined }) {
    if (!value) return null;
    return (
        <div className="flex min-w-0 items-start gap-[7px]">
            <span className="mt-[1px] flex-none text-[var(--cs-faint)]" aria-hidden="true">{icon}</span>
            <span className="break-words text-[12px] font-medium leading-[1.45] text-[var(--cs-muted)]">{value}</span>
        </div>
    );
}

export function ClinicSettingsPage() {
    const identity = useClinicalIdentity();

    const [hospital, setHospital] = useState<DBHospital | null>(null);
    const [week, setWeek] = useState<ClinicDayHours[]>(emptyClinicHours);
    const [fees, setFees] = useState<FeeSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [clinicOpen, setClinicOpen] = useState(false);
    const [hoursOpen, setHoursOpen] = useState(false);

    const load = useCallback(() => {
        if (!identity.ready) return;
        setLoading(true);
        // The hospital row is read here rather than taken from the auth
        // identity: that copy is a login-time snapshot, and this page is where
        // the row gets edited, so it must show what is actually stored.
        supabase
            .from("hospitals")
            .select("*")
            .eq("id", identity.hospitalId)
            .maybeSingle()
            .then(({ data }) => setHospital((data as DBHospital) ?? null))
            .then(() => setLoading(false));
        fetchClinicHours(identity.hospitalId).then(setWeek).catch(() => setWeek(emptyClinicHours()));
        fetchFeeSettings(identity.hospitalId).then(setFees).catch(() => setFees(null));
    }, [identity.ready, identity.hospitalId]);

    useEffect(load, [load]);

    const openDays = week.filter((d) => d.sessions.length > 0).length;

    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex w-full flex-1 flex-col gap-[12px] overflow-y-auto px-[28px] pb-[44px] pt-[15px] max-[900px]:px-[12px]">

                <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] items-stretch gap-[12px] max-[980px]:grid-cols-1">

                    {/* ── Identity ───────────────────────────────────────── */}
                    <Card
                        id="adm-card-clinic"
                        tone="blue"
                        icon={<Building2 size={14} />}
                        title="Clinic information"
                        subtitle="What patients see on a prescription"
                        action={
                            hospital && (
                                <CardPillButton tone="blue" onClick={() => setClinicOpen(true)}>Edit</CardPillButton>
                            )
                        }
                    >
                        {loading ? (
                            <SkeletonRows count={4} />
                        ) : !hospital ? (
                            <EmptyBlock fact="Clinic details unavailable" next="Reload the page, or check your connection." />
                        ) : (
                            <div className="flex flex-col gap-[9px]">
                                <div className="flex min-w-0 flex-col gap-[1px]">
                                    <span className="truncate text-[16px] font-bold text-[var(--cs-ink)]">{hospital.name}</span>
                                    {hospital.tagline && (
                                        <span className="text-[11.5px] text-[var(--cs-faint)]">{hospital.tagline}</span>
                                    )}
                                </div>
                                <div className="flex flex-col gap-[6px]">
                                    <Detail icon={<MapPin size={12} />} value={[hospital.address, hospital.city, hospital.state].filter(Boolean).join(", ")} />
                                    <Detail icon={<Phone size={12} />} value={hospital.phone} />
                                    <Detail icon={<Mail size={12} />} value={hospital.email} />
                                    <Detail icon={<Globe size={12} />} value={hospital.website} />
                                </div>
                            </div>
                        )}
                    </Card>

                    {/* ── Hours ──────────────────────────────────────────── */}
                    <Card
                        id="adm-card-hours"
                        tone="violet"
                        icon={<Clock size={14} />}
                        title="Clinic hours"
                        subtitle={openDays ? `Open ${openDays} ${openDays === 1 ? "day" : "days"} a week` : "When you see patients"}
                        action={<CardPillButton tone="violet" onClick={() => setHoursOpen(true)}>Edit hours</CardPillButton>}
                    >
                        {openDays === 0 ? (
                            <EmptyBlock fact="No hours set" next="Add the days and times you see patients." />
                        ) : (
                            <div className="flex flex-col gap-[4px]">
                                {week.map((d) => (
                                    <div key={d.day} className="flex items-center gap-[9px] rounded-[8px] px-[8px] py-[5px] odd:bg-[var(--cs-page)]">
                                        <span className="w-[34px] flex-none text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--cs-label)]">
                                            {DAY_LABEL[d.day] ?? d.day}
                                        </span>
                                        <span className={`text-[11.5px] tabular-nums ${d.sessions.length ? "text-[var(--cs-muted)]" : "text-[var(--cs-faint)]"}`}>
                                            {d.sessions.length
                                                ? d.sessions.map((s) => `${s.opensAt}–${s.closesAt}`).join(", ")
                                                : "Closed"}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>

                {/* ── What lives elsewhere ───────────────────────────────── */}
                <Card
                    id="adm-card-elsewhere"
                    tone="slate"
                    icon={<ScrollText size={14} />}
                    title="Not set from here"
                    subtitle="Two things this clinic configures somewhere else, on purpose"
                >
                    <div className="flex flex-col gap-[6px]">
                        <div className="flex min-w-0 items-start gap-[9px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[10px] py-[9px]">
                            <span className="mt-[1px] grid h-[24px] w-[24px] flex-none place-items-center rounded-[7px] bg-[#f1f5f9] text-[#475569]">
                                <ScrollText size={12} />
                            </span>
                            <RowText
                                label="Prescription pad"
                                sub="Clinical output the doctor signs — laid out from their own workspace, not from admin."
                            />
                        </div>
                        <div className="flex min-w-0 items-start gap-[9px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[10px] py-[9px]">
                            <span className="mt-[1px] grid h-[24px] w-[24px] flex-none place-items-center rounded-[7px] bg-[#f1f5f9] text-[#475569]">
                                <Stethoscope size={12} />
                            </span>
                            <RowText
                                label="Doctor profiles"
                                sub={
                                    fees
                                        ? `${fees.doctors.length} on file. Name, qualification, registration and signature belong to each doctor.`
                                        : "Name, qualification, registration and signature belong to each doctor."
                                }
                            />
                        </div>
                    </div>
                </Card>
            </div>

            {clinicOpen && (
                <EditClinicModal
                    hospitalId={identity.hospitalId}
                    hospital={hospital}
                    onClose={() => setClinicOpen(false)}
                    onSaved={() => { toast.success("Clinic updated"); setClinicOpen(false); load(); }}
                />
            )}
            {hoursOpen && (
                <ClinicHoursModal
                    hospitalId={identity.hospitalId}
                    week={week}
                    onClose={() => setHoursOpen(false)}
                    onSaved={(next) => { setWeek(next); toast.success("Hours updated"); setHoursOpen(false); }}
                />
            )}
        </div>
    );
}
