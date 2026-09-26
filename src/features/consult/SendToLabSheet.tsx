// ---------------------------------------------------------------------------
// SEND TO LAB — the investigation order, handed to a preferred lab.
//
// Opened from Review, and only when the prescription has investigations.
// Never automatic: the doctor chooses to send it. Everything is prefilled
// from the consult and editable:
//
//   Lab                 the plan's "order from" lab (or the default), and
//                       whether it has a WhatsApp number (added here if not)
//   Tests               each with its place and side, as ordered
//   Priority            Routine / Urgent / STAT
//   Clinical indication why: the mechanism and the working assessment
//   Clinical context    today's story only (complaints, findings, pain,
//                       a neurovascular abnormality), never past history
//
// The lab receives the approved WhatsApp template and a link to the full
// order on the clinic's letterhead (/lab-orders/:token). One credit.
// ---------------------------------------------------------------------------

import { Check, ExternalLink, FlaskConical, Loader2, MessageCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { ChartSurface } from "./ChartSurface";
import { Segmented } from "./DetailInput";
import { orderSite } from "./ResultSheet";
import { clinicalSiteLabel } from "../../lib/body/clinicalSite";
import { dashText } from "../../lib/clinicalText";
import { updatePreferredLab, type PreferredLab } from "../../lib/db/synapse";
import {
    createLabOrder, labOrderUrl, sendLabOrder, LAB_PRIORITY_LABEL,
    type LabOrderTest, type LabPriority,
} from "../../lib/db/labOrders";
import { phoneProblem } from "../practice/LabFields";

/** "X-Ray Hand / Wrist — Left" → name, place and side. */
export function labTestOf(order: string): LabOrderTest {
    const site = orderSite(order);
    const parts = dashText(order).split(" - ");
    const name = parts.length > 1 && site ? parts.slice(0, -1).join(" - ") : dashText(order);
    return {
        name,
        site: site ? clinicalSiteLabel(site) : null,
        side: site?.side ?? null,
    };
}

export function SendToLabSheet({
    tests, labs, initialLabName, patient, hospitalId, doctorId, visitId, prescriptionId,
    defaultIndication, defaultContext, onLabsChanged, onSent, onClose,
}: {
    tests: string[];
    labs: PreferredLab[];
    initialLabName: string | null;
    patient: { id: string; name: string; age: string | number | null; gender: string | null };
    hospitalId: string;
    doctorId: string | null;
    visitId: string | null;
    prescriptionId: string | null;
    defaultIndication: string;
    defaultContext: string;
    onLabsChanged: (labs: PreferredLab[]) => void;
    onSent: (labName: string) => void;
    onClose: () => void;
}) {
    const initial = labs.find((l) => l.name === initialLabName) ?? labs.find((l) => l.isDefault) ?? labs[0] ?? null;
    const [labId, setLabId] = useState<number | null>(initial?.id ?? null);
    const lab = labs.find((l) => l.id === labId) ?? null;
    const [phoneDraft, setPhoneDraft] = useState("");
    const [savingPhone, setSavingPhone] = useState(false);
    const parsed = useMemo(() => tests.map(labTestOf), [tests]);
    const [picked, setPicked] = useState<Set<number>>(() => new Set(parsed.map((_, i) => i)));
    const [priority, setPriority] = useState<LabPriority>("routine");
    const [indication, setIndication] = useState(defaultIndication);
    const [context, setContext] = useState(defaultContext);
    const [phase, setPhase] = useState<{ kind: "idle" | "sending" } | { kind: "sent"; url: string } | { kind: "error"; message: string }>({ kind: "idle" });

    const chosen = parsed.filter((_, i) => picked.has(i));
    const canSend = !!lab?.whatsappPhone && chosen.length > 0 && phase.kind !== "sending";

    const savePhone = async () => {
        if (!lab || phoneProblem(phoneDraft) || !phoneDraft.trim()) return;
        setSavingPhone(true);
        try {
            const updated = await updatePreferredLab(lab.id, { whatsappPhone: phoneDraft });
            onLabsChanged(labs.map((l) => (l.id === updated.id ? updated : l)));
            setPhoneDraft("");
        } catch (e) {
            setPhase({ kind: "error", message: e instanceof Error ? e.message : "Could not save the number." });
        } finally {
            setSavingPhone(false);
        }
    };

    const send = async () => {
        if (!lab || !canSend) return;
        setPhase({ kind: "sending" });
        try {
            const order = await createLabOrder({
                hospitalId, doctorId, patientId: patient.id, visitId, prescriptionId,
                labName: lab.name, labPhone: lab.whatsappPhone, priority, indication, context, tests: chosen,
            });
            const r = await sendLabOrder(order.id);
            if (!r.ok) { setPhase({ kind: "error", message: r.message }); return; }
            setPhase({ kind: "sent", url: labOrderUrl(order.shareToken) });
            onSent(lab.name);
        } catch (e) {
            setPhase({ kind: "error", message: e instanceof Error ? e.message : "The order could not be sent." });
        }
    };

    const ageSex = [patient.age != null && patient.age !== "" ? `${patient.age}y` : "", patient.gender ?? ""].filter(Boolean).join(" · ");

    return (
        <ChartSurface title="Investigation order" eyebrow="Send to lab" icon={<FlaskConical size={15} />} expanded onClose={onClose} maxWidth={620}>
            {phase.kind === "sent" ? (
                <div className="cs-stl-done">
                    <span className="cs-stl-done-mark"><Check size={22} strokeWidth={2.6} aria-hidden="true" /></span>
                    <p className="cs-stl-done-title">Sent to {lab?.name}</p>
                    <p className="cs-stl-done-sub">
                        {chosen.length} investigation{chosen.length === 1 ? "" : "s"} for {patient.name}, {LAB_PRIORITY_LABEL[priority].toLowerCase()}.
                        The lab has the full order and the patient's contact.
                    </p>
                    <div className="cs-stl-done-actions">
                        <a className="cs-stl-link" href={phase.url} target="_blank" rel="noreferrer">
                            <ExternalLink size={13} aria-hidden="true" /> View the order as the lab sees it
                        </a>
                        <button type="button" className="cs-stl-send" onClick={onClose}>Done</button>
                    </div>
                </div>
            ) : (
                <div className="cs-stl">
                    <p className="cs-stl-patient"><b>{patient.name}</b>{ageSex && <> · {ageSex}</>}</p>

                    <section className="cs-stl-sec">
                        <span className="cs-stl-label">Lab</span>
                        {labs.length === 0 ? (
                            <p className="cs-stl-none">No preferred labs yet. Add one in Practice, with its WhatsApp number.</p>
                        ) : (
                            <>
                                <select
                                    className="cs-stl-select"
                                    value={labId ?? ""}
                                    onChange={(e) => { setLabId(Number(e.target.value)); setPhoneDraft(""); }}
                                >
                                    {labs.map((l) => <option key={l.id} value={l.id}>{l.name}{l.whatsappPhone ? "" : " (no WhatsApp number)"}</option>)}
                                </select>
                                {lab?.whatsappPhone ? (
                                    <span className="cs-stl-phone"><MessageCircle size={12} aria-hidden="true" /> {lab.whatsappPhone}</span>
                                ) : lab && (
                                    <div className="cs-stl-addphone">
                                        <input
                                            className="cs-stl-input"
                                            inputMode="tel"
                                            value={phoneDraft}
                                            placeholder={`${lab.name}'s WhatsApp number`}
                                            onChange={(e) => setPhoneDraft(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === "Enter") savePhone(); }}
                                        />
                                        <button type="button" className="cs-stl-small" disabled={!phoneDraft.trim() || !!phoneProblem(phoneDraft) || savingPhone} onClick={savePhone}>
                                            {savingPhone ? <Loader2 size={13} className="cs-spin" /> : "Save number"}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </section>

                    <section className="cs-stl-sec">
                        <span className="cs-stl-label">Investigations</span>
                        <ul className="cs-stl-tests">
                            {parsed.map((t, i) => (
                                <li key={i}>
                                    <label className={`cs-stl-test${picked.has(i) ? " is-on" : ""}`}>
                                        <input
                                            type="checkbox"
                                            checked={picked.has(i)}
                                            onChange={() => setPicked((c) => { const n = new Set(c); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                                        />
                                        <span className="cs-stl-check" aria-hidden="true">{picked.has(i) && <Check size={11} strokeWidth={3} />}</span>
                                        <span className="cs-stl-testname">{t.name}</span>
                                        {t.site && <em>{t.site}</em>}
                                    </label>
                                </li>
                            ))}
                        </ul>
                    </section>

                    <section className="cs-stl-sec">
                        <span className="cs-stl-label">Priority</span>
                        <Segmented
                            label="Priority"
                            options={(["routine", "urgent", "stat"] as LabPriority[]).map((p) => ({ value: LAB_PRIORITY_LABEL[p] }))}
                            value={LAB_PRIORITY_LABEL[priority]}
                            onChange={(v) => {
                                const p = (Object.keys(LAB_PRIORITY_LABEL) as LabPriority[]).find((k) => LAB_PRIORITY_LABEL[k] === v);
                                if (p) setPriority(p);
                            }}
                        />
                    </section>

                    <section className="cs-stl-sec">
                        <span className="cs-stl-label">Clinical indication</span>
                        <textarea className="cs-stl-text" rows={2} value={indication} placeholder="Why the investigation is needed" onChange={(e) => setIndication(e.target.value)} />
                    </section>

                    <section className="cs-stl-sec">
                        <span className="cs-stl-label">Clinical context <em>today's story only</em></span>
                        <textarea className="cs-stl-text" rows={3} value={context} placeholder="Symptoms, findings, how it happened" onChange={(e) => setContext(e.target.value)} />
                    </section>

                    {phase.kind === "error" && <p className="cs-stl-error">{phase.message}</p>}

                    <footer className="cs-stl-foot">
                        <span className="cs-stl-cost">Uses 1 WhatsApp credit</span>
                        <button type="button" className="cs-addmed-cancel" onClick={onClose}>Cancel</button>
                        <button type="button" className="cs-stl-send" disabled={!canSend} onClick={send}>
                            {phase.kind === "sending" ? <Loader2 size={15} className="cs-spin" aria-hidden="true" /> : <MessageCircle size={15} aria-hidden="true" />}
                            {lab ? `Send to ${lab.name}` : "Send to lab"}
                        </button>
                    </footer>
                </div>
            )}
        </ChartSurface>
    );
}
