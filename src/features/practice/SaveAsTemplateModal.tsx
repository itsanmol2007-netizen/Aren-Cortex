// ---------------------------------------------------------------------------
// SAVE AS TEMPLATE — the Plan rail's own path into Prescription Templates.
// Turns whatever is currently accepted in a live consult — plus the plain
// chart entries that justified it (`add_template_observable_items`) — into
// a reusable `prescription_templates` row, using the SAME item shapes the
// Practice builder writes — one table, two ways to reach it.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Layers } from "lucide-react";
import {
    createPrescriptionTemplate, loadPrescriptionTemplateSummaries,
    type PrescriptionTemplateSummary, type PrescriptionTemplateItemInput,
} from "../../lib/db/synapse";
import { PracticeModal } from "./PracticeModal";
import "./practiceModal.css";

export function SaveAsTemplateModal({
    doctorId, hospitalId, items, onClose, onSaved,
}: {
    doctorId: string;
    hospitalId: string;
    /** the plan's accepted items (deduped by `acceptedIntents`) plus this
     *  visit's own plain chart entries — see App.tsx's call site */
    items: PrescriptionTemplateItemInput[];
    onClose: () => void;
    /** the doctor's refreshed template list — see App.tsx's `templates` state */
    onSaved: (templates: PrescriptionTemplateSummary[]) => void;
}) {
    const [name, setName] = useState("");
    const [triggerLabel, setTriggerLabel] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const save = () => {
        if (!name.trim() || !triggerLabel.trim() || busy) return;
        setBusy(true);
        setError(null);
        createPrescriptionTemplate({ doctorId, hospitalId, name, triggerLabel, items })
            .then(() => loadPrescriptionTemplateSummaries(doctorId))
            .then((rows) => { onSaved(rows); onClose(); })
            .catch((e) => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => setBusy(false));
    };

    return (
        <PracticeModal
            accent="violet"
            icon={<Layers size={15} />}
            eyebrow="Prescription Templates"
            title="Save this plan as a template"
            onClose={onClose}
            footer={
                <button
                    type="button" className="prac-modal-btn is-primary" onClick={save}
                    disabled={busy || !name.trim() || !triggerLabel.trim()}
                >
                    Save template
                </button>
            }
        >
            {error && <p className="prac-modal-error">{error}</p>}
            <p className="prac-soon">
                {items.length} item{items.length === 1 ? "" : "s"} from this visit — what's on the
                plan, and what you charted to get there — will become this template's starting
                point. Edit or trim them later from Practice.
            </p>
            <div className="prac-modal-field">
                <label>Template name</label>
                <input type="text" value={name} placeholder="e.g. Fever — General OPD"
                    onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="prac-modal-field">
                <label>Trigger word — what you'll type in the case sheet to find it</label>
                <input type="text" value={triggerLabel} placeholder="e.g. fever"
                    onChange={(e) => setTriggerLabel(e.target.value)} />
            </div>
        </PracticeModal>
    );
}
