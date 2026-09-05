// ---------------------------------------------------------------------------
// CATALOGUE — the clinic's own labs and brands, and the salt queue it cannot
// touch.
//
// ── The constraint this page is built around
//
// Standing rule 22: a new COMPOSITION is never minted from the UI. Anmol,
// 2026-09-04, confirmed it holds for admins too — "if you start adding random
// compositions from there it will fuck up our rank, which we don't want." A
// composition reaches the catalogue through compositions → gates → rules, run
// by a human who understands what it does to ranking.
//
// What the admin CAN do here, added 2026-09-05 after "the catalogue section is
// useless... it should be usable, just as a doctor section where you can
// import new medicine": add a BRAND against a salt that already exists, the
// same thing a doctor does from the consult screen, through the same
// `add_medicine` RPC (widened so an admin with no `doctors` row can call it).
// The salt is still forced — picked from `searchCompositions`, never typed —
// so rule 22 holds without a special case in this file.
//
// ── The one lab action that touches other people's settings
//
// "Apply to all doctors" writes rows into `doctor_preferred_labs`. Deliberate,
// confirmed, skips anything a doctor already has, and never sets `is_default`.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { BookOpen, FlaskConical, Pill, Plus, Send, Users } from "lucide-react";
import { toast } from "sonner";
import { useClinicalIdentity } from "../../../hooks/useClinicalIdentity";
import { Card, EmptyBlock, INPUT_CLASS, RemoveButton, RowText, SkeletonRows } from "../../clinic/ui";
import { AddMedicineModal } from "../AddMedicineModal";
import {
    addClinicLab, applyClinicLabsToAllDoctors, fetchClinicLabs, fetchClinicMedicines,
    fetchCompositionRequests, removeClinicLab,
    type ClinicLab, type ClinicMedicine, type CompositionRequest,
} from "../../../lib/db/admin";

const STATUS_TONE: Record<string, string> = {
    pending: "border-[var(--cs-amber)] bg-[var(--cs-amber-soft)] text-[var(--cs-amber)]",
    approved: "border-[var(--cs-green)] bg-[var(--cs-green-soft)] text-[var(--cs-green)]",
    rejected: "border-[var(--cs-line-strong)] bg-transparent text-[var(--cs-faint)]",
};

/** A list that stays a fixed height and scrolls inside itself. Every list on
 *  this page uses it — an admin should never have to scroll the whole page
 *  past 40 lab rows to reach the salt queue. */
function ScrollList({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex max-h-[280px] flex-col gap-[6px] overflow-y-auto pr-[2px]">
            {children}
        </div>
    );
}

export function CataloguePage() {
    const identity = useClinicalIdentity();

    const [labs, setLabs] = useState<ClinicLab[] | null>(null);
    const [medicines, setMedicines] = useState<ClinicMedicine[] | null>(null);
    const [requests, setRequests] = useState<CompositionRequest[] | null>(null);

    const [labName, setLabName] = useState("");
    const [labNote, setLabNote] = useState("");
    const [adding, setAdding] = useState(false);
    const [applying, setApplying] = useState(false);
    const [medModalOpen, setMedModalOpen] = useState(false);

    const load = useCallback(() => {
        if (!identity.ready) return;
        const h = identity.hospitalId;
        fetchClinicLabs(h).then(setLabs).catch((e: unknown) => { console.error("[catalogue] labs:", e); setLabs(null); });
        fetchClinicMedicines(h).then(setMedicines).catch(() => setMedicines(null));
        fetchCompositionRequests(h).then(setRequests).catch(() => setRequests(null));
    }, [identity.ready, identity.hospitalId]);

    useEffect(load, [load]);

    const add = async () => {
        if (!labName.trim() || adding) return;
        setAdding(true);
        try {
            await addClinicLab(identity.hospitalId, labName, labNote);
            setLabName("");
            setLabNote("");
            toast.success("Added to the clinic list");
            load();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not add that lab.");
        } finally {
            setAdding(false);
        }
    };

    const remove = async (lab: ClinicLab) => {
        try {
            await removeClinicLab(lab.id);
            toast.success(`${lab.name} removed from the clinic list`);
            load();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not remove that lab.");
        }
    };

    const applyAll = async () => {
        if (applying) return;
        setApplying(true);
        try {
            const n = await applyClinicLabsToAllDoctors(identity.hospitalId);
            toast.success(
                n === 0
                    ? "Every doctor already has these labs"
                    : `Added ${n} lab ${n === 1 ? "entry" : "entries"} across your doctors`
            );
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not apply the clinic list.");
        } finally {
            setApplying(false);
        }
    };

    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex w-full flex-1 flex-col gap-[12px] overflow-y-auto px-[28px] pb-[44px] pt-[15px] max-[900px]:px-[12px]">

                {/* ── Labs ───────────────────────────────────────────────── */}
                <Card
                    id="adm-card-labs"
                    tone="teal"
                    icon={<FlaskConical size={14} />}
                    title="Diagnostic centres"
                    subtitle="The labs this clinic endorses"
                    action={
                        labs && labs.length > 0 && (
                            <button
                                type="button"
                                onClick={applyAll}
                                disabled={applying}
                                className="inline-flex cursor-pointer items-center gap-[5px] rounded-full border border-[var(--cs-teal)] bg-transparent px-[10px] py-[4px] text-[10.5px] font-semibold text-[var(--cs-teal)] outline-none transition-colors hover:bg-[var(--cs-teal-soft)] disabled:opacity-50"
                            >
                                <Users size={12} /> {applying ? "Applying…" : "Apply to all doctors"}
                            </button>
                        )
                    }
                    foot={
                        <span className="text-[11px] leading-[1.45] text-[var(--cs-faint)]">
                            These sit at the <strong className="font-semibold text-[var(--cs-muted)]">bottom</strong> of every
                            doctor's own list. "Apply to all" copies them into each doctor's list, skipping any they already have.
                        </span>
                    }
                >
                    {/* One compact row — name, contact, Add — not two stacked
                        full-height labelled fields. The screenshot's "uselessly
                        big" was two 40px inputs each with a label above them. */}
                    <div className="mb-[8px] flex items-center gap-[7px] max-[620px]:flex-wrap">
                        <input
                            aria-label="Lab name"
                            value={labName}
                            placeholder="Lab name — e.g. Dr Lal PathLabs"
                            onChange={(e) => setLabName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") void add(); }}
                            className="h-[34px]! min-w-[160px] flex-[2] rounded-[9px]! border! border-[var(--cs-line-strong)]! bg-[var(--cs-page)]! px-[10px]! text-[12px]! text-[var(--cs-ink)] outline-none focus:border-[var(--cs-teal)]!"
                        />
                        <input
                            aria-label="Contact (optional)"
                            value={labNote}
                            placeholder="Contact — optional"
                            onChange={(e) => setLabNote(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") void add(); }}
                            className="h-[34px]! min-w-[140px] flex-[3] rounded-[9px]! border! border-[var(--cs-line-strong)]! bg-[var(--cs-page)]! px-[10px]! text-[12px]! text-[var(--cs-ink)] outline-none focus:border-[var(--cs-teal)]!"
                        />
                        <button
                            type="button"
                            onClick={add}
                            disabled={!labName.trim() || adding}
                            className="inline-flex h-[34px] flex-none cursor-pointer items-center gap-[5px] rounded-[9px] border-[1.5px] border-[var(--cs-teal)] bg-transparent px-[13px] text-[12px] font-semibold text-[var(--cs-teal)] outline-none transition-colors hover:bg-[var(--cs-teal-soft)] disabled:opacity-45"
                        >
                            <Plus size={12} /> Add
                        </button>
                    </div>

                    {!labs ? (
                        <SkeletonRows count={2} />
                    ) : labs.length === 0 ? (
                        <EmptyBlock fact="No clinic labs yet" next="Add the centres your doctors send patients to." />
                    ) : (
                        <ScrollList>
                            {labs.map((l) => (
                                <div key={l.id} className="flex min-w-0 flex-none items-center gap-[9px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[10px] py-[8px]">
                                    <RowText label={l.name} sub={l.contactNote} />
                                    <span className="ml-auto flex-none">
                                        <RemoveButton label={`Remove ${l.name}`} onClick={() => remove(l)} />
                                    </span>
                                </div>
                            ))}
                        </ScrollList>
                    )}
                </Card>

                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-stretch gap-[12px] max-[980px]:grid-cols-1">

                    {/* ── Salt requests ─────────────────────────────────── */}
                    <Card
                        id="adm-card-requests"
                        tone="violet"
                        icon={<BookOpen size={14} />}
                        title="Salt requests"
                        subtitle="What your doctors have asked AREN to add"
                        foot={
                            <span className="text-[11px] leading-[1.45] text-[var(--cs-faint)]">
                                A new salt changes how every suggestion is ranked, so it is added by AREN
                                after review — not from this screen.
                            </span>
                        }
                    >
                        {!requests ? (
                            <SkeletonRows count={3} />
                        ) : requests.length === 0 ? (
                            <EmptyBlock
                                fact="No requests open"
                                next="A doctor raises one from the consult screen when a salt is missing."
                            />
                        ) : (
                            <ScrollList>
                                {requests.map((r) => (
                                    <div key={r.id} className="flex min-w-0 flex-none items-start gap-[9px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[10px] py-[8px]">
                                        <div className="flex min-w-0 flex-col gap-[2px]">
                                            <span className="truncate text-[12px] font-semibold text-[var(--cs-ink)]">{r.requestedName}</span>
                                            <span className="text-[10.5px] leading-[1.4] text-[var(--cs-faint)]">
                                                {[r.doctorName, new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })]
                                                    .filter(Boolean).join(" · ")}
                                                {r.notes ? ` — ${r.notes}` : ""}
                                            </span>
                                        </div>
                                        <span className={`ml-auto flex-none rounded-full border px-[9px] py-[2px] text-[10px] font-bold uppercase tracking-[0.05em] ${STATUS_TONE[r.status] ?? STATUS_TONE.rejected}`}>
                                            {r.status}
                                        </span>
                                    </div>
                                ))}
                            </ScrollList>
                        )}
                    </Card>

                    {/* ── Clinic brands ─────────────────────────────────── */}
                    <Card
                        id="adm-card-medicines"
                        tone="blue"
                        icon={<Pill size={14} />}
                        title="Clinic brands"
                        subtitle="Brands added against an existing salt"
                        action={
                            <button
                                type="button"
                                onClick={() => setMedModalOpen(true)}
                                className="inline-flex cursor-pointer items-center gap-[5px] rounded-full border border-[var(--cs-blue)] bg-transparent px-[10px] py-[4px] text-[10.5px] font-semibold text-[var(--cs-blue)] outline-none transition-colors hover:bg-[var(--cs-blue-soft)]"
                            >
                                <Plus size={12} /> Add medicine
                            </button>
                        }
                        foot={
                            <span className="text-[11px] leading-[1.45] text-[var(--cs-faint)]">
                                Add a brand here or from the consult screen — either way it becomes
                                searchable for every doctor at this clinic.
                            </span>
                        }
                    >
                        {!medicines ? (
                            <SkeletonRows count={3} />
                        ) : medicines.length === 0 ? (
                            <EmptyBlock
                                fact="No clinic brands yet"
                                next="Add one with the button above, against a salt that already exists."
                            />
                        ) : (
                            <ScrollList>
                                {medicines.map((m) => (
                                    <div key={m.id} className="flex min-w-0 flex-none items-center gap-[9px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[10px] py-[8px]">
                                        <RowText
                                            label={m.name}
                                            sub={[m.manufacturer, m.strengthMg ? `${m.strengthMg} mg` : null].filter(Boolean).join(" · ") || null}
                                        />
                                        <span className="ml-auto flex-none text-[10.5px] text-[var(--cs-faint)]">
                                            {new Date(m.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                        </span>
                                    </div>
                                ))}
                            </ScrollList>
                        )}
                    </Card>
                </div>

                <div className="flex items-start gap-[8px] rounded-[var(--cs-radius)] border border-[var(--cs-line)] bg-[var(--cs-card)] px-[14px] py-[11px] shadow-[var(--cs-shadow)]">
                    <span className="grid h-[26px] w-[26px] flex-none place-items-center rounded-[8px] bg-[#f1f5f9] text-[#475569]">
                        <Send size={13} />
                    </span>
                    <span className="text-[11.5px] leading-[1.5] text-[var(--cs-muted)]">
                        <strong className="font-semibold text-[var(--cs-ink)]">Need a salt that is not in AREN?</strong>{" "}
                        Ask the doctor to raise it from the consult screen while they are prescribing — the
                        request lands in the queue above with the clinical context attached, which is what
                        review needs.
                    </span>
                </div>
            </div>

            {medModalOpen && (
                <AddMedicineModal
                    onClose={() => setMedModalOpen(false)}
                    onSaved={() => { toast.success("Medicine added to the catalogue"); load(); }}
                />
            )}
        </div>
    );
}
