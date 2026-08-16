import { useState } from "react";
import { Calendar, Hash, Sparkles, Stethoscope, Target, X } from "lucide-react";
import { closeCarePlan, createCarePlan } from "../lib/db";
import type { CarePlan, CarePlanWithProgress } from "../lib/db";

type TargetKind = "none" | "visits" | "date";

interface CarePlanModalProps {
    mode: "create" | "view";
    patient: { id: string; name: string };
    doctorId: string;
    hospitalId?: string | null;
    /** Required when mode === "view". */
    plan?: CarePlanWithProgress | null;
    onClose: () => void;
    onCreated: (plan: CarePlan) => void;
    onPlanClosed: () => void;
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function CarePlanModal({
    mode, patient, doctorId, hospitalId, plan, onClose, onCreated, onPlanClosed,
}: CarePlanModalProps) {
    const [goal, setGoal] = useState("");
    const [diagnosis, setDiagnosis] = useState("");
    const [notes, setNotes] = useState("");
    const [targetKind, setTargetKind] = useState<TargetKind>("none");
    const [targetVisits, setTargetVisits] = useState("");
    const [targetDate, setTargetDate] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [closeArmed, setCloseArmed] = useState(false);
    const [closing, setClosing] = useState(false);

    const isValid = goal.trim().length > 0;

    async function handleCreate() {
        if (!isValid || saving) return;
        setSaving(true);
        setError("");
        try {
            const created = await createCarePlan({
                patientId: patient.id,
                doctorId,
                hospitalId,
                goal: goal.trim(),
                diagnosis: diagnosis.trim() || null,
                notes: notes.trim() || null,
                targetVisitCount: targetKind === "visits" && targetVisits ? Number(targetVisits) : null,
                targetDate: targetKind === "date" && targetDate ? new Date(targetDate).toISOString() : null,
            });
            onCreated(created);
        } catch (err: any) {
            setError(err.message ?? "Could not create the plan.");
        } finally {
            setSaving(false);
        }
    }

    async function handleCloseClick() {
        if (!plan) return;
        if (!closeArmed) { setCloseArmed(true); return; }
        setClosing(true);
        setError("");
        try {
            await closeCarePlan(plan.id);
            onPlanClosed();
        } catch (err: any) {
            setError(err.message ?? "Could not close the plan.");
            setClosing(false);
            setCloseArmed(false);
        }
    }

    return (
        <div className="pm-overlay" role="dialog" aria-modal="true" aria-label="Care plan">
            <button className="pm-backdrop" type="button" onClick={onClose} aria-label="Close" />

            <div className="pm-card">
                <div className="pm-top-stripe" />

                <div className="pm-header">
                    <div className="pm-header-left">
                        <div className="pm-header-icon"><Target size={14} /></div>
                        <div>
                            <p className="pm-eyebrow">{mode === "create" ? "New care plan" : "Care plan"}</p>
                            <h3 className="pm-title">{patient.name}</h3>
                        </div>
                    </div>
                    <button type="button" className="pm-close-btn" onClick={onClose} aria-label="Close">
                        <X size={14} />
                    </button>
                </div>

                {mode === "create" ? (
                    <div className="pm-section">
                        <div className="pm-field">
                            <label className="pm-label">
                                <Sparkles size={12} className="pm-label-icon" />
                                Goal <span className="pm-required">*</span>
                            </label>
                            <input
                                autoFocus
                                className="pm-input"
                                value={goal}
                                placeholder="e.g. Blood pressure control, ACL rehabilitation"
                                onChange={(e) => setGoal(e.target.value)}
                            />
                        </div>

                        <div className="pm-field">
                            <label className="pm-label">
                                <Stethoscope size={12} className="pm-label-icon" />
                                Diagnosis <span className="pm-optional">optional</span>
                            </label>
                            <input
                                className="pm-input"
                                value={diagnosis}
                                placeholder="e.g. Essential hypertension"
                                onChange={(e) => setDiagnosis(e.target.value)}
                            />
                        </div>

                        <div className="pm-field">
                            <label className="pm-label">Track progress by <span className="pm-optional">optional</span></label>
                            <div className="pm-toggle">
                                <button type="button" className={`pm-toggle-btn ${targetKind === "none" ? "active" : ""}`} onClick={() => setTargetKind("none")}>
                                    Neither
                                </button>
                                <button type="button" className={`pm-toggle-btn ${targetKind === "visits" ? "active" : ""}`} onClick={() => setTargetKind("visits")}>
                                    Visit count
                                </button>
                                <button type="button" className={`pm-toggle-btn ${targetKind === "date" ? "active" : ""}`} onClick={() => setTargetKind("date")}>
                                    Review date
                                </button>
                            </div>
                        </div>

                        {targetKind === "visits" && (
                            <div className="pm-field">
                                <label className="pm-label">
                                    <Hash size={12} className="pm-label-icon" />
                                    Target visit count
                                </label>
                                <input
                                    className="pm-input"
                                    inputMode="numeric"
                                    maxLength={2}
                                    value={targetVisits}
                                    placeholder="e.g. 12"
                                    onChange={(e) => setTargetVisits(e.target.value.replace(/\D/g, ""))}
                                />
                            </div>
                        )}

                        {targetKind === "date" && (
                            <div className="pm-field">
                                <label className="pm-label">
                                    <Calendar size={12} className="pm-label-icon" />
                                    Review by
                                </label>
                                <input
                                    className="pm-input"
                                    type="date"
                                    value={targetDate}
                                    onChange={(e) => setTargetDate(e.target.value)}
                                />
                            </div>
                        )}

                        <div className="pm-field">
                            <label className="pm-label">Notes <span className="pm-optional">optional</span></label>
                            <input
                                className="pm-input"
                                value={notes}
                                placeholder="Anything else worth carrying across visits"
                                onChange={(e) => setNotes(e.target.value)}
                            />
                        </div>

                        {error && <p className="pm-no-results" style={{ color: "#f87171" }}>{error}</p>}

                        <div className="pm-actions">
                            <button type="button" className="pm-btn-ghost" onClick={onClose}>Cancel</button>
                            <button type="button" className="pm-btn-primary" disabled={!isValid || saving} onClick={handleCreate}>
                                {saving ? "Creating…" : "Create plan"}
                            </button>
                        </div>
                    </div>
                ) : plan ? (
                    <div className="pm-section">
                        <div className="pm-field">
                            <label className="pm-label">Goal</label>
                            <p className="pm-plain-text">{plan.goal}</p>
                        </div>
                        {plan.diagnosis && (
                            <div className="pm-field">
                                <label className="pm-label">Diagnosis</label>
                                <p className="pm-plain-text">{plan.diagnosis}</p>
                            </div>
                        )}
                        {(plan.target_visit_count || plan.target_date) && (
                            <div className="pm-field">
                                <label className="pm-label">Progress</label>
                                <p className="pm-plain-text">
                                    {plan.target_visit_count
                                        ? `${plan.linked_visit_count} of ${plan.target_visit_count} visits completed`
                                        : `Review by ${formatDate(plan.target_date!)}`}
                                </p>
                            </div>
                        )}
                        {plan.notes && (
                            <div className="pm-field">
                                <label className="pm-label">Notes</label>
                                <p className="pm-plain-text">{plan.notes}</p>
                            </div>
                        )}
                        <div className="pm-field">
                            <label className="pm-label">Started</label>
                            <p className="pm-plain-text">{formatDate(plan.created_at)}</p>
                        </div>

                        {error && <p className="pm-no-results" style={{ color: "#f87171" }}>{error}</p>}

                        <div className="pm-actions">
                            <button
                                type="button"
                                className="pm-btn-ghost"
                                style={closeArmed ? { color: "#dc2626", borderColor: "rgba(220,38,38,0.35)" } : undefined}
                                onClick={handleCloseClick}
                                disabled={closing}
                            >
                                {closing ? "Closing…" : closeArmed ? "Sure? Click again" : "Close plan"}
                            </button>
                            <button type="button" className="pm-btn-primary" onClick={onClose}>Done</button>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
