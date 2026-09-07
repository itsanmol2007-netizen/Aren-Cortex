// ---------------------------------------------------------------------------
// PEOPLE & BENCHES — who works here, and what each bench is doing.
//
// The one page in Parallax that WRITES to other people's accounts, so it is
// built to make that obvious: every change is a single explicit control with
// an immediate, named result ("Raju is now Front desk"), never a form that
// saves six things at once.
//
// ── The guard rail that matters
//
// An admin cannot deactivate or demote THEMSELVES. Not because it would be
// destructive — `is_active = false` is reversible — but because it is
// irreversible FROM HERE: the moment it lands, the route guard ejects them and
// the only surface that could undo it is the one they just lost. A clinic
// locking itself out of its own admin panel at 9pm is a support call, not a
// mistake worth allowing.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
    AlertTriangle, Eye, EyeOff, ShieldCheck, ShieldOff, Stethoscope, UserCheck, UserPlus, UserX, Users,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../auth/AuthProvider";
import { useClinicalIdentity } from "../../../hooks/useClinicalIdentity";
import { Card, CardAction, EmptyBlock, FormError, INPUT_CLASS, RowText, SkeletonRows } from "../../clinic/ui";
import { ShareBar } from "../charts";
import { PeriodBar, type PeriodState } from "../PeriodBar";
import {
    buildRange, clinicToday, fetchClinicAnalytics, fetchClinicSetup, fetchDoctorRoster, fetchFeeSettings,
    formatMoney, formatRangeLabel, setDoctorClinicAdmin,
    type ClinicAnalytics, type ClinicSetup, type DoctorRosterRow, type FeeSettings,
} from "../../../lib/db/admin";
import {
    createStaffMember, fetchStaff, updateStaffMember, type NewStaffRole, type StaffMember,
} from "../../../lib/db/staff";

/** Roles an admin may assign from here. `owner` is absent deliberately —
 *  ownership is a commercial fact AREN sets, not something a clinic hands
 *  around; `lab`/`pharmacist` are absent because no workspace exists for them
 *  yet and granting a role that leads nowhere is worse than not offering it. */
const ASSIGNABLE = ["admin", "doctor", "reception"] as const;

const ROLE_LABEL: Record<string, string> = {
    owner: "Owner",
    admin: "Admin",
    doctor: "Doctor",
    reception: "Front desk",
    lab: "Lab",
    pharmacist: "Pharmacy",
};

/**
 * "Setting the email, number, and password is possible" — a clinic admin
 * mints a real sign-in for a new doctor, receptionist, or admin from here,
 * instead of that person registering themselves against the clinic. Calls
 * the `admin-staff` Supabase Edge Function, the one place allowed to write
 * a `users` row that isn't the caller's own.
 *
 * Deliberately its own small form rather than a modal: this card already IS
 * the "manage people" surface, and a modal-over-a-modal (Overview embeds
 * this whole page in one already, see DoctorOverviewPage.tsx) is one layer
 * of glass too many.
 */
function AddStaffForm({ onCreated }: { onCreated: () => void }) {
    const [fullName, setFullName] = useState("");
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [showPw, setShowPw] = useState(false);
    const [role, setRole] = useState<NewStaffRole>("reception");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        const digits = phone.replace(/\D/g, "");
        if (!fullName.trim()) { setError("Enter their name."); return; }
        if (digits.length !== 10) { setError("Enter a 10-digit phone number."); return; }
        if (password.length < 8) { setError("Use a password of at least 8 characters."); return; }

        setBusy(true);
        try {
            await createStaffMember({ fullName: fullName.trim(), phone: digits, password, role });
            toast.success(`${fullName.trim()} can now sign in with that phone number.`);
            setFullName(""); setPhone(""); setPassword(""); setRole("reception");
            onCreated();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not create that account.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <form
            onSubmit={submit}
            className="flex flex-none flex-col gap-[8px] rounded-[10px] border border-dashed border-[var(--cs-line-strong)] bg-[var(--cs-page)] p-[10px]"
        >
            <div className="grid grid-cols-2 gap-[8px] max-[520px]:grid-cols-1">
                <input
                    aria-label="Full name" placeholder="Full name" value={fullName}
                    onChange={(e) => setFullName(e.target.value)} disabled={busy} className={INPUT_CLASS}
                />
                <input
                    aria-label="Phone number" placeholder="10-digit phone" inputMode="numeric" value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    disabled={busy} className={INPUT_CLASS}
                />
            </div>
            <div className="grid grid-cols-2 gap-[8px] max-[520px]:grid-cols-1">
                <div className="relative">
                    <input
                        aria-label="Password" type={showPw ? "text" : "password"} placeholder="Password (min. 8 characters)"
                        value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy}
                        className={`${INPUT_CLASS} pr-[36px]!`}
                    />
                    <button
                        type="button" onClick={() => setShowPw((v) => !v)} disabled={busy}
                        aria-label={showPw ? "Hide password" : "Show password"}
                        className="absolute right-[8px] top-1/2 grid h-[22px] w-[22px] -translate-y-1/2 cursor-pointer place-items-center border-0 bg-transparent p-0 text-[var(--cs-faint)]"
                    >
                        {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                </div>
                <select
                    aria-label="Role" value={role} disabled={busy}
                    onChange={(e) => setRole(e.target.value as NewStaffRole)}
                    className="h-[40px]! rounded-[11px]! border! border-[var(--cs-line)]! bg-[rgba(248,250,252,0.9)]! px-[12px]! text-[13px]! font-medium text-[var(--cs-ink)] outline-none focus:border-[#a855f7]!"
                >
                    <option value="reception">Front desk</option>
                    <option value="doctor">Doctor</option>
                    <option value="admin">Admin</option>
                </select>
            </div>
            {error && <FormError message={error} />}
            <div className="flex items-center gap-[8px]">
                <button
                    type="submit" disabled={busy}
                    className="inline-flex cursor-pointer items-center gap-[6px] rounded-full border-[1.5px] border-[var(--cs-violet)] bg-[var(--cs-violet-soft)] px-[14px] py-[7px] text-[12px] font-semibold text-[var(--cs-violet)] outline-none disabled:opacity-55"
                >
                    <UserPlus size={13} /> {busy ? "Creating…" : "Create sign-in"}
                </button>
                <span className="text-[10.5px] text-[var(--cs-faint)]">
                    They sign in with this phone number and password — same login screen as everyone else.
                </span>
            </div>
        </form>
    );
}

export function PeoplePage() {
    const identity = useClinicalIdentity();
    const auth = useAuth();
    const myUserId = auth.status === "authed" ? auth.identity.user.id : null;
    const today = clinicToday();

    const [period, setPeriod] = useState<PeriodState>({ preset: "30d", from: today, to: today });
    const [staff, setStaff] = useState<StaffMember[] | null>(null);
    const [setup, setSetup] = useState<ClinicSetup | null>(null);
    const [data, setData] = useState<ClinicAnalytics | null>(null);
    const [fees, setFees] = useState<FeeSettings | null>(null);
    const [roster, setRoster] = useState<DoctorRosterRow[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [adminBusyId, setAdminBusyId] = useState<string | null>(null);
    const [addingStaff, setAddingStaff] = useState(false);

    const range = useMemo(
        () => buildRange(period.preset, { from: period.from, to: period.to }),
        [period]
    );

    const loadStaff = useCallback(() => {
        if (!identity.ready) return;
        fetchStaff(identity.hospitalId).then(setStaff).catch((e: unknown) => {
            console.error("[people] staff:", e);
            setStaff(null);
        });
        fetchClinicSetup(identity.hospitalId).then(setSetup).catch(() => setSetup(null));
        fetchFeeSettings(identity.hospitalId).then(setFees).catch(() => setFees(null));
        fetchDoctorRoster(identity.hospitalId).then(setRoster).catch((e: unknown) => {
            console.error("[people] roster:", e);
            setRoster(null);
        });
    }, [identity.ready, identity.hospitalId]);

    const loadBenches = useCallback(() => {
        if (!identity.ready) return;
        setLoading(true);
        fetchClinicAnalytics(identity.hospitalId, range)
            .then(setData)
            .catch((e: unknown) => { console.error("[people] benches:", e); setData(null); })
            .finally(() => setLoading(false));
    }, [identity.ready, identity.hospitalId, range]);

    useEffect(loadStaff, [loadStaff]);
    useEffect(loadBenches, [loadBenches]);

    const currency = fees?.policy.currency ?? "INR";

    const change = async (member: StaffMember, patch: { role?: string; is_active?: boolean }, what: string) => {
        setSavingId(member.id);
        try {
            await updateStaffMember(member.id, patch);
            toast.success(what);
            loadStaff();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not save that change.");
        } finally {
            setSavingId(null);
        }
    };

    const active = useMemo(() => (staff ?? []).filter((s) => s.is_active), [staff]);
    const inactive = useMemo(() => (staff ?? []).filter((s) => !s.is_active), [staff]);

    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex w-full flex-1 flex-col gap-[12px] overflow-y-auto px-[28px] pb-[44px] pt-[15px] max-[900px]:px-[12px]">

                {setup?.seatsExceeded && (
                    <div className="flex items-start gap-[8px] rounded-[var(--cs-radius)] border border-[var(--cs-amber)] bg-[var(--cs-amber-soft)] px-[12px] py-[10px]">
                        <AlertTriangle size={14} className="mt-[1px] flex-none text-[var(--cs-amber)]" />
                        <span className="text-[11.5px] leading-[1.45] text-[var(--cs-muted)]">
                            <strong className="font-semibold text-[var(--cs-ink)]">
                                {setup.benches} benches on {setup.seats} seats.
                            </strong>{" "}
                            Your plan is behind your setup — ask AREN to add seats from the Plan page.
                        </span>
                    </div>
                )}

                {/* ── Staff ───────────────────────────────────────────────── */}
                <Card
                    id="adm-card-staff"
                    tone="blue"
                    icon={<Users size={14} />}
                    title="People"
                    subtitle={
                        staff
                            ? `${active.length} active · ${inactive.length} inactive`
                            : "Everyone with a login at this clinic"
                    }
                    action={
                        <CardAction tone="blue" onClick={() => setAddingStaff((v) => !v)}>
                            <UserPlus size={12} /> {addingStaff ? "Cancel" : "Add staff"}
                        </CardAction>
                    }
                    foot={
                        <span className="text-[11px] text-[var(--cs-faint)]">
                            Staff can also join on their own by registering against this clinic.
                        </span>
                    }
                >
                    {addingStaff && (
                        <AddStaffForm onCreated={() => { setAddingStaff(false); loadStaff(); }} />
                    )}
                    {!staff ? (
                        <SkeletonRows count={3} />
                    ) : staff.length === 0 ? (
                        <EmptyBlock fact="Nobody has a login yet" next="Add them above, or they can register against this clinic themselves." />
                    ) : (
                        <div className="flex max-h-[340px] flex-col gap-[6px] overflow-y-auto pr-[2px]">
                            {[...active, ...inactive].map((s) => {
                                const isMe = s.id === myUserId;
                                const busy = savingId === s.id;
                                return (
                                    <div
                                        key={s.id}
                                        className={
                                            "flex min-w-0 flex-none flex-wrap items-center gap-[9px] rounded-[10px] border px-[10px] py-[9px] transition-opacity " +
                                            (s.is_active
                                                ? "border-[var(--cs-line)] bg-[var(--cs-page)]"
                                                : "border-dashed border-[var(--cs-line-strong)] bg-transparent opacity-70") +
                                            (busy ? " pointer-events-none opacity-50" : "")
                                        }
                                    >
                                        <RowText
                                            label={`${s.full_name ?? "Unnamed"}${isMe ? " (you)" : ""}`}
                                            sub={s.phone}
                                        />

                                        <div className="ml-auto flex flex-none items-center gap-[8px]">
                                            {/* Role. Disabled for yourself — see the header. */}
                                            <select
                                                aria-label={`Role for ${s.full_name ?? "this person"}`}
                                                value={s.role ?? ""}
                                                disabled={isMe || !s.is_active}
                                                onChange={(e) => change(s, { role: e.target.value }, `${s.full_name ?? "They"} is now ${ROLE_LABEL[e.target.value] ?? e.target.value}`)}
                                                className="h-[30px]! rounded-[8px]! border! border-[var(--cs-line-strong)]! bg-[var(--cs-card)]! px-[8px]! text-[11.5px]! font-semibold text-[var(--cs-muted)] outline-none disabled:opacity-55 focus:border-[var(--cs-blue)]!"
                                            >
                                                {!ASSIGNABLE.includes((s.role ?? "") as typeof ASSIGNABLE[number]) && (
                                                    <option value={s.role ?? ""}>{ROLE_LABEL[s.role ?? ""] ?? s.role ?? "—"}</option>
                                                )}
                                                {ASSIGNABLE.map((r) => (
                                                    <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                                                ))}
                                            </select>

                                            {isMe ? (
                                                <span className="rounded-full border border-[var(--cs-line-strong)] px-[10px] py-[4px] text-[10.5px] font-semibold text-[var(--cs-faint)]">
                                                    Signed in
                                                </span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => change(
                                                        s,
                                                        { is_active: !s.is_active },
                                                        s.is_active
                                                            ? `${s.full_name ?? "They"} can no longer sign in`
                                                            : `${s.full_name ?? "They"} can sign in again`
                                                    )}
                                                    className={
                                                        "inline-flex cursor-pointer items-center gap-[5px] rounded-full border px-[10px] py-[4px] text-[10.5px] font-semibold transition-colors outline-none " +
                                                        (s.is_active
                                                            ? "border-[var(--cs-line-strong)] text-[var(--cs-muted)] hover:border-[var(--cs-red)] hover:bg-[var(--cs-red-soft)] hover:text-[var(--cs-red)]"
                                                            : "border-[var(--cs-green)] text-[var(--cs-green)] hover:bg-[var(--cs-green-soft)]")
                                                    }
                                                >
                                                    {s.is_active ? <><UserX size={12} /> Deactivate</> : <><UserCheck size={12} /> Reactivate</>}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Card>

                {/* ── Benches ─────────────────────────────────────────────── */}
                <PeriodBar period={period} range={range} onChange={setPeriod} onRefresh={loadBenches} busy={loading} />

                <Card
                    id="adm-card-benches"
                    tone="teal"
                    icon={<Stethoscope size={14} />}
                    title="Benches"
                    subtitle={`${setup?.benches ?? 0} consultation ${setup?.benches === 1 ? "bench" : "benches"} · ${formatRangeLabel(range)}`}
                >
                    {!data ? (
                        <SkeletonRows count={3} />
                    ) : data.benches.length === 0 ? (
                        <EmptyBlock fact="No doctors on file" next="A doctor appears here once they register against this clinic." />
                    ) : (
                        <div className="flex flex-col gap-[6px]">
                            {data.benches.map((b) => {
                                // `data.benches` is a performance read (this
                                // period's visits/revenue); admin authority
                                // lives on `roster`, a separate un-ranged
                                // read — joined here by doctorId rather than
                                // added to fetchClinicAnalytics, which has no
                                // reason to know about admin flags.
                                const r = roster?.find((x) => x.doctorId === b.doctorId);
                                const adminBusy = adminBusyId === b.doctorId;
                                return (
                                    <div key={b.doctorId} className="flex min-w-0 flex-col gap-[6px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[10px] py-[9px]">
                                        <div className="flex min-w-0 items-center gap-[9px]">
                                            <RowText
                                                label={b.name}
                                                sub={[b.specialization, b.consultationFee !== null ? formatMoney(b.consultationFee, currency) : "Fee not set"]
                                                    .filter(Boolean).join(" · ")}
                                            />
                                            <span className="ml-auto flex flex-none items-center gap-[14px] text-[12px] tabular-nums text-[var(--cs-muted)]">
                                                <span><strong className="text-[13px] font-bold text-[var(--cs-ink)]">{b.visits}</strong> seen</span>
                                                <span>{b.completed} done</span>
                                                <span>{b.prescriptions} Rx</span>
                                                {data.revenueTracked && (
                                                    <span className="font-semibold text-[var(--cs-violet)]">{formatMoney(b.revenue, currency)}</span>
                                                )}
                                            </span>
                                            {/* Clinic-admin authority — additive to `users.role`, see
                                                `adminAccess.ts`. A doctor keeps this flag whether or not
                                                the clinic ALSO has a dedicated (non-doctor) admin; several
                                                doctors can carry it at once. */}
                                            {r && (
                                                <button
                                                    type="button"
                                                    disabled={adminBusy}
                                                    onClick={async () => {
                                                        setAdminBusyId(b.doctorId);
                                                        try {
                                                            await setDoctorClinicAdmin(b.doctorId, !r.isClinicAdmin);
                                                            toast.success(`${b.name} is ${r.isClinicAdmin ? "no longer" : "now"} a clinic admin`);
                                                            loadStaff();
                                                        } catch (e) {
                                                            toast.error(e instanceof Error ? e.message : "Could not save that change.");
                                                        } finally {
                                                            setAdminBusyId(null);
                                                        }
                                                    }}
                                                    className={
                                                        "inline-flex flex-none cursor-pointer items-center gap-[5px] rounded-full border px-[10px] py-[4px] text-[10.5px] font-semibold outline-none disabled:opacity-55 " +
                                                        (r.isClinicAdmin
                                                            ? "border-[var(--cs-violet)] bg-[var(--cs-violet-soft)] text-[var(--cs-violet)]"
                                                            : "border-[var(--cs-line-strong)] text-[var(--cs-muted)] hover:border-[var(--cs-violet)] hover:text-[var(--cs-violet)]")
                                                    }
                                                >
                                                    {r.isClinicAdmin ? <ShieldOff size={12} /> : <ShieldCheck size={12} />}
                                                    {r.isClinicAdmin ? "Remove admin" : "Make admin"}
                                                </button>
                                            )}
                                        </div>
                                        <ShareBar share={b.share} tone="teal" />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}
