// Clinic staff — list, rename, change role, deactivate. New with Consult:
// a front-desk clinic is a multi-user clinic and had no surface for that.
//
// Adding a login is deliberately NOT here: `users` INSERT is gated on
// `id = auth.uid()` (registration only), so a "create staff" button would be
// a form that always fails. The footer says where people actually join from.
import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { PracticeModal } from "../practice/PracticeModal";
import { INPUT_CLASS, RowText } from "./ui";
import { fetchStaff, updateStaffMember, type StaffMember } from "../../lib/db/staff";

const ROLES = [
    { value: "doctor", label: "Doctor" },
    { value: "reception", label: "Front desk" },
    { value: "admin", label: "Admin" },
    { value: "owner", label: "Owner" },
];

export function StaffModal({
    hospitalId, currentUserId, onClose, onChanged,
}: {
    hospitalId: string;
    /** you cannot deactivate or demote yourself — that locks the clinic out */
    currentUserId: string | null;
    onClose: () => void;
    onChanged?: (staff: StaffMember[]) => void;
}) {
    const [staff, setStaff] = useState<StaffMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<string | null>(null);
    const [draftName, setDraftName] = useState("");

    useEffect(() => {
        fetchStaff(hospitalId)
            .then((s) => { setStaff(s); onChanged?.(s); })
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hospitalId]);

    const apply = async (id: string, patch: Parameters<typeof updateStaffMember>[1]) => {
        setBusyId(id);
        setError(null);
        try {
            await updateStaffMember(id, patch);
            const next = staff.map((m) => (m.id === id ? { ...m, ...patch } as StaffMember : m));
            setStaff(next);
            onChanged?.(next);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setBusyId(null);
        }
    };

    return (
        <PracticeModal
            accent="blue"
            icon={<Users size={16} />}
            eyebrow="Clinic"
            title="Staff"
            wide
            onClose={onClose}
            footer={<button type="button" className="prac-modal-btn is-ghost" onClick={onClose}>Done</button>}
        >
            <div className="flex flex-col gap-[8px]">
                {error && <p className="m-0 text-[11.5px] font-semibold text-[var(--cs-red)]">{error}</p>}
                {loading ? (
                    <p className="m-0 text-[12px] text-[var(--cs-faint)]">Loading…</p>
                ) : staff.length === 0 ? (
                    <p className="m-0 text-[12px] text-[var(--cs-faint)]">Nobody is registered against this clinic yet.</p>
                ) : staff.map((m) => {
                    const self = m.id === currentUserId;
                    return (
                        <div
                            key={m.id}
                            className={`flex items-center gap-[10px] rounded-[var(--cs-radius)] border border-[var(--cs-line)] bg-white px-[10px] py-[8px] ${m.is_active ? "" : "opacity-60"}`}
                        >
                            <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-full bg-[var(--cs-blue-soft)] text-[11px] font-extrabold text-[var(--cs-blue)]">
                                {(m.full_name ?? "?").replace(/[^A-Za-z ]/g, "").split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?"}
                            </span>

                            {editing === m.id ? (
                                <input
                                    autoFocus
                                    value={draftName}
                                    onChange={(e) => setDraftName(e.target.value)}
                                    onBlur={() => { setEditing(null); if (draftName.trim() && draftName !== m.full_name) void apply(m.id, { full_name: draftName.trim() }); }}
                                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditing(null); }}
                                    className={`${INPUT_CLASS} flex-1`}
                                />
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => { setEditing(m.id); setDraftName(m.full_name ?? ""); }}
                                    title="Rename"
                                    className="min-w-0 flex-1 border-0 bg-transparent p-0 text-left"
                                >
                                    <RowText
                                        label={`${m.full_name ?? "Unnamed"}${self ? " · you" : ""}`}
                                        sub={m.phone ?? "no phone on file"}
                                    />
                                </button>
                            )}

                            <select
                                value={m.role ?? "reception"}
                                disabled={self || busyId === m.id}
                                onChange={(e) => void apply(m.id, { role: e.target.value })}
                                title={self ? "You cannot change your own role" : "Role"}
                                className="h-[30px]! w-auto! flex-none rounded-[8px]! border! border-[var(--cs-line)]! bg-white! px-[8px]! text-[11.5px]! font-semibold"
                            >
                                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>

                            <button
                                type="button"
                                disabled={self || busyId === m.id}
                                onClick={() => void apply(m.id, { is_active: !m.is_active })}
                                title={self ? "You cannot deactivate yourself" : m.is_active ? "Deactivate — they can no longer sign in" : "Reactivate"}
                                className={
                                    "h-[30px] flex-none rounded-full border px-[11px] text-[11px] font-semibold transition-colors disabled:opacity-40 " +
                                    (m.is_active
                                        ? "border-[var(--cs-line-strong)] text-[var(--cs-muted)] hover:border-[var(--cs-red)] hover:text-[var(--cs-red)]"
                                        : "border-[var(--cs-green)] text-[var(--cs-green)] hover:bg-[var(--cs-green-soft)]")
                                }
                            >
                                {m.is_active ? "Deactivate" : "Reactivate"}
                            </button>
                        </div>
                    );
                })}
                <p className="m-0 pt-[2px] text-[11px] leading-[1.5] text-[var(--cs-faint)]">
                    New staff join by registering at arenode.com with this clinic's phone number — an account can only be
                    created by the person signing in, so it cannot be made for them from here.
                </p>
            </div>
        </PracticeModal>
    );
}
