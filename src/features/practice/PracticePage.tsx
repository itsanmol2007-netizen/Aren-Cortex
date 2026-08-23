// ---------------------------------------------------------------------------
// PRACTICE — "how does this doctor practice?"
//
// Built 2026-08-23, unblocked the same day it was documented as blocked.
// The concern was resolving a pinned `intents.id` to a display name without
// pulling in the full consult ruleset — checked live instead of assumed:
// `intents.label` already IS the display name for a medicine intent (the
// composition's own name), so `fetchPinnedMedicineDetails` is one join, not
// a second copy of the ruleset loader. See lib/db/synapse.ts's own header.
//
// Only Pinned Medicines is real here — `usePinnedMedicines`'s own table,
// same read/write point the consult screen's RecommendationsCard uses (a
// pin set here is the SAME pin a doctor would set there, not a second
// concept). Preferred Labs and Prescription Templates have no backing data
// model anywhere in the schema yet (checked: no such tables exist) — they
// say so honestly rather than rendering an empty list next to a real one,
// which would read as "broken" instead of "not built yet".
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { FlaskConical, Layers, Pill } from "lucide-react";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { useClinicalIdentity } from "../../hooks/useClinicalIdentity";
import { fetchPinnedMedicineDetails, type PinnedMedicineDetail } from "../../lib/db/synapse";
import "./practice.css";

interface Props {
    logoRef: RefObject<HTMLDivElement>;
    onOpenSidebar: () => void;
}

function SkelRow() {
    return <div className="prac-skeleton" style={{ height: 34 }} />;
}

export function PracticePage({ logoRef, onOpenSidebar }: Props) {
    const identity = useClinicalIdentity();
    const [pinned, setPinned] = useState<PinnedMedicineDetail[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!identity.ready) return;
        setLoading(true);
        fetchPinnedMedicineDetails(identity.doctorId)
            .then(setPinned)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [identity.ready, identity.doctorId]);

    return (
        <div className="prac-page">
            <WorkspaceHeader
                logoRef={logoRef}
                onOpenSidebar={onOpenSidebar}
                title="Practice"
                subtitle="How you practice — medicines, labs & templates"
            />

            <div className="prac-body">
                <div className="prac-card">
                    <div className="prac-card-header">
                        <Pill size={14} className="prac-card-icon prac-card-icon--blue" />
                        <span className="prac-card-title">Pinned Medicines</span>
                        {pinned.length > 0 && <span className="prac-card-count">{pinned.length}</span>}
                    </div>
                    <div className="prac-card-body">
                        {loading ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                <SkelRow /><SkelRow /><SkelRow />
                            </div>
                        ) : pinned.length > 0 ? (
                            <div className="prac-med-list">
                                {pinned.map((p) => (
                                    <div key={p.intentId} className="prac-med-row">
                                        <span className="prac-med-name">{p.label}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="prac-empty">
                                Nothing pinned yet — pin a medicine from its row in Consult's
                                Recommendations to have it show up here and rank to the top of
                                future suggestions.
                            </p>
                        )}
                    </div>
                </div>

                <div className="prac-card prac-card--soon">
                    <div className="prac-card-header">
                        <FlaskConical size={14} className="prac-card-icon" />
                        <span className="prac-card-title">Preferred Labs</span>
                    </div>
                    <div className="prac-card-body">
                        <p className="prac-empty">
                            No schema exists for this yet — it isn't built, not empty.
                        </p>
                    </div>
                </div>

                <div className="prac-card prac-card--soon">
                    <div className="prac-card-header">
                        <Layers size={14} className="prac-card-icon" />
                        <span className="prac-card-title">Prescription Templates</span>
                    </div>
                    <div className="prac-card-body">
                        <p className="prac-empty">
                            No schema exists for this yet — it isn't built, not empty.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
